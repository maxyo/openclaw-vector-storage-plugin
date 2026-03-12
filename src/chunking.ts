import type { ChunkingOptions, ChunkingResult } from './types.js';

function approximateTokenCount(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }
  const words = normalized.split(/\s+/u).filter(Boolean);
  return Math.max(1, Math.round(words.length * 1.33));
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/gu)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function chunkDocument(text: string, options: ChunkingOptions): ChunkingResult[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = splitIntoParagraphs(normalized);
  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: ChunkingResult[] = [];
  let currentParts: string[] = [];
  let currentTokens = 0;

  const flush = (): void => {
    const chunkText = currentParts.join('\n\n').trim();
    if (!chunkText) {
      return;
    }
    chunks.push({
      chunkIndex: chunks.length,
      text: chunkText,
      tokenCount: approximateTokenCount(chunkText),
    });
  };

  for (const paragraph of paragraphs) {
    const paragraphTokens = approximateTokenCount(paragraph);
    const wouldOverflow = currentTokens > 0 && currentTokens + paragraphTokens > options.targetTokens;

    if (wouldOverflow) {
      flush();

      const overlapParts: string[] = [];
      let overlapTokens = 0;
      for (let i = currentParts.length - 1; i >= 0; i -= 1) {
        const candidate = currentParts[i];
        if (!candidate) {
          continue;
        }
        const candidateTokens = approximateTokenCount(candidate);
        if (overlapParts.length > 0 && overlapTokens + candidateTokens > options.overlapTokens) {
          break;
        }
        overlapParts.unshift(candidate);
        overlapTokens += candidateTokens;
      }

      currentParts = overlapParts;
      currentTokens = overlapTokens;
    }

    currentParts.push(paragraph);
    currentTokens += paragraphTokens;
  }

  flush();
  return chunks;
}

export function normalizeDocumentText(text: string): string {
  return text.replace(/\r\n?/gu, '\n').replace(/[\t ]+/gu, ' ').replace(/\n{3,}/gu, '\n\n').trim();
}
