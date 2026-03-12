#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createSqliteDocStoreApi } from '../src/api.js';
import { resolveConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { extractContentFromBody } from '../src/ingest/extract.js';
import { ingestDocuments } from '../src/ingest/pipeline.js';
import { getSourceProfile } from '../src/ingest/source-profiles.js';
import { fetchUrlDocument } from '../src/ingest/url-fetch.js';
import type { ExtractionHints, SaveDocumentInput } from '../src/types.js';

function printUsage(): void {
  console.error('Usage: npm run ingest:url -- --url <url> [--source-type <type>] [--source-name <name>] [--document-type <type>] [--title <title>] [--published-at <iso>] [--trust-score <0..1>] [--content-selector <css>] [--title-selector <css>] [--remove-selector <css>] [--skip-embeddings] [--db-path <path>]');
}

function parseTrustScore(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function main(): Promise<void> {
  return (async () => {
    const { values } = parseArgs({
      options: {
        url: { type: 'string' },
        'source-type': { type: 'string' },
        'source-name': { type: 'string' },
        'document-type': { type: 'string' },
        title: { type: 'string' },
        'published-at': { type: 'string' },
        'trust-score': { type: 'string' },
        'content-selector': { type: 'string' },
        'title-selector': { type: 'string' },
        'remove-selector': { type: 'string', multiple: true },
        'db-path': { type: 'string' },
        'skip-embeddings': { type: 'boolean', default: false },
        'run-id': { type: 'string' },
      },
    });

    if (!values.url) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const matchedProfile = getSourceProfile(values.url);
    const resolvedSourceType = values['source-type'] ?? matchedProfile?.sourceType;
    const resolvedSourceName = values['source-name'] ?? matchedProfile?.sourceName;
    const resolvedDocumentType = values['document-type'] ?? matchedProfile?.documentType;

    if (!resolvedSourceType || !resolvedSourceName || !resolvedDocumentType) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const extractionHints: ExtractionHints = {
      ...(values['content-selector'] ? { contentSelector: values['content-selector'] } : {}),
      ...(values['title-selector'] ? { titleSelector: values['title-selector'] } : {}),
      ...(values['remove-selector'] && values['remove-selector'].length > 0
        ? { removeSelectors: values['remove-selector'] }
        : {}),
    };

    const fetched = await fetchUrlDocument(values.url);
    const profile = getSourceProfile(fetched.finalUrl) ?? matchedProfile;
    const extracted = extractContentFromBody(fetched.body, fetched.contentType, {
      url: fetched.finalUrl,
      hints: extractionHints,
    });

    const trustScore = parseTrustScore(values['trust-score']);
    const provenance: NonNullable<SaveDocumentInput['provenance']> = {
      ...(profile?.provenanceDefaults ?? {}),
      sourceUrlCanonical: fetched.finalUrl,
      retrievedVia: 'html',
      httpStatus: fetched.status,
      ...(fetched.contentType ? { contentType: fetched.contentType } : {}),
      ...(fetched.etag ? { etag: fetched.etag } : {}),
      ...(fetched.lastModified ? { lastModified: fetched.lastModified } : {}),
      ...(typeof trustScore === 'number' ? { trustScore } : {}),
    };

    const document: SaveDocumentInput = {
      sourceType: resolvedSourceType as SaveDocumentInput['sourceType'],
      sourceName: resolvedSourceName,
      title: values.title ?? extracted.title ?? fetched.finalUrl,
      url: fetched.finalUrl,
      ...(values['published-at'] ? { publishedAt: values['published-at'] } : {}),
      collectedAt: fetched.fetchedAt,
      documentType: resolvedDocumentType as SaveDocumentInput['documentType'],
      textRaw: extracted.text,
      provenance,
      metadata: {
        ...(profile?.metadataDefaults ?? {}),
        extractionMethod: extracted.extractionMethod,
        requestedUrl: fetched.requestedUrl,
        ...(profile ? { sourceProfile: profile.id } : {}),
      },
    };

    const config = resolveConfig({
      ...(values['db-path'] ? { dbPath: values['db-path'] } : {}),
      ...(values['skip-embeddings'] ? { embedding: { enabled: false } } : {}),
    });
    const db = openDatabase(config.dbPath);
    const api = createSqliteDocStoreApi(db, config);

    const result = await ingestDocuments(db, api, [document], {
      mode: 'url',
      ...(values['run-id'] ? { runId: values['run-id'] } : {}),
      sourceName: resolvedSourceName,
      metadata: {
        requestedUrl: values.url,
        finalUrl: fetched.finalUrl,
        ...(profile ? { sourceProfile: profile.id } : {}),
      },
    });

    console.log(JSON.stringify(result, null, 2));
  })();
}

await main();
