import { extractText, getDocumentProxy } from 'unpdf';
import type { DraftBlock } from './block-builder.js';
import { blockContentHash, estimateTokens } from './block-builder.js';

export interface PdfPageText {
  pageNumber: number;
  text: string;
  charCount: number;
}

export interface PdfQualityDetails {
  suspectPages: number[];
  avgCharsPerPage: number;
  printableRatio: number;
  replacementRatio: number;
  blankPageCount: number;
}

export interface PdfExtractionResult {
  pageCount: number;
  pages: PdfPageText[];
  metadata: Record<string, unknown>;
  qualityScore: number;
  qualityDetails: PdfQualityDetails;
  needsAttention: boolean;
}

const ATTENTION_THRESHOLD = 0.45;
const MIN_CHARS_PER_PAGE = 40;

function printableRatio(text: string): number {
  if (text.length === 0) return 0;
  let printable = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) {
      printable += 1;
    }
  }
  return printable / text.length;
}

function replacementRatio(text: string): number {
  if (text.length === 0) return 0;
  const replacements = (text.match(/\uFFFD/g) ?? []).length;
  return replacements / text.length;
}

function assessPageQuality(text: string): boolean {
  if (text.trim().length < MIN_CHARS_PER_PAGE) return true;
  if (printableRatio(text) < 0.7) return true;
  if (replacementRatio(text) > 0.05) return true;
  return false;
}

export function computePdfQuality(pages: PdfPageText[]): {
  qualityScore: number;
  qualityDetails: PdfQualityDetails;
  needsAttention: boolean;
} {
  if (pages.length === 0) {
    return {
      qualityScore: 0,
      qualityDetails: {
        suspectPages: [],
        avgCharsPerPage: 0,
        printableRatio: 0,
        replacementRatio: 1,
        blankPageCount: 0,
      },
      needsAttention: true,
    };
  }

  const suspectPages: number[] = [];
  let totalChars = 0;
  let totalPrintable = 0;
  let totalReplacements = 0;
  let blankPageCount = 0;

  for (const page of pages) {
    totalChars += page.charCount;
    totalPrintable += printableRatio(page.text) * page.charCount;
    totalReplacements += (page.text.match(/\uFFFD/g) ?? []).length;
    if (page.charCount < MIN_CHARS_PER_PAGE) blankPageCount += 1;
    if (assessPageQuality(page.text)) suspectPages.push(page.pageNumber);
  }

  const avgCharsPerPage = totalChars / pages.length;
  const aggregatePrintable = totalChars > 0 ? totalPrintable / totalChars : 0;
  const aggregateReplacement = totalChars > 0 ? totalReplacements / totalChars : 0;

  const charScore = Math.min(1, avgCharsPerPage / 500);
  const printableScore = aggregatePrintable;
  const replacementScore = 1 - Math.min(1, aggregateReplacement * 20);
  const suspectScore = 1 - suspectPages.length / pages.length;

  const qualityScore = Math.max(
    0,
    Math.min(
      1,
      charScore * 0.35 + printableScore * 0.35 + replacementScore * 0.15 + suspectScore * 0.15,
    ),
  );

  return {
    qualityScore,
    qualityDetails: {
      suspectPages,
      avgCharsPerPage,
      printableRatio: aggregatePrintable,
      replacementRatio: aggregateReplacement,
      blankPageCount,
    },
    needsAttention: qualityScore < ATTENTION_THRESHOLD || suspectPages.length > pages.length * 0.4,
  };
}

export async function extractPdfFromBytes(bytes: Buffer): Promise<PdfExtractionResult> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [text];

  const pages: PdfPageText[] = pageTexts.map((pageText, index) => {
    const normalized = pageText.replace(/\r\n/g, '\n').trim();
    return {
      pageNumber: index + 1,
      text: normalized,
      charCount: normalized.length,
    };
  });

  const metadata: Record<string, unknown> = {
    totalPages: totalPages ?? pages.length,
  };

  try {
    const info = await pdf.getMetadata();
    if (info?.info) {
      metadata.info = info.info;
    }
  } catch {
    // metadata is optional
  }

  const quality = computePdfQuality(pages);

  return {
    pageCount: totalPages ?? pages.length,
    pages,
    metadata,
    qualityScore: quality.qualityScore,
    qualityDetails: quality.qualityDetails,
    needsAttention: quality.needsAttention,
  };
}

/**
 * Target block size in characters. PDF text extraction frequently yields a
 * whole page as one run of text with no blank lines, and a page-sized block
 * is both a poor retrieval unit and an imprecise citation target.
 */
const TARGET_BLOCK_CHARS = 900;
const MAX_BLOCK_CHARS = 1600;

/** Splits on sentence boundaries, keeping pieces near the target size. */
function splitIntoBlockTexts(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_BLOCK_CHARS) {
      chunks.push(paragraph);
      continue;
    }

    const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [paragraph];
    let current = '';

    for (const sentence of sentences) {
      const candidate = current ? `${current}${sentence}` : sentence;
      if (candidate.length >= TARGET_BLOCK_CHARS) {
        chunks.push(candidate.trim());
        current = '';
      } else {
        current = candidate;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

export function buildPdfPageBlocks(pages: PdfPageText[]): DraftBlock[] {
  const blocks: DraftBlock[] = [];

  for (const page of pages) {
    let cursor = 0;
    for (const text of splitIntoBlockTexts(page.text)) {
      const charStart = cursor;
      cursor += text.length;

      blocks.push({
        kind: 'paragraph',
        text,
        headingPath: [`Page ${page.pageNumber}`],
        headingPathText: `Page ${page.pageNumber}`,
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        timeStartMs: null,
        timeEndMs: null,
        charStart,
        charEnd: cursor,
        locator: {
          kind: 'page',
          page: page.pageNumber,
          pageEnd: page.pageNumber,
          charStart,
          charEnd: cursor,
        },
        contentHash: blockContentHash(text),
        tokenEstimate: estimateTokens(text),
      });
    }
  }

  return blocks;
}
