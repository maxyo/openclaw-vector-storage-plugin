# SQLite Document Store Plugin

OpenClaw plugin project for buffered document storage on top of SQLite.

## Goal

Provide a strongly typed storage/processing layer for the trading-agent project:
- save normalized documents
- chunk them for retrieval
- index them with SQLite FTS5
- generate optional chunk embeddings through an OpenAI-compatible API
- keep a path open for sqlite-vec integration
- expose a reusable API that agents can call through a future runtime tool layer

## Current scope

Implemented now:
- strict TypeScript project scaffold
- SQLite schema for `documents`, `document_chunks`, `ingest_runs`, and `ingest_errors`
- normalization and chunking
- document save / dedupe by content hash
- FTS-based search over documents and chunks
- optional OpenAI-compatible embeddings on save/backfill
- JSONL batch ingestion script
- URL ingestion script
- embeddings backfill script
- tests for chunking, repository behavior, embedding generation/failure handling, and ingest run logging
- strict ESLint + TypeScript config

Planned next:
- runtime-facing OpenClaw tool registration
- sqlite-vec integration
- vector / hybrid retrieval helpers
- richer reranking helpers
- source-specific ingestion helpers above the shared pipeline

## Storage model

### documents
Stores document-level metadata and normalized content.

### document_chunks
Stores retrieval-sized chunks derived from `documents.text_clean`.
Embeddings are stored in:
- `embedding_json`
- `embedding_model`

## Document metadata model (v2)

The plugin now stores three practical metadata layers:

### 1) Core document columns
Used for filtering, ranking, provenance, and reprocessing:
- `source_type`
- `document_type`
- `published_at`
- `collected_at`
- `language`
- `country`
- `content_hash`
- `status`
- `embedding_status`
- `embedding_model`
- `chunk_count`
- `token_count_estimate`
- `processing_error`
- `last_processed_at`

### 2) Provenance / trust columns
Used to separate official sources from secondary ones:
- `source_url_canonical`
- `source_domain`
- `source_priority`
- `is_official_source`
- `source_publisher`
- `source_section`
- `retrieved_via`
- `http_status`
- `content_type`
- `etag`
- `last_modified`
- `fetch_run_id`
- `trust_score`

### 3) Chunk metadata
Used for retrieval quality and later vector search:
- `char_count`
- `embedding_status`
- `starts_at_char`
- `ends_at_char`
- `chunk_kind`

### FTS indexes
- `documents_fts`
- `document_chunks_fts`

## Embeddings config

The plugin can call an OpenAI-compatible embeddings endpoint when saving documents.
If enabled, embeddings are generated for each new chunk and stored in SQLite.
If the embedding request fails, the document is still saved and the save result reports an embedding failure.

Example config payload for `plugins.entries.sqlite-doc-store.config`:

```json
{
  "dbPath": "/config/.openclaw/sqlite-doc-store/documents.sqlite",
  "enableFts": true,
  "vectorMode": "disabled",
  "embedding": {
    "enabled": true,
    "apiUrl": "https://api.openai.com/v1/embeddings",
    "apiKey": "YOUR_TOKEN",
    "model": "text-embedding-3-small",
    "timeoutMs": 30000,
    "batchSize": 32
  }
}
```

Supported embedding fields:
- `enabled`
- `apiUrl`
- `apiKey`
- `model`
- `timeoutMs`
- `batchSize`
- `dimensions` (optional)

## Ingestion entrypoints

### JSONL batch ingest

```bash
npm run ingest:jsonl -- ./reports/trading/ingest/cbr.jsonl
```

### URL ingest

```bash
npm run ingest:url -- \
  --url https://cbr.ru/press/pr/?file=13022026_133000key.htm
```

`ingest:url` now supports **source profiles**. For known domains like `cbr.ru`, `minfin.gov.ru`, `moex.com` / `iss.moex.com`, `econs.online`, `acra-ratings.ru`, `raexpert.ru`, `bofit.fi`, and `cbonds.ru`, the plugin can auto-fill:
- `sourceType`
- `sourceName`
- default `documentType`
- extraction selectors
- provenance defaults (`sourcePriority`, `isOfficialSource`, `trustScore`)

You can still override extraction manually with:
- `--content-selector`
- `--title-selector`
- `--remove-selector`

### Embeddings backfill

```bash
npm run embeddings:backfill -- --limit 100
```

## Development

```bash
npm install
npm run check
```

## Design notes

- SQLite is the buffered storage layer
- agents should not own low-level chunking/indexing logic
- the plugin is intended to become a domain processing layer, not just a thin DB driver
- embeddings are stored now so sqlite-vec / hybrid retrieval can be layered in next without reworking ingestion

## Status

This repository is an actively usable storage scaffold. The core storage layer, chunking, FTS, and embedding generation are implemented and tested; runtime tool wiring is the next step.
