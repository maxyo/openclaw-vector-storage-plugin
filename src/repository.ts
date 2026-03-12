import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { chunkDocument, normalizeDocumentText } from './chunking.js';
import { sha256 } from './hash.js';
import type { EmbeddingClient } from './embeddings.js';
import type {
  ChunkSearchHit,
  DocumentProcessingStatus,
  DocumentSearchHit,
  EmbeddingGenerationStatus,
  GenerateEmbeddingsResult,
  PluginConfig,
  RetrievedVia,
  SaveDocumentInput,
  SaveDocumentResult,
  SearchChunksInput,
  SearchDocumentsInput,
  SourcePriority,
} from './types.js';

const DEFAULT_INGEST_VERSION = 'v2';
const DEFAULT_NORMALIZER_VERSION = 'normalize/v1';
const DEFAULT_CHUNKING_VERSION = 'chunking/v1';

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

interface ChunkEmbeddingRow {
  id: string;
  text: string;
}

interface DocumentEmbeddingStateRow {
  embedding_status: EmbeddingGenerationStatus;
  embedding_model: string | null;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseUrlDomain(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function clampTrustScore(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function inferSourcePriority(sourceType: SaveDocumentInput['sourceType']): SourcePriority {
  if (sourceType === 'cbr' || sourceType === 'minfin' || sourceType === 'moex') {
    return 'primary';
  }
  if (sourceType === 'marketaux' || sourceType === 'manual') {
    return 'secondary';
  }
  return 'tertiary';
}

function inferOfficialSource(sourceType: SaveDocumentInput['sourceType']): boolean {
  return sourceType === 'cbr' || sourceType === 'minfin' || sourceType === 'moex';
}

function inferTrustScore(sourceType: SaveDocumentInput['sourceType']): number {
  switch (sourceType) {
    case 'cbr':
    case 'minfin':
    case 'moex':
      return 0.95;
    case 'manual':
      return 0.75;
    case 'marketaux':
      return 0.6;
    case 'web':
      return 0.45;
    default:
      return 0.35;
  }
}

function inferRetrievedVia(sourceType: SaveDocumentInput['sourceType']): RetrievedVia {
  switch (sourceType) {
    case 'marketaux':
      return 'api';
    case 'manual':
      return 'manual';
    case 'cbr':
    case 'minfin':
    case 'moex':
    case 'web':
      return 'html';
    default:
      return 'other';
  }
}

export class SqliteDocumentRepository {
  public constructor(
    private readonly db: DatabaseSync,
    private readonly config: PluginConfig,
    private readonly embeddingClient?: EmbeddingClient,
  ) {}

  public async saveDocument(input: SaveDocumentInput): Promise<SaveDocumentResult> {
    const collectedAt = input.collectedAt ?? nowIso();
    const normalizedText = normalizeDocumentText(input.textClean ?? input.textRaw);
    const contentHash = sha256([input.sourceName, input.title, input.url ?? '', normalizedText].join('\n'));

    const existing = this.db
      .prepare('SELECT id FROM documents WHERE content_hash = ?')
      .get(contentHash) as { id: string } | undefined;

    if (existing) {
      const embeddingResult = await this.generateEmbeddingsForDocument(existing.id);
      return {
        documentId: existing.id,
        contentHash,
        inserted: false,
        chunkCount: embeddingResult.chunkCount,
        embeddingsGenerated: embeddingResult.embeddingsGenerated,
        embeddingStatus: embeddingResult.embeddingStatus,
        ...(embeddingResult.embeddingModel ? { embeddingModel: embeddingResult.embeddingModel } : {}),
        ...(embeddingResult.embeddingError ? { embeddingError: embeddingResult.embeddingError } : {}),
      };
    }

    const documentId = randomUUID();
    const createdAt = nowIso();
    const metadataJson = stringifyMetadata(input.metadata, input.tags);

    const sourceUrlCanonical = input.provenance?.sourceUrlCanonical ?? input.url;
    const sourceDomain = parseUrlDomain(sourceUrlCanonical);
    const sourcePriority = input.provenance?.sourcePriority ?? inferSourcePriority(input.sourceType);
    const isOfficialSource = input.provenance?.isOfficialSource ?? inferOfficialSource(input.sourceType);
    const sourcePublisher = input.provenance?.sourcePublisher ?? input.sourceName;
    const retrievedVia = input.provenance?.retrievedVia ?? inferRetrievedVia(input.sourceType);
    const trustScore = clampTrustScore(input.provenance?.trustScore, inferTrustScore(input.sourceType));

    const chunks = chunkDocument(normalizedText, {
      targetTokens: input.chunking?.targetTokens ?? this.config.defaultChunkTargetTokens,
      overlapTokens: input.chunking?.overlapTokens ?? this.config.defaultChunkOverlapTokens,
    });
    const tokenCountEstimate = chunks.reduce((total, chunk) => total + chunk.tokenCount, 0);
    const initialEmbeddingStatus: EmbeddingGenerationStatus = this.embeddingClient ? 'pending' : 'skipped';
    const initialStatus: DocumentProcessingStatus = 'chunked';

    this.db.prepare(
      `INSERT INTO documents (
        id, source_type, source_name, title, url, published_at, collected_at, document_type,
        language, country, text_raw, text_clean, summary, metadata_json, content_hash,
        status, ingest_version, normalizer_version, chunking_version, embedding_status, embedding_model,
        chunk_count, token_count_estimate, processing_error, last_processed_at,
        source_url_canonical, source_domain, source_priority, is_official_source, source_publisher, source_section,
        retrieved_via, http_status, content_type, etag, last_modified, fetch_run_id, trust_score,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      initialStatus,
      input.processing?.ingestVersion ?? DEFAULT_INGEST_VERSION,
      input.processing?.normalizerVersion ?? DEFAULT_NORMALIZER_VERSION,
      input.processing?.chunkingVersion ?? DEFAULT_CHUNKING_VERSION,
      initialEmbeddingStatus,
      null,
      chunks.length,
      tokenCountEstimate,
      null,
      null,
      sourceUrlCanonical ?? null,
      sourceDomain ?? null,
      sourcePriority,
      isOfficialSource ? 1 : 0,
      sourcePublisher,
      input.provenance?.sourceSection ?? null,
      retrievedVia,
      input.provenance?.httpStatus ?? null,
      input.provenance?.contentType ?? null,
      input.provenance?.etag ?? null,
      input.provenance?.lastModified ?? null,
      input.provenance?.fetchRunId ?? null,
      trustScore,
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

    const insertChunk = this.db.prepare(
      `INSERT INTO document_chunks (
        id, document_id, chunk_index, section_title, text, token_count, char_count,
        embedding_json, embedding_model, embedding_status, starts_at_char, ends_at_char, chunk_kind,
        metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        chunk.charCount,
        null,
        null,
        initialEmbeddingStatus,
        chunk.startsAtChar,
        chunk.endsAtChar,
        chunk.chunkKind,
        metadataJson,
        createdAt,
      );
      insertChunkFts?.run(chunkId, documentId, chunk.text);
    }

    const embeddingResult = await this.generateEmbeddingsForDocument(documentId);

    return {
      documentId,
      contentHash,
      inserted: true,
      chunkCount: chunks.length,
      embeddingsGenerated: embeddingResult.embeddingsGenerated,
      embeddingStatus: embeddingResult.embeddingStatus,
      ...(embeddingResult.embeddingModel ? { embeddingModel: embeddingResult.embeddingModel } : {}),
      ...(embeddingResult.embeddingError ? { embeddingError: embeddingResult.embeddingError } : {}),
    };
  }

  public async generateEmbeddingsForDocument(documentId: string): Promise<GenerateEmbeddingsResult> {
    const chunkCount = this.countChunks(documentId);
    const currentState = this.db
      .prepare('SELECT embedding_status, embedding_model FROM documents WHERE id = ?')
      .get(documentId) as DocumentEmbeddingStateRow | undefined;

    if (!this.embeddingClient) {
      const processedAt = nowIso();
      this.db.prepare(
        `UPDATE documents
         SET embedding_status = ?, status = ?, processing_error = NULL, last_processed_at = ?, updated_at = ?
         WHERE id = ?`
      ).run('skipped', 'chunked', processedAt, processedAt, documentId);

      this.db.prepare(
        `UPDATE document_chunks
         SET embedding_status = CASE WHEN embedding_json IS NOT NULL THEN 'generated' ELSE 'skipped' END
         WHERE document_id = ?`
      ).run(documentId);

      return {
        documentId,
        chunkCount,
        embeddingsGenerated: 0,
        embeddingStatus: currentState?.embedding_status ?? 'skipped',
        ...(currentState?.embedding_model ? { embeddingModel: currentState.embedding_model } : {}),
      };
    }

    const rows = this.db
      .prepare(
        `SELECT id, text
         FROM document_chunks
         WHERE document_id = ? AND embedding_json IS NULL
         ORDER BY chunk_index ASC`
      )
      .all(documentId) as unknown as ChunkEmbeddingRow[];

    if (rows.length === 0) {
      return {
        documentId,
        chunkCount,
        embeddingsGenerated: 0,
        embeddingStatus: currentState?.embedding_status ?? 'generated',
        ...(currentState?.embedding_model ? { embeddingModel: currentState.embedding_model } : {}),
      };
    }

    try {
      const embeddings = await this.embeddingClient.embedTexts(rows.map((row) => row.text));
      const updateChunk = this.db.prepare(
        `UPDATE document_chunks
         SET embedding_json = ?, embedding_model = ?, embedding_status = 'generated'
         WHERE id = ?`
      );

      for (const [index, row] of rows.entries()) {
        updateChunk.run(JSON.stringify(embeddings[index]), this.embeddingClient.model, row.id);
      }

      const processedAt = nowIso();
      this.db.prepare(
        `UPDATE documents
         SET embedding_status = 'generated', embedding_model = ?, processing_error = NULL,
             last_processed_at = ?, status = 'embedded', updated_at = ?
         WHERE id = ?`
      ).run(this.embeddingClient.model, processedAt, processedAt, documentId);

      return {
        documentId,
        chunkCount,
        embeddingsGenerated: rows.length,
        embeddingStatus: 'generated',
        embeddingModel: this.embeddingClient.model,
      };
    } catch (error) {
      const processedAt = nowIso();
      const message = errorMessage(error);
      this.db.prepare(
        `UPDATE documents
         SET embedding_status = 'failed', embedding_model = ?, processing_error = ?,
             last_processed_at = ?, status = 'failed', updated_at = ?
         WHERE id = ?`
      ).run(this.embeddingClient.model, message, processedAt, processedAt, documentId);

      this.db.prepare(
        `UPDATE document_chunks
         SET embedding_status = CASE WHEN embedding_json IS NOT NULL THEN 'generated' ELSE 'failed' END
         WHERE document_id = ?`
      ).run(documentId);

      return {
        documentId,
        chunkCount,
        embeddingsGenerated: 0,
        embeddingStatus: 'failed',
        embeddingModel: this.embeddingClient.model,
        embeddingError: message,
      };
    }
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
