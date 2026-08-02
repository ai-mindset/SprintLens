import { assertEquals } from "@std/assert";
import type { DB } from "../src/db.ts";
import {
  parseSlackThread,
  parseTsv,
  replaceRetroItems,
  replaceSlackUpdates,
} from "../src/loader.ts";

function recordingDb() {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        run(...args: unknown[]) {
          calls.push({ sql: sql.replace(/\s+/g, " ").trim(), args });
        },
      };
    },
  } as unknown as DB;
  return { db, calls };
}

Deno.test("parseTsv maps headers, preserves empty fields, and ignores a trailing newline", () => {
  const records = parseTsv([
    "note_id\tauthor\ttext\trank",
    "n1\tAlex\tGood progress\t5",
    "n2\t\tMissing owner\t",
    "",
  ].join("\n"));

  assertEquals(records, [
    { note_id: "n1", author: "Alex", text: "Good progress", rank: "5" },
    { note_id: "n2", author: "", text: "Missing owner", rank: "" },
  ]);
});

Deno.test("parseSlackThread preserves thread and reply fields", () => {
  assertEquals(
    parseSlackThread(JSON.stringify({
      thread_ts: "1715000000",
      replies: [
        { author: "Alex", text: "Pipeline done!", ts: "1715003600" },
        { author: "Priya", text: "Blocked by API", ts: "1715007200" },
      ],
    })),
    {
      thread_ts: "1715000000",
      replies: [
        { author: "Alex", text: "Pipeline done!", ts: "1715003600" },
        { author: "Priya", text: "Blocked by API", ts: "1715007200" },
      ],
    },
  );
});

Deno.test("replaceRetroItems clears one sprint and maps every database field", () => {
  const { db, calls } = recordingDb();
  const count = replaceRetroItems(db, "sprint-01", [
    {
      note_id: "n1",
      author_id: "a1",
      author: "Alex",
      text: "Automate releases",
      column_id: "c1",
      column: "action",
      rank: "5",
      stack: "s1",
    },
    {
      note_id: "n2",
      author_id: "a2",
      author: "Priya",
      text: "Invalid rank",
      column_id: "c2",
      column: "negative",
      rank: "invalid",
      stack: "s2",
    },
  ]);

  assertEquals(count, 2);
  assertEquals(calls.length, 3);
  assertEquals(calls[0], {
    sql: "DELETE FROM retro_item WHERE retro_name = ?",
    args: ["sprint-01"],
  });
  assertEquals(calls[1].args, [
    "n1",
    "sprint-01",
    "a1",
    "Alex",
    "Automate releases",
    "c1",
    "action",
    5,
    "s1",
  ]);
  assertEquals(calls[2].args, [
    "n2",
    "sprint-01",
    "a2",
    "Priya",
    "Invalid rank",
    "c2",
    "negative",
    null,
    "s2",
  ]);
});

Deno.test("replaceSlackUpdates resets stale data once and inserts all replies", () => {
  const { db, calls } = recordingDb();
  const count = replaceSlackUpdates(db, [
    {
      thread_ts: "100",
      replies: [
        { author: "Alex", text: "One", ts: "101" },
        { author: "Bea", text: "Two", ts: "102" },
      ],
    },
    {
      thread_ts: "200",
      replies: [{ author: "Chen", text: "Three", ts: "201" }],
    },
  ]);

  assertEquals(count, 3);
  assertEquals(calls.map(({ args }) => args), [
    [],
    ["100", "Alex", "One", "101"],
    ["100", "Bea", "Two", "102"],
    ["200", "Chen", "Three", "201"],
  ]);
  assertEquals(
    calls.filter(({ sql }) => sql === "DELETE FROM slack_update").length,
    1,
  );
});
