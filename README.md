# 🏃🔍 SprintLens

**Are your sprint retros actually changing anything?**

SprintLens analyses your team's Slack updates and retrospective boards using AI
to measure sprint ceremony effectiveness - sentiment trends, recurring themes,
persistent blockers, and whether retro action items were actually followed
through.

---

## Quick Start

### Development prerequisites

- [Deno 2.x](https://deno.com/) with Desktop support
- An Ollama instance running locally (or any OpenAI-compatible API)

The commands below are only needed for the lightweight system-WebView backend
used by `deno task app`. Release bundles include CEF for consistent rendering
without a separately installed browser engine.

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

**macOS:** No additional development dependencies required (uses system WebKit).

**Windows:** The development launcher uses Edge WebView2, which is included in
Windows 11 and current eligible Windows 10 installations.

### 1. Configure

SprintLens defaults to a local Ollama-compatible endpoint at
`http://localhost:11434/v1`. Override settings with environment variables;
credentials never need to be committed to source control:

```bash
export SPRINTLENS_AI_BASE_URL="https://api.example.com/v1"
export SPRINTLENS_API_KEY="your-key"
export SPRINTLENS_CHAT_MODEL="your-chat-model"
export SPRINTLENS_EMBED_MODEL="your-embedding-model"
export SPRINTLENS_EMBED_DIM="4096"
```

Any OpenAI-compatible API works. The dashboard's startup notice shows the active
endpoint, models, database location, and provider availability without
displaying the API key.

### 2. Add your data

- **Retro boards**: export as TSV/CSV, place in `data/retros/` (one file per
  sprint, e.g. `sprint-01.csv`)
- **Slack updates**: export thread replies as JSON, place in `data/slack/` (one
  file per thread, see format below)

### 3. Run the pipeline

```bash
deno task load       # load data into SQLite
deno task analyse    # AI analysis + action tracking
deno task app        # launch the native desktop dashboard
```

Or all at once:

```bash
deno task pipeline
```

The dashboard opens automatically in a native SprintLens window. When
`src/main.ts` is run without Deno Desktop, it remains available at
`http://localhost:8765` for browser-based development.

To build a self-extracting release for the current platform:

```bash
deno task bundle
```

Release bundles use the bundled CEF renderer and extract their payload on first
launch so the native `sqlite-vec` library can be loaded from a real filesystem.
Build a particular supported target—or all five—from any development host:

```bash
deno task bundle x86_64-pc-windows-msvc
deno task bundle aarch64-apple-darwin
deno task bundle x86_64-unknown-linux-gnu
deno task bundle --all
```

Artifacts are written under `dist/<target>/`. Windows produces an application
directory, macOS an `.app`, and Linux an `.AppImage`. The supported release
matrix is Windows x64, macOS Intel and Apple Silicon, and Linux x64 and ARM64.
Windows ARM64 is intentionally excluded because `sqlite-vec` does not currently
publish a native Windows ARM64 library.

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
    {
      "author": "Alex Morgan",
      "text": "Pipeline migration done!",
      "ts": "1715003600"
    },
    {
      "author": "Tom Bradley",
      "text": "Blocked by API access",
      "ts": "1715007200"
    }
  ]
}
```

---

## How It Works

SprintLens runs three analysis phases:

1. **Slack analysis** - each update is classified for sentiment
   (positive/neutral/negative), themes, and blockers via structured LLM output.
   Embeddings are stored for semantic search.

2. **Retro classification** - each retro note is classified as positive,
   negative, or action item. Action items are extracted and embedded.

3. **Action tracking** - for each action item, SprintLens performs a semantic
   search across subsequent Slack updates and later retro boards to find
   evidence of follow-through. The LLM then classifies the action as done /
   partial / not done / dropped, with a confidence score and evidence summary.

Results are displayed on a dashboard with four charts:

- Sentiment trends over time
- Recurring theme frequency
- Blocker frequency
- Action item follow-through breakdown

## Configuration and local data

| Variable                 | Default                       | Purpose                           |
| ------------------------ | ----------------------------- | --------------------------------- |
| `SPRINTLENS_DATA_DIR`    | OS application-data directory | Directory for persistent app data |
| `SPRINTLENS_DB_PATH`     | `<data-dir>/sprintlens.db`    | Explicit SQLite database path     |
| `SPRINTLENS_AI_BASE_URL` | `http://localhost:11434/v1`   | OpenAI-compatible API base URL    |
| `SPRINTLENS_API_KEY`     | unset                         | Optional provider credential      |
| `SPRINTLENS_CHAT_MODEL`  | `qwen3.6:27b`                 | Analysis model                    |
| `SPRINTLENS_EMBED_MODEL` | `qwen3-embedding:8b`          | Embedding model                   |
| `SPRINTLENS_EMBED_DIM`   | `4096`                        | Embedding vector size             |
| `SPRINTLENS_PORT`        | `8765`                        | Browser-development server port   |

