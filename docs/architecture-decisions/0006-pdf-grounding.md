# ADR 0006: Preserve original PDF evidence before improving extraction

## Status

Accepted as an implementation seam; parser selection remains open pending benchmark results.

## Decision

The original PDF is the visible source of truth. Any parser output must retain a reversible mapping to the original source version, page, atom, quotation, and geometry. Coordinates are normalized once in `apps/desktop/src/core/sources/pdf-coordinates.ts` from PDF bottom-left coordinates to top-left overlay coordinates.

The repository now adds a PDF.js native-text atom adapter, persists those atoms and their source-block relationships, and serves immutable PDF assets through a restricted `omakase-pdf://source-version/<uuidv7>` protocol. It does not fabricate coordinates for pages that have no native text; OCR and parser benchmarking remain separate phases.

## Consequences

- Existing citations continue to work as block citations while precise evidence is introduced.
- A parser can be benchmarked and replaced behind one adapter boundary.
- Geometry, quote, prefix/suffix, character, and atom selectors can be used as redundant anchors.
- The renderer uses the original asset with PDF.js and draws persisted evidence overlays over the page canvas rather than highlighting a reconstructed Markdown blob.
