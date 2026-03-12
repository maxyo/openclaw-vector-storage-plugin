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
  return { db, repository: new SqliteDocumentRepository(db, config) };
}

describe('SqliteDocumentRepository', () => {
  it('saves a document and indexes it for search', async () => {
    const { repository } = makeRepository();

    const saved = await repository.saveDocument({
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
    expect(saved.embeddingStatus).toBe('skipped');
    expect(repository.countDocuments()).toBe(1);

    const hits = repository.searchDocuments({ query: 'rates inflation', limit: 5 });
    expect(hits.length).toBe(1);
    expect(hits[0]?.title).toBe('CBR statement on rates');
  });

  it('deduplicates by content hash', async () => {
    const { repository } = makeRepository();

    const first = await repository.saveDocument({
      sourceType: 'manual',
      sourceName: 'test',
      title: 'Same title',
      documentType: 'analysis',
      textRaw: 'Same text body.',
    });

    const second = await repository.saveDocument({
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

  it('stores provenance, processing metadata, and trust score', async () => {
    const { db, repository } = makeRepository();

    const saved = await repository.saveDocument({
      sourceType: 'cbr',
      sourceName: 'Bank of Russia',
      title: 'Rate decision metadata test',
      documentType: 'press_release',
      url: 'https://cbr.ru/test/rate-decision',
      textRaw: 'The central bank published a rate decision with policy guidance.',
      provenance: {
        sourcePriority: 'primary',
        isOfficialSource: true,
        sourceSection: 'press-release',
        retrievedVia: 'html',
        httpStatus: 200,
        contentType: 'text/html',
        fetchRunId: 'fetch-001',
        trustScore: 0.98,
      },
      processing: {
        ingestVersion: 'ingest/v2',
        normalizerVersion: 'normalize/v2',
        chunkingVersion: 'chunking/v2',
      },
    });

    expect(saved.inserted).toBe(true);

    const documentRow = db.prepare(
      `SELECT source_priority, is_official_source, trust_score, ingest_version, normalizer_version,
              chunking_version, source_domain, source_url_canonical, embedding_status, chunk_count,
              token_count_estimate
       FROM documents
       WHERE id = ?`
    ).get(saved.documentId) as {
      source_priority: string;
      is_official_source: number;
      trust_score: number;
      ingest_version: string;
      normalizer_version: string;
      chunking_version: string;
      source_domain: string;
      source_url_canonical: string;
      embedding_status: string;
      chunk_count: number;
      token_count_estimate: number;
    };

    expect(documentRow.source_priority).toBe('primary');
    expect(documentRow.is_official_source).toBe(1);
    expect(documentRow.trust_score).toBe(0.98);
    expect(documentRow.ingest_version).toBe('ingest/v2');
    expect(documentRow.normalizer_version).toBe('normalize/v2');
    expect(documentRow.chunking_version).toBe('chunking/v2');
    expect(documentRow.source_domain).toBe('cbr.ru');
    expect(documentRow.source_url_canonical).toBe('https://cbr.ru/test/rate-decision');
    expect(documentRow.embedding_status).toBe('skipped');
    expect(documentRow.chunk_count).toBeGreaterThan(0);
    expect(documentRow.token_count_estimate).toBeGreaterThan(0);

    const chunkRow = db.prepare(
      `SELECT char_count, embedding_status, starts_at_char, ends_at_char, chunk_kind
       FROM document_chunks
       WHERE document_id = ?
       LIMIT 1`
    ).get(saved.documentId) as {
      char_count: number;
      embedding_status: string;
      starts_at_char: number;
      ends_at_char: number;
      chunk_kind: string;
    };

    expect(chunkRow.char_count).toBeGreaterThan(0);
    expect(chunkRow.embedding_status).toBe('skipped');
    expect(chunkRow.starts_at_char).toBeGreaterThanOrEqual(0);
    expect(chunkRow.ends_at_char).toBeGreaterThan(chunkRow.starts_at_char);
    expect(chunkRow.chunk_kind).toBe('body');
  });
});
