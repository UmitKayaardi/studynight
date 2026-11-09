# Decisions

One line per decision: what was decided, and why.

## Models (checked 2026-11-09 via `GET /openai/v1/models`)

- Generator: `openai/gpt-oss-120b` — strongest production text model in the catalogue, JSON mode, good multilingual output.
- Generator fallback: `openai/gpt-oss-20b` — Groq free limits are per model (8,000 tokens/min each), so falling back to a second model on HTTP 429 roughly doubles throughput.
- Verifier / grader: `qwen/qwen3.8-27b` — different model family (Alibaba) from the generator, so verification is independent; no Llama 70B-class model is listed any more.
- Verifier fallback: `openai/gpt-oss-20b` with the same strict prompt at temperature 0, used only when the verifier is rate-limited.
- Vision: `qwen/qwen3.8-27b` — the only listed model that accepts image input (verified with a test image; images must be ≥ 32 px per side).
- Speech-to-text: `whisper-large-v3`, fallback `whisper-large-v3-turbo`.
- All models are configurable by environment variable (`GROQ_*_MODEL`); see `.env.example`.

## Embeddings

- `Xenova/multilingual-e5-small` (base `intfloat/multilingual-e5-small`, MIT), int8 ONNX, 118 MB — no permissively licensed multilingual sentence-embedding model exists near the preferred ~60 MB, because the 250k-token multilingual vocabulary alone is ~96M parameters; e5-small is the smallest good multilingual retrieval model and is trained for query/passage retrieval. The UI states the real size before download.

## Groq data terms (checked 2026-11-09)

- Source: console.groq.com/docs/your-data and the Services Agreement (last modified 22 June 2026). Groq does not retain inference data by default, but may log inputs/outputs for up to 30 days for reliability and abuse investigation unless Zero Data Retention is enabled in the organisation's Data Controls; Groq may not use inputs/outputs to train models (Services Agreement §4.2); data is stored in the United States. The Privacy page states this and recommends the operator enable ZDR (owner action in FINAL_REPORT).

## Tooling

- TypeScript 6.0.3 rather than 7.x — typescript-eslint supports TypeScript < 6.1.
- Vite 8 + `@tailwindcss/vite` + Vitest 5 (latest stable, compatible peers).
- Licence allow-list adds `Zlib` (permissive, used by `pako` alongside MIT); `duck` is recorded as BSD-2-Clause after reading its LICENSE; native Node-only binaries of `sharp`/`onnxruntime-node` (transitive deps of transformers.js, never bundled into the browser app or the functions) are excluded from the check.
- `wouter` for routing (tiny, Unlicense) — keeps the initial bundle small.
- `/api` handlers use Web-standard `Request`/`Response`; a small Vite plugin serves them during `npm run dev`, so one command runs the whole app locally on Windows.
- Shared server/client code lives in `shared/` and uses `.js` import suffixes so the functions run as native ES modules on Vercel.
- ONNX Runtime WebAssembly files are self-hosted under `/ort/` (copied from `node_modules` by `scripts/copy-ort.mjs` before dev/build) instead of transformers.js's default jsDelivr CDN — keeps the CSP strict and lets the files be cached for offline use. Single-threaded WASM (no cross-origin isolation needed).
- Verified in Chromium (2026-11-09): model load incl. download ~34 s on a fast connection; English↔Spanish paraphrase cosine 0.90 vs unrelated 0.80 (e5 similarities are compressed into a high range, so absolute thresholds must be calibrated — see BENCHMARK.md); ~20 s per 100 long chunks single-threaded on a desktop CPU, so embedding runs in the background after the first questions are playable.

## Ingestion

- Sentence segmentation uses `Intl.Segmenter` (Unicode rules); line breaks inside a block are boundaries too, and over-long sentences are split by words (or by characters for unspaced scripts) so no chunk exceeds 400 words.
- A day counts towards the streak once at least one question is answered that day (simple and friendly; the daily goal ring is separate).
- `ts-fsrs` v6's legacy `fsrs()` scheduler API is used through one wrapper module (`src/lib/learning/fsrs.ts`); the newer scheduler API is not yet documented well enough to depend on.

## Data

- Two tables beyond the plan's list: `images` (page renders/photos for figure questions and the source sheet) and `days` (daily activity rollups for the streak calendar, daily goal and stats). `days` arrives in schema v2 with a real upgrade that backfills it from the review log, which also exercises the migration path in tests.
- Importing a backup replaces all local data (after a preview and confirmation) rather than merging — merging decks, FSRS states and streaks from two devices has no single correct answer, and "move to a new phone" is the stated purpose.
- Deleting a deck keeps an in-memory snapshot for the undo toast; once the toast closes, the data is gone.
- UI translations are machine-assisted with the project's own Groq generator model via `scripts/translate.mjs` (keeps all 21 locales complete at every checkpoint so CI stays green); the script validates variables and plural categories, rejects strings returned untranslated, and re-translates any string whose English source changes. Translations are reviewed in Phase 10.

## Benchmark-driven

- Hybrid retrieval uses weighted Reciprocal Rank Fusion with BM25 weight 0.5 and vector weight 1 (`HYBRID_BM25_WEIGHT`): on the benchmark corpus it raises hybrid MRR from 0.78 to 0.80 at equal recall; keyword search stays in the mix because it works before (or without) the Smart search download and for exact terms. Vector-only scored one query higher on recall@5 on this small corpus — reported in docs/BENCHMARK.md rather than hidden.
- Groq's free plan also caps tokens per day per model; build-time jobs (translations, sample decks, benchmark) therefore wait out long `retry-after` periods and are run in stages.
