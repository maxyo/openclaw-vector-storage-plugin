import type { DocumentType, ExtractionHints, SaveDocumentInput } from '../types.js';

export interface MatchedSourceProfile {
  id: string;
  sourceType: SaveDocumentInput['sourceType'];
  sourceName: string;
  extractionHints?: ExtractionHints;
  documentType?: DocumentType;
  metadataDefaults?: Record<string, unknown>;
  provenanceDefaults?: NonNullable<SaveDocumentInput['provenance']>;
}

interface SourceProfileDefinition {
  id: string;
  matches(url: URL): boolean;
  build(url: URL): MatchedSourceProfile;
}

function inferCbrDocumentType(url: URL): DocumentType {
  if (url.pathname.startsWith('/press/pr/')) {
    return 'press_release';
  }
  if (url.pathname.startsWith('/press/event/')) {
    return 'news';
  }
  if (url.pathname.startsWith('/press/')) {
    return 'news';
  }
  return 'other';
}

const SOURCE_PROFILES: SourceProfileDefinition[] = [
  {
    id: 'cbr',
    matches(url) {
      return url.hostname === 'cbr.ru' || url.hostname.endsWith('.cbr.ru');
    },
    build(url) {
      return {
        id: 'cbr',
        sourceType: 'cbr',
        sourceName: 'Bank of Russia',
        documentType: inferCbrDocumentType(url),
        extractionHints: {
          titleSelector: 'h1',
          contentSelector:
            'main .offset-md-2, main article, main [class*="article"], main [class*="content"], main [class*="text"], main',
          removeSelectors: [
            '.news-page__top',
            '.article__top',
            '.page-header',
            '.search',
            '.search-page',
            '.feedback',
            '.common-share',
            '.btns',
            '.print',
          ],
        },
        metadataDefaults: {
          policy_body: 'CBR',
          source_profile: 'cbr',
        },
        provenanceDefaults: {
          sourcePublisher: 'Bank of Russia',
          sourcePriority: 'primary',
          isOfficialSource: true,
          retrievedVia: 'html',
          trustScore: 0.98,
        },
      };
    },
  },
  {
    id: 'minfin',
    matches(url) {
      return url.hostname === 'minfin.gov.ru' || url.hostname.endsWith('.minfin.gov.ru');
    },
    build() {
      return {
        id: 'minfin',
        sourceType: 'minfin',
        sourceName: 'Ministry of Finance of Russia',
        documentType: 'news',
        extractionHints: {
          titleSelector: 'h1',
          contentSelector: 'main article, main .content, main .article, main .news-item, main',
          removeSelectors: ['.breadcrumbs', '.share', '.social', '.sidebar', '.page-tools'],
        },
        metadataDefaults: {
          policy_body: 'MinFin',
          source_profile: 'minfin',
        },
        provenanceDefaults: {
          sourcePublisher: 'Ministry of Finance of Russia',
          sourcePriority: 'primary',
          isOfficialSource: true,
          retrievedVia: 'html',
          trustScore: 0.97,
        },
      };
    },
  },
  {
    id: 'moex',
    matches(url) {
      return url.hostname === 'moex.com' || url.hostname.endsWith('.moex.com') || url.hostname === 'iss.moex.com';
    },
    build() {
      return {
        id: 'moex',
        sourceType: 'moex',
        sourceName: 'Moscow Exchange',
        documentType: 'news',
        extractionHints: {
          titleSelector: 'h1',
          contentSelector: 'main article, main .content, main .article, .news-detail, main',
          removeSelectors: ['.breadcrumbs', '.share', '.social', '.sidebar', '.page-tools', '.pager'],
        },
        metadataDefaults: {
          market_operator: 'MOEX',
          source_profile: 'moex',
        },
        provenanceDefaults: {
          sourcePublisher: 'Moscow Exchange',
          sourcePriority: 'primary',
          isOfficialSource: true,
          retrievedVia: 'html',
          trustScore: 0.97,
        },
      };
    },
  },
  {
    id: 'econs',
    matches(url) {
      return url.hostname === 'econs.online' || url.hostname.endsWith('.econs.online');
    },
    build() {
      return {
        id: 'econs',
        sourceType: 'econs',
        sourceName: 'Econs',
        documentType: 'analysis',
        extractionHints: {
          titleSelector: 'h1',
          contentSelector: 'article .article__content, article .post__content, article, main article, main',
          removeSelectors: ['.breadcrumbs', '.share', '.social', '.subscribe', '.authors', '.related'],
        },
        metadataDefaults: {
          source_profile: 'econs',
          analysis_kind: 'macro',
        },
        provenanceDefaults: {
          sourcePublisher: 'Econs',
          sourcePriority: 'secondary',
          isOfficialSource: false,
          retrievedVia: 'html',
          trustScore: 0.9,
        },
      };
    },
  },
  {
    id: 'acra',
    matches(url) {
      return url.hostname === 'acra-ratings.ru' || url.hostname.endsWith('.acra-ratings.ru');
    },
    build() {
      return {
        id: 'acra',
        sourceType: 'acra',
        sourceName: 'ACRA Ratings',
        documentType: 'report',
        extractionHints: {
          titleSelector: 'h1',
          contentSelector: 'main article, main .article, main .content, .news-detail, main',
          removeSelectors: ['.breadcrumbs', '.share', '.social', '.sidebar', '.page-tools', '.pager', '.tags'],
        },
        metadataDefaults: {
          source_profile: 'acra',
          analysis_kind: 'credit_research',
        },
        provenanceDefaults: {
          sourcePublisher: 'ACRA Ratings',
          sourcePriority: 'secondary',
          isOfficialSource: false,
          retrievedVia: 'html',
          trustScore: 0.88,
        },
      };
    },
  },
  {
    id: 'raexpert',
    matches(url) {
      return url.hostname === 'raexpert.ru' || url.hostname.endsWith('.raexpert.ru');
    },
    build() {
      return {
        id: 'raexpert',
        sourceType: 'raexpert',
        sourceName: 'Expert RA',
        documentType: 'report',
        extractionHints: {
          titleSelector: 'h1',
          contentSelector: 'main article, main .article, main .content, .research-detail, .news-detail, main',
          removeSelectors: ['.breadcrumbs', '.share', '.social', '.sidebar', '.page-tools', '.pager', '.tags'],
        },
        metadataDefaults: {
          source_profile: 'raexpert',
          analysis_kind: 'credit_research',
        },
        provenanceDefaults: {
          sourcePublisher: 'Expert RA',
          sourcePriority: 'secondary',
          isOfficialSource: false,
          retrievedVia: 'html',
          trustScore: 0.87,
        },
      };
    },
  },
  {
    id: 'bofit',
    matches(url) {
      return url.hostname === 'bofit.fi' || url.hostname.endsWith('.bofit.fi') || url.hostname === 'www.bofit.fi';
    },
    build() {
      return {
        id: 'bofit',
        sourceType: 'bofit',
        sourceName: 'BOFIT',
        documentType: 'analysis',
        extractionHints: {
          titleSelector: 'h1',
          contentSelector: 'main article, main .content, main .article, .article-content, main',
          removeSelectors: ['.breadcrumbs', '.share', '.social', '.sidebar', '.page-tools', '.pager', '.related-content'],
        },
        metadataDefaults: {
          source_profile: 'bofit',
          analysis_kind: 'macro',
        },
        provenanceDefaults: {
          sourcePublisher: 'BOFIT',
          sourcePriority: 'secondary',
          isOfficialSource: false,
          retrievedVia: 'html',
          trustScore: 0.9,
        },
      };
    },
  },
  {
    id: 'cbonds',
    matches(url) {
      return url.hostname === 'cbonds.ru' || url.hostname.endsWith('.cbonds.ru');
    },
    build() {
      return {
        id: 'cbonds',
        sourceType: 'cbonds',
        sourceName: 'Cbonds',
        documentType: 'analysis',
        extractionHints: {
          titleSelector: 'h1',
          contentSelector: 'main article, main .content, main .article, .article_body, .news-detail, main',
          removeSelectors: ['.breadcrumbs', '.share', '.social', '.sidebar', '.page-tools', '.pager', '.login', '.subscribe'],
        },
        metadataDefaults: {
          source_profile: 'cbonds',
          analysis_kind: 'market_practitioner',
        },
        provenanceDefaults: {
          sourcePublisher: 'Cbonds',
          sourcePriority: 'secondary',
          isOfficialSource: false,
          retrievedVia: 'html',
          trustScore: 0.82,
        },
      };
    },
  },
];

export function getSourceProfile(urlString: string | undefined): MatchedSourceProfile | undefined {
  if (!urlString) {
    return undefined;
  }

  try {
    const url = new URL(urlString);
    const profile = SOURCE_PROFILES.find((candidate) => candidate.matches(url));
    return profile?.build(url);
  } catch {
    return undefined;
  }
}
