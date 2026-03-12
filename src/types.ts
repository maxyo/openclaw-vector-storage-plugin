export type DocumentSourceType =
  | 'marketaux'
  | 'cbr'
  | 'minfin'
  | 'moex'
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
  embeddingJson?: string;
  embeddingModel?: string;
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
}
