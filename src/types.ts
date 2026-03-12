export type DocumentSourceType =
  | 'marketaux'
  | 'cbr'
  | 'minfin'
  | 'moex'
  | 'econs'
  | 'acra'
  | 'raexpert'
  | 'bofit'
  | 'cbonds'
  | 'manual'
  | 'web'
  | 'other';

export type DocumentType =
  | 'news'
  | 'press_release'
  | 'meeting_summary'
  | 'macro_snapshot'
  | 'report'
  | 'analysis'
  | 'other';

export type EmbeddingGenerationStatus = 'generated' | 'skipped' | 'failed' | 'pending';
export type DocumentProcessingStatus = 'raw' | 'normalized' | 'chunked' | 'embedded' | 'failed';
export type SourcePriority = 'primary' | 'secondary' | 'tertiary';
export type RetrievedVia = 'api' | 'rss' | 'html' | 'manual' | 'scrape' | 'other';
export type ChunkKind = 'body' | 'summary' | 'title' | 'table' | 'bullet_list' | 'other';

export interface EmbeddingProviderConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  batchSize: number;
  dimensions?: number;
}

export interface DocumentProvenanceInput {
  sourceUrlCanonical?: string;
  sourcePublisher?: string;
  sourceSection?: string;
  sourcePriority?: SourcePriority;
  isOfficialSource?: boolean;
  retrievedVia?: RetrievedVia;
  httpStatus?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  fetchRunId?: string;
  trustScore?: number;
}

export interface DocumentProcessingInput {
  ingestVersion?: string;
  normalizerVersion?: string;
  chunkingVersion?: string;
}

export interface ExtractionHints {
  titleSelector?: string;
  contentSelector?: string;
  removeSelectors?: string[];
}

export interface DocumentRecord {
  id: string;
  sourceType: DocumentSourceType;
  sourceName: string;
  title: string;
  url?: string;
  publishedAt?: string;
  collectedAt: string;
  documentType: DocumentType;
  language?: string;
  country?: string;
  textRaw: string;
  textClean: string;
  summary?: string;
  metadataJson: string;
  contentHash: string;
  status: DocumentProcessingStatus;
  ingestVersion: string;
  normalizerVersion: string;
  chunkingVersion: string;
  embeddingStatus: EmbeddingGenerationStatus;
  embeddingModel?: string;
  chunkCount: number;
  tokenCountEstimate: number;
  processingError?: string;
  lastProcessedAt?: string;
  sourceUrlCanonical?: string;
  sourceDomain?: string;
  sourcePriority: SourcePriority;
  isOfficialSource: boolean;
  sourcePublisher?: string;
  sourceSection?: string;
  retrievedVia?: RetrievedVia;
  httpStatus?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  fetchRunId?: string;
  trustScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunkRecord {
  id: string;
  documentId: string;
  chunkIndex: number;
  sectionTitle?: string;
  text: string;
  tokenCount: number;
  charCount: number;
  embeddingJson?: string;
  embeddingModel?: string;
  embeddingStatus: EmbeddingGenerationStatus;
  startsAtChar?: number;
  endsAtChar?: number;
  chunkKind: ChunkKind;
  metadataJson: string;
  createdAt: string;
}

export interface SaveDocumentInput {
  sourceType: DocumentSourceType;
  sourceName: string;
  title: string;
  url?: string;
  publishedAt?: string;
  collectedAt?: string;
  documentType: DocumentType;
  language?: string;
  country?: string;
  textRaw: string;
  textClean?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  provenance?: DocumentProvenanceInput;
  processing?: DocumentProcessingInput;
  chunking?: {
    targetTokens?: number;
    overlapTokens?: number;
  };
}

export interface SaveDocumentResult {
  documentId: string;
  contentHash: string;
  inserted: boolean;
  chunkCount: number;
  embeddingsGenerated: number;
  embeddingStatus: EmbeddingGenerationStatus;
  embeddingModel?: string;
  embeddingError?: string;
}

export interface GenerateEmbeddingsResult {
  documentId: string;
  chunkCount: number;
  embeddingsGenerated: number;
  embeddingStatus: EmbeddingGenerationStatus;
  embeddingModel?: string;
  embeddingError?: string;
}

export interface ChunkingOptions {
  targetTokens: number;
  overlapTokens: number;
}

export interface ChunkingResult {
  chunkIndex: number;
  sectionTitle?: string;
  text: string;
  tokenCount: number;
  charCount: number;
  startsAtChar: number;
  endsAtChar: number;
  chunkKind: ChunkKind;
}

export interface SearchDocumentsInput {
  query: string;
  limit?: number;
  sourceType?: DocumentSourceType;
  documentType?: DocumentType;
}

export interface DocumentSearchHit {
  documentId: string;
  title: string;
  sourceName: string;
  sourceType: DocumentSourceType;
  documentType: DocumentType;
  publishedAt?: string;
  summary?: string;
  score: number;
}

export interface SearchChunksInput {
  query: string;
  limit?: number;
  sourceType?: DocumentSourceType;
  documentType?: DocumentType;
}

export interface ChunkSearchHit {
  chunkId: string;
  documentId: string;
  title: string;
  sourceName: string;
  sourceType: DocumentSourceType;
  documentType: DocumentType;
  chunkIndex: number;
  text: string;
  score: number;
}

export interface PluginConfig {
  dbPath: string;
  defaultChunkTargetTokens: number;
  defaultChunkOverlapTokens: number;
  enableFts: boolean;
  vectorMode: 'disabled' | 'sqlite-vec';
  sqliteVecExtensionPath?: string;
  embedding: EmbeddingProviderConfig;
}
