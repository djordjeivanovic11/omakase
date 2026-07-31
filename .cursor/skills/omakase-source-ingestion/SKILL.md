---
name: omakase-source-ingestion
description: Use when changing URL, PDF, transcript, note, extraction, chunking, citations, or retrieval. Verifies local processing, anchors, idempotency, and injection boundaries.
---

# Omakase source ingestion

## Entry conditions

Activate for parsers, chunking, locators, FTS/embeddings, citation anchors, URL fetch policy, or Inbox/Studio import paths.

## Required checks

1. Source identity and content hashing
2. Extraction quality / needs_attention path
3. Stable page, section, or timestamp anchors
4. Idempotent ingestion
5. Local-only processing where intended (no model call on save)
6. Prompt-injection boundaries (source is data)
7. Citation round-trip to supplied blocks
8. Duplicate handling
9. Search regression (FTS / hybrid)
10. Packaged-app asset and worker paths

## Evidence required

- Fixture under `fixtures/` or eval dataset case
- Deterministic citation validity remains 100%
- No secrets or remote execution introduced

See `references/pipeline.md`.
