import type { EmbeddingProviderConfig, PluginConfig } from './types.js';

const DEFAULT_DB_PATH = '/config/.openclaw/sqlite-doc-store/documents.sqlite';
const DEFAULT_CHUNK_TARGET_TOKENS = 900;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 120;
const DEFAULT_EMBEDDING_API_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_EMBEDDING_TIMEOUT_MS = 30000;
const DEFAULT_EMBEDDING_BATCH_SIZE = 32;

function readInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= min && parsed <= max) {
      return parsed;
    }
  }
  return fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resolveEmbeddingConfig(raw: unknown): EmbeddingProviderConfig {
  const cfg = readRecord(raw);
  const apiKey = readNonEmptyString(cfg['apiKey']);
  const dimensions = cfg['dimensions'];

  return {
    enabled: cfg['enabled'] === true,
    apiUrl: readNonEmptyString(cfg['apiUrl']) ?? DEFAULT_EMBEDDING_API_URL,
    ...(apiKey ? { apiKey } : {}),
    model: readNonEmptyString(cfg['model']) ?? DEFAULT_EMBEDDING_MODEL,
    timeoutMs: readInteger(cfg['timeoutMs'], DEFAULT_EMBEDDING_TIMEOUT_MS, 1000, 120000),
    batchSize: readInteger(cfg['batchSize'], DEFAULT_EMBEDDING_BATCH_SIZE, 1, 128),
    ...(typeof dimensions === 'number' && Number.isInteger(dimensions) && dimensions > 0 ? { dimensions } : {}),
  };
}

export function resolveConfig(raw: unknown): PluginConfig {
  const cfg = readRecord(raw);

  const sqliteVecExtensionPath = readNonEmptyString(cfg['sqliteVecExtensionPath']);

  return {
    dbPath:
      typeof cfg['dbPath'] === 'string' && cfg['dbPath'].trim() ? cfg['dbPath'] : DEFAULT_DB_PATH,
    defaultChunkTargetTokens: readInteger(cfg['defaultChunkTargetTokens'], DEFAULT_CHUNK_TARGET_TOKENS, 100, 4000),
    defaultChunkOverlapTokens: readInteger(cfg['defaultChunkOverlapTokens'], DEFAULT_CHUNK_OVERLAP_TOKENS, 0, 1000),
    enableFts: cfg['enableFts'] !== false,
    vectorMode: cfg['vectorMode'] === 'sqlite-vec' ? 'sqlite-vec' : 'disabled',
    ...(sqliteVecExtensionPath ? { sqliteVecExtensionPath } : {}),
    embedding: resolveEmbeddingConfig(cfg['embedding']),
  };
}
