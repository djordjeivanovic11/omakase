import fs from 'node:fs';
import path from 'node:path';
import type { ImportPdfSourceInput, Source } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import type { JobQueue } from '../jobs/queue.js';
import type { AssetStore } from '../storage/asset-store.js';
import { normalizeTextForHash, sha256Hex } from '../storage/hash.js';
import { nowMs } from '../storage/ids.js';
import type { StudiosRepo } from '../storage/studios-repo.js';
import { enqueueEmbedJob, IngestionPipeline } from './ingestion-pipeline.js';
import { extractPdfAtoms } from './pdf-atoms.js';
import { buildPdfPageBlocks, extractPdfFromBytes } from './pdf-extract.js';
import type { SourcesRepo } from './sources-repo.js';

const PARSER_ID = 'omakase-pdf';
const PARSER_VERSION = '1.0.0';

export interface PdfIngestDeps {
  db: Database.Database;
  assets: AssetStore;
  sources: SourcesRepo;
  studios?: StudiosRepo;
  jobs: JobQueue;
  derivedDir: string;
}

export interface PdfIngestResult {
  source: Source;
  sourceVersionId: string;
  blockCount: number;
  qualityScore: number;
  needsAttention: boolean;
  embedJobId: string;
  deduped: boolean;
}

function titleFromPath(filePath: string, override?: string): string {
  if (override) return override;
  return path.basename(filePath, path.extname(filePath)) || 'PDF document';
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

export async function importPdfSource(
  input: ImportPdfSourceInput,
  deps: PdfIngestDeps,
): Promise<PdfIngestResult> {
  if (!fs.existsSync(input.absolutePath)) {
    throw new Error(`PDF not found: ${input.absolutePath}`);
  }

  const bytes = fs.readFileSync(input.absolutePath);
  const asset = deps.assets.storeFile(
    input.absolutePath,
    'application/pdf',
    path.basename(input.absolutePath),
  );

  const existingByAsset = deps.db
    .prepare(
      `SELECT sv.id AS version_id, sv.source_id, sv.extraction_quality
       FROM source_versions sv
       JOIN sources s ON s.id = sv.source_id
       WHERE sv.asset_hash = ?
         AND sv.status IN ('ready', 'needs_attention')
         AND s.lifecycle_status <> 'deleted'
         AND s.deleted_at IS NULL
       ORDER BY sv.version_number DESC LIMIT 1`,
    )
    .get(asset.sha256) as
    | { version_id: string; source_id: string; extraction_quality: number | null }
    | undefined;

  if (existingByAsset) {
    const source = deps.sources.getSource(existingByAsset.source_id);
    if (!source) throw new Error('Existing PDF source missing');
    if (input.studioId && deps.studios) {
      deps.studios.assignSource(input.studioId, source.id, input.role);
    }
    const embedJobId = enqueueEmbedJob(deps.jobs, source.id, existingByAsset.version_id);
    return {
      source,
      sourceVersionId: existingByAsset.version_id,
      blockCount: deps.sources.listBlocks(existingByAsset.version_id).length,
      qualityScore: existingByAsset.extraction_quality ?? 0,
      needsAttention: source.processingStatus === 'needs_attention',
      embedJobId,
      deduped: true,
    };
  }

  const extraction = await extractPdfFromBytes(bytes);
  const mergedText = extraction.pages.map((p) => p.text).join('\n\n');
  const normalizedText = normalizeTextForHash(mergedText);
  const normalizedHash = sha256Hex(normalizedText);
  const blocks = buildPdfPageBlocks(extraction.pages);
  const title = titleFromPath(input.absolutePath, input.title);

  const source = deps.sources.createSource({
    kind: 'pdf',
    title,
    lifecycleStatus: input.lifecycleStatus,
    processingStatus: 'queued',
    capturedAt: nowMs(),
    metadata: { originalPath: input.absolutePath, pageCount: extraction.pageCount },
  });

  deps.sources.createProvenance(source.id, 'file_import', {
    metadata: { path: input.absolutePath, sha256: asset.sha256 },
  });

  const version = deps.sources.createSourceVersion({
    sourceId: source.id,
    assetHash: asset.sha256,
    mimeType: 'application/pdf',
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    pageCount: extraction.pageCount,
    extractionQuality: extraction.qualityScore,
    qualityDetails: extraction.qualityDetails as unknown as Record<string, unknown>,
    status: 'processing',
  });

  const normalizedPath = writeNormalizedArtifact(deps.derivedDir, version.id, normalizedText);
  const pipeline = new IngestionPipeline({ db: deps.db, sources: deps.sources, jobs: deps.jobs });

  let embedJobId = '';

  const result = await pipeline.run({
    sourceId: source.id,
    sourceVersionId: version.id,
    handlers: {
      acquire: async () => ({ outputHash: asset.sha256 }),
      extract: async () => ({
        outputHash: sha256Hex(mergedText),
        extractedText: mergedText,
        pageCount: extraction.pageCount,
      }),
      quality_check: async () => ({
        outputHash: sha256Hex(JSON.stringify(extraction.qualityDetails)),
        qualityScore: extraction.qualityScore,
        needsAttention: extraction.needsAttention,
      }),
      normalize: async () => ({
        outputHash: normalizedHash,
        normalizedText,
        normalizedHash,
      }),
      structure: async () => {
        const atoms = await extractPdfAtoms(bytes, version.id);
        return {
          outputHash: sha256Hex(
            JSON.stringify(
              atoms.map((atom) => [atom.pageNumber, atom.readingOrder, atom.text, atom.quads]),
            ),
          ),
          documentAtoms: atoms,
        };
      },
      block: async () => ({
        outputHash: sha256Hex(blocks.map((b) => b.contentHash).join(':')),
        blocks,
      }),
      index_lexical: async () => ({ outputHash: normalizedHash }),
      embed: async () => {
        embedJobId = enqueueEmbedJob(deps.jobs, source.id, version.id);
        return { outputHash: embedJobId, jobId: embedJobId };
      },
    },
  });

  if (result.finalStatus === 'failed') {
    throw new Error(
      `PDF ingestion failed at ${result.failedStage ?? 'unknown'}: ${result.error ?? 'unknown error'}`,
    );
  }

  deps.sources.updateSourceVersion(version.id, {
    normalizedHash,
    normalizedPath,
    pageCount: extraction.pageCount,
    wordCount: normalizedText.split(/\s+/).filter(Boolean).length,
    extractionQuality: extraction.qualityScore,
    qualityDetails: extraction.qualityDetails as unknown as Record<string, unknown>,
  });

  if (input.studioId && deps.studios) {
    deps.studios.assignSource(input.studioId, source.id, input.role);
  }

  const updatedSource = deps.sources.getSource(source.id);
  if (!updatedSource) throw new Error('Source missing after PDF ingest');

  return {
    source: updatedSource,
    sourceVersionId: version.id,
    blockCount: blocks.length,
    qualityScore: extraction.qualityScore,
    needsAttention: extraction.needsAttention,
    embedJobId,
    deduped: false,
  };
}
