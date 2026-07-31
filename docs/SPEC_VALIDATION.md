# Specification Pack Validation

**Validated:** 31 July 2026

This file records checks performed on the specification pack itself. It does not claim that the application has been implemented.

## Completed checks

### SQLite schema

`SCHEMA.sql` was executed from an empty in-memory SQLite 3.46.1 database with JSON1 and FTS5 enabled.

Results:

```text
schema execution: pass
foreign_key_check: pass
integrity_check: ok
logical tables (including FTS internals): 46
schema triggers: 16
```

Behavioral smoke checks passed for:

- Studio/source/version insertion;
- active source-version invariant;
- source-block insertion;
- automatic FTS5 synchronization and search;
- Float32 vector-length constraint;
- rejection of a ready source version without a normalized hash;
- Probe/session scope invariant;
- learning-event append-only trigger;
- final foreign-key and database integrity checks.

The implementation repository must repeat these tests through its own migration runner and target `better-sqlite3` build.

### Pack consistency

The pack contains:

- full normative technical specification;
- executable initial persistence schema;
- coding-agent operating contract;
- implementation prompt;
- acceptance/evidence matrix;
- primary technical reference baseline.

The product’s golden path, scope exclusions, process boundaries, agent modes, learner evidence policy, and release criteria are represented consistently across the documents.

### Placeholder scan

The technical specification contains no implementation placeholders. `SCHEMA.sql` intentionally contains one build-time migration checksum marker:

```text
REPLACE_WITH_BUILD_TIME_SHA256
```

The migration tool must replace or verify this value as part of repository initialization.

## Checks that belong to implementation

The following cannot be validated by the specification pack alone and are release requirements for the coding agent:

- actual Electron packaging on macOS and Windows;
- native module compatibility;
- bundled ONNX model checksums and inference output;
- provider API behavior;
- PDF fixture quality;
- retrieval metrics;
- Probe evaluator agreement;
- security penetration tests;
- browser-store extension installation;
- code signing and notarization;
- accessibility and usability testing.

Those checks are enumerated in `ACCEPTANCE_CHECKLIST.md` and must be accompanied by reproducible evidence.
