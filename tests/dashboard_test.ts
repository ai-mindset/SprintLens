import { assertEquals, assertRejects } from "@std/assert";
import {
  countValues,
  createDashboardHandler,
  groupSentimentBySprint,
  json,
  parseStringList,
} from "../src/dashboard.ts";
import { type DB, openDB } from "../src/db.ts";

function testDatabase(): { db: DB; dispose: () => void } {
  const path = Deno.makeTempFileSync({ suffix: ".db" });
  const db = openDB(path);
  return {
    db,
    dispose() {
      db.close();
      Deno.removeSync(path);
    },
  };
}

function seedDashboard(db: DB) {
  const addSlack = db.prepare(
    "INSERT INTO slack_update (thread_ts, author, text, ts) VALUES (?, ?, ?, ?)",
  );
  const addAnalysis = db.prepare(
    `INSERT INTO ai_analysis
      (source, source_id, sentiment, themes, blockers, action_text, action_status, evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const addRetro = db.prepare(
    `INSERT INTO retro_item
      (note_id, retro_name, author, text, "column") VALUES (?, ?, ?, ?, ?)`,
  );

  addSlack.run("200", "Bea", "Second update", "20");
  addSlack.run("100", "Alex", "First update", "3");
  addSlack.run("300", "Chen", "Third update", "100");
  addAnalysis.run(
    "slack",
    "1",
    "negative",
    '["api","qa"]',
    '["access"]',
    null,
    null,
    null,
  );
  addAnalysis.run(
    "slack",
    "2",
    "positive",
    '["delivery","qa"]',
    "[]",
    null,
    null,
    null,
  );
  addAnalysis.run(
    "slack",
    "3",
    "neutral",
    '["qa"]',
    '["access"]',
    null,
    null,
    null,
  );

  addRetro.run("r1", "sprint-01", "Alex", "Original action", "action");
  addRetro.run("r2", "sprint-02", "Bea", "Keep pairing", "action");
  addAnalysis.run(
    "retro",
    "r1",
    null,
    null,
    null,
    "Automate checks",
    "done",
    "CI is green",
  );
  addAnalysis.run("retro", "r2", null, null, null, null, "not_done", null);
}

function responseJson(response: Response): Promise<unknown> {
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(response.headers.get("cache-control"), "no-store");
  return response.json();
}

Deno.test("parseStringList accepts string arrays and empty values", () => {
  assertEquals(parseStringList('["qa","delivery"]'), ["qa", "delivery"]);
  assertEquals(parseStringList(null), []);
  assertEquals(parseStringList(""), []);
  assertEquals(parseStringList('{"qa":true}'), []);
  assertEquals(parseStringList('["qa",2]'), []);
});

Deno.test("parseStringList reports malformed stored JSON", () => {
  assertRejects(
    () => Promise.resolve().then(() => parseStringList("not-json")),
    SyntaxError,
  );
});

Deno.test("countValues counts and deterministically sorts ties", () => {
  assertEquals(countValues([["qa", "api"], ["qa", "delivery"], ["api"]]), [
    { value: "api", count: 2 },
    { value: "qa", count: 2 },
    { value: "delivery", count: 1 },
  ]);
  assertEquals(countValues([]), []);
});

Deno.test("groupSentimentBySprint partitions updates and handles empty input", () => {
  assertEquals(
    groupSentimentBySprint(
      ["positive", "positive", "negative", "neutral", "negative"],
      ["sprint-01", "sprint-02"],
    ),
    [
      { sprint: "sprint-01", sentiment: "positive", count: 2 },
      { sprint: "sprint-01", sentiment: "negative", count: 1 },
      { sprint: "sprint-02", sentiment: "neutral", count: 1 },
      { sprint: "sprint-02", sentiment: "negative", count: 1 },
    ],
  );
  assertEquals(groupSentimentBySprint(["positive"], []), []);
  assertEquals(groupSentimentBySprint([], ["sprint-01"]), []);
});

Deno.test("json returns JSON with explicit status and no-store caching", async () => {
  const response = json({ error: "bad request" }, 400);
  assertEquals(response.status, 400);
  assertEquals(response.headers.get("cache-control"), "no-store");
  assertEquals(await response.json(), { error: "bad request" });
});

Deno.test("dashboard sentiment endpoints return chronological parsed data", async () => {
  const { db, dispose } = testDatabase();
  try {
    seedDashboard(db);
    const handler = createDashboardHandler(db);
    assertEquals(
      await responseJson(
        await handler(new Request("http://app/api/sentiment-trends")),
      ),
      [
        {
          thread_ts: "100",
          ts: "3",
          author: "Alex",
          text: "First update",
          sentiment: "positive",
          themes: ["delivery", "qa"],
          blockers: [],
        },
        {
          thread_ts: "200",
          ts: "20",
          author: "Bea",
          text: "Second update",
          sentiment: "negative",
          themes: ["api", "qa"],
          blockers: ["access"],
        },
        {
          thread_ts: "300",
          ts: "100",
          author: "Chen",
          text: "Third update",
          sentiment: "neutral",
          themes: ["qa"],
          blockers: ["access"],
        },
      ],
    );
    assertEquals(
      await responseJson(
        await handler(new Request("http://app/api/sentiment-by-sprint")),
      ),
      [
        { sprint: "sprint-01", sentiment: "positive", count: 1 },
        { sprint: "sprint-01", sentiment: "negative", count: 1 },
        { sprint: "sprint-02", sentiment: "neutral", count: 1 },
      ],
    );
  } finally {
    dispose();
  }
});

Deno.test("dashboard frequency endpoints count themes and blockers", async () => {
  const { db, dispose } = testDatabase();
  try {
    seedDashboard(db);
    const handler = createDashboardHandler(db);
    assertEquals(
      await responseJson(await handler(new Request("http://app/api/themes"))),
      [
        { theme: "qa", count: 3 },
        { theme: "api", count: 1 },
        { theme: "delivery", count: 1 },
      ],
    );
    assertEquals(
      await responseJson(await handler(new Request("http://app/api/blockers"))),
      [
        { blocker: "access", count: 2 },
      ],
    );
  } finally {
    dispose();
  }
});

Deno.test("dashboard action endpoints prefer extracted action text", async () => {
  const { db, dispose } = testDatabase();
  try {
    seedDashboard(db);
    const handler = createDashboardHandler(db);
    assertEquals(
      await responseJson(
        await handler(new Request("http://app/api/action-status")),
      ),
      [
        {
          retro_name: "sprint-01",
          text: "Automate checks",
          action_status: "done",
          action_text: "Automate checks",
          evidence: "CI is green",
        },
        {
          retro_name: "sprint-02",
          text: "Keep pairing",
          action_status: "not_done",
          action_text: null,
          evidence: null,
        },
      ],
    );
    assertEquals(
      await responseJson(
        await handler(new Request("http://app/api/action-status-by-sprint")),
      ),
      [
        { sprint: "sprint-01", status: "done", count: 1 },
        { sprint: "sprint-02", status: "not_done", count: 1 },
      ],
    );
  } finally {
    dispose();
  }
});

Deno.test("dashboard serves HTML and returns a plain 404", async () => {
  const { db, dispose } = testDatabase();
  try {
    const handler = createDashboardHandler(
      db,
      () => Promise.resolve("<h1>Dashboard</h1>"),
    );
    const home = await handler(new Request("http://app/"));
    assertEquals(home.status, 200);
    assertEquals(home.headers.get("content-type"), "text/html; charset=utf-8");
    assertEquals(await home.text(), "<h1>Dashboard</h1>");
    assertEquals(
      await (await handler(new Request("http://app/missing"))).text(),
      "Not found",
    );
    assertEquals(
      (await handler(new Request("http://app/missing"))).status,
      404,
    );
  } finally {
    dispose();
  }
});
