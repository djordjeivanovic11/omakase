import fs from 'node:fs';
import path from 'node:path';
import type { BrowserCapturePayload, Source } from '@omakase/contracts';
import type Database from 'better-sqlite3';
import type { JobQueue } from '../jobs/queue.js';
import { validateHttpUrl } from '../security/url-policy.js';
import type { AssetStore } from '../storage/asset-store.js';
import { normalizeTextForHash, sha256Hex } from '../storage/hash.js';
import { nowMs } from '../storage/ids.js';
import type { StudiosRepo } from '../storage/studios-repo.js';
import { buildBlocksFromMarkdown } from './block-builder.js';
import { enqueueEmbedJob, IngestionPipeline } from './ingestion-pipeline.js';
import type { SourcesRepo } from './sources-repo.js';

const PARSER_ID = 'omakase-web';
const PARSER_VERSION = '1.0.0';

function requireHttpUrl(raw: string): string {
  const result = validateHttpUrl(raw);
  if (!result.ok || !result.url) throw new Error(result.reason ?? 'invalid_url');
  return result.url.toString();
}

export interface WebIngestDeps {
  db: Database.Database;
  assets: AssetStore;
  sources: SourcesRepo;
  studios?: StudiosRepo;
  jobs?: JobQueue;
  derivedDir: string;
}

export interface WebIngestResult {
  source: Source;
  sourceVersionId: string;
  blockCount: number;
  normalizedHash: string;
  deduped: boolean;
}

export function sanitizeWebMarkdown(markdown: string): string {
  let cleaned = markdown.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  cleaned = cleaned.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return cleaned.trim();
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

interface IngestWebMarkdownOpts {
  title: string;
  canonicalUrl: string;
  originalUrl?: string;
  author?: string;
  publishedAt?: number;
  markdown: string;
  studioId?: string;
  provenanceType: 'browser_capture' | 'direct_fetch';
  metadata?: Record<string, unknown>;
}

async function ingestWebMarkdown(
  deps: WebIngestDeps,
  opts: IngestWebMarkdownOpts,
): Promise<WebIngestResult> {
  const canonicalUrl = requireHttpUrl(opts.canonicalUrl);
  const originalUrl = requireHttpUrl(opts.originalUrl ?? canonicalUrl);
  const sanitized = sanitizeWebMarkdown(opts.markdown);
  const normalizedText = normalizeTextForHash(sanitized);
  const normalizedHash = sha256Hex(normalizedText);

  const existing = deps.sources.findSourceByCanonicalUrl(canonicalUrl);
  if (existing?.activeVersionId) {
    const version = deps.sources.getSourceVersion(existing.activeVersionId);
    if (version?.normalizedHash === normalizedHash) {
      if (opts.studioId && deps.studios) {
        deps.studios.assignSource(opts.studioId, existing.id);
      }
      return {
        source: existing,
        sourceVersionId: existing.activeVersionId,
        blockCount: deps.sources.listBlocks(existing.activeVersionId).length,
        normalizedHash,
        deduped: true,
      };
    }
  }

  const globalDup = deps.db
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

  if (globalDup) {
    const source = deps.sources.getSource(globalDup.source_id);
    if (!source) throw new Error('Existing web source missing');
    if (opts.studioId && deps.studios) {
      deps.studios.assignSource(opts.studioId, source.id);
    }
    return {
      source,
      sourceVersionId: globalDup.version_id,
      blockCount: deps.sources.listBlocks(globalDup.version_id).length,
      normalizedHash,
      deduped: true,
    };
  }

  const asset = deps.assets.storeBytes(
    Buffer.from(sanitized, 'utf8'),
    'text/markdown',
    `${opts.title}.md`,
  );
  const blocks = buildBlocksFromMarkdown(sanitized);

  const source = deps.sources.createSource({
    kind: 'web',
    title: opts.title,
    author: opts.author ?? null,
    canonicalUrl,
    originalUrl,
    publishedAt: opts.publishedAt ?? null,
    lifecycleStatus: opts.studioId ? 'active' : 'inbox',
    processingStatus: 'queued',
    capturedAt: nowMs(),
    metadata: opts.metadata ?? {},
  });

  deps.sources.createProvenance(source.id, opts.provenanceType, {
    originatingUrl: canonicalUrl,
    metadata: opts.metadata ?? {},
  });

  const version = deps.sources.createSourceVersion({
    sourceId: source.id,
    assetHash: asset.sha256,
    mimeType: 'text/markdown',
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    status: 'processing',
  });

  const normalizedPath = writeNormalizedArtifact(deps.derivedDir, version.id, normalizedText);
  const pipeline = new IngestionPipeline({ db: deps.db, sources: deps.sources, jobs: deps.jobs });

  const result = await pipeline.run({
    sourceId: source.id,
    sourceVersionId: version.id,
    handlers: {
      acquire: async () => ({ outputHash: asset.sha256 }),
      extract: async () => ({ outputHash: sha256Hex(sanitized), extractedText: sanitized }),
      quality_check: async () => ({
        outputHash: normalizedHash,
        qualityScore: 1,
        needsAttention: false,
      }),
      normalize: async () => ({ outputHash: normalizedHash, normalizedText, normalizedHash }),
      structure: async () => ({ outputHash: sha256Hex(JSON.stringify(blocks.map((b) => b.kind))) }),
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
    throw new Error('Web ingestion failed');
  }

  deps.sources.updateSourceVersion(version.id, {
    normalizedHash,
    normalizedPath,
    wordCount: normalizedText.split(/\s+/).filter(Boolean).length,
  });

  if (opts.studioId && deps.studios) {
    deps.studios.assignSource(opts.studioId, source.id);
  }

  const updatedSource = deps.sources.getSource(source.id);
  if (!updatedSource) throw new Error('Source missing after web ingest');

  return {
    source: updatedSource,
    sourceVersionId: version.id,
    blockCount: blocks.length,
    normalizedHash,
    deduped: false,
  };
}

export async function importBrowserCapture(
  payload: BrowserCapturePayload,
  deps: WebIngestDeps,
): Promise<WebIngestResult> {
  const canonicalUrl = requireHttpUrl(payload.finalUrl ?? payload.url);
  const originalUrl = requireHttpUrl(payload.url);
  return ingestWebMarkdown(deps, {
    title: payload.title,
    canonicalUrl,
    originalUrl,
    author: payload.author,
    publishedAt: payload.publishedAt,
    markdown: payload.markdown,
    studioId: payload.studioId,
    provenanceType: 'browser_capture',
    metadata: {
      externalRequestId: payload.externalRequestId,
      selection: payload.selection ?? null,
      userNote: payload.userNote ?? null,
      contentHash: payload.contentHash ?? null,
    },
  });
}

export async function importUrlMarkdown(
  url: string,
  markdown: string,
  deps: WebIngestDeps,
  opts?: { title?: string; studioId?: string },
): Promise<WebIngestResult> {
  const safeUrl = requireHttpUrl(url);
  return ingestWebMarkdown(deps, {
    title: opts?.title ?? safeUrl,
    canonicalUrl: safeUrl,
    originalUrl: safeUrl,
    markdown,
    studioId: opts?.studioId,
    provenanceType: 'direct_fetch',
    metadata: { fetchUrl: safeUrl },
  });
}
