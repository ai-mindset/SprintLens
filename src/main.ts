import { openDB } from "./db.ts";

const db = openDB();

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

function sentimentTrends(): Response {
  const rows = db.prepare(`
    SELECT s.thread_ts, s.author, a.sentiment
    FROM slack_update s
    JOIN ai_analysis a ON a.source_id = CAST(s.id AS TEXT) AND a.source = 'slack'
    ORDER BY s.ts
  `).all();
  return json(rows);
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

function actionStatus(): Response {
  const rows = db.prepare(`
    SELECT r.retro_name, r.text, a.action_status
    FROM retro_item r
    JOIN ai_analysis a ON a.source_id = r.note_id AND a.source = 'retro'
    WHERE a.action_status IS NOT NULL
    ORDER BY r.retro_name
  `).all();
  return json(rows);
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/api/sentiment-trends") return sentimentTrends();
  if (url.pathname === "/api/themes") return themeFrequency();
  if (url.pathname === "/api/blockers") return blockerFrequency();
  if (url.pathname === "/api/action-status") return actionStatus();

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = await Deno.readTextFile("index.html");
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response("Not found", { status: 404 });
}

Deno.serve({ port: 8765 }, handler);
