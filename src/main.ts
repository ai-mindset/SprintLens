import { openDB } from "./db.ts";

const db = openDB();

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

// --- Slack analysis ---

function sentimentTrends(): Response {
  const rows = db.prepare(`
    SELECT s.thread_ts, s.ts, s.author, s.text, a.sentiment, a.themes, a.blockers
    FROM slack_update s
    JOIN ai_analysis a ON a.source_id = CAST(s.id AS TEXT) AND a.source = 'slack'
    ORDER BY s.ts
  `).all() as {
    thread_ts: string;
    ts: string;
    author: string;
    text: string;
    sentiment: string;
    themes: string;
    blockers: string;
  }[];

  return json(rows.map((r) => ({
    thread_ts: r.thread_ts,
    ts: r.ts,
    author: r.author,
    text: r.text,
    sentiment: r.sentiment,
    themes: r.themes ? JSON.parse(r.themes) : [],
    blockers: r.blockers ? JSON.parse(r.blockers) : [],
  })));
}

function sentimentBySprint(): Response {
  return inferSentimentBySprint();
}

function inferSentimentBySprint(): Response {
  const sentimentRows = db.prepare(`
    SELECT s.ts, a.sentiment
    FROM slack_update s
    JOIN ai_analysis a ON a.source_id = CAST(s.id AS TEXT) AND a.source = 'slack'
  `).all() as { ts: string; sentiment: string }[];

  const sprints = db.prepare(`
    SELECT retro_name FROM retro_item GROUP BY retro_name ORDER BY retro_name
  `).all() as { retro_name: string }[];

  if (sprints.length === 0) return json([]);

  const sortedSprints = sprints.map((s) => s.retro_name);
  const total = sentimentRows.length;
  const perSprint = Math.ceil(total / sortedSprints.length);

  const result: { sprint: string; sentiment: string; count: number }[] = [];
  const counts: Record<string, Record<string, number>> = {};

  sentimentRows.forEach((row, idx) => {
    const sprintIdx = Math.min(
      Math.floor(idx / perSprint),
      sortedSprints.length - 1,
    );
    const sprint = sortedSprints[sprintIdx];
    counts[sprint] ??= {};
    counts[sprint][row.sentiment] = (counts[sprint][row.sentiment] ?? 0) + 1;
  });

  for (const [sprint, sentiments] of Object.entries(counts)) {
    for (const [sentiment, count] of Object.entries(sentiments)) {
      result.push({ sprint, sentiment, count });
    }
  }

  return json(result);
}

function themeFrequency(): Response {
  const rows = db.prepare(`
    SELECT themes FROM ai_analysis
    WHERE source = 'slack' AND themes IS NOT NULL
  `).all() as { themes: string }[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const theme of JSON.parse(row.themes)) {
      counts[theme] = (counts[theme] ?? 0) + 1;
    }
  }

  return json(
    Object.entries(counts)
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count),
  );
}

function blockerFrequency(): Response {
  const rows = db.prepare(`
    SELECT blockers FROM ai_analysis
    WHERE source = 'slack' AND blockers IS NOT NULL
  `).all() as { blockers: string }[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const blocker of JSON.parse(row.blockers)) {
      counts[blocker] = (counts[blocker] ?? 0) + 1;
    }
  }

  return json(
    Object.entries(counts)
      .map(([blocker, count]) => ({ blocker, count }))
      .sort((a, b) => b.count - a.count),
  );
}

// --- Action analysis ---

function actionStatus(): Response {
  const rows = db.prepare(`
    SELECT r.retro_name, r.text, a.action_status, a.action_text, a.evidence
    FROM retro_item r
    JOIN ai_analysis a ON a.source_id = r.note_id AND a.source = 'retro'
    WHERE a.action_status IS NOT NULL
    ORDER BY r.retro_name
  `).all() as {
    retro_name: string;
    text: string;
    action_status: string;
    action_text: string;
    evidence: string;
  }[];

  return json(rows.map((r) => ({
    retro_name: r.retro_name,
    text: r.action_text || r.text,
    action_status: r.action_status,
    evidence: r.evidence,
  })));
}

function actionStatusBySprint(): Response {
  const rows = db.prepare(`
    SELECT r.retro_name AS sprint, a.action_status AS status, COUNT(*) AS count
    FROM retro_item r
    JOIN ai_analysis a ON a.source_id = r.note_id AND a.source = 'retro'
    WHERE a.action_status IS NOT NULL
    GROUP BY r.retro_name, a.action_status
    ORDER BY r.retro_name
  `).all();

  return json(rows);
}

// --- Static file ---

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/api/sentiment-trends") return sentimentTrends();
  if (url.pathname === "/api/sentiment-by-sprint") return sentimentBySprint();
  if (url.pathname === "/api/themes") return themeFrequency();
  if (url.pathname === "/api/blockers") return blockerFrequency();
  if (url.pathname === "/api/action-status") return actionStatus();
  if (url.pathname === "/api/action-status-by-sprint") {
    return actionStatusBySprint();
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = await Deno.readTextFile("index.html");
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response("Not found", { status: 404 });
}

Deno.serve({ port: 8765 }, handler);
