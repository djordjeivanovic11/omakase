import fs from 'node:fs';
import path from 'node:path';
import type { ImportTextSourceInput, Source } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import type { JobQueue } from '../jobs/queue.js';
import type { AssetStore } from '../storage/asset-store.js';
import { normalizeTextForHash, sha256Hex } from '../storage/hash.js';
import { nowMs } from '../storage/ids.js';
import type { StudiosRepo } from '../storage/studios-repo.js';
import { buildBlocksFromText } from './block-builder.js';
import { enqueueEmbedJob, IngestionPipeline } from './ingestion-pipeline.js';
import type { SourcesRepo } from './sources-repo.js';

const PARSER_ID = 'omakase-text';
const PARSER_VERSION = '1.0.0';

export interface TextIngestDeps {
  db: Database.Database;
  assets: AssetStore;
  sources: SourcesRepo;
  studios?: StudiosRepo;
  jobs?: JobQueue;
  derivedDir: string;
}

export interface TextIngestResult {
  source: Source;
  sourceVersionId: string;
  blockCount: number;
  normalizedHash: string;
  deduped: boolean;
}

function countWords(text: string): number {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

function mediaTypeForKind(kind: ImportTextSourceInput['kind']): string {
  if (kind === 'markdown') return 'text/markdown';
  if (kind === 'note') return 'text/markdown';
  return 'text/plain';
}

function blockFormatForKind(kind: ImportTextSourceInput['kind']): 'markdown' | 'plain' {
  return kind === 'text' ? 'plain' : 'markdown';
}

function writeNormalizedArtifact(
  derivedDir: string,
  sourceVersionId: string,
  text: string,
): string {
  const relativePath = path.join(sourceVersionId.slice(0, 2), sourceVersionId, 'normalized.md');
  const abs = path.join(derivedDir, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  return relativePath;
}

export async function importTextSource(
  input: ImportTextSourceInput,
  deps: TextIngestDeps,
): Promise<TextIngestResult> {
  const normalizedText = normalizeTextForHash(input.text);
  const normalizedHash = sha256Hex(normalizedText);
  const mediaType = mediaTypeForKind(input.kind);

  const existingByHash = deps.db
    .prepare(
      `SELECT sv.id AS version_id, sv.source_id
       FROM source_versions sv
       JOIN sources s ON s.id = sv.source_id
       WHERE sv.normalized_hash = ?
         AND sv.status IN ('ready', 'needs_attention')
         AND s.lifecycle_status <> 'deleted'
         AND s.deleted_at IS NULL
       LIMIT 1`,
    )
    .get(normalizedHash) as { version_id: string; source_id: string } | undefined;

  if (existingByHash) {
    const source = deps.sources.getSource(existingByHash.source_id);
    if (!source) throw new Error('Existing source missing');
    if (input.studioId && deps.studios) {
      deps.studios.assignSource(input.studioId, source.id, input.role);
    }
    return {
      source,
      sourceVersionId: existingByHash.version_id,
      blockCount: deps.sources.listBlocks(existingByHash.version_id).length,
      normalizedHash,
      deduped: true,
    };
  }

  const asset = deps.assets.storeBytes(
    Buffer.from(normalizedText, 'utf8'),
    mediaType,
    `${input.title}.txt`,
  );

  const kind = input.kind ?? 'text';
  const lifecycleStatus = input.lifecycleStatus ?? 'inbox';
  const source = deps.sources.createSource({
    kind,
    title: input.title,
    lifecycleStatus,
    processingStatus: 'queued',
    capturedAt: nowMs(),
    metadata: { importKind: kind },
  });

  deps.sources.createProvenance(source.id, kind === 'note' ? 'user_note' : 'paste', {
    metadata: { title: input.title },
  });

  const version = deps.sources.createSourceVersion({
    sourceId: source.id,
    assetHash: asset.sha256,
    mimeType: mediaType,
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    status: 'processing',
  });

  const normalizedPath = writeNormalizedArtifact(deps.derivedDir, version.id, normalizedText);
  const blocks = buildBlocksFromText(normalizedText, blockFormatForKind(input.kind));

  const pipeline = new IngestionPipeline({ db: deps.db, sources: deps.sources, jobs: deps.jobs });

  const result = await pipeline.run({
    sourceId: source.id,
    sourceVersionId: version.id,
    handlers: {
      acquire: async () => ({ outputHash: asset.sha256 }),
      extract: async () => ({
        outputHash: sha256Hex(normalizedText),
        extractedText: normalizedText,
      }),
      quality_check: async () => ({
        outputHash: normalizedHash,
        qualityScore: 1,
        needsAttention: false,
      }),
      normalize: async () => ({
        outputHash: normalizedHash,
        normalizedText,
        normalizedHash,
      }),
      structure: async () => ({ outputHash: sha256Hex(JSON.stringify(blocks.map((b) => b.kind))) }),
      block: async () => ({
        outputHash: sha256Hex(blocks.map((b) => b.contentHash).join(':')),
        blocks,
      }),
      index_lexical: async () => ({ outputHash: normalizedHash }),
      embed: async () => {
        if (!deps.jobs) {
          return { outputHash: 'no-job-queue' };
        }
        const jobId = enqueueEmbedJob(deps.jobs, source.id, version.id);
        return { outputHash: jobId, jobId };
      },
    },
  });

  if (result.finalStatus === 'failed') {
    throw new Error(
      `Text ingestion failed at ${result.failedStage ?? 'unknown'}: ${result.error ?? 'unknown error'}`,
    );
  }

  deps.sources.updateSourceVersion(version.id, {
    normalizedHash,
    normalizedPath,
    wordCount: countWords(normalizedText),
  });

  if (input.studioId && deps.studios) {
    deps.studios.assignSource(input.studioId, source.id, input.role);
  }

  const updatedSource = deps.sources.getSource(source.id);
  if (!updatedSource) throw new Error('Source missing after ingest');

  return {
    source: updatedSource,
    sourceVersionId: version.id,
    blockCount: blocks.length,
    normalizedHash,
    deduped: false,
  };
}
