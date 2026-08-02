import { describe, expect, it } from 'vitest';
import {
  pdfPointToNormalizedTopLeft,
  pdfRectToNormalizedQuad,
  quadBoundingBox,
} from '../../src/core/sources/pdf-coordinates.js';

describe('PDF coordinate grounding', () => {
  it('converts bottom-left PDF coordinates to normalized top-left coordinates', () => {
    expect(pdfPointToNormalizedTopLeft({ x: 0, y: 0 }, 600, 800)).toEqual({ x: 0, y: 1 });
    expect(pdfPointToNormalizedTopLeft({ x: 300, y: 400 }, 600, 800)).toEqual({ x: 0.5, y: 0.5 });
    expect(pdfPointToNormalizedTopLeft({ x: 600, y: 800 }, 600, 800)).toEqual({ x: 1, y: 0 });
  });

  it('preserves a PDF rectangle as a viewport-independent quad', () => {
    const quad = pdfRectToNormalizedQuad(
      { left: 100, top: 700, right: 500, bottom: 650 },
      600,
      800,
    );
    expect(quad).toEqual({
      topLeft: { x: 1 / 6, y: 0.125 },
      topRight: { x: 5 / 6, y: 0.125 },
      bottomRight: { x: 5 / 6, y: 0.1875 },
      bottomLeft: { x: 1 / 6, y: 0.1875 },
    });
    expect(quadBoundingBox(quad)).toEqual({
      left: 1 / 6,
      top: 0.125,
      right: 5 / 6,
      bottom: 0.1875,
    });
  });

  it('rejects invalid page dimensions rather than fabricating geometry', () => {
    expect(() => pdfPointToNormalizedTopLeft({ x: 1, y: 1 }, 0, 800)).toThrow(
      /dimensions must be positive/,
    );
  });
});
