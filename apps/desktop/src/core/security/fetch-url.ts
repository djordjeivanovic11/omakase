import { Defuddle } from 'defuddle/node';
import { FETCH_LIMITS, validateHttpUrl } from './url-policy.js';

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(contentLength) && contentLength > FETCH_LIMITS.maxBytes) {
    throw new Error('response_too_large');
  }

  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > FETCH_LIMITS.maxBytes) {
      throw new Error('response_too_large');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > FETCH_LIMITS.maxBytes) {
        await reader.cancel();
        throw new Error('response_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchUrlMarkdown(url: string): Promise<{ title: string; markdown: string }> {
  const validated = validateHttpUrl(url);
  if (!validated.ok || !validated.url) {
    throw new Error(validated.reason ?? 'invalid_url');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_LIMITS.timeoutMs);
  try {
    let currentUrl = validated.url;
    let redirects = 0;
    let response: Response;
    while (true) {
      response = await fetch(currentUrl.toString(), {
        signal: controller.signal,
        redirect: 'manual',
      });
      if (!isRedirectStatus(response.status)) break;
      if (redirects >= FETCH_LIMITS.maxRedirects) throw new Error('too_many_redirects');
      const location = response.headers.get('location');
      if (!location) throw new Error('redirect_missing_location');
      const next = validateHttpUrl(new URL(location, currentUrl).toString());
      if (!next.ok || !next.url) throw new Error(next.reason ?? 'invalid_redirect');
      currentUrl = next.url;
      redirects += 1;
    }
    if (!response.ok) throw new Error(`fetch_failed:${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    const body = await readBoundedResponseText(response);
    if (contentType.includes('text/markdown') || currentUrl.pathname.endsWith('.md')) {
      return { title: currentUrl.hostname, markdown: body };
    }
    const result = await Defuddle(body, currentUrl.toString());
    return {
      title: result.title ?? currentUrl.hostname,
      markdown: result.content ?? body,
    };
  } finally {
    clearTimeout(timeout);
  }
}
