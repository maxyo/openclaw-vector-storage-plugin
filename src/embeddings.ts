import type { EmbeddingProviderConfig } from './types.js';

interface OpenAICompatibleEmbeddingResponse {
  data?: Array<{
    embedding?: unknown;
  }>;
}

export interface EmbeddingClient {
  readonly model: string;
  embedTexts(texts: string[]): Promise<number[][]>;
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

export class OpenAICompatibleEmbeddingClient implements EmbeddingClient {
  public constructor(private readonly config: EmbeddingProviderConfig) {}

  public get model(): string {
    return this.config.model;
  }

  public async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (!this.config.apiKey) {
      throw new Error('Embedding API is enabled but apiKey is missing.');
    }

    const embeddings: number[][] = [];

    for (let offset = 0; offset < texts.length; offset += this.config.batchSize) {
      const batch = texts.slice(offset, offset + this.config.batchSize);
      const batchEmbeddings = await this.embedBatch(batch);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const body: Record<string, unknown> = {
      input: texts,
      model: this.config.model,
    };

    if (typeof this.config.dimensions === 'number') {
      body['dimensions'] = this.config.dimensions;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.config.timeoutMs);

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Embedding API request failed (${response.status}): ${responseText}`);
      }

      const payload = (await response.json()) as OpenAICompatibleEmbeddingResponse;
      const rows = payload.data;

      if (!Array.isArray(rows) || rows.length !== texts.length) {
        throw new Error('Embedding API returned an unexpected number of embedding rows.');
      }

      return rows.map((row, index) => {
        if (!isFiniteNumberArray(row.embedding)) {
          throw new Error(`Embedding API returned an invalid embedding at index ${index}.`);
        }
        return row.embedding;
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createEmbeddingClient(config: EmbeddingProviderConfig): EmbeddingClient | undefined {
  if (!config.enabled) {
    return undefined;
  }

  return new OpenAICompatibleEmbeddingClient(config);
}
