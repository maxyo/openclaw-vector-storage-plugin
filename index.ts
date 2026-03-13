import { createSqliteDocStoreApi } from './src/api.js';
import { openDatabase } from './src/database.js';
import { resolveConfig } from './src/config.js';
import type { PluginConfig, SaveDocumentInput, SearchChunksInput, SearchDocumentsInput } from './src/types.js';

const sourceTypes = [
  'marketaux',
  'cbr',
  'minfin',
  'moex',
  'econs',
  'acra',
  'raexpert',
  'bofit',
  'cbonds',
  'manual',
  'web',
  'other',
] as const;

const documentTypes = [
  'news',
  'press_release',
  'meeting_summary',
  'macro_snapshot',
  'report',
  'analysis',
  'other',
] as const;

const sourcePriorities = ['primary', 'secondary', 'tertiary'] as const;
const retrievedViaValues = ['api', 'rss', 'html', 'manual', 'scrape', 'other'] as const;
const embeddingStatuses = ['generated', 'skipped', 'failed', 'pending'] as const;
const chunkKinds = ['body', 'summary', 'title', 'table', 'bullet_list', 'other'] as const;

interface OpenClawPluginApi {
  pluginConfig?: Record<string, unknown>;
  logger: { info(message: string): void };
  registerTool: (tool: Record<string, unknown>) => void;
}

const emptyObjectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

type ToolResultPayload = {
  ok: true;
  summary: string;
  data: unknown;
};

function json(payload: ToolResultPayload): {
  content: [{ type: 'text'; text: string }];
  details: ToolResultPayload;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function createToolResult(summary: string, data: unknown): {
  content: [{ type: 'text'; text: string }];
  details: ToolResultPayload;
} {
  return json({ ok: true, summary, data });
}

function readStringParam(
  params: Record<string, unknown>,
  key: string,
  options?: { required?: boolean },
): string | undefined {
  const value = params[key];
  if (value === undefined || value === null || value === '') {
    if (options?.required) {
      throw new Error(`Missing required string parameter: ${key}`);
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Parameter ${key} must be a string`);
  }
  return value;
}

function readNumberParam(
  params: Record<string, unknown>,
  key: string,
  options?: { min?: number; max?: number },
): number | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Parameter ${key} must be a finite number`);
  }
  if (options?.min !== undefined && value < options.min) {
    throw new Error(`Parameter ${key} must be >= ${String(options.min)}`);
  }
  if (options?.max !== undefined && value > options.max) {
    throw new Error(`Parameter ${key} must be <= ${String(options.max)}`);
  }
  return value;
}

function readBooleanParam(params: Record<string, unknown>, key: string): boolean | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`Parameter ${key} must be a boolean`);
  }
  return value;
}

