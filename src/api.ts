import type { DatabaseSync } from 'node:sqlite';
import type { PluginConfig, SaveDocumentInput, SaveDocumentResult, SearchChunksInput, SearchDocumentsInput } from './types.js';
import { SqliteDocumentRepository } from './repository.js';

export interface SqliteDocStoreApi {
  saveDocument(input: SaveDocumentInput): SaveDocumentResult;
  searchDocuments(input: SearchDocumentsInput): ReturnType<SqliteDocumentRepository['searchDocuments']>;
  searchChunks(input: SearchChunksInput): ReturnType<SqliteDocumentRepository['searchChunks']>;
  getDocument(documentId: string): ReturnType<SqliteDocumentRepository['getDocument']>;
  countDocuments(): number;
}

export function createSqliteDocStoreApi(db: DatabaseSync, config: PluginConfig): SqliteDocStoreApi {
  const repository = new SqliteDocumentRepository(db, config);

  return {
    saveDocument: (input) => repository.saveDocument(input),
    searchDocuments: (input) => repository.searchDocuments(input),
    searchChunks: (input) => repository.searchChunks(input),
    getDocument: (documentId) => repository.getDocument(documentId),
    countDocuments: () => repository.countDocuments(),
  };
}
