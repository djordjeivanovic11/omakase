import { describe, expect, it } from 'vitest';
import { buildPdfPageBlocks, computePdfQuality } from '../../src/core/sources/pdf-extract.js';

const sentence = 'Write-through caching keeps the cache and the store consistent at all times. ';

describe('PDF block building', () => {
  it('splits a page that has no blank lines into several blocks', () => {
    const page = { pageNumber: 1, text: sentence.repeat(40), charCount: sentence.length * 40 };
    const blocks = buildPdfPageBlocks([page]);

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(1600);
      expect(block.pageStart).toBe(1);
    }
  });

  it('keeps short paragraphs intact', () => {
    const text = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';
    const blocks = buildPdfPageBlocks([{ pageNumber: 2, text, charCount: text.length }]);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.text).toBe('First paragraph here.');
    expect(blocks[2]?.pageStart).toBe(2);
  });

  it('anchors every block to its page', () => {
    const blocks = buildPdfPageBlocks([
      { pageNumber: 1, text: 'Page one text.', charCount: 14 },
      { pageNumber: 2, text: 'Page two text.', charCount: 14 },
    ]);

    expect(blocks.map((b) => b.locator.page)).toEqual([1, 2]);
    expect(blocks.every((b) => b.locator.kind === 'page')).toBe(true);
  });

  it('skips pages with no extractable text', () => {
    expect(buildPdfPageBlocks([{ pageNumber: 1, text: '   \n\n  ', charCount: 0 }])).toHaveLength(
      0,
    );
  });

  it('flags a scanned-looking document as needing attention', () => {
    const quality = computePdfQuality([
      { pageNumber: 1, text: '', charCount: 0 },
      { pageNumber: 2, text: ' ', charCount: 1 },
    ]);

    expect(quality.needsAttention).toBe(true);
    expect(quality.qualityDetails.blankPageCount).toBe(2);
  });
});
