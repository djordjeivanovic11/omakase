import fs from 'node:fs';
import path from 'node:path';
import type { ImportTranscriptSourceInput, Source } from '@omakase/contracts';
import { normalizeTextForHash, sha256Hex } from '../storage/hash.js';
import { nowMs } from '../storage/ids.js';
import { buildBlocksFromTranscriptSegments } from './block-builder.js';
import { enqueueEmbedJob, IngestionPipeline } from './ingestion-pipeline.js';
import type { TextIngestDeps } from './text-ingest.js';
import { detectTranscriptFormat, parseTranscript } from './transcript-parse.js';

const PARSER_ID = 'omakase-transcript';
const PARSER_VERSION = '1.0.0';
const MAX_TRANSCRIPT_BYTES = 20_000_000;

export interface TranscriptIngestResult {
  source: Source;
  sourceVersionId: string;
  blockCount: number;
  segmentCount: number;
  hasTimestamps: boolean;
  deduped: boolean;
}

function readTranscript(input: ImportTranscriptSourceInput): { content: string; title: string } {
  if (input.text !== undefined) {
    return { content: input.text, title: input.title ?? 'Pasted transcript' };
  }
  if (!input.absolutePath) {
    throw new Error('A transcript needs either a file or pasted text.');
  }

  const stats = fs.statSync(input.absolutePath);
  if (!stats.isFile()) {
    throw new Error('Transcript path is not a file.');
  }
  if (stats.size > MAX_TRANSCRIPT_BYTES) {
    throw new Error('Transcript file is too large to import.');
  }

  return {
    content: fs.readFileSync(input.absolutePath, 'utf8'),
    title: input.title ?? path.basename(input.absolutePath, path.extname(input.absolutePath)),
  };
}

/**
 * Transcripts keep their timings so citations can point at a moment in the
 * recording rather than an offset in a wall of text.
 */
export async function importTranscriptSource(
  input: ImportTranscriptSourceInput,
  deps: TextIngestDeps,
): Promise<TranscriptIngestResult> {
  const { content, title } = readTranscript(input);
  const format = detectTranscriptFormat(content);
  const segments = parseTranscript(content, format);

  if (segments.length === 0) {
    throw new Error('No transcript text could be read from this file.');
  }

  const normalizedText = normalizeTextForHash(segments.map((s) => s.text).join('\n'));
  const normalizedHash = sha256Hex(normalizedText);

  const existing = deps.db
    .prepare(
      `SELECT sv.id AS version_id, sv.source_id
       FROM source_versions sv
       JOIN sources s ON s.id = sv.source_id
       WHERE sv.normalized_hash = ? AND s.lifecycle_status <> 'deleted'
       LIMIT 1`,
    )
    .get(normalizedHash) as { version_id: string; source_id: string } | undefined;

  if (existing) {
    const source = deps.sources.getSource(existing.source_id);
    if (!source) throw new Error('Existing source missing');
    if (input.studioId && deps.studios) {
      deps.studios.assignSource(input.studioId, source.id, input.role);
    }
    return {
      source,
      sourceVersionId: existing.version_id,
      blockCount: deps.sources.listBlocks(existing.version_id).length,
      segmentCount: segments.length,
      hasTimestamps: segments.some((s) => s.endMs > 0),
      deduped: true,
    };
  }

  const asset = deps.assets.storeBytes(Buffer.from(content, 'utf8'), 'text/vtt', `${title}.vtt`);

  const source = deps.sources.createSource({
    kind: 'transcript',
    title,
    lifecycleStatus: input.lifecycleStatus ?? 'inbox',
    processingStatus: 'queued',
    capturedAt: nowMs(),
    metadata: { transcriptFormat: format, segmentCount: segments.length },
  });

  deps.sources.createProvenance(source.id, 'file_import', {
    metadata: { title, format },
  });

  const version = deps.sources.createSourceVersion({
    sourceId: source.id,
    assetHash: asset.sha256,
    mimeType: 'text/vtt',
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    status: 'processing',
  });

  const relativePath = path.join(version.id.slice(0, 2), version.id, 'normalized.md');
  const normalizedAbsolute = path.join(deps.derivedDir, relativePath);
  fs.mkdirSync(path.dirname(normalizedAbsolute), { recursive: true });
  fs.writeFileSync(normalizedAbsolute, normalizedText, 'utf8');

  const blocks = buildBlocksFromTranscriptSegments(segments);
  const pipeline = new IngestionPipeline({ db: deps.db, sources: deps.sources, jobs: deps.jobs });

  const result = await pipeline.run({
    sourceId: source.id,
    sourceVersionId: version.id,
    handlers: {
      acquire: async () => ({ outputHash: asset.sha256 }),
      extract: async () => ({ outputHash: normalizedHash, extractedText: normalizedText }),
      quality_check: async () => ({
        outputHash: normalizedHash,
        qualityScore: 1,
        needsAttention: false,
      }),
      normalize: async () => ({ outputHash: normalizedHash, normalizedText, normalizedHash }),
      structure: async () => ({ outputHash: sha256Hex(String(segments.length)) }),
      block: async () => ({
        outputHash: sha256Hex(blocks.map((b) => b.contentHash).join(':')),
        blocks,
      }),
      index_lexical: async () => ({ outputHash: normalizedHash }),
      embed: async () => {
        if (!deps.jobs) return { outputHash: 'no-job-queue' };
        const jobId = enqueueEmbedJob(deps.jobs, source.id, version.id);
        return { outputHash: jobId, jobId };
      },
    },
  });

  if (result.finalStatus === 'failed') {
    throw new Error('Transcript ingestion failed');
  }

  deps.sources.updateSourceVersion(version.id, {
    normalizedHash,
    normalizedPath: relativePath,
    wordCount: normalizedText.split(/\s+/).filter(Boolean).length,
  });

  if (input.studioId && deps.studios) {
    deps.studios.assignSource(input.studioId, source.id, input.role);
  }

  const updated = deps.sources.getSource(source.id);
  if (!updated) throw new Error('Source missing after ingest');

  return {
    source: updated,
    sourceVersionId: version.id,
    blockCount: blocks.length,
    segmentCount: segments.length,
    hasTimestamps: blocks.some((b) => b.timeStartMs !== null),
    deduped: false,
  };
}
