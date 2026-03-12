import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/database.js';
import { SqliteDocumentRepository } from '../src/repository.js';
import { resolveConfig } from '../src/config.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  cleanupPaths.length = 0;
});

function makeRepository() {
  const dir = mkdtempSync(join(tmpdir(), 'sqlite-doc-store-'));
  cleanupPaths.push(dir);
  const dbPath = join(dir, 'documents.sqlite');
  const config = resolveConfig({ dbPath });
  const db = openDatabase(dbPath);
  return new SqliteDocumentRepository(db, config);
}

describe('SqliteDocumentRepository', () => {
  it('saves a document and indexes it for search', () => {
    const repository = makeRepository();

    const saved = repository.saveDocument({
      sourceType: 'manual',
      sourceName: 'test',
      title: 'CBR statement on rates',
      documentType: 'press_release',
      textRaw: 'The Central Bank discussed rates, inflation, and liquidity conditions in detail.',
      summary: 'Rates and inflation statement',
      tags: ['cbr', 'rates'],
    });

    expect(saved.inserted).toBe(true);
    expect(saved.chunkCount).toBeGreaterThan(0);
    expect(repository.countDocuments()).toBe(1);

    const hits = repository.searchDocuments({ query: 'rates inflation', limit: 5 });
    expect(hits.length).toBe(1);
    expect(hits[0]?.title).toBe('CBR statement on rates');
  });

  it('deduplicates by content hash', () => {
    const repository = makeRepository();

    const first = repository.saveDocument({
      sourceType: 'manual',
      sourceName: 'test',
      title: 'Same title',
      documentType: 'analysis',
      textRaw: 'Same text body.',
    });

    const second = repository.saveDocument({
      sourceType: 'manual',
      sourceName: 'test',
      title: 'Same title',
      documentType: 'analysis',
      textRaw: 'Same text body.',
    });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(first.documentId).toBe(second.documentId);
    expect(repository.countDocuments()).toBe(1);
  });
});
