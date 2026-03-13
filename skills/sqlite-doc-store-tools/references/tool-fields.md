# sqlite-doc-store field reference

## API methods

### `saveDocument(input)`
Stores one logical document, normalizes text, chunks it, saves provenance/metadata, and optionally generates chunk embeddings.

Core fields:
- `sourceType` — source family: `marketaux|cbr|minfin|moex|econs|acra|raexpert|bofit|cbonds|manual|web|other`
- `sourceName` — concrete source label
- `title` — document title
- `documentType` — `news|press_release|meeting_summary|macro_snapshot|report|analysis|other`
- `textRaw` — original body text

Optional fields:
- `url`
- `publishedAt`
- `collectedAt`
- `language`
- `country`
- `textClean`
- `summary`
- `metadata`
- `tags`
- `provenance`
- `processing`
- `chunking`

### `generateEmbeddingsForDocument(documentId)`
Generates chunk embeddings for a stored document.

Returns:
- `documentId`
- `chunkCount`
- `embeddingsGenerated`
- `embeddingStatus`
- `embeddingModel`
- `embeddingError`

### `searchDocuments(input)`
FTS-oriented document retrieval.

Fields:
- `query`
- `limit`
- `sourceType`
- `sourceName`
- `documentType`
- `language`
- `country`
- `sourcePriority`
- `isOfficialSource`
- `retrievedVia`
- `embeddingStatus`
- `minTrustScore`
- `publishedAfter`
- `publishedBefore`
- `collectedAfter`
- `collectedBefore`

### `searchChunks(input)`
FTS-oriented chunk retrieval.

Fields:
- `query`
- `limit`
- `sourceType`
- `sourceName`
- `documentType`
- `language`
- `country`
- `sourcePriority`
- `isOfficialSource`
- `retrievedVia`
- `embeddingStatus`
- `minTrustScore`
- `publishedAfter`
- `publishedBefore`
- `collectedAfter`
- `collectedBefore`
- `chunkKind`
- `chunkEmbeddingStatus`

### `getDocument(documentId)`
Returns the stored document row by id.

### `countDocuments()`
Returns total document count.

## Provenance fields

`provenance` inside `saveDocument(input)` may include:
- `sourceUrlCanonical`
- `sourcePublisher`
- `sourceSection`
- `sourcePriority`
- `isOfficialSource`
- `retrievedVia`
- `httpStatus`
- `contentType`
- `etag`
- `lastModified`
- `fetchRunId`
- `trustScore`

## Processing fields

`processing` may include:
- `ingestVersion`
- `normalizerVersion`
- `chunkingVersion`

## Chunking fields

`chunking` may include:
- `targetTokens`
- `overlapTokens`

## Important enums

### `sourcePriority`
- `primary`
- `secondary`
- `tertiary`

### `retrievedVia`
- `api`
- `rss`
- `html`
- `manual`
- `scrape`
- `other`

### `embeddingStatus` / `chunkEmbeddingStatus`
- `generated`
- `skipped`
- `failed`
- `pending`

### `chunkKind`
- `body`
- `summary`
- `title`
- `table`
- `bullet_list`
- `other`

## Script surface

### `ingest:jsonl`
`npm run ingest:jsonl -- <file.jsonl> [--continue-on-error] [--dry-run] [--skip-embeddings] [--db-path <path>] [--run-id <id>]`

### `ingest:url`
`npm run ingest:url -- --url <url> [--source-type <type>] [--source-name <name>] [--document-type <type>] [--title <title>] [--published-at <iso>] [--trust-score <0..1>] [--content-selector <css>] [--title-selector <css>] [--remove-selector <css>] [--skip-embeddings] [--db-path <path>] [--run-id <id>]`

### `embeddings:backfill`
`npm run embeddings:backfill -- [--limit <n>] [--db-path <path>] [--run-id <id>] [--continue-on-error] [--dry-run]`

## Retrieval advice

### Prefer document search when
- selecting sources
- listing candidate materials
- showing a high-level overview

### Prefer chunk search when
- pulling evidence snippets
- building RAG context
- matching concepts inside long texts

## Known caveats

- FTS query syntax needs sanitizing; raw natural-language strings can break `MATCH`
- Existing chunk embeddings are not automatically overwritten by re-embed calls
- Semantic retrieval exists at the data level, but runtime tool exposure may still lag behind repo/API support
