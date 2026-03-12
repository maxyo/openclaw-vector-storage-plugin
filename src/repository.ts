import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { chunkDocument, normalizeDocumentText } from './chunking.js';
import { sha256 } from './hash.js';
import type {
  ChunkSearchHit,
  DocumentSearchHit,
  PluginConfig,
  SaveDocumentInput,
  SaveDocumentResult,
  SearchChunksInput,
  SearchDocumentsInput,
} from './types.js';

interface DocumentSearchRow {
  document_id: string;
  title: string;
  source_name: string;
  source_type: string;
  document_type: string;
  published_at: string | null;
  summary: string | null;
  score: number;
}

interface ChunkSearchRow {
  chunk_id: string;
  document_id: string;
  title: string;
  source_name: string;
  source_type: string;
  document_type: string;
  chunk_index: number;
  text: string;
  score: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function stringifyMetadata(input: Record<string, unknown> | undefined, tags: string[] | undefined): string {
  return JSON.stringify({
    ...(input ?? {}),
    tags: tags ?? [],
  });
}

export class SqliteDocumentRepository {
  public constructor(
    private readonly db: DatabaseSync,
    private readonly config: PluginConfig,
  ) {}

  public saveDocument(input: SaveDocumentInput): SaveDocumentResult {
    const collectedAt = input.collectedAt ?? nowIso();
    const normalizedText = normalizeDocumentText(input.textClean ?? input.textRaw);
    const contentHash = sha256([input.sourceName, input.title, input.url ?? '', normalizedText].join('\n'));

    const existing = this.db
      .prepare('SELECT id FROM documents WHERE content_hash = ?')
      .get(contentHash) as { id: string } | undefined;

    if (existing) {
      return {
        documentId: existing.id,
        contentHash,
        inserted: false,
        chunkCount: this.countChunks(existing.id),
      };
    }

    const documentId = randomUUID();
    const createdAt = nowIso();
    const metadataJson = stringifyMetadata(input.metadata, input.tags);

    this.db.prepare(
      `INSERT INTO documents (
        id, source_type, source_name, title, url, published_at, collected_at, document_type,
        language, country, text_raw, text_clean, summary, metadata_json, content_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      documentId,
      input.sourceType,
      input.sourceName,
      input.title,
      input.url ?? null,
      input.publishedAt ?? null,
      collectedAt,
      input.documentType,
      input.language ?? null,
      input.country ?? null,
      input.textRaw,
      normalizedText,
      input.summary ?? null,
      metadataJson,
      contentHash,
      createdAt,
      createdAt,
    );

    if (this.config.enableFts) {
      this.db.prepare('INSERT INTO documents_fts (document_id, title, summary, text_clean) VALUES (?, ?, ?, ?)').run(
        documentId,
        input.title,
        input.summary ?? '',
        normalizedText,
      );
    }

    const chunks = chunkDocument(normalizedText, {
      targetTokens: input.chunking?.targetTokens ?? this.config.defaultChunkTargetTokens,
      overlapTokens: input.chunking?.overlapTokens ?? this.config.defaultChunkOverlapTokens,
    });

    const insertChunk = this.db.prepare(
      `INSERT INTO document_chunks (
        id, document_id, chunk_index, section_title, text, token_count, embedding_json, embedding_model, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertChunkFts = this.config.enableFts
      ? this.db.prepare('INSERT INTO document_chunks_fts (chunk_id, document_id, text) VALUES (?, ?, ?)')
      : null;

    for (const chunk of chunks) {
      const chunkId = randomUUID();
      insertChunk.run(
        chunkId,
        documentId,
        chunk.chunkIndex,
        chunk.sectionTitle ?? null,
        chunk.text,
        chunk.tokenCount,
        null,
        null,
        metadataJson,
        createdAt,
      );
      insertChunkFts?.run(chunkId, documentId, chunk.text);
    }

    return {
      documentId,
      contentHash,
      inserted: true,
      chunkCount: chunks.length,
    };
  }

  public searchDocuments(input: SearchDocumentsInput): DocumentSearchHit[] {
    const limit = input.limit ?? 10;
    const sql = `
      SELECT
        d.id AS document_id,
        d.title,
        d.source_name,
        d.source_type,
        d.document_type,
        d.published_at,
        d.summary,
        bm25(documents_fts) AS score
      FROM documents_fts
      JOIN documents d ON d.id = documents_fts.document_id
      WHERE documents_fts MATCH ?
        AND (? IS NULL OR d.source_type = ?)
        AND (? IS NULL OR d.document_type = ?)
      ORDER BY score
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(
      input.query,
      input.sourceType ?? null,
      input.sourceType ?? null,
      input.documentType ?? null,
      input.documentType ?? null,
      limit,
    ) as unknown as DocumentSearchRow[];

    return rows.map((row) => ({
      documentId: row.document_id,
      title: row.title,
      sourceName: row.source_name,
      sourceType: row.source_type as DocumentSearchHit['sourceType'],
      documentType: row.document_type as DocumentSearchHit['documentType'],
      ...(typeof row.published_at === 'string' ? { publishedAt: row.published_at } : {}),
      ...(typeof row.summary === 'string' ? { summary: row.summary } : {}),
      score: row.score,
    }));
  }

  public searchChunks(input: SearchChunksInput): ChunkSearchHit[] {
    const limit = input.limit ?? 10;
    const sql = `
      SELECT
        c.id AS chunk_id,
        c.document_id,
        d.title,
        d.source_name,
        d.source_type,
        d.document_type,
        c.chunk_index,
        c.text,
        bm25(document_chunks_fts) AS score
      FROM document_chunks_fts
      JOIN document_chunks c ON c.id = document_chunks_fts.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE document_chunks_fts MATCH ?
        AND (? IS NULL OR d.source_type = ?)
        AND (? IS NULL OR d.document_type = ?)
      ORDER BY score
      LIMIT ?
    `;

    const rows = this.db.prepare(sql).all(
      input.query,
      input.sourceType ?? null,
      input.sourceType ?? null,
      input.documentType ?? null,
      input.documentType ?? null,
      limit,
    ) as unknown as ChunkSearchRow[];

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      title: row.title,
      sourceName: row.source_name,
      sourceType: row.source_type as ChunkSearchHit['sourceType'],
      documentType: row.document_type as ChunkSearchHit['documentType'],
      chunkIndex: row.chunk_index,
      text: row.text,
      score: row.score,
    }));
  }

  public getDocument(documentId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as Record<string, unknown> | undefined;
  }

  public countDocuments(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM documents').get() as { count: number };
    return row.count;
  }

  private countChunks(documentId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM document_chunks WHERE document_id = ?').get(documentId) as {
      count: number;
    };
    return row.count;
  }
}
