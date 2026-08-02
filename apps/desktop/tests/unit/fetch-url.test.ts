import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUrlMarkdown } from '../../src/core/security/fetch-url.js';

describe('bounded URL fetching', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('revalidates redirects before following them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1/private' },
          }),
        ),
      ),
    );

    await expect(fetchUrlMarkdown('https://example.com/start')).rejects.toThrow('blocked_ip');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized responses before buffering their body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('ignored', {
            headers: { 'content-length': String(50 * 1024 * 1024 + 1) },
          }),
        ),
      ),
    );

    await expect(fetchUrlMarkdown('https://example.com/large')).rejects.toThrow(
      'response_too_large',
    );
  });

  it('returns bounded markdown from a valid response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('# Local notes', { headers: { 'content-type': 'text/markdown' } }),
        ),
      ),
    );

    await expect(fetchUrlMarkdown('https://example.com/notes.md')).resolves.toEqual({
      title: 'example.com',
      markdown: '# Local notes',
    });
  });
});
