import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JobQueue } from '../../src/core/jobs/queue.js';
import { openDatabaseForTests } from '../../src/core/storage/database.js';
import { LOCAL_JOB_WORKER_COUNT } from '../../src/main/job-worker.js';

describe('local job worker pool', () => {
  it('exposes five concurrent local workers', () => {
    expect(LOCAL_JOB_WORKER_COUNT).toBe(5);
  });

  it('can claim five queued jobs without waiting for the first to finish', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-jobs-'));
    const handle = openDatabaseForTests(path.join(dir, 't.db'));
    try {
      const queue = new JobQueue(handle.db);
      for (let i = 0; i < 8; i += 1) {
        queue.enqueue('embed_source_version', { sourceId: `s${i}`, sourceVersionId: `v${i}` });
      }

      const claimed = [];
      for (let i = 0; i < LOCAL_JOB_WORKER_COUNT; i += 1) {
        const job = queue.claimNext(`worker-${i}`, ['embed_source_version']);
        expect(job).not.toBeNull();
        if (!job) throw new Error('Expected a job to be claimed');
        claimed.push(job.id);
      }
      expect(new Set(claimed).size).toBe(LOCAL_JOB_WORKER_COUNT);
      expect(queue.claimNext('worker-extra', ['embed_source_version'])).not.toBeNull();
    } finally {
      handle.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
