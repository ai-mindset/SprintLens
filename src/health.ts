import type { DB } from "./db.ts";
import { config } from "./config.ts";

export type HealthReport = {
  status: "ready" | "degraded" | "error";
  database: {
    ok: boolean;
    path: string;
    slackUpdates: number;
    retroItems: number;
    analyses: number;
    message?: string;
  };
  ai: {
    ok: boolean;
    baseURL: string;
    chatModel: string;
    embedModel: string;
    apiKeyConfigured: boolean;
    message?: string;
  };
};

function rowCount(db: DB, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
    | { count: number }
    | undefined;
  return Number(row?.count ?? 0);
}

export async function checkHealth(
  db: DB,
  fetcher: typeof fetch = fetch,
): Promise<HealthReport> {
  const database = {
    ok: true,
    path: config.dbPath,
    slackUpdates: rowCount(db, "slack_update"),
    retroItems: rowCount(db, "retro_item"),
    analyses: rowCount(db, "ai_analysis"),
  };

  const ai: HealthReport["ai"] = {
    ok: false,
    baseURL: config.ai.baseURL,
    chatModel: config.ai.chatModel,
    embedModel: config.ai.embedModel,
    apiKeyConfigured: Boolean(config.ai.apiKey),
  };

  try {
    const response = await fetcher(
      `${config.ai.baseURL.replace(/\/$/, "")}/models`,
      {
        headers: config.ai.apiKey
          ? { Authorization: `Bearer ${config.ai.apiKey}` }
          : undefined,
        signal: AbortSignal.timeout(2500),
      },
    );
    ai.ok = response.ok;
    if (!response.ok) ai.message = `Provider returned HTTP ${response.status}`;
  } catch (error) {
    ai.message = error instanceof Error ? error.message : String(error);
  }

  return {
    status: ai.ok ? "ready" : "degraded",
    database,
    ai,
  };
}

export function startupFailureHealth(error: unknown): HealthReport {
  return {
    status: "error",
    database: {
      ok: false,
      path: config.dbPath,
      slackUpdates: 0,
      retroItems: 0,
      analyses: 0,
      message: error instanceof Error ? error.message : String(error),
    },
    ai: {
      ok: false,
      baseURL: config.ai.baseURL,
      chatModel: config.ai.chatModel,
      embedModel: config.ai.embedModel,
      apiKeyConfigured: Boolean(config.ai.apiKey),
      message: "Not checked because the database could not be opened",
    },
  };
}
