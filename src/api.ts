import type { DatabaseSync } from 'node:sqlite';
import type {
  GenerateEmbeddingsResult,
  PluginConfig,
  SaveDocumentInput,
  SaveDocumentResult,
  SearchChunksInput,
  SearchDocumentsInput,
} from './types.js';
import { createEmbeddingClient } from './embeddings.js';
import { SqliteDocumentRepository } from './repository.js';

export interface SqliteDocStoreApi {
  saveDocument(input: SaveDocumentInput): Promise<SaveDocumentResult>;
  generateEmbeddingsForDocument(documentId: string): Promise<GenerateEmbeddingsResult>;
  searchDocuments(input: SearchDocumentsInput): ReturnType<SqliteDocumentRepository['searchDocuments']>;
  searchChunks(input: SearchChunksInput): ReturnType<SqliteDocumentRepository['searchChunks']>;
  getDocument(documentId: string): ReturnType<SqliteDocumentRepository['getDocument']>;
  countDocuments(): number;
}

export function createSqliteDocStoreApi(db: DatabaseSync, config: PluginConfig): SqliteDocStoreApi {
  const embeddingClient = createEmbeddingClient(config.embedding);
  const repository = new SqliteDocumentRepository(db, config, embeddingClient);

  return {
    saveDocument: (input) => repository.saveDocument(input),
    generateEmbeddingsForDocument: (documentId) => repository.generateEmbeddingsForDocument(documentId),
    searchDocuments: (input) => repository.searchDocuments(input),
    searchChunks: (input) => repository.searchChunks(input),
    getDocument: (documentId) => repository.getDocument(documentId),
    countDocuments: () => repository.countDocuments(),
  };
}
