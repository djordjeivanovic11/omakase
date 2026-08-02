import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JobQueue } from '../../src/core/jobs/queue.js';
import {
  listEvidenceForSourceVersion,
  persistValidatedCitations,
} from '../../src/core/sources/evidence-repo.js';
import { importPdfSource } from '../../src/core/sources/pdf-ingest.js';
import { SourcesRepo } from '../../src/core/sources/sources-repo.js';
import { AssetStore } from '../../src/core/storage/asset-store.js';
import { openDatabaseForTests } from '../../src/core/storage/database.js';
import { newId, nowMs } from '../../src/core/storage/ids.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-pdf-grounding-'));
  tempDirs.push(dir);
  return dir;
}

describe('PDF grounding integration', () => {
  it('persists native atoms and reversible block relationships for a real PDF', async () => {
    const root = makeTempDir();
    const fixture = path.resolve(process.cwd(), '../../fixtures/pdfs/cache-write-policies.pdf');
    const { db, close } = openDatabaseForTests(path.join(root, 'library.sqlite'));

    try {
      const sources = new SourcesRepo(db);
      const result = await importPdfSource(
        {
          absolutePath: fixture,
          lifecycleStatus: 'inbox',
        },
        {
          db,
          assets: new AssetStore(db, path.join(root, 'assets')),
          sources,
          jobs: new JobQueue(db),
          derivedDir: path.join(root, 'derived'),
        },
      );

      expect(result.deduped).toBe(false);
      expect(result.source.processingStatus).toBe('ready');
      expect(result.blockCount).toBeGreaterThan(0);

      const atoms = db
        .prepare(
          `SELECT id, source_version_id, page_number, quads_json, parser_name
           FROM document_atoms WHERE source_version_id = ? ORDER BY reading_order`,
        )
        .all(result.sourceVersionId) as Array<{
        id: string;
        source_version_id: string;
        page_number: number;
        quads_json: string;
        parser_name: string;
      }>;
      expect(atoms.length).toBeGreaterThan(10);
      expect(new Set(atoms.map((atom) => atom.page_number))).toEqual(new Set([1, 2, 3]));
      expect(atoms.every((atom) => atom.source_version_id === result.sourceVersionId)).toBe(true);
      expect(atoms.every((atom) => JSON.parse(atom.quads_json).length > 0)).toBe(true);
      expect(atoms.every((atom) => atom.parser_name === 'pdfjs-text-content')).toBe(true);

      const linked = db
        .prepare(
          `SELECT ca.source_block_id, ca.atom_id
           FROM chunk_atoms ca
           JOIN source_blocks sb ON sb.id = ca.source_block_id
           WHERE sb.source_version_id = ?`,
        )
        .all(result.sourceVersionId) as Array<{ source_block_id: number; atom_id: string }>;
      expect(linked.length).toBeGreaterThan(0);
      expect(new Set(linked.map((row) => row.atom_id)).size).toBeGreaterThan(0);

      const sessionId = newId();
      const messageId = newId();
      const ts = nowMs();
      db.prepare(
        `INSERT INTO sessions (id, mode, status, runtime_context_json, started_at, created_at, updated_at)
         VALUES (?, 'learn', 'active', '{}', ?, ?, ?)`,
      ).run(sessionId, ts, ts, ts);
      db.prepare(
        `INSERT INTO messages (id, session_id, ordinal, role, content_text, status, created_at)
         VALUES (?, ?, 0, 'assistant', 'A grounded answer', 'complete', ?)`,
      ).run(messageId, sessionId, ts);
      const block = sources.listBlocks(result.sourceVersionId)[0];
      if (!block) throw new Error('PDF fixture did not produce a source block');
      const evidence = persistValidatedCitations(db, messageId, [
        {
          handle: 'S1',
          sourceBlockId: block.id,
          claimSummary: 'Grounded fixture claim',
          locatorSnapshotJson: JSON.stringify(block.locator),
          verificationStatus: 'verified',
        },
      ]);
      expect(evidence[0]?.atomIds.length).toBeGreaterThan(0);
      expect(
        listEvidenceForSourceVersion(db, result.sourceVersionId)[0]?.atomIds.length,
      ).toBeGreaterThan(0);
    } finally {
      close();
    }
  });
});
