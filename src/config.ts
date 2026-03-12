import type { PluginConfig } from './types.js';

const DEFAULT_DB_PATH = '/config/.openclaw/sqlite-doc-store/documents.sqlite';
const DEFAULT_CHUNK_TARGET_TOKENS = 900;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 120;

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

export function resolveConfig(raw: unknown): PluginConfig {
  const cfg = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  const sqliteVecExtensionPath =
    typeof cfg['sqliteVecExtensionPath'] === 'string' && cfg['sqliteVecExtensionPath'].trim()
      ? cfg['sqliteVecExtensionPath']
      : undefined;

  return {
    dbPath:
      typeof cfg['dbPath'] === 'string' && cfg['dbPath'].trim() ? cfg['dbPath'] : DEFAULT_DB_PATH,
    defaultChunkTargetTokens: readInteger(cfg['defaultChunkTargetTokens'], DEFAULT_CHUNK_TARGET_TOKENS, 100, 4000),
    defaultChunkOverlapTokens: readInteger(cfg['defaultChunkOverlapTokens'], DEFAULT_CHUNK_OVERLAP_TOKENS, 0, 1000),
    enableFts: cfg['enableFts'] !== false,
    vectorMode: cfg['vectorMode'] === 'sqlite-vec' ? 'sqlite-vec' : 'disabled',
    ...(sqliteVecExtensionPath ? { sqliteVecExtensionPath } : {}),
  };
}