function readStringArrayParam(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Parameter ${key} must be an array of strings`);
  }
  return value as string[];
}

function readRecordParam(params: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Parameter ${key} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readEnumParam<T extends readonly string[]>(
  params: Record<string, unknown>,
  key: string,
  values: T,
): T[number] | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`Parameter ${key} must be one of: ${values.join(', ')}`);
  }
  return value as T[number];
}

function buildSearchDocumentsInput(params: Record<string, unknown>): SearchDocumentsInput {
  const query = readStringParam(params, 'query', { required: true }) as string;
  const limit = readNumberParam(params, 'limit', { min: 1, max: 50 });
  const sourceType = readEnumParam(params, 'sourceType', sourceTypes);
  const sourceName = readStringParam(params, 'sourceName');
  const documentType = readEnumParam(params, 'documentType', documentTypes);
  const language = readStringParam(params, 'language');
  const country = readStringParam(params, 'country');
  const sourcePriority = readEnumParam(params, 'sourcePriority', sourcePriorities);
  const isOfficialSource = readBooleanParam(params, 'isOfficialSource');
  const retrievedVia = readEnumParam(params, 'retrievedVia', retrievedViaValues);
  const embeddingStatus = readEnumParam(params, 'embeddingStatus', embeddingStatuses);
  const minTrustScore = readNumberParam(params, 'minTrustScore', { min: 0, max: 1 });
  const publishedAfter = readStringParam(params, 'publishedAfter');
  const publishedBefore = readStringParam(params, 'publishedBefore');
  const collectedAfter = readStringParam(params, 'collectedAfter');
  const collectedBefore = readStringParam(params, 'collectedBefore');

  return {
    query,
    ...(limit !== undefined ? { limit } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(documentType ? { documentType } : {}),
    ...(language ? { language } : {}),
    ...(country ? { country } : {}),
    ...(sourcePriority ? { sourcePriority } : {}),
    ...(isOfficialSource !== undefined ? { isOfficialSource } : {}),
    ...(retrievedVia ? { retrievedVia } : {}),
    ...(embeddingStatus ? { embeddingStatus } : {}),
    ...(minTrustScore !== undefined ? { minTrustScore } : {}),
    ...(publishedAfter ? { publishedAfter } : {}),
    ...(publishedBefore ? { publishedBefore } : {}),
    ...(collectedAfter ? { collectedAfter } : {}),
    ...(collectedBefore ? { collectedBefore } : {}),
  };
}

function buildSearchChunksInput(params: Record<string, unknown>): SearchChunksInput {
  const base = buildSearchDocumentsInput(params);
  const chunkKind = readEnumParam(params, 'chunkKind', chunkKinds);
  const chunkEmbeddingStatus = readEnumParam(params, 'chunkEmbeddingStatus', embeddingStatuses);
  return {
    ...base,
    ...(chunkKind ? { chunkKind } : {}),
    ...(chunkEmbeddingStatus ? { chunkEmbeddingStatus } : {}),
  };
}

export function createPlugin(rawConfig: unknown) {
  const config = resolveConfig(rawConfig);
  const db = openDatabase(config.dbPath);
  const api = createSqliteDocStoreApi(db, config);

  return {
    name: 'sqlite-doc-store',
    description: 'Buffered SQLite document store with chunking, FTS search, and optional embeddings.',
    config,
    api,
    db,
  };
}

const plugin = {
  name: 'sqlite-doc-store',
  description: 'Buffered SQLite document store with chunking, FTS search, and optional embeddings.',
  async register(api: OpenClawPluginApi): Promise<void> {
    const { api: storeApi, config } = createPlugin(api.pluginConfig);

    api.logger.info(
      `[sqlite-doc-store] registered (dbPath=${config.dbPath}, embeddings=${String(config.embedding.enabled)}, model=${config.embedding.model})`,
    );

    api.registerTool({
      name: 'sqlite_doc_store_count_documents',
      label: 'SQLite Doc Store Count Documents',
      description: 'Count documents currently stored in sqlite-doc-store.',
      parameters: emptyObjectSchema,
      async execute() {
        const count = storeApi.countDocuments();
        return createToolResult(`Documents in store: ${String(count)}`, { count });
      },
    });

    api.registerTool({
      name: 'sqlite_doc_store_get_document',
      label: 'SQLite Doc Store Get Document',
      description: 'Get one stored document row by document id.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string', minLength: 1 },
        },
        required: ['documentId'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const documentId = readStringParam(params, 'documentId', { required: true }) as string;
        const document = storeApi.getDocument(documentId);
        return createToolResult(document ? 'Document fetched.' : 'Document not found.', {
          documentId,
          found: Boolean(document),
          document: document ?? null,
        });
      },
    });

    api.registerTool({
      name: 'sqlite_doc_store_generate_embeddings',
      label: 'SQLite Doc Store Generate Embeddings',
      description: 'Generate or synchronize chunk embeddings for a stored document.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          documentId: { type: 'string', minLength: 1 },
        },
        required: ['documentId'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const documentId = readStringParam(params, 'documentId', { required: true }) as string;
        const result = await storeApi.generateEmbeddingsForDocument(documentId);
        return createToolResult('Embedding generation finished.', result);
      },
    });

    api.registerTool({
      name: 'sqlite_doc_store_save_document',
      label: 'SQLite Doc Store Save Document',
      description: 'Save one document into sqlite-doc-store, with chunking and optional embeddings.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceType: { type: 'string', enum: [...sourceTypes] },
          sourceName: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          documentType: { type: 'string', enum: [...documentTypes] },
          textRaw: { type: 'string', minLength: 1 },
          url: { type: 'string' },
          publishedAt: { type: 'string' },
          collectedAt: { type: 'string' },
          language: { type: 'string' },
          country: { type: 'string' },
          textClean: { type: 'string' },
          summary: { type: 'string' },
          metadata: { type: 'object', additionalProperties: true },
          tags: { type: 'array', items: { type: 'string' } },
          provenance: { type: 'object', additionalProperties: true },
          processing: { type: 'object', additionalProperties: true },
          chunking: { type: 'object', additionalProperties: true },
        },
        required: ['sourceType', 'sourceName', 'title', 'documentType', 'textRaw'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const url = readStringParam(params, 'url');
        const publishedAt = readStringParam(params, 'publishedAt');
        const collectedAt = readStringParam(params, 'collectedAt');
        const language = readStringParam(params, 'language');
        const country = readStringParam(params, 'country');
        const textClean = readStringParam(params, 'textClean');
        const summary = readStringParam(params, 'summary');
        const metadata = readRecordParam(params, 'metadata');
        const tags = readStringArrayParam(params, 'tags');
        const provenance = readRecordParam(params, 'provenance') as SaveDocumentInput['provenance'] | undefined;
        const processing = readRecordParam(params, 'processing') as SaveDocumentInput['processing'] | undefined;
        const chunking = readRecordParam(params, 'chunking') as SaveDocumentInput['chunking'] | undefined;

        const input: SaveDocumentInput = {
          sourceType: readEnumParam(params, 'sourceType', sourceTypes) as SaveDocumentInput['sourceType'],
          sourceName: readStringParam(params, 'sourceName', { required: true }) as string,
          title: readStringParam(params, 'title', { required: true }) as string,
          documentType: readEnumParam(params, 'documentType', documentTypes) as SaveDocumentInput['documentType'],
          textRaw: readStringParam(params, 'textRaw', { required: true }) as string,
          ...(url ? { url } : {}),
          ...(publishedAt ? { publishedAt } : {}),
          ...(collectedAt ? { collectedAt } : {}),
          ...(language ? { language } : {}),
          ...(country ? { country } : {}),
          ...(textClean ? { textClean } : {}),
          ...(summary ? { summary } : {}),
          ...(metadata ? { metadata } : {}),
          ...(tags ? { tags } : {}),
          ...(provenance ? { provenance } : {}),
          ...(processing ? { processing } : {}),
          ...(chunking ? { chunking } : {}),
        };

        const result = await storeApi.saveDocument(input);
        return createToolResult(result.inserted ? 'Document saved.' : 'Document deduplicated.', result);
      },
    });

    const searchBaseProperties = {
      query: { type: 'string', minLength: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      sourceType: { type: 'string', enum: [...sourceTypes] },
      sourceName: { type: 'string' },
      documentType: { type: 'string', enum: [...documentTypes] },
      language: { type: 'string' },
      country: { type: 'string' },
      sourcePriority: { type: 'string', enum: [...sourcePriorities] },
      isOfficialSource: { type: 'boolean' },
      retrievedVia: { type: 'string', enum: [...retrievedViaValues] },
      embeddingStatus: { type: 'string', enum: [...embeddingStatuses] },
      minTrustScore: { type: 'number', minimum: 0, maximum: 1 },
      publishedAfter: { type: 'string' },
      publishedBefore: { type: 'string' },
      collectedAfter: { type: 'string' },
      collectedBefore: { type: 'string' },
    } as const;

    api.registerTool({
      name: 'sqlite_doc_store_search_documents',
      label: 'SQLite Doc Store Search Documents',
      description: 'Search stored documents using safe FTS plus metadata/time/trust filters.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: searchBaseProperties,
        required: ['query'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const input = buildSearchDocumentsInput(params);
        const hits = storeApi.searchDocuments(input);
        return createToolResult(`Document hits: ${String(hits.length)}`, { input, hits });
      },
    });

    api.registerTool({
      name: 'sqlite_doc_store_search_chunks',
      label: 'SQLite Doc Store Search Chunks',
      description: 'Search stored chunks using safe FTS plus metadata/time/trust filters.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...searchBaseProperties,
          chunkKind: { type: 'string', enum: [...chunkKinds] },
          chunkEmbeddingStatus: { type: 'string', enum: [...embeddingStatuses] },
        },
        required: ['query'],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const input = buildSearchChunksInput(params);
        const hits = storeApi.searchChunks(input);
        return createToolResult(`Chunk hits: ${String(hits.length)}`, { input, hits });
      },
    });
  },
};

export default plugin;

export { resolveConfig } from './src/config.js';
export { openDatabase } from './src/database.js';
export { chunkDocument, normalizeDocumentText } from './src/chunking.js';
export { createSqliteDocStoreApi } from './src/api.js';
export { createEmbeddingClient, OpenAICompatibleEmbeddingClient } from './src/embeddings.js';
export { ingestDocuments, backfillEmbeddings } from './src/ingest/pipeline.js';
export { validateSaveDocumentInput } from './src/ingest/validate.js';
export { fetchUrlDocument } from './src/ingest/url-fetch.js';
export { extractContentFromBody } from './src/ingest/extract.js';
export { getSourceProfile } from './src/ingest/source-profiles.js';
export type * from './src/types.js';
