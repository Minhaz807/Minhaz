const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

export class HttpError extends Error {
  constructor(status, body, url) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.status = status;
    this.body = body;
  }
}

/** fetch() + JSON + timeout. Throws HttpError on non-2xx. */
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...DEFAULT_HEADERS,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new HttpError(res.status, data, url);
  return data;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
