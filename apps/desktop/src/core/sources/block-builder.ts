import type { Locator, SourceBlockKind } from '@omakase/contracts';
import { normalizeTextForHash, sha256Hex } from '../storage/hash.js';

export interface DraftBlock {
  kind: SourceBlockKind;
  text: string;
  headingPath: string[];
  headingPathText: string;
  pageStart: number | null;
  pageEnd: number | null;
  timeStartMs: number | null;
  timeEndMs: number | null;
  charStart: number | null;
  charEnd: number | null;
  locator: Locator;
  contentHash: string;
  tokenEstimate: number;
}

const MAX_CODE_BLOCK_CHARS = 12_000;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const ORDERED_LIST_RE = /^\d+[.)]\s+/;
const UNORDERED_LIST_RE = /^[-*+]\s+/;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function blockContentHash(text: string): string {
  return sha256Hex(normalizeTextForHash(text));
}

function headingPathText(path: string[]): string {
  return path.join(' > ');
}

function makeBlock(
  kind: SourceBlockKind,
  text: string,
  headingPath: string[],
  charStart: number,
  charEnd: number,
  extra?: Partial<
    Pick<DraftBlock, 'pageStart' | 'pageEnd' | 'timeStartMs' | 'timeEndMs' | 'locator'>
  >,
): DraftBlock {
  const trimmed = text.trim();
  const locator: Locator =
    extra?.locator ??
    (headingPath.length > 0
      ? { kind: 'section', headingPath: [...headingPath] }
      : { kind: 'char_range', charStart, charEnd });

  return {
    kind,
    text: trimmed,
    headingPath: [...headingPath],
    headingPathText: headingPathText(headingPath),
    pageStart: extra?.pageStart ?? null,
    pageEnd: extra?.pageEnd ?? null,
    timeStartMs: extra?.timeStartMs ?? null,
    timeEndMs: extra?.timeEndMs ?? null,
    charStart,
    charEnd,
    locator,
    contentHash: blockContentHash(trimmed),
    tokenEstimate: estimateTokens(trimmed),
  };
}

function flushParagraph(
  lines: string[],
  headingPath: string[],
  charCursor: number,
  blocks: DraftBlock[],
): number {
  const text = lines.join('\n').trim();
  if (!text) return charCursor;
  const start = charCursor;
  const end = start + text.length;
  blocks.push(makeBlock('paragraph', text, headingPath, start, end));
  return end + 1;
}

function flushList(
  lines: string[],
  headingPath: string[],
  charCursor: number,
  blocks: DraftBlock[],
): number {
  const text = lines.join('\n').trim();
  if (!text) return charCursor;
  const start = charCursor;
  const end = start + text.length;
  blocks.push(makeBlock('list', text, headingPath, start, end));
  return end + 1;
}

export function buildBlocksFromMarkdown(markdown: string): DraftBlock[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: DraftBlock[] = [];
  const headingPath: string[] = [];
  let charCursor = 0;
  let paragraphLines: string[] = [];
  let listLines: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let codeFence = '';

  const flushPara = () => {
    if (paragraphLines.length === 0) return;
    charCursor = flushParagraph(paragraphLines, headingPath, charCursor, blocks);
    paragraphLines = [];
  };

  const flushListBlock = () => {
    if (listLines.length === 0) return;
    charCursor = flushList(listLines, headingPath, charCursor, blocks);
    listLines = [];
  };

  const flushCode = () => {
    if (codeLines.length === 0) return;
    let text = codeLines.join('\n');
    if (text.length > MAX_CODE_BLOCK_CHARS) {
      text = `${text.slice(0, MAX_CODE_BLOCK_CHARS)}\n…`;
    }
    const start = charCursor;
    const end = start + text.length;
    blocks.push(makeBlock('code', text, headingPath, start, end));
    charCursor = end + 1;
    codeLines = [];
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\w*)$/);
    if (fenceMatch) {
      if (!inCode) {
        flushPara();
        flushListBlock();
        inCode = true;
        codeFence = fenceMatch[1] ?? '```';
        codeLines = [];
      } else if ((fenceMatch[1] ?? '').startsWith(codeFence[0] ?? '`')) {
        flushCode();
        inCode = false;
        codeFence = '';
      } else {
        codeLines.push(line);
      }
      charCursor += line.length + 1;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      charCursor += line.length + 1;
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushPara();
      flushListBlock();
      const level = headingMatch[1]?.length ?? 1;
      const title = (headingMatch[2] ?? '').trim();
      headingPath.splice(level - 1);
      headingPath[level - 1] = title;
      headingPath.length = level;
      const start = charCursor;
      const end = start + title.length;
      blocks.push(makeBlock('heading', title, [...headingPath], start, end));
      charCursor += line.length + 1;
      continue;
    }

    if (ORDERED_LIST_RE.test(line) || UNORDERED_LIST_RE.test(line)) {
      flushPara();
      listLines.push(line);
      charCursor += line.length + 1;
      continue;
    }

    if (listLines.length > 0 && line.trim() === '') {
      flushListBlock();
      charCursor += 1;
      continue;
    }

    if (listLines.length > 0) {
      flushListBlock();
    }

    if (line.trim() === '') {
      flushPara();
      charCursor += 1;
      continue;
    }

    paragraphLines.push(line);
    charCursor += line.length + 1;
  }

  if (inCode) {
    flushCode();
  }
  flushListBlock();
  flushPara();

  return blocks.filter((b) => b.text.length > 0);
}

export function buildBlocksFromPlainText(text: string): DraftBlock[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks: DraftBlock[] = [];
  const parts = normalized.split(/\n{2,}/);
  let charCursor = 0;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const start = charCursor;
    const end = start + trimmed.length;
    blocks.push(makeBlock('paragraph', trimmed, [], start, end));
    charCursor = end + 2;
  }

  return blocks;
}

export function buildBlocksFromText(
  text: string,
  format: 'markdown' | 'plain' = 'plain',
): DraftBlock[] {
  return format === 'markdown' ? buildBlocksFromMarkdown(text) : buildBlocksFromPlainText(text);
}

export function buildBlocksFromTranscriptSegments(
  segments: Array<{ startMs: number; endMs: number; text: string }>,
): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  let ordinalChar = 0;

  for (const segment of segments) {
    const trimmed = segment.text.trim();
    if (!trimmed) continue;
    const start = ordinalChar;
    const end = start + trimmed.length;
    blocks.push(
      makeBlock('transcript', trimmed, [], start, end, {
        timeStartMs: segment.startMs,
        timeEndMs: segment.endMs,
        locator: {
          kind: 'timestamp',
          timeStartMs: segment.startMs,
          timeEndMs: segment.endMs,
        },
      }),
    );
    ordinalChar = end + 1;
  }

  return blocks;
}
