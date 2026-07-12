import { assertEquals } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { loadRetros, loadSlack } from "../src/loader.ts";
import { openDB } from "../src/db.ts";

const TEST_DB = "data/test_sprintlens.db";

function cleanDB() {
  try {
    Deno.removeSync(TEST_DB);
  } catch {
    // file may not exist
  }
}

Deno.test("loadRetros loads retro items from CSV", async () => {
  cleanDB();
  Deno.mkdirSync("data/retros", { recursive: true });
  Deno.writeTextFileSync(
    "data/retros/test-sprint.csv",
    [
      "note_id\tauthor_id\tauthor\ttext\tcolumn_id\tcolumn\trank\tstack",
      "n1\ta1\tAlex\tGood progress on pipeline\tc1\tpositive\t5\ts1",
      "n2\ta2\tPriya\tToo many meetings\tc2\tnegative\t3\ts2",
    ].join("\n") + "\n",
  );

  const db = openDB(TEST_DB);
  await loadRetros(db, "data/retros/test-sprint.csv");

  const rows = db.prepare("SELECT * FROM retro_item").all() as Record<
    string,
    unknown
  >[];
  assertEquals(rows.length, 2);
  assertEquals(rows[0].retro_name, "test-sprint");
  assertEquals(rows[1].column, "negative");

  db.close();
  cleanDB();
  Deno.removeSync("data/retros/test-sprint.csv");
});

Deno.test("loadSlack loads thread replies from JSON", async () => {
  cleanDB();
  Deno.mkdirSync("data/slack", { recursive: true });
  Deno.writeTextFileSync(
    "data/slack/test-thread.json",
    JSON.stringify({
      thread_ts: "1715000000",
      replies: [
        { author: "Alex", text: "Pipeline done!", ts: "1715003600" },
        { author: "Priya", text: "Blocked by API", ts: "1715007200" },
      ],
    }),
  );

  const db = openDB(TEST_DB);
  await loadSlack(db, "data/slack/test-thread.json");

  const rows = db.prepare("SELECT * FROM slack_update").all() as Record<
    string,
    unknown
  >[];
  assertEquals(rows.length, 2);
  assertEquals(rows[0].author, "Alex");
  assertEquals(rows[1].text, "Blocked by API");

  db.close();
  cleanDB();
  Deno.removeSync("data/slack/test-thread.json");
});
