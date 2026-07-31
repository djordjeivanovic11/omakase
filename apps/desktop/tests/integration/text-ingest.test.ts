import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JobQueue } from '../../src/core/jobs/queue.js';
import { SourcesRepo } from '../../src/core/sources/sources-repo.js';
import { importTextSource } from '../../src/core/sources/text-ingest.js';
import { AssetStore } from '../../src/core/storage/asset-store.js';
import { openDatabaseForTests } from '../../src/core/storage/database.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-text-ingest-'));
  tempDirs.push(dir);
  return dir;
}

describe('text-ingest integration', () => {
  it('imports markdown, creates blocks, indexes FTS, and enqueues embedding job', async () => {
    const root = makeTempDir();
    const dbPath = path.join(root, 'library.sqlite');
    const assetsDir = path.join(root, 'assets');
    const derivedDir = path.join(root, 'derived');

    const { db, close } = openDatabaseForTests(dbPath);
    try {
      const assets = new AssetStore(db, assetsDir);
      const sources = new SourcesRepo(db);
      const jobs = new JobQueue(db);

      const markdown = `# Learning Notes

This is a paragraph about local learning.

## Details

- first item
- second item
`;

      const result = await importTextSource(
        {
          title: 'Learning Notes',
          text: markdown,
          kind: 'markdown',
          lifecycleStatus: 'inbox',
        },
        { db, assets, sources, jobs, derivedDir },
      );

      expect(result.deduped).toBe(false);
      expect(result.blockCount).toBeGreaterThan(0);
      expect(result.source.processingStatus).toBe('ready');
      expect(result.source.activeVersionId).toBe(result.sourceVersionId);

      const blocks = sources.listBlocks(result.sourceVersionId);
      expect(blocks.length).toBe(result.blockCount);
      expect(blocks.some((b) => b.kind === 'heading')).toBe(true);
      expect(blocks.some((b) => b.kind === 'list')).toBe(true);

      const ftsCount = sources.countFtsRows(result.sourceVersionId);
      expect(ftsCount).toBe(blocks.length);

      const version = sources.getSourceVersion(result.sourceVersionId);
      expect(version?.normalizedHash).toBe(result.normalizedHash);
      expect(version?.status).toBe('ready');

      const stageRuns = sources.listStageRuns(result.sourceVersionId);
      expect(stageRuns.filter((r) => r.status === 'succeeded').length).toBeGreaterThanOrEqual(7);

      const queuedJobs = jobs.list(10).filter((j) => j.type === 'embed_source_version');
      expect(queuedJobs.length).toBe(1);
      expect(JSON.parse(queuedJobs[0]?.payloadJson ?? '{}')).toMatchObject({
        sourceId: result.source.id,
        sourceVersionId: result.sourceVersionId,
      });

      const second = await importTextSource(
        {
          title: 'Duplicate',
          text: markdown,
          kind: 'markdown',
        },
        { db, assets, sources, jobs, derivedDir },
      );
      expect(second.deduped).toBe(true);
      expect(second.sourceVersionId).toBe(result.sourceVersionId);
    } finally {
      close();
    }
  });
});
