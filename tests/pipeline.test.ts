import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteDocStoreApi } from '../src/api.js';
import { resolveConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { ingestDocuments } from '../src/ingest/pipeline.js';
import type { SaveDocumentInput } from '../src/types.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  cleanupPaths.length = 0;
});

function makeHarness() {
  const dir = mkdtempSync(join(tmpdir(), 'sqlite-doc-store-pipeline-'));
  cleanupPaths.push(dir);
  const dbPath = join(dir, 'documents.sqlite');
  const config = resolveConfig({ dbPath });
  const db = openDatabase(dbPath);
  const api = createSqliteDocStoreApi(db, config);
  return { db, api };
}

describe('ingest pipeline', () => {
  it('records ingest runs for batch ingestion', async () => {
    const { db, api } = makeHarness();
    const documents: SaveDocumentInput[] = [
      {
        sourceType: 'manual',
        sourceName: 'test-batch',
        title: 'Doc one',
        documentType: 'analysis',
        textRaw: 'First document body.',
      },
      {
        sourceType: 'manual',
        sourceName: 'test-batch',
        title: 'Doc two',
        documentType: 'analysis',
        textRaw: 'Second document body.',
      },
    ];

    const result = await ingestDocuments(db, api, documents, {
      mode: 'jsonl',
      sourceName: 'test-batch',
      inputPath: '/tmp/test.jsonl',
    });

    expect(result.processedCount).toBe(2);
    expect(result.insertedCount).toBe(2);
    expect(result.failedCount).toBe(0);

    const row = db.prepare(
      `SELECT mode, status, processed_count, inserted_count, failed_count
       FROM ingest_runs
       WHERE id = ?`
    ).get(result.runId) as {
      mode: string;
      status: string;
      processed_count: number;
      inserted_count: number;
      failed_count: number;
    };

    expect(row.mode).toBe('jsonl');
    expect(row.status).toBe('completed');
    expect(row.processed_count).toBe(2);
    expect(row.inserted_count).toBe(2);
    expect(row.failed_count).toBe(0);
  });
});
