import { load } from 'cheerio';
import type { ExtractionHints } from '../types.js';
import { getSourceProfile } from './source-profiles.js';

export interface ExtractedContent {
  title?: string;
  text: string;
  extractionMethod: 'text-pass-through' | 'html-basic' | 'html-selector' | 'html-profile';
}

export interface ExtractContentOptions {
  url?: string;
  hints?: ExtractionHints;
}

const COMMON_REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'header',
  'footer',
  'nav',
  'form',
  '[role="navigation"]',
  '[class*="cookie"]',
  '[class*="share"]',
  '[class*="social"]',
  '[class*="breadcrumb"]',
  '[class*="header"]',
  '[class*="footer"]',
  '[class*="menu"]',
  '[class*="toolbar"]',
];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#x27;/giu, "'");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, ' ')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<\/p>/giu, '\n\n')
      .replace(/<\/div>/giu, '\n')
      .replace(/<\/li>/giu, '\n')
      .replace(/<\/section>/giu, '\n\n')
      .replace(/<\/article>/giu, '\n\n')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/[ \t]+/gu, ' ')
      .replace(/\n{3,}/gu, '\n\n')
      .trim(),
  );
}

function normalizeText(text: string): string {
  return text.replace(/[ \t]+/gu, ' ').replace(/\n{3,}/gu, '\n\n').trim();
}

function extractTitleFromHtml(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  if (!match?.[1]) {
    return undefined;
  }
  const title = decodeHtmlEntities(match[1]).replace(/\s+/gu, ' ').trim();
  return title || undefined;
}

function splitSelectors(selector: string | undefined): string[] {
  if (!selector) {
    return [];
  }
  return selector
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function extractSelectedHtml(html: string, selectors: string[], removeSelectors: string[]): string | undefined {
  const $ = load(html);
  for (const selector of removeSelectors) {
    $(selector).remove();
  }

  for (const selector of selectors) {
    const node = $(selector).first();
    if (node.length === 0) {
      continue;
    }
    const selectedHtml = $.html(node);
    if (!selectedHtml) {
      continue;
    }
    const text = normalizeText(stripHtml(selectedHtml));
    if (text.length >= 40) {
      return text;
    }
  }

  return undefined;
}

function extractSelectedTitle(html: string, selector: string | undefined): string | undefined {
  if (!selector) {
    return undefined;
  }
  const $ = load(html);
  const node = $(selector).first();
  if (node.length === 0) {
    return undefined;
  }
  const title = normalizeText(node.text());
  return title || undefined;
}

export function extractContentFromBody(
  body: string,
  contentType: string | undefined,
  options: ExtractContentOptions = {},
): ExtractedContent {
  if (!contentType?.includes('text/html')) {
    return {
      text: body.trim(),
      extractionMethod: 'text-pass-through',
    };
  }

  const profile = getSourceProfile(options.url);
  const contentSelectors = splitSelectors(options.hints?.contentSelector).length > 0
    ? splitSelectors(options.hints?.contentSelector)
    : splitSelectors(profile?.extractionHints?.contentSelector);
  const titleSelector = options.hints?.titleSelector ?? profile?.extractionHints?.titleSelector;
  const removeSelectors = [
    ...COMMON_REMOVE_SELECTORS,
    ...(profile?.extractionHints?.removeSelectors ?? []),
    ...(options.hints?.removeSelectors ?? []),
  ];

  if (splitSelectors(options.hints?.contentSelector).length > 0) {
    const selectedText = extractSelectedHtml(body, splitSelectors(options.hints?.contentSelector), removeSelectors);
    const selectedTitle = extractSelectedTitle(body, titleSelector) ?? extractTitleFromHtml(body);
    if (selectedText) {
      return {
        ...(selectedTitle ? { title: selectedTitle } : {}),
        text: selectedText,
        extractionMethod: 'html-selector',
      };
    }
  }

  if (profile && contentSelectors.length > 0) {
    const profileText = extractSelectedHtml(body, contentSelectors, removeSelectors);
    const profileTitle = extractSelectedTitle(body, titleSelector) ?? extractTitleFromHtml(body);
    if (profileText) {
      return {
        ...(profileTitle ? { title: profileTitle } : {}),
        text: profileText,
        extractionMethod: 'html-profile',
      };
    }
  }

  const title = extractSelectedTitle(body, titleSelector) ?? extractTitleFromHtml(body);
  return {
    ...(title ? { title } : {}),
    text: normalizeText(stripHtml(body)),
    extractionMethod: 'html-basic',
  };
}