The persistent database is stored in `%APPDATA%\\SprintLens` on Windows,
`~/Library/Application Support/SprintLens` on macOS, and
`${XDG_DATA_HOME:-~/.local/share}/SprintLens` on Linux. On first launch,
SprintLens creates or reuses a per-user database there. Development runs can
initialize it from `data/sprintlens.db` when that file exists; release bundles
never include raw exports or a developer's local database.

Raw files placed in `data/slack/` and `data/retros/`, and the generated
database, stay local and are not included by `deno task bundle`. The database
contains source text and AI analysis, so treat it as sensitive team data.
SprintLens sends source text to the configured AI provider during
`deno task analyse`; consult that provider's data-handling policy before using
production exports. The dashboard itself uses locally bundled Pico CSS, D3, and
Observable Plot assets and makes no CDN requests.

---

## Project Structure

```
SprintLens/
├── deno.json                 # tasks, imports, permissions
├── data/
│   ├── retros/               # retro board CSVs (input)
│   ├── slack/                # Slack thread JSONs (input)
│   └── sprintlens.db         # optional packaged seed database
├── src/
│   ├── ai.ts                 # dual-provider chat() + embed() with zod schemas
│   ├── config.ts             # single source of truth for configuration
│   ├── db.ts                 # SQLite schema, connection, sqlite-vec setup
│   ├── loader.ts             # CSV + JSON → SQLite
│   ├── analyse.ts            # sentiment/themes/blockers + agentic action tracking
│   └── main.ts               # Deno Desktop server + API endpoints
├── tasks/
│   ├── setup.ts              # download sqlite-vec loadable extension
│   ├── build_desktop.ts      # safe target-aware release builder
│   ├── scrape_slack.ts       # Playwright scraper (WIP)
│   └── generate_synthetic.ts # synthetic data generator for testing
└── index.html                # dashboard (Observable Plot charts)
```

---

## Architecture Notes

- **No external database** - SQLite with the
  [sqlite-vec](https://github.com/asg017/sqlite-vec) extension handles both
  relational data and vector similarity search.
- **Offline dashboard assets** - Pico CSS, D3, and Observable Plot are served
  from pinned npm dependencies bundled with the desktop application.
- **Cross-platform releases** - compressed CEF bundles provide consistent
  rendering and expose native libraries on disk on Windows, macOS, and Linux.
- **Provider-agnostic** - any OpenAI-compatible API works. Swap models with
  environment variables. Embedding dimension is the only thing to verify.
- **Environment-configured** - model names, credentials, database location,
  embedding dimensions, and development port can be supplied without editing
  source files.

---

## AI Engineer Notes

### Release verification

The regular CI workflow runs formatting, type checks, linting, and unit tests on
Windows, macOS, and Linux. The desktop release workflow builds all five
supported artifacts on version tags or manual dispatch. Native Windows, macOS,
and Linux x64 jobs then run the packaged application's `--smoke-test`, which
opens SQLite, loads `sqlite-vec`, and reads every bundled UI asset without
opening a window. Internal beta artifacts are not code-signed; public Windows
releases should be Authenticode-signed, while public macOS releases require a
Developer ID signature and notarization.

### Structured output

`chat()` accepts an optional `z.ZodType` schema. When provided, it sets
`response_format` to `json_schema` and validates the LLM response against the
zod schema. This is used for all structured analysis (sentiment classification,
action verdicts, etc.).

### Semantic search for evidence

Action item tracking uses `sqlite-vec`'s `MATCH` operator with cosine distance
to find the most semantically relevant Slack updates and retro notes for each
action item. The top 15 Slack matches and top 10 retro matches are passed as
evidence to the LLM for verdict classification.

### Embedding dimension

The default embedding dimension is 4096 (qwen3-embedding:8b). If you switch to a
different embedding model, set `SPRINTLENS_EMBED_DIM` — sqlite-vec virtual
tables are created with a fixed dimension.

### Extending analysis

To add a new analysis type:

1. Add a zod schema in `analyse.ts`
2. Write an async function that queries unanalysed rows and calls `chat()`
3. Store results in `ai_analysis` with a distinct `source` value
4. Add an API endpoint in `main.ts` and a chart in `index.html`

---

## License

MIT
