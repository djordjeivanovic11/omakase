import type {
  LifecycleStatus,
  ProcessingStatus,
  Source,
  SourceBlock,
  SourceKind,
} from '@omakase/contracts';
import type Database from 'better-sqlite3';
import { newId, nowMs } from '../storage/ids.js';

export type SourceVersionStatus =
  | 'processing'
  | 'ready'
  | 'needs_attention'
  | 'failed'
  | 'superseded';

export type IngestionStageName =
  | 'acquire'
  | 'extract'
  | 'quality_check'
  | 'normalize'
  | 'structure'
  | 'block'
  | 'index_lexical'
  | 'embed';

export type IngestionStageStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface SourceVersion {
  id: string;
  sourceId: string;
  versionNumber: number;
  status: SourceVersionStatus;
  assetHash: string | null;
  normalizedHash: string | null;
  mimeType: string | null;
  normalizedPath: string | null;
  parserId: string;
  parserVersion: string;
  structureSchemaVersion: number;
  blockSchemaVersion: number;
  pageCount: number | null;
  durationMs: number | null;
  wordCount: number | null;
  extractionQuality: number | null;
  qualityDetails: Record<string, unknown>;
  acquiredAt: number | null;
  readyAt: number | null;
  createdAt: number;
}

export interface CreateSourceInput {
  kind: SourceKind;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  publisher?: string | null;
  canonicalUrl?: string | null;
  originalUrl?: string | null;
  language?: string | null;
  publishedAt?: number | null;
  lifecycleStatus?: LifecycleStatus;
  processingStatus?: ProcessingStatus;
  metadata?: Record<string, unknown>;
  capturedAt?: number | null;
}

export interface CreateSourceVersionInput {
  sourceId: string;
  assetHash?: string | null;
  normalizedHash?: string | null;
  mimeType?: string | null;
  normalizedPath?: string | null;
  parserId: string;
  parserVersion: string;
  pageCount?: number | null;
  durationMs?: number | null;
  wordCount?: number | null;
  extractionQuality?: number | null;
  qualityDetails?: Record<string, unknown>;
  status?: SourceVersionStatus;
}

export interface InsertBlockInput {
  publicId?: string;
  sourceVersionId: string;
  ordinal: number;
  kind: SourceBlock['kind'];
  text: string;
  headingPath: string[];
  headingPathText: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  timeStartMs?: number | null;
  timeEndMs?: number | null;
  charStart?: number | null;
  charEnd?: number | null;
  locator: SourceBlock['locator'];
  contentHash: string;
  tokenEstimate: number;
}

