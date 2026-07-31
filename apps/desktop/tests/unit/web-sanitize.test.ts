import { describe, expect, it } from 'vitest';
import { sanitizeWebMarkdown } from '../../src/core/sources/web-ingest.js';

describe('web capture sanitization', () => {
  it('strips script, style, iframe, and inline handlers from captured markdown', () => {
    const dirty = [
      '# Title',
      '<script>alert("xss")</script>',
      '<style>body{display:none}</style>',
      '<iframe src="https://evil.example"></iframe>',
      '<img src="x" onerror="alert(1)">',
      'Safe paragraph.',
    ].join('\n');

    const cleaned = sanitizeWebMarkdown(dirty);
    expect(cleaned).toContain('# Title');
    expect(cleaned).toContain('Safe paragraph.');
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('alert("xss")');
    expect(cleaned).not.toContain('<style');
    expect(cleaned).not.toContain('<iframe');
    expect(cleaned).not.toContain('onerror');
  });
});
