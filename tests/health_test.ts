import { assertEquals, assertStringIncludes } from "@std/assert";
import type { DB } from "../src/db.ts";
import { checkHealth, startupFailureHealth } from "../src/health.ts";

function healthDatabase(): DB {
  return {
    prepare(sql: string) {
      const count = sql.includes("slack_update")
        ? 12
        : sql.includes("retro_item")
        ? 4
        : 16;
      return { get: () => ({ count }) };
    },
  } as unknown as DB;
}

Deno.test("health check reports data counts and reachable AI provider", async () => {
  const fetcher = (() => Promise.resolve(new Response("{}"))) as typeof fetch;
  const report = await checkHealth(healthDatabase(), fetcher);
  assertEquals(report.status, "ready");
  assertEquals(report.database.slackUpdates, 12);
  assertEquals(report.database.retroItems, 4);
  assertEquals(report.database.analyses, 16);
  assertEquals(report.ai.ok, true);
});

Deno.test("health check degrades without exposing secrets", async () => {
  const fetcher =
    (() => Promise.reject(new Error("connection refused"))) as typeof fetch;
  const report = await checkHealth(healthDatabase(), fetcher);
  assertEquals(report.status, "degraded");
  assertEquals(report.ai.ok, false);
  assertEquals(report.ai.message, "connection refused");
  assertEquals("apiKey" in report.ai, false);
});

Deno.test("startup failure health preserves an actionable error", () => {
  const report = startupFailureHealth(new Error("database is locked"));
  assertEquals(report.status, "error");
  assertEquals(report.database.ok, false);
  assertStringIncludes(report.database.message!, "database is locked");
});
