import { RateLimiter } from './rate-limit.js';

export interface HttpOptions {
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  rateLimiter?: RateLimiter;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  json<T = unknown>(): T;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000];

/**
 * HTTP client with retry, rate limiting, and raw response saving.
 */
export async function httpGet(url: string, opts: HttpOptions = {}): Promise<HttpResponse> {
  const { headers = {}, timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, rateLimiter } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (rateLimiter) await rateLimiter.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ether-mirror/0.1', ...headers },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { responseHeaders[k] = v; });

      const body = await res.text();

      if (res.status === 429 || (res.status >= 500 && attempt < retries)) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
        console.error(`  HTTP ${res.status} from ${url}, retrying in ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      return {
        status: res.status,
        headers: responseHeaders,
        body,
        json<T>(): T { return JSON.parse(body) as T; },
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (attempt < retries) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  Request to ${url} failed (${msg}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`All ${retries + 1} attempts failed for ${url}`);
}

/**
 * Fetch JSON from a URL with retry + rate limiting.
 */
export async function fetchJson<T = unknown>(url: string, opts: HttpOptions = {}): Promise<T> {
  const res = await httpGet(url, {
    ...opts,
    headers: { Accept: 'application/json', ...opts.headers },
  });
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status} from ${url}: ${res.body.slice(0, 200)}`);
  }
  return res.json<T>();
}

/**
 * Download a binary file to disk. Returns the number of bytes written.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  opts: HttpOptions = {}
): Promise<number> {
  const { timeout = 120_000, retries = DEFAULT_RETRIES, rateLimiter, headers = {} } = opts;
  const fs = await import('node:fs');
  const fsp = fs.promises;
  const path = await import('node:path');

  await fsp.mkdir(path.dirname(destPath), { recursive: true });

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (rateLimiter) await rateLimiter.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ether-mirror/0.1', ...headers },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || (res.status >= 500 && attempt < retries)) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} downloading ${url}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      await fsp.writeFile(destPath, buf);
      return buf.length;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (attempt < retries) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`All ${retries + 1} download attempts failed for ${url}`);
}
