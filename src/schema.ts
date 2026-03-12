export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  published_at TEXT,
  collected_at TEXT NOT NULL,
  document_type TEXT NOT NULL,
  language TEXT,
  country TEXT,
  text_raw TEXT NOT NULL,
  text_clean TEXT NOT NULL,
  summary TEXT,
  metadata_json TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'chunked',
  ingest_version TEXT NOT NULL DEFAULT 'v2',
  normalizer_version TEXT NOT NULL DEFAULT 'normalize/v1',
  chunking_version TEXT NOT NULL DEFAULT 'chunking/v1',
  embedding_status TEXT NOT NULL DEFAULT 'pending',
  embedding_model TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  token_count_estimate INTEGER NOT NULL DEFAULT 0,
  processing_error TEXT,
  last_processed_at TEXT,
  source_url_canonical TEXT,
  source_domain TEXT,
  source_priority TEXT NOT NULL DEFAULT 'secondary',
  is_official_source INTEGER NOT NULL DEFAULT 0,
  source_publisher TEXT,
  source_section TEXT,
  retrieved_via TEXT,
  http_status INTEGER,
  content_type TEXT,
  etag TEXT,
  last_modified TEXT,
  fetch_run_id TEXT,
  trust_score REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  section_title TEXT,
  text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  embedding_json TEXT,
  embedding_model TEXT,
  embedding_status TEXT NOT NULL DEFAULT 'pending',
  starts_at_char INTEGER,
  ends_at_char INTEGER,
  chunk_kind TEXT NOT NULL DEFAULT 'body',
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_published_at ON documents(published_at);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  document_id UNINDEXED,
  title,
  summary,
  text_clean,
  tokenize = 'unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  document_id UNINDEXED,
  text,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS ingest_runs (
  id TEXT PRIMARY KEY,
  source_name TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  input_path TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  processed_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  deduped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  embeddings_generated_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS ingest_errors (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ingest_runs(id) ON DELETE CASCADE,
  document_url TEXT,
  title TEXT,
  stage TEXT NOT NULL,
  error_message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_status ON ingest_runs(status);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_started_at ON ingest_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_ingest_errors_run_id ON ingest_errors(run_id);
`;
