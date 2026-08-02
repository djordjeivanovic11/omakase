import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPdfAtoms } from '../../src/core/sources/pdf-atoms.js';
import { newId } from '../../src/core/storage/ids.js';

describe('PDF native text atoms', () => {
  it('keeps page geometry and reading order for a real PDF fixture', async () => {
    const fixture = path.resolve(process.cwd(), '../../fixtures/pdfs/cache-write-policies.pdf');
    const atoms = await extractPdfAtoms(fs.readFileSync(fixture), newId());

    expect(atoms.length).toBeGreaterThan(10);
    expect(atoms[0]?.kind).toBe('title');
    expect(new Set(atoms.map((atom) => atom.readingOrder)).size).toBe(atoms.length);
    expect(new Set(atoms.map((atom) => atom.pageNumber))).toEqual(new Set([1, 2, 3]));
    for (const atom of atoms.slice(0, 12)) {
      expect(atom.pageWidth).toBeGreaterThan(0);
      expect(atom.pageHeight).toBeGreaterThan(0);
      expect(atom.quads).toHaveLength(1);
      expect(atom.boundingBox.left).toBeGreaterThanOrEqual(0);
      expect(atom.boundingBox.right).toBeLessThanOrEqual(1);
      expect(atom.boundingBox.top).toBeGreaterThanOrEqual(0);
      expect(atom.boundingBox.bottom).toBeLessThanOrEqual(1);
      expect(atom.extractionMethod).toBe('native_pdf');
      expect(atom.parserName).toBe('pdfjs-text-content');
    }
  });
});
