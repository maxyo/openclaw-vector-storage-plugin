#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createSqliteDocStoreApi } from '../src/api.js';
import { resolveConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { backfillEmbeddings } from '../src/ingest/pipeline.js';

interface DocumentIdRow {
  id: string;
}

function printUsage(): void {
  console.error('Usage: npm run embeddings:backfill -- [--limit <n>] [--db-path <path>] [--run-id <id>] [--continue-on-error] [--dry-run]');
}

function main(): Promise<void> {
  return (async () => {
    const { values } = parseArgs({
      options: {
        limit: { type: 'string' },
        'db-path': { type: 'string' },
        'run-id': { type: 'string' },
        'continue-on-error': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
      },
    });

    const limit = values.limit ? Number.parseInt(values.limit, 10) : 100;
    if (!Number.isInteger(limit) || limit <= 0) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const config = resolveConfig({
      ...(values['db-path'] ? { dbPath: values['db-path'] } : {}),
    });
    const db = openDatabase(config.dbPath);
    const api = createSqliteDocStoreApi(db, config);

    const rows = db.prepare(
      `SELECT id
       FROM documents
       WHERE embedding_status != 'generated'
       ORDER BY published_at DESC, created_at DESC
       LIMIT ?`
    ).all(limit) as unknown as DocumentIdRow[];

    const result = await backfillEmbeddings(db, api, rows.map((row) => row.id), {
      ...(values['run-id'] ? { runId: values['run-id'] } : {}),
      continueOnError: values['continue-on-error'],
      dryRun: values['dry-run'],
      metadata: {
        limit,
      },
    });

    console.log(JSON.stringify(result, null, 2));
  })();
}

await main();
