import type { DocumentAtom, PdfQuad } from '@omakase/contracts';
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import { normalizeTextForHash } from '../storage/hash.js';
import { newId } from '../storage/ids.js';

const PARSER_NAME = 'pdfjs-text-content';

interface Point {
  x: number;
  y: number;
}

interface NativeTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: unknown): item is NativeTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof (item as { str?: unknown }).str === 'string' &&
    'transform' in item &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function transformPoint(matrix: number[], point: Point): Point {
  return {
    x: (matrix[0] ?? 1) * point.x + (matrix[2] ?? 0) * point.y + (matrix[4] ?? 0),
    y: (matrix[1] ?? 0) * point.x + (matrix[3] ?? 1) * point.y + (matrix[5] ?? 0),
  };
}

function multiplyTransforms(first: number[], second: number[]): number[] {
  return [
    (first[0] ?? 1) * (second[0] ?? 1) + (first[2] ?? 0) * (second[1] ?? 0),
    (first[1] ?? 0) * (second[0] ?? 1) + (first[3] ?? 1) * (second[1] ?? 0),
    (first[0] ?? 1) * (second[2] ?? 0) + (first[2] ?? 0) * (second[3] ?? 1),
    (first[1] ?? 0) * (second[2] ?? 0) + (first[3] ?? 1) * (second[3] ?? 1),
    (first[0] ?? 1) * (second[4] ?? 0) + (first[2] ?? 0) * (second[5] ?? 0) + (first[4] ?? 0),
    (first[1] ?? 0) * (second[4] ?? 0) + (first[3] ?? 1) * (second[5] ?? 0) + (first[5] ?? 0),
  ];
}

function normalizePoint(point: Point, pageWidth: number, pageHeight: number) {
  return {
    x: clampUnit(point.x / pageWidth),
    y: clampUnit(point.y / pageHeight),
  };
}

function itemQuad(
  item: NativeTextItem,
  viewportTransform: number[],
  pageWidth: number,
  pageHeight: number,
): { quads: PdfQuad[]; boundingBox: DocumentAtom['boundingBox'] } {
  const matrix = multiplyTransforms(viewportTransform, item.transform as number[]);
  const width = Math.max(0, item.width);
  const height = Math.max(0, item.height || Math.hypot(matrix[2] ?? 0, matrix[3] ?? 0));
  const points = [
    transformPoint(matrix, { x: 0, y: 0 }),
    transformPoint(matrix, { x: width, y: 0 }),
    transformPoint(matrix, { x: width, y: height }),
    transformPoint(matrix, { x: 0, y: height }),
  ];
  const normalized = points.map((point) => normalizePoint(point, pageWidth, pageHeight));
  const left = Math.min(...normalized.map((point) => point.x));
  const right = Math.max(...normalized.map((point) => point.x));
  const top = Math.min(...normalized.map((point) => point.y));
  const bottom = Math.max(...normalized.map((point) => point.y));

  return {
    // PDF.js text matrices use the lower-left item origin; after applying the
    // viewport transform, p3/p2 are the visual top edge and p0/p1 the bottom.
    quads: [
      {
        topLeft: normalized[3] ?? { x: left, y: top },
        topRight: normalized[2] ?? { x: right, y: top },
        bottomRight: normalized[1] ?? { x: right, y: bottom },
        bottomLeft: normalized[0] ?? { x: left, y: bottom },
      },
    ],
    boundingBox: { left, top, right, bottom },
  };
}

function classifyItem(
  text: string,
  pageNumber: number,
  itemIndex: number,
  height: number,
): DocumentAtom['kind'] {
  const trimmed = text.trim();
  if (pageNumber === 1 && itemIndex === 0) return 'title';
  if (/^(?:\u2022|\u25e6|[-*])\s/.test(trimmed)) return 'list_item';
  if (
    trimmed.length <= 120 &&
    (/^\d+(?:\.\d+)*\s+/.test(trimmed) || /^[A-Z][A-Z\s\d:,-]{5,}$/.test(trimmed))
  ) {
    return 'heading';
  }
  if (height >= 16 && trimmed.length <= 180) return 'heading';
  return 'paragraph';
}

/**
 * Extracts native PDF.js text items while retaining the page geometry that
 * the renderer can later use for evidence overlays. Scanned pages simply
 * produce no atoms here; OCR is a separate parser phase and is never faked.
 */
export async function extractPdfAtoms(
  bytes: Buffer,
  sourceVersionId: string,
): Promise<DocumentAtom[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pdfjs = await getResolvedPDFJS();
  const parserVersion = typeof pdfjs.version === 'string' ? pdfjs.version : 'unknown';
  const atoms: DocumentAtom[] = [];
  let readingOrder = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      let characterCursor = 0;

      for (let itemIndex = 0; itemIndex < content.items.length; itemIndex += 1) {
        const item = content.items[itemIndex];
        if (!item) continue;
        if (!isTextItem(item)) continue;
        const text = item.str;
        if (!text.trim()) {
          characterCursor += text.length;
          continue;
        }
        const geometry = itemQuad(item, viewport.transform, viewport.width, viewport.height);
        const height = Math.max(0, (item.transform[3] as number | undefined) ?? item.height);
        const characterStart = characterCursor;
        const characterEnd = characterStart + text.length;
        atoms.push({
          id: newId(),
          sourceVersionId,
          pageNumber,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          readingOrder,
          kind: classifyItem(text, pageNumber, itemIndex, height),
          text,
          normalizedText: normalizeTextForHash(text),
          quads: geometry.quads,
          boundingBox: geometry.boundingBox,
          sectionPath: [],
          characterStart,
          characterEnd,
          extractionMethod: 'native_pdf',
          parserName: PARSER_NAME,
          parserVersion,
          confidence: 1,
        });
        readingOrder += 1;
        characterCursor = characterEnd + 1;
      }
    }
  } finally {
    await pdf.cleanup();
    await pdf.loadingTask.destroy();
  }

  return atoms;
}
