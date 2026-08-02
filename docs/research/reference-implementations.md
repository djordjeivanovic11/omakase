# Reference implementation reconnaissance

This is the initial implementation-guidance record. No external source code was copied and no reference project was added as a runtime dependency.

## Inspection record

Inspected 2026-08-02 against the public repository default branches/pages available
that day. The Chrome Native Messaging documentation identifies the caller origin
as the host's first argument, requires exact `allowed_origins`, keeps native
messaging out of content scripts, and uses length-prefixed UTF-8 JSON over stdio.
The PDF.js examples document the page viewport transform from PDF bottom-left
coordinates to browser top-left coordinates and HiDPI rendering. Zotero's current
architecture page describes injected page code, a background process, and a
desktop connector server. AG-UI's current repository describes a provider-neutral
event stream with run/step-style lifecycle events and transport independence.

The repository pages were read as current public HEAD rather than pinned into the
Omakase dependency graph. Before copying implementation code or adding a parser,
the next research pass must record the exact commit/package version, license,
fixture results, installation size, memory use, and packaging impact in this file.

| Reference | Useful pattern | Omakase decision |
|---|---|---|
| [Zotero Connectors](https://github.com/zotero/zotero-connectors) | Page extraction, background coordination, desktop connector separation | Keep extraction in content code, privileged work in the MV3 service worker, and desktop persistence in Omakase. |
| [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) | Exact origin allowlisting, stdio framing, service-worker-only privileged connection | Keep Native Messaging as the primary bridge and validate the caller origin in the host. |
| [Electron deep links](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app) | Single-instance focus and cold-start protocol handling | Use short-lived `omakase://capture/<request-id>` navigation only. |
| [NotebookLM source selection](https://support.google.com/notebooklm/answer/16296687) | Visible active-source selection and source-aware answers | Adopt the interaction model, not the visual design or hosted architecture. |
| [PaperQA](https://github.com/Future-House/paper-qa) | Scientific-document provenance and page-level citations | Extend Omakase evidence beyond block IDs toward claim and page evidence. |
| [Microsoft GraphRAG](https://microsoft.github.io/graphrag/index/outputs/) | Separate text units, concepts, relationships, and supporting IDs | Implement a smaller incremental graph backed by evidence; do not import GraphRAG. |
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx) | Run/step lifecycle and activity events | Use the event shape as inspiration while keeping Omakase contracts provider-neutral. |
| [PDF.js](https://mozilla.github.io/pdf.js/examples/index.html) | Original-page rendering and viewport coordinate transforms | Use PDF.js for the viewer layer after the parser benchmark. |
| [Docling](https://github.com/docling-project/docling) / [MinerU](https://github.com/opendatalab/mineru) | Layout-aware atoms, reading order, tables, formulas, OCR | Benchmark behind an adapter; do not introduce a Python runtime before measuring packaging cost. |
| [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) | Quote, prefix/suffix, and position selectors | Store redundant textual and geometric anchors. |

Before a parser dependency is introduced, record the exact commit/package version, license, fixture results, installation size, memory use, and packaging impact here.
