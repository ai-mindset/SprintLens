/**
 * SprintLens configuration — single source of truth.
 *
 * AI provider examples (all OpenAI-compatible):
 *
 *   // Ollama (local, default)
 *   ai: { baseURL: "http://localhost:11434/v1", chatModel: "qwen3.6:27b", embedModel: "qwen3-embedding:8b" }
 *
 *   // Mistral
 *   ai: { baseURL: "https://api.mistral.ai/v1", apiKey: "<key>", chatModel: "mistral-large-latest", embedModel: "mistral-embed" }
 *
 *   // Azure OpenAI — baseURL includes deployment + API version
 *   ai: { baseURL: "https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat", apiKey: "<key>", chatModel: "gpt-4o", embedModel: "text-embedding-3-large" }
 */

export const config = {
  sqliteVecVersion: "0.1.9",
  dbPath: "data/sprintlens.db",
  embedDim: 4096, // qwen3-embedding:8b - verify and adjust for other models
  ai: {
    baseURL: "http://localhost:11434/v1",
    apiKey: undefined as string | undefined,
    chatModel: "qwen3.6:27b",
    embedModel: "qwen3-embedding:8b",
  },
  port: 8765,
};
