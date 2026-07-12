# 🏃🔍 SprintLens

**Are your sprint retros actually changing anything?**

SprintLens analyses your team's Slack updates and retrospective boards
using AI to measure sprint ceremony effectiveness - sentiment trends,
recurring themes, persistent blockers, and whether retro action items
were actually followed through.

---

## Quick Start

### Prerequisites

- [Deno 2.x](https://deno.com/) with Desktop support
- An Ollama instance running locally (or any OpenAI-compatible API)

**Linux (Debian/Ubuntu):**

```bash
sudo apt install libwebkit2gtk-4.1-dev
```

**Linux (Fedora):**

```bash
sudo dnf install webkit2gtk4.1-devel
```

**Linux (Arch):**

```bash
sudo pacman -S webkit2gtk-4.1
```

**macOS:** No additional system dependencies required (uses system WebKit).

**Windows:** No additional system dependencies required (uses Edge WebView2, included with Windows 10/11).

### 1. Configure

Edit `src/config.ts` to point at your AI provider:

```typescript
ai: {
  baseURL: "http://localhost:11434/v1",   // Ollama default
  apiKey: undefined,                       // set for cloud providers
  chatModel: "qwen3.6:27b",
  embedModel: "qwen3-embedding:8b",
}
```

Any OpenAI-compatible API works - Mistral, Azure OpenAI, local Ollama, etc.

### 2. Add your data

- **Retro boards**: export as TSV/CSV, place in `data/retros/`
  (one file per sprint, e.g. `sprint-01.csv`)
- **Slack updates**: export thread replies as JSON, place in `data/slack/`
  (one file per thread, see format below)

### 3. Run the pipeline

```bash
deno task setup       # download sqlite-vec extension
deno task load         # load data into SQLite
deno task analyse      # AI analysis + action tracking
deno task app          # launch dashboard
```

Or all at once:

```bash
deno task pipeline
```

The dashboard opens at `http://localhost:8765`.

### 4. Try it with synthetic data (no real data needed)

```bash
deno task generate     # creates 90 days of fake Slack + 4 retro boards
deno task pipeline     # load → analyse → dashboard
```

---

## Data Formats

### Retro board CSV (tab-separated)

```
note_id  author_id  author  text              column_id  column    rank  stack
<uuid>   <uuid>     <name>  "too much work"   <uuid>     negative  8     <uuid>
<uuid>   <uuid>     <name>  "QA caught a bug" <uuid>     positive  5     <uuid>
```

Filename becomes the retro name (e.g. `sprint-01.csv` → `sprint-01`).

### Slack thread JSON

```json
{
  "thread_ts": "1715000000",
  "replies": [
    { "author": "Alex Morgan", "text": "Pipeline migration done!", "ts": "1715003600" },
    { "author": "Tom Bradley", "text": "Blocked by API access", "ts": "1715007200" }
  ]
}
```

---

## How It Works

SprintLens runs three analysis phases:

1. **Slack analysis** - each update is classified for sentiment
   (positive/neutral/negative), themes, and blockers via structured LLM
   output. Embeddings are stored for semantic search.

2. **Retro classification** - each retro note is classified as positive,
   negative, or action item. Action items are extracted and embedded.

3. **Action tracking** - for each action item, SprintLens performs a
   semantic search across subsequent Slack updates and later retro
   boards to find evidence of follow-through. The LLM then classifies
   the action as done / partial / not done / dropped, with a confidence
   score and evidence summary.

Results are displayed on a dashboard with four charts:
- Sentiment trends over time
- Recurring theme frequency
- Blocker frequency
- Action item follow-through breakdown

---

## Project Structure

```
SprintLens/
├── deno.json                 # tasks, imports, permissions
├── data/
│   ├── retros/               # retro board CSVs (input)
│   ├── slack/                # Slack thread JSONs (input)
│   └── sprintlens.db         # SQLite database (generated)
├── src/
│   ├── ai.ts                 # dual-provider chat() + embed() with zod schemas
│   ├── config.ts             # single source of truth for configuration
│   ├── db.ts                 # SQLite schema, connection, sqlite-vec setup
│   ├── loader.ts             # CSV + JSON → SQLite
│   ├── analyse.ts            # sentiment/themes/blockers + agentic action tracking
│   └── main.ts               # Deno Desktop server + API endpoints
├── tasks/
│   ├── setup.ts              # download sqlite-vec loadable extension
│   ├── scrape_slack.ts       # Playwright scraper (WIP)
│   └── generate_synthetic.ts # synthetic data generator for testing
└── index.html                # dashboard (Observable Plot charts)
```

---

## Architecture Notes

- **No external database** - SQLite with the [sqlite-vec](https://github.com/asg017/sqlite-vec)
  extension handles both relational data and vector similarity search.
- **No build step** - Deno runs TypeScript directly. The dashboard loads
  Observable Plot from CDN. Zero npm dependencies to install.
- **Provider-agnostic** - any OpenAI-compatible API works. Swap models
  by changing `config.ts`. Embedding dimension is the only thing to verify.
- **Config-driven** - a single `config.ts` file controls everything:
  model names, database path, embedding dimensions, server port.

---

## AI Engineer Notes

### Structured output

`chat()` accepts an optional `z.ZodType` schema. When provided, it sets
`response_format` to `json_schema` and validates the LLM response against
the zod schema. This is used for all structured analysis (sentiment
classification, action verdicts, etc.).

### Semantic search for evidence

Action item tracking uses `sqlite-vec`'s `MATCH` operator with cosine
distance to find the most semantically relevant Slack updates and retro
notes for each action item. The top 15 Slack matches and top 10 retro
matches are passed as evidence to the LLM for verdict classification.

### Embedding dimension

The default `embedDim` in `config.ts` is 4096 (qwen3-embedding:8b).
If you switch to a different embedding model, update this value —
sqlite-vec virtual tables are created with a fixed dimension.

### Extending analysis

To add a new analysis type:
1. Add a zod schema in `analyse.ts`
2. Write an async function that queries unanalysed rows and calls `chat()`
3. Store results in `ai_analysis` with a distinct `source` value
4. Add an API endpoint in `main.ts` and a chart in `index.html`

---

## License

MIT
