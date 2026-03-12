# Architecture

## Role in the system

The SQLite Document Store sits between ingestion agents and the analyst/trader agent.

Pipeline:
1. external feeds / official scrapers fetch raw material
2. plugin normalizes text
3. plugin chunks documents
4. plugin indexes data for search
5. analyst/trader reads from the buffered store instead of hitting live sources directly

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

## Planned tool surface

Likely runtime methods:
- save document
- get document
- search documents
- search chunks
- list recent documents
- attach embeddings to chunks
- hybrid search (FTS + vector)
