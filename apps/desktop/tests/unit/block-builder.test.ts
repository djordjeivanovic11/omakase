import { describe, expect, it } from 'vitest';
import {
  buildBlocksFromMarkdown,
  buildBlocksFromPlainText,
  estimateTokens,
} from '../../src/core/sources/block-builder.js';

describe('block-builder', () => {
  it('splits markdown into headings, paragraphs, lists, and code', () => {
    const markdown = `# Title

Intro paragraph.

## Section

- item one
- item two

\`\`\`ts
const x = 1;
\`\`\`

Closing paragraph.
`;

    const blocks = buildBlocksFromMarkdown(markdown);
    expect(blocks.some((b) => b.kind === 'heading' && b.text === 'Title')).toBe(true);
    expect(blocks.some((b) => b.kind === 'heading' && b.text === 'Section')).toBe(true);
    expect(blocks.some((b) => b.kind === 'list')).toBe(true);
    expect(blocks.some((b) => b.kind === 'code' && b.text.includes('const x = 1'))).toBe(true);
    expect(blocks.some((b) => b.kind === 'paragraph' && b.text.includes('Intro paragraph'))).toBe(
      true,
    );
  });

  it('tracks heading paths on nested sections', () => {
    const markdown = `# Alpha\n\n## Beta\n\nParagraph under beta.`;
    const blocks = buildBlocksFromMarkdown(markdown);
    const paragraph = blocks.find((b) => b.kind === 'paragraph');
    expect(paragraph?.headingPath).toEqual(['Alpha', 'Beta']);
    expect(paragraph?.headingPathText).toBe('Alpha > Beta');
    expect(paragraph?.locator.kind).toBe('section');
  });

  it('estimates tokens from character length', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(8))).toBe(2);
  });

  it('builds plain text paragraphs separated by blank lines', () => {
    const blocks = buildBlocksFromPlainText('First paragraph.\n\nSecond paragraph.');
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
    expect(blocks[0]?.locator.kind).toBe('char_range');
  });

  it('assigns content hashes deterministically', () => {
    const blocks = buildBlocksFromMarkdown('# Hello\n\nWorld.');
    const firstHash = blocks[0]?.contentHash;
    const secondPass = buildBlocksFromMarkdown('# Hello\n\nWorld.');
    expect(secondPass[0]?.contentHash).toBe(firstHash);
  });
});
