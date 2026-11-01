/**
 * SprintLens configuration — single source of truth.
 *
 * AI provider settings come from SPRINTLENS_* environment variables.
 * Examples (all OpenAI-compatible):
 *
 *   SPRINTLENS_AI_BASE_URL=http://localhost:11434/v1
 *   SPRINTLENS_CHAT_MODEL=qwen3.6:27b
 *   SPRINTLENS_EMBED_MODEL=qwen3-embedding:8b
 *
 *   SPRINTLENS_AI_BASE_URL=https://api.mistral.ai/v1
 *   SPRINTLENS_API_KEY=<key>
 *   SPRINTLENS_CHAT_MODEL=mistral-large-latest
 *   SPRINTLENS_EMBED_MODEL=mistral-embed
 */

import { join } from "@std/path";
import { getAppDataDirectory, readEnvironment } from "./app_paths.ts";

const env = readEnvironment();
const dataDir = (() => {
  try {
    return getAppDataDirectory(Deno.build.os, env);
  } catch {
    // Permission-free unit tests cannot read HOME. Runtime tasks use
    // --allow-env and therefore resolve the platform-specific directory.
    return join(Deno.cwd(), ".sprintlens");
  }
})();

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  sqliteVecVersion: "0.1.9",
  dataDir,
  dbPath: env.SPRINTLENS_DB_PATH ?? join(dataDir, "sprintlens.db"),
  embedDim: positiveInteger(env.SPRINTLENS_EMBED_DIM, 4096),
  ai: {
    baseURL: env.SPRINTLENS_AI_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: env.SPRINTLENS_API_KEY,
    chatModel: env.SPRINTLENS_CHAT_MODEL ?? "qwen3.6:27b",
    embedModel: env.SPRINTLENS_EMBED_MODEL ?? "qwen3-embedding:8b",
  },
  port: positiveInteger(env.SPRINTLENS_PORT, 8765),
};
