#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createSqliteDocStoreApi } from '../src/api.js';
import { resolveConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { ingestDocuments } from '../src/ingest/pipeline.js';
import { validateSaveDocumentInput } from '../src/ingest/validate.js';
import type { SaveDocumentInput } from '../src/types.js';

function printUsage(): void {
  console.error('Usage: npm run ingest:jsonl -- <file.jsonl> [--continue-on-error] [--dry-run] [--skip-embeddings] [--db-path <path>] [--run-id <id>]');
}

function main(): Promise<void> {
  return (async () => {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        'continue-on-error': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'skip-embeddings': { type: 'boolean', default: false },
        'db-path': { type: 'string' },
        'run-id': { type: 'string' },
      },
    });

    const filePath = positionals[0];
    if (!filePath) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const lines = readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const documents: SaveDocumentInput[] = lines.map((line, index) => {
      try {
        return validateSaveDocumentInput(JSON.parse(line) as unknown);
      } catch (error) {
        throw new Error(`Invalid JSONL document at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    const config = resolveConfig({
      ...(values['db-path'] ? { dbPath: values['db-path'] } : {}),
      ...(values['skip-embeddings'] ? { embedding: { enabled: false } } : {}),
    });
    const db = openDatabase(config.dbPath);
    const api = createSqliteDocStoreApi(db, config);

    const result = await ingestDocuments(db, api, documents, {
      mode: 'jsonl',
      inputPath: filePath,
      ...(values['run-id'] ? { runId: values['run-id'] } : {}),
      continueOnError: values['continue-on-error'],
      dryRun: values['dry-run'],
      ...(documents[0]?.sourceName ? { sourceName: documents[0].sourceName } : {}),
      metadata: {
        lineCount: documents.length,
      },
    });

    console.log(JSON.stringify(result, null, 2));
  })();
}

await main();
