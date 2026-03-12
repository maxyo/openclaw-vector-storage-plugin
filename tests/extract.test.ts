import { describe, expect, it } from 'vitest';
import { extractContentFromBody } from '../src/ingest/extract.js';

describe('extractContentFromBody', () => {
  it('uses explicit CSS selectors when provided', () => {
    const html = `
      <html>
        <head><title>Wrong title</title></head>
        <body>
          <div class="noise">menu</div>
          <h1 class="article-title">Right title</h1>
          <div class="article-body">
            <p>Paragraph one about OFZ and yields.</p>
            <p>Paragraph two about RGBI and the central bank.</p>
          </div>
        </body>
      </html>
    `;

    const extracted = extractContentFromBody(html, 'text/html', {
      hints: {
        titleSelector: '.article-title',
        contentSelector: '.article-body',
        removeSelectors: ['.noise'],
      },
    });

    expect(extracted.extractionMethod).toBe('html-selector');
    expect(extracted.title).toBe('Right title');
    expect(extracted.text).toContain('Paragraph one about OFZ and yields.');
    expect(extracted.text).toContain('Paragraph two about RGBI and the central bank.');
    expect(extracted.text).not.toContain('menu');
  });

  it('uses the CBR profile to avoid page chrome', () => {
    const html = `
      <html>
        <head><title>CBR page</title></head>
        <body>
          <header>Global header noise</header>
          <main>
            <div class="offset-md-2">
              <h1>CBR headline</h1>
              <p>Доходности ОФЗ снизились после сигнала регулятора.</p>
              <p>Минфин увеличил размещения, а население покупало ОФЗ.</p>
            </div>
          </main>
          <footer>Footer noise</footer>
        </body>
      </html>
    `;

    const extracted = extractContentFromBody(html, 'text/html', {
      url: 'https://cbr.ru/press/event/?id=12345',
    });

    expect(extracted.extractionMethod).toBe('html-profile');
    expect(extracted.title).toBe('CBR headline');
    expect(extracted.text).toContain('Доходности ОФЗ снизились');
    expect(extracted.text).toContain('население покупало ОФЗ');
    expect(extracted.text).not.toContain('Global header noise');
    expect(extracted.text).not.toContain('Footer noise');
  });
});