export interface IngestionStageRun {
  id: string;
  sourceVersionId: string;
  stage: IngestionStageName;
  stageVersion: string;
  status: IngestionStageStatus;
  attempt: number;
  inputHash: string | null;
  outputHash: string | null;
  jobId: string | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

function mapSource(row: Record<string, unknown>, activeVersionId?: string | null): Source {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata_json as string) as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  return {
    id: row.id as string,
    kind: row.kind as Source['kind'],
    title: row.title as string,
    subtitle: (row.subtitle as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    publisher: (row.publisher as string | null) ?? null,
    canonicalUrl: (row.canonical_url as string | null) ?? null,
    originalUrl: (row.original_url as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    publishedAt: (row.published_at as number | null) ?? null,
    lifecycleStatus: row.lifecycle_status as Source['lifecycleStatus'],
    processingStatus: row.processing_status as Source['processingStatus'],
    processingErrorCode: (row.processing_error_code as string | null) ?? null,
    processingError: (row.processing_error as string | null) ?? null,
    metadata,
    capturedAt: (row.captured_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    deletedAt: (row.deleted_at as number | null) ?? null,
    activeVersionId: activeVersionId ?? null,
  };
}

function mapSourceVersion(row: Record<string, unknown>): SourceVersion {
  let qualityDetails: Record<string, unknown> = {};
  try {
    qualityDetails = JSON.parse(row.quality_details_json as string) as Record<string, unknown>;
  } catch {
    qualityDetails = {};
  }
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    versionNumber: row.version_number as number,
    status: row.status as SourceVersionStatus,
    assetHash: (row.asset_hash as string | null) ?? null,
    normalizedHash: (row.normalized_hash as string | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    normalizedPath: (row.normalized_path as string | null) ?? null,
    parserId: row.parser_id as string,
    parserVersion: row.parser_version as string,
    structureSchemaVersion: row.structure_schema_version as number,
    blockSchemaVersion: row.block_schema_version as number,
    pageCount: (row.page_count as number | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    wordCount: (row.word_count as number | null) ?? null,
    extractionQuality: (row.extraction_quality as number | null) ?? null,
    qualityDetails,
    acquiredAt: (row.acquired_at as number | null) ?? null,
    readyAt: (row.ready_at as number | null) ?? null,
    createdAt: row.created_at as number,
  };
}

function mapSourceBlock(row: Record<string, unknown>): SourceBlock {
  return {
    id: row.id as number,
    publicId: row.public_id as string,
    sourceVersionId: row.source_version_id as string,
    ordinal: row.ordinal as number,
    kind: row.kind as SourceBlock['kind'],
    text: row.text as string,
    headingPath: JSON.parse(row.heading_path_json as string) as string[],
    headingPathText: row.heading_path_text as string,
    pageStart: (row.page_start as number | null) ?? null,
    pageEnd: (row.page_end as number | null) ?? null,
    timeStartMs: (row.time_start_ms as number | null) ?? null,
    timeEndMs: (row.time_end_ms as number | null) ?? null,
    locator: JSON.parse(row.locator_json as string) as SourceBlock['locator'],
    contentHash: row.content_hash as string,
    tokenEstimate: row.token_estimate as number,
  };
}

function mapStageRun(row: Record<string, unknown>): IngestionStageRun {
  return {
    id: row.id as string,
    sourceVersionId: row.source_version_id as string,
    stage: row.stage as IngestionStageName,
    stageVersion: row.stage_version as string,
    status: row.status as IngestionStageStatus,
    attempt: row.attempt as number,
    inputHash: (row.input_hash as string | null) ?? null,
    outputHash: (row.output_hash as string | null) ?? null,
    jobId: (row.job_id as string | null) ?? null,
    progress: row.progress as number,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    startedAt: (row.started_at as number | null) ?? null,
    completedAt: (row.completed_at as number | null) ?? null,
    createdAt: row.created_at as number,
  };
}

export class SourcesRepo {
  constructor(private readonly db: Database.Database) {}

  getSource(id: string): Source | null {
    const row = this.db
      .prepare('SELECT * FROM sources WHERE id = ? AND deleted_at IS NULL')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const active = this.db
      .prepare('SELECT source_version_id FROM source_active_versions WHERE source_id = ?')
      .get(id) as { source_version_id: string } | undefined;
    return mapSource(row, active?.source_version_id ?? null);
  }

  getSourceVersion(id: string): SourceVersion | null {
    const row = this.db.prepare('SELECT * FROM source_versions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapSourceVersion(row) : null;
  }

  findVersionByNormalizedHash(sourceId: string, normalizedHash: string): SourceVersion | null {
    const row = this.db
      .prepare('SELECT * FROM source_versions WHERE source_id = ? AND normalized_hash = ?')
      .get(sourceId, normalizedHash) as Record<string, unknown> | undefined;
    return row ? mapSourceVersion(row) : null;
  }

  findSourceByCanonicalUrl(canonicalUrl: string): Source | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sources WHERE canonical_url = ? AND lifecycle_status <> 'deleted' LIMIT 1`,
      )
      .get(canonicalUrl) as Record<string, unknown> | undefined;
    if (!row) return null;
    const active = this.db
      .prepare('SELECT source_version_id FROM source_active_versions WHERE source_id = ?')
      .get(row.id) as { source_version_id: string } | undefined;
    return mapSource(row, active?.source_version_id ?? null);
  }

  createSource(input: CreateSourceInput): Source {
    const id = newId();
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO sources (
          id, kind, title, subtitle, author, publisher, canonical_url, original_url,
          language, published_at, lifecycle_status, processing_status, metadata_json,
          captured_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.kind,
        input.title,
        input.subtitle ?? null,
        input.author ?? null,
        input.publisher ?? null,
        input.canonicalUrl ?? null,
        input.originalUrl ?? null,
        input.language ?? null,
        input.publishedAt ?? null,
        input.lifecycleStatus ?? 'inbox',
        input.processingStatus ?? 'queued',
        JSON.stringify(input.metadata ?? {}),
        input.capturedAt ?? null,
        ts,
        ts,
      );
    const source = this.getSource(id);
    if (!source) throw new Error('Failed to create source');
    return source;
  }

  updateSourceProcessingStatus(
    sourceId: string,
    status: ProcessingStatus,
    error?: { code?: string; message?: string },
  ): void {
    const ts = nowMs();
    this.db
      .prepare(
        `UPDATE sources SET
          processing_status = ?,
          processing_error_code = ?,
          processing_error = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(status, error?.code ?? null, error?.message ?? null, ts, sourceId);
  }

  nextVersionNumber(sourceId: string): number {
    const row = this.db
      .prepare(
        'SELECT COALESCE(MAX(version_number), 0) AS max_version FROM source_versions WHERE source_id = ?',
      )
      .get(sourceId) as { max_version: number };
    return row.max_version + 1;
  }

  createSourceVersion(input: CreateSourceVersionInput): SourceVersion {
    const id = newId();
    const ts = nowMs();
    const versionNumber = this.nextVersionNumber(input.sourceId);
    this.db
      .prepare(
        `INSERT INTO source_versions (
          id, source_id, version_number, status, asset_hash, normalized_hash, mime_type,
          normalized_path, parser_id, parser_version, page_count, duration_ms, word_count,
          extraction_quality, quality_details_json, acquired_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.sourceId,
        versionNumber,
        input.status ?? 'processing',
        input.assetHash ?? null,
        input.normalizedHash ?? null,
        input.mimeType ?? null,
        input.normalizedPath ?? null,
        input.parserId,
        input.parserVersion,
        input.pageCount ?? null,
        input.durationMs ?? null,
        input.wordCount ?? null,
        input.extractionQuality ?? null,
        JSON.stringify(input.qualityDetails ?? {}),
        ts,
        ts,
      );
    const version = this.getSourceVersion(id);
    if (!version) throw new Error('Failed to create source version');
    return version;
  }

  updateSourceVersion(
    versionId: string,
    patch: Partial<
      Pick<
        SourceVersion,
        | 'status'
        | 'normalizedHash'
        | 'normalizedPath'
        | 'pageCount'
        | 'durationMs'
        | 'wordCount'
        | 'extractionQuality'
        | 'qualityDetails'
        | 'readyAt'
      >
    >,
  ): SourceVersion {
    const existing = this.getSourceVersion(versionId);
    if (!existing) throw new Error('Source version not found');

    this.db
      .prepare(
        `UPDATE source_versions SET
          status = ?,
          normalized_hash = ?,
          normalized_path = ?,
          page_count = ?,
          duration_ms = ?,
          word_count = ?,
          extraction_quality = ?,
          quality_details_json = ?,
          ready_at = ?
        WHERE id = ?`,
      )
      .run(
        patch.status ?? existing.status,
        patch.normalizedHash !== undefined ? patch.normalizedHash : existing.normalizedHash,
        patch.normalizedPath !== undefined ? patch.normalizedPath : existing.normalizedPath,
        patch.pageCount !== undefined ? patch.pageCount : existing.pageCount,
        patch.durationMs !== undefined ? patch.durationMs : existing.durationMs,
        patch.wordCount !== undefined ? patch.wordCount : existing.wordCount,
        patch.extractionQuality !== undefined
          ? patch.extractionQuality
          : existing.extractionQuality,
        JSON.stringify(patch.qualityDetails ?? existing.qualityDetails),
        patch.readyAt !== undefined ? patch.readyAt : existing.readyAt,
        versionId,
      );

    const updated = this.getSourceVersion(versionId);
    if (!updated) throw new Error('Source version missing after update');
    return updated;
  }

  setActiveVersion(sourceId: string, sourceVersionId: string): void {
    const version = this.getSourceVersion(sourceVersionId);
    if (!version || version.sourceId !== sourceId) {
      throw new Error('Active version must belong to source');
    }
    if (version.status !== 'ready' && version.status !== 'needs_attention') {
      throw new Error('Active version must be ready or needs_attention');
    }
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO source_active_versions (source_id, source_version_id, selected_at)
         VALUES (?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           source_version_id = excluded.source_version_id,
           selected_at = excluded.selected_at`,
      )
      .run(sourceId, sourceVersionId, ts);
  }

  deleteBlocksForVersion(sourceVersionId: string): void {
    this.db.prepare('DELETE FROM source_blocks WHERE source_version_id = ?').run(sourceVersionId);
  }

  insertBlocks(blocks: InsertBlockInput[]): SourceBlock[] {
    if (blocks.length === 0) return [];
    const ts = nowMs();
    const insert = this.db.prepare(
      `INSERT INTO source_blocks (
        public_id, source_version_id, ordinal, kind, text, heading_path_json, heading_path_text,
        page_start, page_end, time_start_ms, time_end_ms, char_start, char_end,
        locator_json, content_hash, token_estimate, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const inserted: SourceBlock[] = [];
    const tx = this.db.transaction((items: InsertBlockInput[]) => {
      for (const block of items) {
        const publicId = block.publicId ?? newId();
        const result = insert.run(
          publicId,
          block.sourceVersionId,
          block.ordinal,
          block.kind,
          block.text,
          JSON.stringify(block.headingPath),
          block.headingPathText,
          block.pageStart ?? null,
          block.pageEnd ?? null,
          block.timeStartMs ?? null,
          block.timeEndMs ?? null,
          block.charStart ?? null,
          block.charEnd ?? null,
          JSON.stringify(block.locator),
          block.contentHash,
          block.tokenEstimate,
          ts,
        );
        const row = this.db
          .prepare('SELECT * FROM source_blocks WHERE id = ?')
          .get(result.lastInsertRowid) as Record<string, unknown>;
        inserted.push(mapSourceBlock(row));
      }
    });
    tx(blocks);
    return inserted;
  }

  listBlocks(sourceVersionId: string): SourceBlock[] {
    const rows = this.db
      .prepare('SELECT * FROM source_blocks WHERE source_version_id = ? ORDER BY ordinal ASC')
      .all(sourceVersionId) as Record<string, unknown>[];
    return rows.map(mapSourceBlock);
  }

  countFtsRows(sourceVersionId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM source_blocks_fts WHERE source_version_id = ?')
      .get(sourceVersionId) as { count: number };
    return row.count;
  }

  createProvenance(
    sourceId: string,
    provenanceType: string,
    opts?: {
      originatingUrl?: string | null;
      referringSourceId?: string | null;
      metadata?: Record<string, unknown>;
      capturedAt?: number;
    },
  ): string {
    const id = newId();
    const ts = opts?.capturedAt ?? nowMs();
    this.db
      .prepare(
        `INSERT INTO source_provenance (
          id, source_id, provenance_type, originating_url, referring_source_id, metadata_json, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        sourceId,
        provenanceType,
        opts?.originatingUrl ?? null,
        opts?.referringSourceId ?? null,
        JSON.stringify(opts?.metadata ?? {}),
        ts,
      );
    return id;
  }

  getStageRun(
    sourceVersionId: string,
    stage: IngestionStageName,
    stageVersion: string,
  ): IngestionStageRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM ingestion_stage_runs
         WHERE source_version_id = ? AND stage = ? AND stage_version = ?
         ORDER BY attempt DESC LIMIT 1`,
      )
      .get(sourceVersionId, stage, stageVersion) as Record<string, unknown> | undefined;
    return row ? mapStageRun(row) : null;
  }

  listStageRuns(sourceVersionId: string): IngestionStageRun[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ingestion_stage_runs
         WHERE source_version_id = ?
         ORDER BY created_at ASC, attempt ASC`,
      )
      .all(sourceVersionId) as Record<string, unknown>[];
    return rows.map(mapStageRun);
  }

  startStageRun(
    sourceVersionId: string,
    stage: IngestionStageName,
    stageVersion: string,
    inputHash?: string | null,
  ): IngestionStageRun {
    const existing = this.getStageRun(sourceVersionId, stage, stageVersion);
    if (existing?.status === 'succeeded') {
      return existing;
    }
    const attempt = existing ? existing.attempt + 1 : 1;
    const id = newId();
    const ts = nowMs();
    this.db
      .prepare(
        `INSERT INTO ingestion_stage_runs (
          id, source_version_id, stage, stage_version, status, attempt,
          input_hash, progress, started_at, created_at
        ) VALUES (?, ?, ?, ?, 'running', ?, ?, 0, ?, ?)`,
      )
      .run(id, sourceVersionId, stage, stageVersion, attempt, inputHash ?? null, ts, ts);
    const run = this.db.prepare('SELECT * FROM ingestion_stage_runs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!run) throw new Error('Failed to start stage run');
    return mapStageRun(run);
  }

  completeStageRun(runId: string, outputHash?: string | null, jobId?: string | null): void {
    const ts = nowMs();
    this.db
      .prepare(
        `UPDATE ingestion_stage_runs SET
          status = 'succeeded',
          output_hash = ?,
          job_id = ?,
          progress = 1,
          completed_at = ?
        WHERE id = ?`,
      )
      .run(outputHash ?? null, jobId ?? null, ts, runId);
  }

  failStageRun(runId: string, errorCode: string, errorMessage: string): void {
    const ts = nowMs();
    this.db
      .prepare(
        `UPDATE ingestion_stage_runs SET
          status = 'failed',
          error_code = ?,
          error_message = ?,
          completed_at = ?
        WHERE id = ?`,
      )
      .run(errorCode, errorMessage, ts, runId);
  }
}
