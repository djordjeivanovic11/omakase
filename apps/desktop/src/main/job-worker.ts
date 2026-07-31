import type { AppContext } from './app-context.js';

/** Local ingestion/embedding pool — one process, N concurrent jobs. */
export const LOCAL_JOB_WORKER_COUNT = 5;
const POLL_MS = 400;
const JOB_TYPES = ['embed_source_version', 'resume_ingestion'] as const;

let timer: ReturnType<typeof setInterval> | null = null;
let active = 0;
let workerSeq = 0;

export function startJobWorker(ctx: AppContext): void {
  if (timer) return;
  timer = setInterval(() => {
    fillWorkerSlots(ctx);
  }, POLL_MS);
  // Kick immediately so imports don't wait a full poll interval.
  fillWorkerSlots(ctx);
}

export function stopJobWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Exposed for tests / diagnostics. */
export function getActiveJobWorkerCount(): number {
  return active;
}

function fillWorkerSlots(ctx: AppContext): void {
  while (active < LOCAL_JOB_WORKER_COUNT) {
    workerSeq += 1;
    const workerId = `local-worker-${workerSeq}`;
    const job = ctx.jobs.claimNext(workerId, [...JOB_TYPES]);
    if (!job) break;
    active += 1;
    void runClaimedJob(ctx, job).finally(() => {
      active = Math.max(0, active - 1);
      // Immediately pull the next queued job when a slot frees.
      fillWorkerSlots(ctx);
    });
  }
}

async function runClaimedJob(
  ctx: AppContext,
  job: { id: string; type: string; payloadJson: string },
): Promise<void> {
  if (job.type === 'embed_source_version') {
    await runEmbedJob(ctx, job.id, job.payloadJson);
  } else if (job.type === 'resume_ingestion') {
    await runResumeIngestion(ctx, job.id, job.payloadJson);
  } else {
    ctx.jobs.fail(job.id, 'unsupported_job', `Unsupported job type: ${job.type}`, false);
  }
}

async function runEmbedJob(ctx: AppContext, jobId: string, payloadJson: string): Promise<void> {
  try {
    const payload = JSON.parse(payloadJson) as {
      sourceId: string;
      sourceVersionId: string;
    };
    const blocks = ctx.sources.listBlocks(payload.sourceVersionId);
    const total = blocks.length;
    if (total === 0) {
      ctx.jobs.succeed(jobId, { embedded: 0 });
      return;
    }

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]!;
      await ctx.embeddingsRepo.ensureEmbedding(block.id, block.text);
      // Throttle status writes — every block is fine for SQLite; progress every ~8.
      if (i === 0 || i === total - 1 || (i + 1) % 8 === 0) {
        ctx.jobs.setProgress(jobId, (i + 1) / total);
        ctx.sources.updateSourceProcessingStatus(payload.sourceId, 'embedding');
      }
    }

    ctx.sources.updateSourceProcessingStatus(payload.sourceId, 'ready');
    ctx.jobs.succeed(jobId, { embedded: total });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.jobs.fail(jobId, 'embed_failed', message);
  }
}

async function runResumeIngestion(
  ctx: AppContext,
  jobId: string,
  payloadJson: string,
): Promise<void> {
  try {
    const payload = JSON.parse(payloadJson) as { sourceId: string; sourceVersionId: string };
    const blocks = ctx.sources.listBlocks(payload.sourceVersionId);
    if (blocks.length === 0) {
      ctx.jobs.fail(jobId, 'no_blocks', 'No blocks to resume', false);
      return;
    }
    ctx.jobs.enqueue('embed_source_version', {
      sourceId: payload.sourceId,
      sourceVersionId: payload.sourceVersionId,
    });
    ctx.jobs.succeed(jobId, { requeued: 'embed_source_version' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.jobs.fail(jobId, 'resume_failed', message);
  }
}
