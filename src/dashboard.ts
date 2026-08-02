import type { DB } from "./db.ts";
import { dirname, fromFileUrl, join } from "@std/path";
import { checkHealth, startupFailureHealth } from "./health.ts";

type Asset = { file: string; contentType: string };

const plotEntry = fromFileUrl(import.meta.resolve("@observablehq/plot"));
const d3Entry = fromFileUrl(import.meta.resolve("d3"));
const projectRoot = join(import.meta.dirname!, "..");
const assets = new Map<string, Asset>([
  ["/vendor/pico.min.css", {
    file: fromFileUrl(import.meta.resolve("@picocss/pico")),
    contentType: "text/css; charset=utf-8",
  }],
  ["/vendor/d3.min.js", {
    file: join(dirname(d3Entry), "..", "dist", "d3.min.js"),
    contentType: "text/javascript; charset=utf-8",
  }],
  ["/vendor/plot.umd.min.js", {
    file: join(dirname(plotEntry), "..", "dist", "plot.umd.min.js"),
    contentType: "text/javascript; charset=utf-8",
  }],
]);

export type DashboardOptions = {
  readIndex?: () => Promise<string>;
  readAsset?: (file: string) => Promise<Uint8Array<ArrayBuffer>>;
  getHealth?: () => Promise<unknown>;
  startupError?: unknown;
};

export type SentimentRow = {
  thread_ts: string;
  ts: string;
  author: string;
  text: string;
  sentiment: string;
  themes: string;
  blockers: string;
};

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function parseStringList(value: string | null): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ? parsed
    : [];
}

export function countValues(values: Iterable<string[]>): {
  value: string;
  count: number;
}[] {
  const counts = new Map<string, number>();
  for (const list of values) {
    for (const value of list) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
}

export function groupSentimentBySprint(
  sentiments: string[],
  sprints: string[],
): { sprint: string; sentiment: string; count: number }[] {
  if (sprints.length === 0 || sentiments.length === 0) return [];
  const perSprint = Math.ceil(sentiments.length / sprints.length);
  const counts = new Map<string, number>();

  sentiments.forEach((sentiment, index) => {
    const sprint =
      sprints[Math.min(Math.floor(index / perSprint), sprints.length - 1)];
    const key = `${sprint}\0${sentiment}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts].map(([key, count]) => {
    const [sprint, sentiment] = key.split("\0");
    return { sprint, sentiment, count };
  });
}

export function createDashboardHandler(
  db: DB | null,
  options: DashboardOptions = {},
): (request: Request) => Promise<Response> {
  const readIndex = options.readIndex ??
    (() => Deno.readTextFile(join(projectRoot, "index.html")));
  const readAsset = options.readAsset ?? Deno.readFile;
  const database = (): DB => {
    if (!db) throw new Error("SprintLens database is unavailable");
    return db;
  };

  function sentimentTrends(): Response {
    const rows = database().prepare(`
      SELECT s.thread_ts, s.ts, s.author, s.text, a.sentiment, a.themes, a.blockers
      FROM slack_update s
      JOIN ai_analysis a ON a.source_id = CAST(s.id AS TEXT) AND a.source = 'slack'
      ORDER BY CAST(s.ts AS REAL)
    `).all() as SentimentRow[];

    return json(rows.map((row) => ({
      ...row,
      themes: parseStringList(row.themes),
      blockers: parseStringList(row.blockers),
    })));
  }

  function sentimentBySprint(): Response {
    const sentiments = database().prepare(`
      SELECT a.sentiment
      FROM slack_update s
      JOIN ai_analysis a ON a.source_id = CAST(s.id AS TEXT) AND a.source = 'slack'
      ORDER BY CAST(s.ts AS REAL)
    `).all() as { sentiment: string }[];
    const sprints = database().prepare(`
      SELECT retro_name FROM retro_item GROUP BY retro_name ORDER BY retro_name
    `).all() as { retro_name: string }[];

    return json(groupSentimentBySprint(
      sentiments.map((row) => row.sentiment),
      sprints.map((row) => row.retro_name),
    ));
  }

  function frequency(column: "themes" | "blockers", label: string): Response {
    const rows = database().prepare(`
      SELECT ${column} AS values_json FROM ai_analysis
      WHERE source = 'slack' AND ${column} IS NOT NULL
    `).all() as { values_json: string }[];
    return json(
      countValues(rows.map((row) => parseStringList(row.values_json))).map(
        ({ value, count }) => ({ [label]: value, count }),
      ),
    );
  }

  function actionStatus(): Response {
    const rows = database().prepare(`
      SELECT r.retro_name, r.text, a.action_status, a.action_text, a.evidence
      FROM retro_item r
      JOIN ai_analysis a ON a.source_id = r.note_id AND a.source = 'retro'
      WHERE a.action_status IS NOT NULL
      ORDER BY r.retro_name
    `).all() as {
      retro_name: string;
      text: string;
      action_status: string;
      action_text: string | null;
      evidence: string | null;
    }[];
    return json(rows.map((row) => ({
      ...row,
      text: row.action_text || row.text,
    })));
  }

  function actionStatusBySprint(): Response {
    return json(
      database().prepare(`
      SELECT r.retro_name AS sprint, a.action_status AS status, COUNT(*) AS count
      FROM retro_item r
      JOIN ai_analysis a ON a.source_id = r.note_id AND a.source = 'retro'
      WHERE a.action_status IS NOT NULL
      GROUP BY r.retro_name, a.action_status
      ORDER BY r.retro_name, a.action_status
    `).all(),
    );
  }

  return async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/health") {
      const report = options.getHealth
        ? await options.getHealth()
        : db
        ? await checkHealth(db)
        : startupFailureHealth(options.startupError);
      // The diagnostic itself remains readable when startup failed; data APIs
      // below still return 503 until the database is available.
      return json(report);
    }
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(await readIndex(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const asset = assets.get(pathname);
    if (asset) {
      return new Response(await readAsset(asset.file), {
        headers: {
          "Content-Type": asset.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    if (!db && pathname.startsWith("/api/")) {
      return json({ error: "SprintLens could not open its database" }, 503);
    }
    if (pathname === "/api/sentiment-trends") return sentimentTrends();
    if (pathname === "/api/sentiment-by-sprint") return sentimentBySprint();
    if (pathname === "/api/themes") return frequency("themes", "theme");
    if (pathname === "/api/blockers") return frequency("blockers", "blocker");
    if (pathname === "/api/action-status") return actionStatus();
    if (pathname === "/api/action-status-by-sprint") {
      return actionStatusBySprint();
    }
    return new Response("Not found", { status: 404 });
  };
}
