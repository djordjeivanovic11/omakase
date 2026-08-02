# Omakase repository architecture map

This map records the production seams used by the source-scope, extension, activity, and PDF-grounding implementation.

## Process boundaries

- `apps/desktop/src/main` owns Electron lifecycle, SQLite access, secrets, IPC, jobs, native-host installation, and the packaged application boundary.
- `apps/desktop/src/preload` exposes the narrow typed renderer bridge.
- `apps/desktop/src/renderer` owns React presentation and does not access SQLite, secrets, or Node APIs.
- `apps/desktop/src/core` owns source ingestion, retrieval, agent execution, learning state, migrations, and persistence services.
- `apps/extension` is a WXT Manifest V3 extension. Page extraction runs in the content script; privileged work runs in the service worker; desktop communication uses Native Messaging.
- `packages/contracts` contains serializable Zod schemas and protocol types shared across the desktop and extension.

## Source and learning flow

```text
capture or import
  -> source/version/asset
  -> staged ingestion
  -> source_blocks + FTS5 + embeddings
  -> SourceScope resolution
  -> hybrid retrieval
  -> citation validation
  -> messages and learner state
```

The existing PDF path currently uses `unpdf` page text and reconstructs source blocks in the renderer. The new `document_atoms`, `chunk_atoms`, and evidence tables are additive so existing sources remain readable while reparsing is introduced.

## Graphify usage

Graphify was used to locate the cross-cutting seams around `AgentService`, `hybridRetrieve`, the native host, extension queue, ingestion pipeline, concepts, and IPC. Its generated graph is a development navigation aid only; source files and tests remain authoritative.
