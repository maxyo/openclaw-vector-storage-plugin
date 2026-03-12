import type { RetrievedVia, SaveDocumentInput, SourcePriority } from '../types.js';

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());

  return strings.length > 0 ? strings : undefined;
}

function readOptionalMetadata(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function validateSaveDocumentInput(raw: unknown): SaveDocumentInput {
  const input = readRecord(raw, 'document');
  const result: SaveDocumentInput = {
    sourceType: readString(input['sourceType'], 'sourceType') as SaveDocumentInput['sourceType'],
    sourceName: readString(input['sourceName'], 'sourceName'),
    title: readString(input['title'], 'title'),
    documentType: readString(input['documentType'], 'documentType') as SaveDocumentInput['documentType'],
    textRaw: readString(input['textRaw'], 'textRaw'),
  };

  const url = readOptionalString(input['url']);
  const publishedAt = readOptionalString(input['publishedAt']);
  const collectedAt = readOptionalString(input['collectedAt']);
  const language = readOptionalString(input['language']);
  const country = readOptionalString(input['country']);
  const textClean = readOptionalString(input['textClean']);
  const summary = readOptionalString(input['summary']);
  const metadata = readOptionalMetadata(input['metadata']);
  const tags = readOptionalStringArray(input['tags']);

  if (url) result.url = url;
  if (publishedAt) result.publishedAt = publishedAt;
  if (collectedAt) result.collectedAt = collectedAt;
  if (language) result.language = language;
  if (country) result.country = country;
  if (textClean) result.textClean = textClean;
  if (summary) result.summary = summary;
  if (metadata) result.metadata = metadata;
  if (tags) result.tags = tags;

  const provenanceRaw = readOptionalMetadata(input['provenance']);
  if (provenanceRaw) {
    const provenance: NonNullable<SaveDocumentInput['provenance']> = {};
    const sourceUrlCanonical = readOptionalString(provenanceRaw['sourceUrlCanonical']);
    const sourcePublisher = readOptionalString(provenanceRaw['sourcePublisher']);
    const sourceSection = readOptionalString(provenanceRaw['sourceSection']);
    const sourcePriority = readOptionalString(provenanceRaw['sourcePriority']);
    const isOfficialSource = readOptionalBoolean(provenanceRaw['isOfficialSource']);
    const retrievedVia = readOptionalString(provenanceRaw['retrievedVia']);
    const httpStatus = readOptionalNumber(provenanceRaw['httpStatus']);
    const contentType = readOptionalString(provenanceRaw['contentType']);
    const etag = readOptionalString(provenanceRaw['etag']);
    const lastModified = readOptionalString(provenanceRaw['lastModified']);
    const fetchRunId = readOptionalString(provenanceRaw['fetchRunId']);
    const trustScore = readOptionalNumber(provenanceRaw['trustScore']);

    if (sourceUrlCanonical) provenance.sourceUrlCanonical = sourceUrlCanonical;
    if (sourcePublisher) provenance.sourcePublisher = sourcePublisher;
    if (sourceSection) provenance.sourceSection = sourceSection;
    if (sourcePriority) {
      const normalizedSourcePriority = sourcePriority as SourcePriority;
      provenance.sourcePriority = normalizedSourcePriority;
    }
    if (typeof isOfficialSource === 'boolean') provenance.isOfficialSource = isOfficialSource;
    if (retrievedVia) {
      const normalizedRetrievedVia = retrievedVia as RetrievedVia;
      provenance.retrievedVia = normalizedRetrievedVia;
    }
    if (typeof httpStatus === 'number') provenance.httpStatus = httpStatus;
    if (contentType) provenance.contentType = contentType;
    if (etag) provenance.etag = etag;
    if (lastModified) provenance.lastModified = lastModified;
    if (fetchRunId) provenance.fetchRunId = fetchRunId;
    if (typeof trustScore === 'number') provenance.trustScore = trustScore;

    result.provenance = provenance;
  }

  const processingRaw = readOptionalMetadata(input['processing']);
  if (processingRaw) {
    const processing: NonNullable<SaveDocumentInput['processing']> = {};
    const ingestVersion = readOptionalString(processingRaw['ingestVersion']);
    const normalizerVersion = readOptionalString(processingRaw['normalizerVersion']);
    const chunkingVersion = readOptionalString(processingRaw['chunkingVersion']);

    if (ingestVersion) processing.ingestVersion = ingestVersion;
    if (normalizerVersion) processing.normalizerVersion = normalizerVersion;
    if (chunkingVersion) processing.chunkingVersion = chunkingVersion;

    result.processing = processing;
  }

  const chunkingRaw = readOptionalMetadata(input['chunking']);
  if (chunkingRaw) {
    const chunking: NonNullable<SaveDocumentInput['chunking']> = {};
    const targetTokens = readOptionalNumber(chunkingRaw['targetTokens']);
    const overlapTokens = readOptionalNumber(chunkingRaw['overlapTokens']);

    if (typeof targetTokens === 'number') chunking.targetTokens = targetTokens;
    if (typeof overlapTokens === 'number') chunking.overlapTokens = overlapTokens;

    result.chunking = chunking;
  }

  return result;
}
