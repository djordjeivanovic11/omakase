import type { ProcessingStatus } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import type { JobQueue } from '../jobs/queue.js';
import { nowMs } from '../storage/ids.js';
import type { DraftBlock } from './block-builder.js';
import type { IngestionStageName, InsertBlockInput, SourcesRepo } from './sources-repo.js';

export const STAGE_VERSION = '1.0.0';

export const INGESTION_STAGE_ORDER: IngestionStageName[] = [
  'acquire',
  'extract',
  'quality_check',
  'normalize',
  'structure',
  'block',
  'index_lexical',
  'embed',
];

const STAGE_TO_PROCESSING: Record<IngestionStageName, ProcessingStatus> = {
  acquire: 'acquiring',
  extract: 'extracting',
  quality_check: 'quality_check',
  normalize: 'normalizing',
  structure: 'structuring',
  block: 'blocking',
  index_lexical: 'indexing_lexical',
  embed: 'embedding',
};

export interface StageResult {
  outputHash: string;
  extractedText?: string;
  pageCount?: number;
  qualityScore?: number;
  needsAttention?: boolean;
  normalizedText?: string;
  normalizedHash?: string;
  blocks?: DraftBlock[];
  jobId?: string;
}

export interface IngestionHandlers {
  acquire?: () => Promise<StageResult>;
  extract?: () => Promise<StageResult>;
  quality_check?: () => Promise<StageResult>;
  normalize?: () => Promise<StageResult>;
  structure?: () => Promise<StageResult>;
  block?: () => Promise<StageResult>;
  index_lexical?: () => Promise<StageResult>;
  embed?: () => Promise<StageResult>;
}

export interface RunIngestionInput {
  sourceId: string;
  sourceVersionId: string;
  handlers: IngestionHandlers;
  requestedStages?: IngestionStageName[];
  force?: boolean;
}

export interface IngestionPipelineDeps {
  db: Database.Database;
  sources: SourcesRepo;
  jobs?: JobQueue;
}

export class IngestionPipeline {
  constructor(private readonly deps: IngestionPipelineDeps) {}

  firstIncompleteStage(sourceVersionId: string, force = false): IngestionStageName | null {
    if (force) return INGESTION_STAGE_ORDER[0] ?? null;
    for (const stage of INGESTION_STAGE_ORDER) {
      const run = this.deps.sources.getStageRun(sourceVersionId, stage, STAGE_VERSION);
      if (!run || run.status !== 'succeeded') {
        return stage;
      }
    }
    return null;
  }

  async run(
    input: RunIngestionInput,
  ): Promise<{ finalStatus: 'ready' | 'needs_attention' | 'failed' }> {
    const stages = input.requestedStages ?? INGESTION_STAGE_ORDER;
    const ordered = INGESTION_STAGE_ORDER.filter((stage) => stages.includes(stage));
    const startStage = input.force
      ? ordered[0]
      : ordered.find((stage) => {
          const run = this.deps.sources.getStageRun(input.sourceVersionId, stage, STAGE_VERSION);
          return !run || run.status !== 'succeeded';
        });

    if (!startStage) {
      const version = this.deps.sources.getSourceVersion(input.sourceVersionId);
      if (version?.status === 'needs_attention') {
        return { finalStatus: 'needs_attention' };
      }
      return { finalStatus: 'ready' };
    }

    const startIndex = ordered.indexOf(startStage);
    let needsAttention = false;
    let qualityScore: number | null = null;
    let normalizedHash: string | null = null;

    for (const stage of ordered.slice(startIndex)) {
      if (!input.force) {
        const existing = this.deps.sources.getStageRun(input.sourceVersionId, stage, STAGE_VERSION);
        if (existing?.status === 'succeeded') {
          continue;
        }
      }

      this.deps.sources.updateSourceProcessingStatus(input.sourceId, STAGE_TO_PROCESSING[stage]);

      const handler = input.handlers[stage];
      if (!handler) {
        this.deps.sources.updateSourceProcessingStatus(input.sourceId, 'failed', {
          code: 'missing_handler',
          message: `No handler for stage ${stage}`,
        });
        return { finalStatus: 'failed' };
      }

      const run = this.deps.sources.startStageRun(input.sourceVersionId, stage, STAGE_VERSION);
      try {
        const result = await handler();
        if (stage === 'quality_check') {
          needsAttention = result.needsAttention ?? false;
          qualityScore = result.qualityScore ?? null;
        }
        if (stage === 'normalize') {
          normalizedHash = result.normalizedHash ?? null;
        }
        if (stage === 'block' && result.blocks && result.blocks.length > 0) {
          this.persistBlocks(input.sourceVersionId, result.blocks);
        }

        if (stage === 'index_lexical') {
          const blockCount = this.deps.sources.listBlocks(input.sourceVersionId).length;
          const ftsCount = this.deps.sources.countFtsRows(input.sourceVersionId);
          if (blockCount > 0 && ftsCount < blockCount) {
            throw new Error(`FTS index incomplete: ${ftsCount}/${blockCount}`);
          }
        }

        this.deps.sources.completeStageRun(run.id, result.outputHash, result.jobId ?? null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.sources.failStageRun(run.id, 'stage_failed', message);
        this.deps.sources.updateSourceProcessingStatus(input.sourceId, 'failed', {
          code: 'stage_failed',
          message: `${stage}: ${message}`,
        });
        this.deps.sources.updateSourceVersion(input.sourceVersionId, { status: 'failed' });
        return { finalStatus: 'failed' };
      }
    }

    const ts = nowMs();
    const finalVersionStatus = needsAttention ? 'needs_attention' : 'ready';
    const finalProcessingStatus: ProcessingStatus = needsAttention ? 'needs_attention' : 'ready';

    this.deps.sources.updateSourceVersion(input.sourceVersionId, {
      status: finalVersionStatus,
      normalizedHash: normalizedHash ?? undefined,
      extractionQuality: qualityScore ?? undefined,
      readyAt: ts,
    });

    this.deps.sources.setActiveVersion(input.sourceId, input.sourceVersionId);
    this.deps.sources.updateSourceProcessingStatus(input.sourceId, finalProcessingStatus);

    return { finalStatus: finalVersionStatus };
  }

  private persistBlocks(sourceVersionId: string, blocks: DraftBlock[]): void {
    const insertInputs = draftBlocksToInsertInputs(sourceVersionId, blocks);
    const tx = this.deps.db.transaction(() => {
      this.deps.sources.deleteBlocksForVersion(sourceVersionId);
      this.deps.sources.insertBlocks(insertInputs);
    });
    tx();
  }
}

export function draftBlocksToInsertInputs(
  sourceVersionId: string,
  blocks: DraftBlock[],
): InsertBlockInput[] {
  return blocks.map((block, ordinal) => ({
    sourceVersionId,
    ordinal,
    kind: block.kind,
    text: block.text,
    headingPath: block.headingPath,
    headingPathText: block.headingPathText,
    pageStart: block.pageStart,
    pageEnd: block.pageEnd,
    timeStartMs: block.timeStartMs,
    timeEndMs: block.timeEndMs,
    charStart: block.charStart,
    charEnd: block.charEnd,
    locator: block.locator,
    contentHash: block.contentHash,
    tokenEstimate: block.tokenEstimate,
  }));
}

export function enqueueEmbedJob(jobs: JobQueue, sourceId: string, sourceVersionId: string): string {
  return jobs.enqueue(
    'embed_source_version',
    { sourceId, sourceVersionId },
    { dedupeKey: `embed:${sourceVersionId}` },
  );
}
