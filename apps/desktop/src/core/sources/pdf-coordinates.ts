import type { NormalizedBoundingBox, NormalizedPoint, PdfQuad } from '@omakase/contracts';

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** PDF native coordinates use a bottom-left origin; overlays use top-left. */
export function pdfPointToNormalizedTopLeft(
  point: PdfPoint,
  pageWidth: number,
  pageHeight: number,
): NormalizedPoint {
  if (pageWidth <= 0 || pageHeight <= 0) throw new Error('PDF page dimensions must be positive');
  return {
    x: clamp01(point.x / pageWidth),
    y: clamp01(1 - point.y / pageHeight),
  };
}

export function pdfRectToNormalizedQuad(
  rect: PdfRect,
  pageWidth: number,
  pageHeight: number,
): PdfQuad {
  const topLeft = pdfPointToNormalizedTopLeft({ x: rect.left, y: rect.top }, pageWidth, pageHeight);
  const topRight = pdfPointToNormalizedTopLeft(
    { x: rect.right, y: rect.top },
    pageWidth,
    pageHeight,
  );
  const bottomRight = pdfPointToNormalizedTopLeft(
    { x: rect.right, y: rect.bottom },
    pageWidth,
    pageHeight,
  );
  const bottomLeft = pdfPointToNormalizedTopLeft(
    { x: rect.left, y: rect.bottom },
    pageWidth,
    pageHeight,
  );
  return { topLeft, topRight, bottomRight, bottomLeft };
}

export function quadBoundingBox(quad: PdfQuad): NormalizedBoundingBox {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}
