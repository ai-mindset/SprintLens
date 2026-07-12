import { z } from "zod";
import { config } from "./config.ts";

export type AiConfig = {
  baseURL: string;
  apiKey?: string;
  chatModel: string;
  embedModel: string;
};

function extractJson(text: string): string {
  // Try to pull JSON out of markdown fences, or return the whole string if none.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

function normaliseStrings(value: unknown): unknown {
  // Recursively lowercase string enum-like fields so the model's
  // "Positive" or "  positive  " becomes "positive".
  if (typeof value === "string") return value.trim().toLowerCase();
  if (Array.isArray(value)) return value.map(normaliseStrings);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normaliseStrings(v)]),
    );
  }
  return value;
}

export async function chat(
  messages: { role: string; content: string }[],
  schema?: z.ZodType,
  aiConfig: AiConfig = config.ai,
): Promise<unknown> {
  const body: Record<string, unknown> = { model: aiConfig.chatModel, messages };
  if (schema) {
    const { zodToJsonSchema } = await import("zod-to-json-schema");

    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "response",
        // deno-lint-ignore no-explicit-any
        schema: zodToJsonSchema(schema as any, "response"),
        strict: true,
      },
    };
  }

  const res = await fetch(`${aiConfig.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(aiConfig.apiKey
        ? { Authorization: `Bearer ${aiConfig.apiKey}` }
        : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Chat API error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const content = extractJson(json.choices[0].message.content);
  return schema ? schema.parse(normaliseStrings(JSON.parse(content))) : content;
}

export async function embed(
  input: string,
  aiConfig: AiConfig = config.ai,
): Promise<number[]> {
  const res = await fetch(`${aiConfig.baseURL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(aiConfig.apiKey
        ? { Authorization: `Bearer ${aiConfig.apiKey}` }
        : {}),
    },
    body: JSON.stringify({ model: aiConfig.embedModel, input }),
  });

  if (!res.ok) {
    throw new Error(`Embed API error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
}
