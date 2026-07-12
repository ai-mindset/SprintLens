import { basename } from "@std/path";
import { expandGlob } from "@std/fs";
import { type DB, openDB } from "./db.ts";

function parseTsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

export async function loadRetros(db: DB, glob = "data/retros/*.csv") {
  for await (const file of expandGlob(glob)) {
    const retroName = basename(file.name, ".csv");
    const text = Deno.readTextFileSync(file.path);
    const records = parseTsv(text);

    db.prepare("DELETE FROM retro_item WHERE retro_name = ?").run(retroName);

    const insert = db.prepare(
      `INSERT INTO retro_item (note_id, retro_name, author_id, author, text, column_id, "column", rank, stack)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const row of records) {
      insert.run(
        row.note_id,
        retroName,
        row.author_id,
        row.author,
        row.text,
        row.column_id,
        row.column,
        parseInt(row.rank) || null,
        row.stack,
      );
    }

    const row = db.prepare(
      "SELECT count(*) AS cnt FROM retro_item WHERE retro_name = ?",
    ).get(retroName) as { cnt: number } | undefined;
    const count = row?.cnt ?? 0;
    console.log(`Loaded ${retroName}: ${count} items`);
  }
}

export async function loadSlack(db: DB, glob = "data/slack/*.json") {
  db.prepare("DELETE FROM slack_update").run();
  for await (const file of expandGlob(glob)) {
    const thread: {
      thread_ts: string;
      replies: { author: string; text: string; ts: string }[];
    } = JSON.parse(Deno.readTextFileSync(file.path));

    const insert = db.prepare(
      "INSERT INTO slack_update (thread_ts, author, text, ts) VALUES (?, ?, ?, ?)",
    );

    for (const reply of thread.replies) {
      insert.run(thread.thread_ts, reply.author, reply.text, reply.ts);
    }
    console.log(`Loaded ${file.name}: ${thread.replies.length} replies`);
  }
}

if (import.meta.main) {
  const db = openDB();
  await loadRetros(db);
  await loadSlack(db);

  const retroCount =
    (db.prepare("SELECT count(*) AS cnt FROM retro_item").get() as {
      cnt: number;
    } | undefined)?.cnt ?? 0;
  const slackCount =
    (db.prepare("SELECT count(*) AS cnt FROM slack_update").get() as {
      cnt: number;
    } | undefined)?.cnt ?? 0;

  console.log("Done. Counts:");
  console.log("  retro items:", retroCount);
  console.log("  slack updates:", slackCount);
}
