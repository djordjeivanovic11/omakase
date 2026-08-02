# PDF grounding: current state

## Findings

1. PDF extraction is implemented in `apps/desktop/src/core/sources/pdf-extract.ts` with `unpdf`.
2. Extraction currently returns page-level text and quality metrics. It does not return word spans, line boxes, reading-order atoms, or native PDF geometry.
3. `buildPdfPageBlocks` splits flattened page text into paragraph-like blocks of approximately 900–1600 characters.
4. Existing block locators retain page and character ranges, but not reversible coordinates.
5. `SourcePage.tsx` renders reconstructed `<pre>` text rather than the original PDF page.
6. Retrieval and citations currently resolve to `source_blocks` and their JSON locators.
7. No parser geometry is currently persisted in SQLite. The new `document_atoms` and `evidence` tables are empty until a parser adapter supplies real coordinates.

## Decision boundary

The current extractor remains the deterministic baseline. It must not claim precise highlights. The parser evaluation harness and real fixture corpus must be completed before Docling, MinerU, GROBID, or a new native parser is made a production dependency.

## Required next PDF slice

- Add PDF.js rendering of the original asset.
- Define the parser adapter output as `DocumentAtom[]`.
- Persist atom geometry and chunk-to-atom joins.
- Add viewport-independent overlay rendering.
- Reparse existing PDFs through a resumable migration.
