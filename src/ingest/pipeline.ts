import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SqliteDocStoreApi } from '../api.js';
import type { SaveDocumentInput } from '../types.js';

export interface IngestPipelineOptions {
  runId?: string;
  sourceName?: string;
  mode: 'jsonl' | 'url' | 'backfill-embeddings';
  inputPath?: string;
  continueOnError?: boolean;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IngestItemFailure {
  index: number;
  title?: string;
  url?: string;
  stage: 'validation' | 'save' | 'backfill';
  error: string;
}

export interface IngestBatchResult {
  runId: string;
  processedCount: number;
  insertedCount: number;
  dedupedCount: number;
  failedCount: number;
  embeddingsGeneratedCount: number;
  failures: IngestItemFailure[];
  durationMs: number;
  dryRun: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringify(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {});
}

function insertRun(db: DatabaseSync, runId: string, options: IngestPipelineOptions): void {
  db.prepare(
    `INSERT INTO ingest_runs (
      id, source_name, mode, status, input_path, started_at, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    options.sourceName ?? null,
    options.mode,
    options.dryRun ? 'dry-run' : 'running',
    options.inputPath ?? null,
    nowIso(),
    stringify(options.metadata),
  );
}

function finalizeRun(db: DatabaseSync, result: IngestBatchResult, options: IngestPipelineOptions): void {
  db.prepare(
    `UPDATE ingest_runs
     SET status = ?, finished_at = ?, processed_count = ?, inserted_count = ?, deduped_count = ?,
         failed_count = ?, embeddings_generated_count = ?, error_summary = ?
     WHERE id = ?`
  ).run(
    result.failedCount > 0 && !options.continueOnError ? 'failed' : options.dryRun ? 'dry-run' : 'completed',
    nowIso(),
    result.processedCount,
    result.insertedCount,
    result.dedupedCount,
    result.failedCount,
    result.embeddingsGeneratedCount,
    result.failures.length > 0 ? result.failures.map((item) => item.error).join(' | ').slice(0, 1000) : null,
    result.runId,
  );
}

function logFailure(db: DatabaseSync, runId: string, failure: IngestItemFailure, payload: unknown): void {
  db.prepare(
    `INSERT INTO ingest_errors (
      id, run_id, document_url, title, stage, error_message, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    runId,
    failure.url ?? null,
    failure.title ?? null,
    failure.stage,
    failure.error,
    JSON.stringify(payload),
    nowIso(),
  );
}

export async function ingestDocuments(
  db: DatabaseSync,
  api: SqliteDocStoreApi,
  documents: SaveDocumentInput[],
  options: IngestPipelineOptions,
): Promise<IngestBatchResult> {
  const startedAt = Date.now();
  const runId = options.runId ?? randomUUID();
  insertRun(db, runId, options);

  const result: IngestBatchResult = {
    runId,
    processedCount: 0,
    insertedCount: 0,
    dedupedCount: 0,
    failedCount: 0,
    embeddingsGeneratedCount: 0,
    failures: [],
    durationMs: 0,
    dryRun: options.dryRun === true,
  };

  for (const [index, document] of documents.entries()) {
    result.processedCount += 1;

    if (options.dryRun === true) {
      continue;
    }

    try {
      const saved = await api.saveDocument(document);
      if (saved.inserted) {
        result.insertedCount += 1;
      } else {
        result.dedupedCount += 1;
      }
      result.embeddingsGeneratedCount += saved.embeddingsGenerated;
    } catch (error) {
      const failure: IngestItemFailure = {
        index,
        title: document.title,
        ...(document.url ? { url: document.url } : {}),
        stage: 'save',
        error: errorMessage(error),
      };
      result.failedCount += 1;
      result.failures.push(failure);
      logFailure(db, runId, failure, document);
      if (options.continueOnError !== true) {
        result.durationMs = Date.now() - startedAt;
        finalizeRun(db, result, options);
        throw error;
      }
    }
  }

  result.durationMs = Date.now() - startedAt;
  finalizeRun(db, result, options);
  return result;
}

export async function backfillEmbeddings(
  db: DatabaseSync,
  api: SqliteDocStoreApi,
  documentIds: string[],
  options: Omit<IngestPipelineOptions, 'mode'>,
): Promise<IngestBatchResult> {
  const startedAt = Date.now();
  const runId = options.runId ?? randomUUID();
  const resolvedOptions: IngestPipelineOptions = { ...options, mode: 'backfill-embeddings' };
  insertRun(db, runId, resolvedOptions);

  const result: IngestBatchResult = {
    runId,
    processedCount: 0,
    insertedCount: 0,
    dedupedCount: 0,
    failedCount: 0,
    embeddingsGeneratedCount: 0,
    failures: [],
    durationMs: 0,
    dryRun: options.dryRun === true,
  };

  for (const [index, documentId] of documentIds.entries()) {
    result.processedCount += 1;

    if (options.dryRun === true) {
      continue;
    }

    try {
      const backfilled = await api.generateEmbeddingsForDocument(documentId);
      result.embeddingsGeneratedCount += backfilled.embeddingsGenerated;
    } catch (error) {
      const failure: IngestItemFailure = {
        index,
        title: documentId,
        stage: 'backfill',
        error: errorMessage(error),
      };
      result.failedCount += 1;
      result.failures.push(failure);
      logFailure(db, runId, failure, { documentId });
      if (options.continueOnError !== true) {
        result.durationMs = Date.now() - startedAt;
        finalizeRun(db, result, resolvedOptions);
        throw error;
      }
    }
  }

  result.durationMs = Date.now() - startedAt;
  finalizeRun(db, result, resolvedOptions);
  return result;
}
