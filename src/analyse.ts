import { z } from "zod";
import { type DB, openDB } from "./db.ts";
import { type AiConfig, chat, embed } from "./ai.ts";

// --- Vector helpers ---
// sqlite-vec accepts vectors in several formats. A JSON array string is the
// simplest and most portable, so we normalise both inserts and MATCH queries
// to use it.
function vecJSON(vec: number[]): string {
  return JSON.stringify(vec);
}

// --- Schemas ---
// These schemas are intentionally strict so bad model output fails loudly.

const slackAnalysisSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  themes: z.array(z.string()),
  blockers: z.array(z.string()),
});

const retroItemSchema = z.object({
  is_action_item: z.boolean(),
  action_text: z.string().nullable(),
  category: z.enum(["positive", "negative", "action", "other"]),
});

const actionVerdictSchema = z.object({
  status: z.enum(["done", "partial", "not_done", "dropped"]),
  evidence: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

// --- Structured chat with explicit fallback logging ---
async function structuredChat(
  messages: { role: string; content: string }[],
  schema: z.ZodType,
  config?: AiConfig,
) {
  // Add an explicit JSON format reminder to the last user message.
  const last = messages.at(-1);
  if (last && last.role === "user") {
    last.content +=
      "\n\nRespond ONLY with a single valid JSON object. Do not include markdown fences, explanations, or any other text.";
  }

  try {
    return await chat(messages, schema, config);
  } catch (err) {
    console.error("\nStructured chat failed. Raw response follows:");
    try {
      const raw = await chat(messages, undefined, config);
      console.error(raw);
    } catch {
      console.error("(could not retrieve raw response)");
    }
    throw err;
  }
}

// --- Slack analysis ---

async function analyseSlack(db: DB, config?: AiConfig) {
  const rows = db.prepare(`
    SELECT id, author, text FROM slack_update
    WHERE CAST(id AS TEXT) NOT IN (
      SELECT source_id FROM ai_analysis WHERE source = 'slack'
    )
  `).all() as { id: number; author: string; text: string }[];

  console.log(`Analysing ${rows.length} Slack updates...`);

  const insertAnalysis = db.prepare(
    `INSERT INTO ai_analysis (source, source_id, sentiment, themes, blockers)
     VALUES ('slack', ?, ?, ?, ?)`,
  );
  const insertEmbedding = db.prepare(
    `INSERT INTO embedding (source, source_id, embedding) VALUES ('slack', ?, ?)`,
  );

  for (const row of rows) {
    const result = await structuredChat(
      [{
        role: "user",
        content: `You are analysing a sprint status update from a team member.

Author: ${row.author}
Update: "${row.text}"

Extract:
- sentiment: exactly one of "positive", "neutral", "negative"
- themes: array of short lowercase topic strings (e.g. ["qa", "delivery"])
- blockers: array of short lowercase blocker strings; empty array if none

JSON schema:
{
  "sentiment": "positive" | "neutral" | "negative",
  "themes": string[],
  "blockers": string[]
}`,
      }],
      slackAnalysisSchema,
      config,
    ) as z.infer<typeof slackAnalysisSchema>;

    insertAnalysis.run(
      String(row.id),
      result.sentiment,
      JSON.stringify(result.themes),
      JSON.stringify(result.blockers),
    );

    const vec = await embed(row.text, config);
    insertEmbedding.run(String(row.id), vecJSON(vec));

    console.log(
      `  [slack:${row.id}] ${result.sentiment} — themes: ${
        result.themes.join(", ") || "none"
      }`,
    );
  }
}

// --- Retro classification ---

async function analyseRetros(db: DB, config?: AiConfig) {
  const rows = db.prepare(`
    SELECT note_id, text, "column" AS col FROM retro_item
    WHERE note_id NOT IN (
      SELECT source_id FROM ai_analysis WHERE source = 'retro'
    )
  `).all() as { note_id: string; text: string; col: string }[];

  console.log(`\nAnalysing ${rows.length} retro items...`);

  const insertAnalysis = db.prepare(
    `INSERT INTO ai_analysis (source, source_id, action_text, action_status)
     VALUES ('retro', ?, ?, 'pending')`,
  );
  const insertEmbedding = db.prepare(
    `INSERT INTO embedding (source, source_id, embedding) VALUES ('retro_action', ?, ?)`,
  );

  for (const row of rows) {
    const result = await structuredChat(
      [{
        role: "user",
        content: `You are a retrospective analyst. Classify this retro note.

Column (from retro board): ${row.col}
Note text: "${row.text}"

Respond with:
- is_action_item: true only if this note describes a concrete action the team should take
- action_text: the specific action text if it is an action item, otherwise null
- category: exactly one of "positive", "negative", "action", "other"

JSON schema:
{
  "is_action_item": boolean,
  "action_text": string | null,
  "category": "positive" | "negative" | "action" | "other"
}`,
      }],
      retroItemSchema,
      config,
    ) as z.infer<typeof retroItemSchema>;

    if (result.is_action_item && result.action_text) {
      insertAnalysis.run(row.note_id, result.action_text);

      const vec = await embed(result.action_text, config);
      insertEmbedding.run(row.note_id, vecJSON(vec));

      console.log(
        `  [retro:${row.note_id}] action item → "${
          result.action_text.slice(0, 60)
        }"`,
      );
    } else {
      console.log(`  [retro:${row.note_id}] ${result.category}`);
    }
  }
}

// --- Action item tracking ---

async function trackActionItems(db: DB, config?: AiConfig) {
  const pending = db.prepare(`
    SELECT a.source_id, a.action_text, r.retro_name
    FROM ai_analysis a
    JOIN retro_item r ON r.note_id = a.source_id
    WHERE a.source = 'retro' AND a.action_status = 'pending'
  `).all() as { source_id: string; action_text: string; retro_name: string }[];

  if (pending.length === 0) {
    console.log("\nNo pending action items to track.");
    return;
  }

  console.log(`\nTracking ${pending.length} action items...`);

  const updateStatus = db.prepare(
    `UPDATE ai_analysis SET action_status = ?, evidence = ? WHERE source = 'retro' AND source_id = ?`,
  );

  for (const item of pending) {
    const actionVecRow = db.prepare(
      `SELECT embedding FROM embedding WHERE source = 'retro_action' AND source_id = ?`,
    ).get(item.source_id) as { embedding: string } | undefined;

    if (!actionVecRow) {
      console.log(`  [action:${item.source_id}] No embedding found, skipping.`);
      continue;
    }

    // Semantic search for relevant Slack updates.
    // The inner query performs the KNN lookup; the outer query joins to the
    // slack_update table. sqlite-vec requires the k = N constraint to be
    // visible directly on the virtual table, which is why we use a subquery.
    const slackEvidence = db.prepare(`
      SELECT s.author, s.text, s.ts, e.distance
      FROM (
        SELECT source_id, distance
        FROM embedding
        WHERE embedding MATCH vec_f32(?)
          AND k = 15
          AND source = 'slack'
      ) e
      JOIN slack_update s ON CAST(s.id AS TEXT) = e.source_id
      ORDER BY e.distance
    `).all(actionVecRow.embedding) as {
      author: string;
      text: string;
      ts: string;
      distance: number;
    }[];

    // Semantic search for related retro notes (later boards or same topic).
    const retroEvidence = db.prepare(`
      SELECT r.retro_name, r.text, r."column" AS col, e.distance
      FROM (
        SELECT source_id, distance
        FROM embedding
        WHERE embedding MATCH vec_f32(?)
          AND k = 10
          AND source = 'retro_action'
          AND source_id != ?
      ) e
      JOIN retro_item r ON r.note_id = e.source_id
      ORDER BY e.distance
    `).all(actionVecRow.embedding, item.source_id) as {
      retro_name: string;
      text: string;
      col: string;
      distance: number;
    }[];

    const slackText = slackEvidence.length > 0
      ? slackEvidence.map((e) => `- ${e.author}: "${e.text}"`).join("\n")
      : "No semantically relevant Slack updates found.";

    const retroText = retroEvidence.length > 0
      ? retroEvidence.map((e) => `- [${e.retro_name} / ${e.col}]: "${e.text}"`)
        .join("\n")
      : "No semantically relevant retro mentions found.";

    const verdict = await structuredChat(
      [{
        role: "user",
        content:
          `You are a sprint effectiveness analyst. Evaluate whether this retro action item was followed through.

ACTION ITEM (from ${item.retro_name}):
"${item.action_text}"

EVIDENCE FROM SUBSEQUENT SLACK UPDATES (ranked by semantic relevance):
${slackText}

EVIDENCE FROM LATER RETRO BOARDS (ranked by semantic relevance):
${retroText}

Classify the action item as exactly one of:
- "done": clear evidence the action was completed
- "partial": some progress but not fully completed
- "not_done": no evidence of follow-through, or still outstanding
- "dropped": abandoned or became irrelevant

Provide a concise evidence summary explaining your reasoning.

JSON schema:
{
  "status": "done" | "partial" | "not_done" | "dropped",
  "evidence": string,
  "confidence": "high" | "medium" | "low"
}`,
      }],
      actionVerdictSchema,
      config,
    ) as z.infer<typeof actionVerdictSchema>;

    updateStatus.run(verdict.status, verdict.evidence, item.source_id);

    console.log(
      `  [action:${item.source_id}] ${verdict.status} (${verdict.confidence} confidence)`,
    );
  }
}

// --- Main ---

if (import.meta.main) {
  const db = openDB();
  await analyseSlack(db);
  await analyseRetros(db);
  await trackActionItems(db);
  console.log("\nAnalysis complete.");
}
