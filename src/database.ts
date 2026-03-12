import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema.js';

const DOCUMENT_COLUMN_DEFINITIONS: Record<string, string> = {
  status: "TEXT NOT NULL DEFAULT 'chunked'",
  ingest_version: "TEXT NOT NULL DEFAULT 'v2'",
  normalizer_version: "TEXT NOT NULL DEFAULT 'normalize/v1'",
  chunking_version: "TEXT NOT NULL DEFAULT 'chunking/v1'",
  embedding_status: "TEXT NOT NULL DEFAULT 'pending'",
  embedding_model: 'TEXT',
  chunk_count: 'INTEGER NOT NULL DEFAULT 0',
  token_count_estimate: 'INTEGER NOT NULL DEFAULT 0',
  processing_error: 'TEXT',
  last_processed_at: 'TEXT',
  source_url_canonical: 'TEXT',
  source_domain: 'TEXT',
  source_priority: "TEXT NOT NULL DEFAULT 'secondary'",
  is_official_source: 'INTEGER NOT NULL DEFAULT 0',
  source_publisher: 'TEXT',
  source_section: 'TEXT',
  retrieved_via: 'TEXT',
  http_status: 'INTEGER',
  content_type: 'TEXT',
  etag: 'TEXT',
  last_modified: 'TEXT',
  fetch_run_id: 'TEXT',
  trust_score: 'REAL NOT NULL DEFAULT 0.5',
};

const CHUNK_COLUMN_DEFINITIONS: Record<string, string> = {
  char_count: 'INTEGER NOT NULL DEFAULT 0',
  embedding_status: "TEXT NOT NULL DEFAULT 'pending'",
  starts_at_char: 'INTEGER',
  ends_at_char: 'INTEGER',
  chunk_kind: "TEXT NOT NULL DEFAULT 'body'",
};

interface TableInfoRow {
  name: string;
}

function getColumnNames(db: DatabaseSync, tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as unknown as TableInfoRow[];
  return new Set(rows.map((row) => row.name));
}

function ensureColumns(db: DatabaseSync, tableName: string, definitions: Record<string, string>): void {
  const existing = getColumnNames(db, tableName);
  for (const [columnName, sqlDefinition] of Object.entries(definitions)) {
    if (existing.has(columnName)) {
      continue;
    }
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`);
  }
}

function backfillDerivedMetadata(db: DatabaseSync): void {
  db.exec(`
    UPDATE documents
    SET source_url_canonical = COALESCE(source_url_canonical, url)
    WHERE source_url_canonical IS NULL AND url IS NOT NULL;

    UPDATE documents
    SET source_publisher = COALESCE(source_publisher, source_name)
    WHERE source_publisher IS NULL OR source_publisher = '';

    UPDATE documents
    SET source_priority = CASE
      WHEN source_priority IS NULL OR source_priority = '' THEN CASE
        WHEN source_type IN ('cbr', 'minfin', 'moex') THEN 'primary'
        WHEN source_type IN ('marketaux', 'manual') THEN 'secondary'
        ELSE 'tertiary'
      END
      ELSE source_priority
    END;

    UPDATE documents
    SET is_official_source = CASE
      WHEN source_type IN ('cbr', 'minfin', 'moex') THEN 1
      ELSE COALESCE(is_official_source, 0)
    END;

    UPDATE documents
    SET trust_score = CASE
      WHEN trust_score IS NULL OR trust_score = 0.5 THEN CASE
        WHEN source_type IN ('cbr', 'minfin', 'moex') THEN 0.95
        WHEN source_type = 'marketaux' THEN 0.60
        WHEN source_type = 'manual' THEN 0.75
        WHEN source_type = 'web' THEN 0.45
        ELSE 0.35
      END
      ELSE trust_score
    END;

    UPDATE documents
    SET chunk_count = (
      SELECT COUNT(*) FROM document_chunks c WHERE c.document_id = documents.id
    )
    WHERE chunk_count = 0;

    UPDATE documents
    SET token_count_estimate = COALESCE((
      SELECT SUM(c.token_count) FROM document_chunks c WHERE c.document_id = documents.id
    ), 0)
    WHERE token_count_estimate = 0;

    UPDATE document_chunks
    SET char_count = length(text)
    WHERE char_count = 0;

    UPDATE document_chunks
    SET chunk_kind = CASE
      WHEN chunk_kind IS NULL OR chunk_kind = '' THEN 'body'
      ELSE chunk_kind
    END;

    UPDATE document_chunks
    SET embedding_status = CASE
      WHEN embedding_json IS NOT NULL THEN 'generated'
      ELSE COALESCE(embedding_status, 'pending')
    END;
  `);
}

function applyMigrations(db: DatabaseSync): void {
  ensureColumns(db, 'documents', DOCUMENT_COLUMN_DEFINITIONS);
  ensureColumns(db, 'document_chunks', CHUNK_COLUMN_DEFINITIONS);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_embedding_status ON documents(embedding_status);
    CREATE INDEX IF NOT EXISTS idx_documents_source_priority ON documents(source_priority);
    CREATE INDEX IF NOT EXISTS idx_documents_trust_score ON documents(trust_score);
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding_status ON document_chunks(embedding_status);
  `);
  backfillDerivedMetadata(db);
}

export function openDatabase(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA_SQL);
  applyMigrations(db);
  return db;
}
