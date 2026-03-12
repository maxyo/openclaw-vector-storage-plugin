import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../src/database.js';
import { resolveConfig } from '../src/config.js';
import { SqliteDocumentRepository } from '../src/repository.js';
import { OpenAICompatibleEmbeddingClient } from '../src/embeddings.js';

const cleanupPaths: string[] = [];

afterEach(() => {
  cleanupPaths.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeRepositoryWithEmbeddings() {
  const dir = mkdtempSync(join(tmpdir(), 'sqlite-doc-store-embeddings-'));
  cleanupPaths.push(dir);
  const dbPath = join(dir, 'documents.sqlite');
  const config = resolveConfig({
    dbPath,
    embedding: {
      enabled: true,
      apiUrl: 'https://embeddings.example.test/v1/embeddings',
      apiKey: 'test-token',
      model: 'text-embedding-3-small',
      timeoutMs: 5000,
      batchSize: 16,
    },
  });
  const db = openDatabase(dbPath);
  const embeddingClient = new OpenAICompatibleEmbeddingClient(config.embedding);
  return {
    db,
    repository: new SqliteDocumentRepository(db, config, embeddingClient),
  };
}

describe('embeddings integration', () => {
  it('generates and stores embeddings for saved chunks', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const { db, repository } = makeRepositoryWithEmbeddings();
    const saved = await repository.saveDocument({
      sourceType: 'manual',
      sourceName: 'test',
      title: 'Embedding smoke test',
      documentType: 'analysis',
      textRaw: 'OFZ yields reacted to central bank language and market expectations.',
      summary: 'Embedding storage test',
    });

    expect(saved.inserted).toBe(true);
    expect(saved.embeddingStatus).toBe('generated');
    expect(saved.embeddingsGenerated).toBe(1);
    expect(saved.embeddingModel).toBe('text-embedding-3-small');
    expect(fetchMock).toHaveBeenCalledOnce();

    const row = db.prepare('SELECT embedding_json, embedding_model FROM document_chunks LIMIT 1').get() as {
      embedding_json: string;
      embedding_model: string;
    };

    expect(JSON.parse(row.embedding_json)).toEqual([0.1, 0.2, 0.3]);
    expect(row.embedding_model).toBe('text-embedding-3-small');
  });

  it('keeps the document even when embedding generation fails', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'upstream unavailable' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const { db, repository } = makeRepositoryWithEmbeddings();
    const saved = await repository.saveDocument({
      sourceType: 'manual',
      sourceName: 'test',
      title: 'Embedding failure test',
      documentType: 'analysis',
      textRaw: 'RGBI moved after the macro release and order flow changed.',
    });

    expect(saved.inserted).toBe(true);
    expect(saved.embeddingStatus).toBe('failed');
    expect(saved.embeddingsGenerated).toBe(0);
    expect(saved.embeddingError).toContain('Embedding API request failed');
    expect(repository.countDocuments()).toBe(1);

    const row = db.prepare('SELECT embedding_json, embedding_model FROM document_chunks LIMIT 1').get() as {
      embedding_json: string | null;
      embedding_model: string | null;
    };

    expect(row.embedding_json).toBeNull();
    expect(row.embedding_model).toBeNull();
  });
});
