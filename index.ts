import { openDatabase } from './src/database.js';
import { createSqliteDocStoreApi } from './src/api.js';
import { resolveConfig } from './src/config.js';

/**
 * Minimal plugin bootstrap.
 *
 * We keep the runtime-facing surface deliberately small in v0.1:
 * the real domain logic lives in src/ and is tested independently.
 *
 * The exact OpenClaw runtime glue can be expanded once the final tool surface
 * is approved, but the storage layer is already usable and strongly typed.
 */
export function createPlugin(rawConfig: unknown) {
  const config = resolveConfig(rawConfig);
  const db = openDatabase(config.dbPath);
  const api = createSqliteDocStoreApi(db, config);

  return {
    name: 'sqlite-doc-store',
    description: 'Buffered SQLite document store with chunking and FTS search.',
    config,
    api,
  };
}

export default createPlugin;

export { resolveConfig } from './src/config.js';
export { openDatabase } from './src/database.js';
export { chunkDocument, normalizeDocumentText } from './src/chunking.js';
export { createSqliteDocStoreApi } from './src/api.js';
export type * from './src/types.js';
