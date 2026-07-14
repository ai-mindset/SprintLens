import { z } from "zod";
import { type DB, openDB } from "./db.ts";
import { type AiConfig, chat, embed } from "./ai.ts";

// --- Signal handling ---
let interrupted = false;
function onInterrupt() {
  console.log("\nInterrupt received. Finishing current item, then stopping...");
  interrupted = true;
}
Deno.addSignalListener("SIGINT", onInterrupt);

// --- Helpers ---
function vecJSON(vec: number[]): string {
  return JSON.stringify(vec);
}

function begin(db: DB) {
  db.prepare("BEGIN").run();
}

function commit(db: DB) {
  db.prepare("COMMIT").run();
}

function rollback(db: DB) {
  try {
    db.prepare("ROLLBACK").run();
  } catch {
    // Ignore rollback errors.
  }
}

// --- Schemas ---
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

// --- Structured chat ---
async function structuredChat(
  messages: { role: string; content: string }[],
  schema: z.ZodType,
  config?: AiConfig,
) {
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
  `).all() as { id: number; author: string; text: string }[];

  const insertAnalysis = db.prepare(
    `INSERT INTO ai_analysis (source, source_id, sentiment, themes, blockers)
     VALUES ('slack', ?, ?, ?, ?)`,
  );
  const insertEmbedding = db.prepare(
    `INSERT INTO embedding (source, source_id, embedding) VALUES ('slack', ?, ?)`,
  );
  const exists = db.prepare(
    `SELECT 1 FROM ai_analysis WHERE source = 'slack' AND source_id = ? LIMIT 1`,
  );

  console.log(`Analysing Slack updates...`);

  let skipped = 0;
  let processed = 0;

  for (const row of rows) {
    if (interrupted) break;

    const alreadyDone = exists.get(String(row.id));
    if (alreadyDone) {
      skipped++;
      continue;
    }

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

    const vec = await embed(row.text, config);

    try {
      begin(db);
      insertAnalysis.run(
        String(row.id),
        result.sentiment,
        JSON.stringify(result.themes),
        JSON.stringify(result.blockers),
      );
      insertEmbedding.run(String(row.id), vecJSON(vec));
      commit(db);
      processed++;
      console.log(
        `  [slack:${row.id}] ${result.sentiment} — themes: ${
          result.themes.join(", ") || "none"
        }`,
      );
    } catch (err) {
      rollback(db);
      console.error(`  [slack:${row.id}] failed to save:`, err);
    }
  }

  console.log(`Slack: ${processed} processed, ${skipped} skipped.`);
}

// --- Retro classification ---
async function analyseRetros(db: DB, config?: AiConfig) {
  const rows = db.prepare(`
    SELECT note_id, text, "column" AS col FROM retro_item
  `).all() as { note_id: string; text: string; col: string }[];

  const insertAnalysis = db.prepare(
    `INSERT INTO ai_analysis (source, source_id, action_text, action_status)
     VALUES ('retro', ?, ?, 'pending')`,
  );
  const insertEmbedding = db.prepare(
    `INSERT INTO embedding (source, source_id, embedding) VALUES ('retro_action', ?, ?)`,
  );
  const exists = db.prepare(
    `SELECT 1 FROM ai_analysis WHERE source = 'retro' AND source_id = ? LIMIT 1`,
  );

  console.log(`\nAnalysing retro items...`);

  let skipped = 0;
  let processed = 0;

  for (const row of rows) {
    if (interrupted) break;

    const alreadyDone = exists.get(row.note_id);
    if (alreadyDone) {
      skipped++;
      continue;
    }

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
      try {
        const vec = await embed(result.action_text, config);
        begin(db);
        insertAnalysis.run(row.note_id, result.action_text);
        insertEmbedding.run(row.note_id, vecJSON(vec));
        commit(db);
        processed++;
        console.log(
          `  [retro:${row.note_id}] action item → "${
            result.action_text.slice(0, 60)
          }"`,
        );
      } catch (err) {
        rollback(db);
        console.error(`  [retro:${row.note_id}] failed to save:`, err);
      }
    } else {
      processed++;
      console.log(`  [retro:${row.note_id}] ${result.category}`);
    }
  }

  console.log(`Retro: ${processed} processed, ${skipped} skipped.`);
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
    if (interrupted) break;

    const actionVecRow = db.prepare(
      `SELECT embedding FROM embedding WHERE source = 'retro_action' AND source_id = ?`,
    ).get(item.source_id) as { embedding: string } | undefined;

    if (!actionVecRow) {
      console.log(`  [action:${item.source_id}] No embedding found, skipping.`);
      continue;
    }

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

  try {
    await analyseSlack(db);
    await analyseRetros(db);
    await trackActionItems(db);
  } finally {
    Deno.removeSignalListener("SIGINT", onInterrupt);
  }

  console.log("\nAnalysis complete.");
}
