import { DatabaseSync } from "node:sqlite";
import { getLoadablePath } from "sqlite-vec";
import { config } from "../src/config.ts";

export type DB = DatabaseSync;

export const EMBED_DIM = 4096; // qwen3-embedding:8b — verify and adjust for your model

function vecExtPath(): string {
  const ext = Deno.build.os === "windows"
    ? "dll"
    : Deno.build.os === "darwin"
    ? "dylib"
    : "so";
  return `data/vec0.${ext}`;
}

function vecLoadPath(): string {
  try {
    if (Deno.statSync(vecExtPath()).isFile) return vecExtPath();
  } catch {
    // fall through to package-provided extension path
  }
  return getLoadablePath();
}

function normalizeLoadExtensionPath(path: string): string {
  // node:sqlite appends the platform suffix automatically.
  return path.replace(/\.(so|dylib|dll)$/i, "");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS retro_item (
  note_id     TEXT PRIMARY KEY,
  retro_name  TEXT NOT NULL,
  author_id   TEXT,
  author      TEXT,
  text        TEXT NOT NULL,
  column_id   TEXT,
  "column"      TEXT,
  rank        INTEGER,
  stack       TEXT
);

CREATE TABLE IF NOT EXISTS slack_update (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_ts   TEXT NOT NULL,
  author      TEXT NOT NULL,
  text        TEXT NOT NULL,
  ts          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_analysis (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  sentiment     TEXT,
  themes        TEXT,
  blockers      TEXT,
  action_text   TEXT,
  action_status TEXT,
  evidence      TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export function openDB(path = config.dbPath): DB {
  const db = new DatabaseSync(path, { allowExtension: true });
  db.loadExtension(normalizeLoadExtensionPath(vecLoadPath()));

  for (const stmt of SCHEMA.split(";").filter((s) => s.trim())) {
    db.prepare(stmt).run();
  }

  // vec0 virtual tables don't support IF NOT EXISTS reliably
  try {
    db.prepare(
      `CREATE VIRTUAL TABLE embedding USING vec0(
        source TEXT,
        source_id TEXT,
        embedding float[${EMBED_DIM}] distance_metric=cosine
      )`,
    ).run();
  } catch (e) {
    if (!String(e).includes("already exists")) throw e;
  }

  return db;
}
