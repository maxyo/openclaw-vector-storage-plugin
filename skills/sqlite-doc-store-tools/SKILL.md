---
name: sqlite-doc-store-tools
description: "Use for sqlite-doc-store tasks: ingesting documents, checking stored records, generating/backfilling embeddings, and searching documents/chunks with metadata, trust, time, and source filters."
metadata: { "openclaw": { "emoji": "🗃️" } }
---

# SQLite Doc Store Tools

Use this skill when the user asks to:
- inspect what is stored in `sqlite-doc-store`
- ingest documents from JSONL or URLs
- check or backfill embeddings
- search documents or chunks
- filter retrieval by source, time, trust, officialness, or embedding state

## Current surface

### Runtime status
Do **not** assume OpenClaw runtime tools are already exposed in every build.

In this repo today, the stable implemented surfaces are:
- plugin API methods in `src/api.ts`
- ingestion/backfill scripts in `scripts/`
- SQLite storage in the configured `dbPath`

If runtime tools are later exposed, they should mirror the same field model described here.

## Implemented capabilities

### API methods
- `saveDocument(input)`
- `generateEmbeddingsForDocument(documentId)`
- `searchDocuments(input)`
- `searchChunks(input)`
- `getDocument(documentId)`
- `countDocuments()`

### Scripts
- `npm run ingest:jsonl -- <file.jsonl>`
- `npm run ingest:url -- --url <url>`
- `npm run embeddings:backfill -- [--limit <n>]`

## Default workflow

### Ingest from batch
1. Prepare JSONL records that match `SaveDocumentInput`
2. Run `ingest:jsonl`
3. Verify document count / `embedding_status`
4. If needed, run embedding backfill

### Ingest from URL
1. Run `ingest:url`
2. Verify extracted text quality
3. Check `chunk_count`, `trust_score`, and `embedding_status`
4. If extraction is noisy, improve selectors/profile before scaling up

### Retrieval
1. Prefer document search for overview / source selection
2. Prefer chunk search for answer extraction / RAG context
3. Apply filters early:
   - official vs non-official
   - source type / source name
   - trust floor
   - time window
   - embedding state

## Important behavior notes

- Full content is stored in the DB: `text_raw`, `text_clean`, `summary`, plus chunk rows
- Embeddings are chunk-level, not document-level
- FTS is keyword-oriented and should not be treated as morphology-aware semantic search
- Embedding generation is non-fatal for storage: documents may persist even if embeddings fail
- Current re-embed behavior is conservative: existing chunk embeddings are not overwritten unless they are reset first
- Raw free-text should **not** be passed directly into SQLite `MATCH` without a safe query builder / normalizer

## Source / trust interpretation

Use these fields when filtering or reporting:
- `sourceType` → source family (`cbr`, `minfin`, `moex`, `econs`, etc.)
- `sourceName` → concrete publisher label
- `sourcePriority` → `primary` / `secondary` / `tertiary`
- `isOfficialSource` → official issuer/source flag
- `trustScore` → retrieval/reporting trust heuristic
- `retrievedVia` → `api` / `rss` / `html` / `manual` / `scrape` / `other`

## Read this reference when you need exact fields
- `references/tool-fields.md`

## Good habits

- For market/regulator questions, prefer `isOfficialSource=true` and a trust floor
- For broad research, search chunks first, then inspect parent documents
- If embeddings exist, use semantic retrieval; if not, say the search is keyword-only
- When extraction produced junk UI/cookie text, fix extraction before trusting retrieval quality
- Do not claim runtime tool availability unless OpenClaw actually exposes the tool in the current build
