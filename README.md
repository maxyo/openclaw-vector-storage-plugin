# SQLite Document Store Plugin

OpenClaw plugin project for buffered document storage on top of SQLite.

## Goal

Provide a strongly typed storage/processing layer for the trading-agent project:
- save normalized documents
- chunk them for retrieval
- index them with SQLite FTS5
- keep a path open for sqlite-vec integration
- expose a reusable API that agents can call through a future runtime tool layer

## Current scope (v0.1 scaffold)

Implemented now:
- strict TypeScript project scaffold
- SQLite schema for `documents` and `document_chunks`
- normalization and chunking
- document save / dedupe by content hash
- FTS-based search over documents and chunks
- tests for chunking and repository behavior
- strict ESLint + TypeScript config

Planned next:
- runtime-facing OpenClaw tool registration
- sqlite-vec integration
- embeddings ingestion/update path
- richer retrieval/reranking helpers
- source-specific ingestion helpers

## Storage model

### documents
Stores document-level metadata and normalized content.

### document_chunks
Stores retrieval-sized chunks derived from `documents.text_clean`.

### FTS indexes
- `documents_fts`
- `document_chunks_fts`

## Development

```bash
npm install
npm run check
```

## Design notes

- SQLite is the buffered storage layer
- agents should not own low-level chunking/indexing logic
- the plugin is intended to become a domain processing layer, not just a thin DB driver

## Status

This repository is the initial working scaffold. The core storage layer is implemented and tested; runtime tool wiring is the next step.
