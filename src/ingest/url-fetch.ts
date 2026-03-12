export interface FetchedUrlDocument {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  body: string;
  fetchedAt: string;
}

export async function fetchUrlDocument(url: string, timeoutMs = 30000): Promise<FetchedUrlDocument> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'openclaw-plugin-sqlite-doc-store/0.1.0',
        Accept: 'text/html, text/plain, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
      },
    });

    const body = await response.text();
    const contentType = response.headers.get('content-type') ?? undefined;
    const etag = response.headers.get('etag') ?? undefined;
    const lastModified = response.headers.get('last-modified') ?? undefined;

    return {
      requestedUrl: url,
      finalUrl: response.url,
      status: response.status,
      ...(contentType ? { contentType } : {}),
      ...(etag ? { etag } : {}),
      ...(lastModified ? { lastModified } : {}),
      body,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
