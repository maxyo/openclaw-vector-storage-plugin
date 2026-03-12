# Architecture

## Role in the system

The SQLite Document Store sits between ingestion agents and the analyst/trader agent.

Pipeline:
1. external feeds / official scrapers fetch raw material
2. plugin normalizes text
3. plugin chunks documents
4. plugin indexes data for search
5. plugin optionally generates embeddings for chunks via an OpenAI-compatible API
6. analyst/trader reads from the buffered store instead of hitting live sources directly

## Why a plugin instead of ad-hoc files

Because we want:
- repeatable ingestion
- dedupe / idempotency
- shared schema
- retrieval-ready chunks
- a single place for future vector and ranking logic

## Why SQLite first

- minimal operational overhead
- easy local deployment
- fast enough for v1
- pairs well with FTS5 and, later, sqlite-vec

## Embeddings design

### Current approach

- embeddings are generated per chunk, not per whole document
- the provider is an OpenAI-compatible HTTP API
- embeddings are stored directly on `document_chunks`
  - `embedding_json`
  - `embedding_model`
- save is resilient:
  - document/chunks are saved first
  - embedding generation happens after persistence
  - if the embeddings call fails, the document still stays in SQLite

## Metadata strategy

The schema now separates metadata into:

### First-class columns
For fields we will filter/rank on often:
- processing state (`status`, `embedding_status`, `processing_error`)
- provenance (`source_priority`, `is_official_source`, `source_domain`)
- trust (`trust_score`)
- retrieval shape (`chunk_count`, `token_count_estimate`, chunk offsets/kind)

### JSON metadata
For source-specific or domain-specific extras that should not explode the top-level schema:
- instruments
- topics
- event details
- ad-hoc tags

This keeps the schema queryable without turning it into an 80-column graveyard.

### Why per-chunk

Because retrieval will operate on chunks, not on raw full documents.
That keeps future vector search aligned with the actual unit we want to rank.

### Why store embeddings before sqlite-vec

Because it gives us:
- immediate compatibility with OpenAI-like providers
- deterministic ingestion state
- simpler debugging/backfills
- an easy migration path into sqlite-vec indexing later

## Ingestion entrypoints

The plugin now supports a shared ingestion boundary inside the package:

- `scripts/ingest-jsonl.ts`
- `scripts/ingest-url.ts`
- `scripts/backfill-embeddings.ts`

These all go through the same core save / chunk / embed / persist pipeline and write operational traces to:
- `ingest_runs`
- `ingest_errors`

That means scraper agents can write JSONL batches or enqueue URL-level ingestion without bypassing normalization and metadata rules.

## Source profiles

The plugin now has a source-profile registry for known domains.
A source profile bundles:
- extraction defaults (title/content/remove selectors)
- source identity defaults (`sourceType`, `sourceName`)
- provenance defaults (`sourcePriority`, `isOfficialSource`, `trustScore`)
- optional document-type defaults
- source-specific metadata defaults

Current built-in profiles:
- `cbr.ru`
- `minfin.gov.ru`
- `moex.com` / `iss.moex.com`
- `econs.online`
- `acra-ratings.ru`
- `raexpert.ru`
- `bofit.fi`
- `cbonds.ru`

This keeps source-specific parsing logic inside the plugin while scraper agents stay focused on discovery and collection.

## Planned tool surface

Likely runtime methods:
- save document
- get document
- search documents
- search chunks
- list recent documents
- generate embeddings for a document / backfill missing chunks
- hybrid search (FTS + vector)
