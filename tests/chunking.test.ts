import { describe, expect, it } from 'vitest';
import { chunkDocument, normalizeDocumentText } from '../src/chunking.js';

describe('normalizeDocumentText', () => {
  it('normalizes whitespace and blank lines', () => {
    expect(normalizeDocumentText('a\r\n\r\n\r\n b\t\t c')).toBe('a\n\n b c');
  });
});

describe('chunkDocument', () => {
  it('splits long text into multiple chunks', () => {
    const text = [
      'Paragraph one with some text repeated to simulate a longer section. '.repeat(12),
      'Paragraph two with other content repeated several times to increase token count. '.repeat(10),
      'Paragraph three with even more content so we get another chunk as output. '.repeat(10),
    ].join('\n\n');

    const chunks = chunkDocument(text, { targetTokens: 80, overlapTokens: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[1]?.chunkIndex).toBe(1);
    expect(chunks.every((chunk) => chunk.text.length > 0)).toBe(true);
  });
});
