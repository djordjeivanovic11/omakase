import fs from 'node:fs';
import path from 'node:path';
import {
  type AgentStreamEvent,
  AnswerProbeInputSchema,
  AssignSourceToStudioInputSchema,
  type ConceptState,
  CreateProviderProfileInputSchema,
  CreateStudioInputSchema,
  ImportPdfSourceInputSchema,
  ImportTextSourceInputSchema,
  ImportTranscriptSourceInputSchema,
  ImportUrlSourceInputSchema,
  IpcChannels,
  type NextAction,
  type ProviderProfile,
  SendAgentMessageInputSchema,
  type Source,
  StartLearnSessionInputSchema,
  StartProbeInputSchema,
  type TodayView,
  UpdateStudioInputSchema,
  UuidV7Schema,
} from '@omakase/contracts';
import { Defuddle } from 'defuddle/node';
import { app, dialog, type IpcMainInvokeEvent, ipcMain, shell, type WebContents } from 'electron';
import { ZodError } from 'zod';
import { createBackup } from '../core/backup/backup.js';
import { isBackupBundle } from '../core/backup/bundle.js';
import { buildDiagnosticsPreview, exportDiagnosticsBundle } from '../core/backup/diagnostics.js';
import { restoreBackup } from '../core/backup/restore.js';
import { exportStudioBundle } from '../core/backup/studio-export.js';
import { LearningEventsRepo } from '../core/learning/events.js';
import { projectConceptStateForStudio } from '../core/learning/projector.js';
import { getLogger } from '../core/observability/logger.js';
import { testProviderConnection } from '../core/providers/connection-test.js';
import { redactSecrets } from '../core/security/redact.js';
import { FETCH_LIMITS, validateHttpUrl } from '../core/security/url-policy.js';
import { importPdfSource } from '../core/sources/pdf-ingest.js';
import { importTextSource } from '../core/sources/text-ingest.js';
import { importTranscriptSource } from '../core/sources/transcript-ingest.js';
import { importUrlMarkdown } from '../core/sources/web-ingest.js';
import { integrityCheck } from '../core/storage/database.js';
import { nowMs } from '../core/storage/ids.js';
import type { AppContext } from './app-context.js';
import { listRegisteredExtensionIds, registerExtensionId } from './native-host.js';
import { getMainWindow, openValidatedExternal } from './window.js';

const cancelledSessions = new Set<string>();
const activeStreams = new Map<string, AbortController>();

const log = getLogger().child('ipc');

/**
 * Errors cross the process boundary into the renderer, so they must carry a
 * usable explanation without echoing source text, file contents, or keys.
 */
function toUserFacingError(channel: string, error: unknown): Error {
  if (error instanceof ZodError) {
    return new Error(`That request was not valid (${channel}).`);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Error(redactSecrets(message).slice(0, 400));
}

type IpcHandler = (event: IpcMainInvokeEvent, raw: unknown) => unknown;

/** Register an IPC handler with sender validation, logging, and error scrubbing. */
function handle(channel: string, fn: IpcHandler): void {
  ipcMain.handle(channel, async (event, raw) => {
    const started = Date.now();
    try {
      return await fn(event, raw);
    } catch (error) {
      log.error('IPC handler failed', { channel, err: error, ms: Date.now() - started });
      throw toUserFacingError(channel, error);
    }
  });
}

function validateSender(event: IpcMainInvokeEvent): WebContents {
  const wc = event.sender;
  const url = wc.getURL();
  if (url.startsWith('devtools://')) {
    throw new Error('IPC rejected from DevTools');
  }
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) {
    return wc;
  }
  if (url.startsWith('file://')) {
    return wc;
  }
  throw new Error(`IPC rejected from untrusted frame: ${url}`);
}

function sendAgentEvent(wc: WebContents, event: AgentStreamEvent): void {
  wc.send(IpcChannels.agentStreamEvent, event);
}

function mapNextAction(row: Record<string, unknown>): NextAction {
  const studioId = (row.studio_id as string | null) ?? null;
  let studioName: string | null = null;
  if (studioId) {
    const studioRow = row.studio_name as string | undefined;
    studioName = studioRow ?? null;
  }
  return {
    id: row.id as string,
    studioId,
    studioName,
    actionType: row.action_type as NextAction['actionType'],
    sourceId: (row.source_id as string | null) ?? null,
    sourceBlockId: (row.source_block_id as number | null) ?? null,
    conceptId: (row.concept_id as string | null) ?? null,
    title: row.title as string,
    rationale: row.rationale as string,
    priority: row.priority as number,
    isPrimary: (row.is_primary as number) === 1,
    status: row.status as NextAction['status'],
    dueAt: (row.due_at as number | null) ?? null,
    createdAt: row.created_at as number,
  };
}

function getTodayView(ctx: AppContext): TodayView {
  const primaryRow = ctx.db.db
    .prepare(
      `SELECT na.*, s.name AS studio_name
       FROM next_actions na
       LEFT JOIN studios s ON s.id = na.studio_id
       WHERE na.is_primary = 1 AND na.status = 'active'
       ORDER BY na.priority DESC, na.created_at DESC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;

  const secondaryRows = ctx.db.db
    .prepare(
      `SELECT na.*, s.name AS studio_name
       FROM next_actions na
       LEFT JOIN studios s ON s.id = na.studio_id
       WHERE na.status = 'active' AND (na.is_primary = 0 OR na.is_primary IS NULL)
       ORDER BY na.priority DESC, na.created_at DESC
       LIMIT 2`,
    )
    .all() as Record<string, unknown>[];

  return {
    primary: primaryRow ? mapNextAction(primaryRow) : null,
    secondary: secondaryRows.map(mapNextAction),
  };
}

function listInboxSources(ctx: AppContext): Source[] {
  const rows = ctx.db.db
    .prepare(
      `SELECT s.*, sav.source_version_id AS active_version_id
       FROM sources s
       LEFT JOIN source_active_versions sav ON sav.source_id = s.id
       WHERE s.lifecycle_status = 'inbox' AND s.deleted_at IS NULL
       ORDER BY s.updated_at DESC`,
    )
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
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
    metadata: JSON.parse(row.metadata_json as string) as Record<string, unknown>,
    capturedAt: (row.captured_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    deletedAt: (row.deleted_at as number | null) ?? null,
    activeVersionId: (row.active_version_id as string | null) ?? null,
  }));
}

function listStudioSources(ctx: AppContext, studioId: string): Source[] {
  const rows = ctx.db.db
    .prepare(
      `SELECT s.*, sav.source_version_id AS active_version_id, ss.role
       FROM studio_sources ss
       JOIN sources s ON s.id = ss.source_id
       LEFT JOIN source_active_versions sav ON sav.source_id = s.id
       WHERE ss.studio_id = ? AND s.deleted_at IS NULL
       ORDER BY ss.position ASC, ss.added_at DESC`,
    )
    .all(studioId) as Record<string, unknown>[];

  return rows.map((row) => ({
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
    metadata: JSON.parse(row.metadata_json as string) as Record<string, unknown>,
    capturedAt: (row.captured_at as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    deletedAt: (row.deleted_at as number | null) ?? null,
    activeVersionId: (row.active_version_id as string | null) ?? null,
  }));
}

async function fetchUrlMarkdown(url: string): Promise<{ title: string; markdown: string }> {
  const validated = validateHttpUrl(url);
  if (!validated.ok || !validated.url) {
    throw new Error(validated.reason ?? 'invalid_url');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_LIMITS.timeoutMs);
  try {
    const response = await fetch(validated.url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`fetch_failed:${response.status}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    const html = await response.text();
    if (contentType.includes('text/markdown') || url.endsWith('.md')) {
      return { title: validated.url.hostname, markdown: html };
    }
    const result = await Defuddle(html, validated.url.toString());
    return {
      title: result.title ?? validated.url.hostname,
      markdown: result.content ?? html,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function textIngestDeps(ctx: AppContext) {
  return {
    db: ctx.db.db,
    assets: ctx.assets,
    sources: ctx.sources,
    studios: ctx.studios,
    jobs: ctx.jobs,
    derivedDir: ctx.paths.derivedDir,
  };
}

function getDialogParent(): Electron.BrowserWindow | undefined {
  return getMainWindow() ?? undefined;
}

async function showOpenFiles(options: Electron.OpenDialogOptions) {
  const parent = getDialogParent();
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

async function showSaveFile(options: Electron.SaveDialogOptions) {
  const parent = getDialogParent();
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

export function registerIpcHandlers(ctx: AppContext): void {
  handle(IpcChannels.appGetInfo, () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      schemaOk: integrityCheck(ctx.db.db) === 'ok',
      packaged: app.isPackaged,
      mockProviderEnabled: process.env.OMAKASE_MOCK_PROVIDER === '1' && !app.isPackaged,
      devDiag: process.env.OMAKASE_DEV_DIAG === '1' || !app.isPackaged,
    };
  });

  handle(IpcChannels.appGetOnboardingState, () => {
    const row = ctx.db.db
      .prepare('SELECT onboarding_completed FROM learner_profile WHERE id = ?')
      .get('local-user') as { onboarding_completed: number } | undefined;
    const providers = ctx.providers.listProfiles().filter((p) => p.enabled);
    const studios = ctx.studios.list();
    return {
      completed: row?.onboarding_completed === 1,
      hasProvider: providers.length > 0,
      hasStudio: studios.length > 0,
    };
  });

  handle(IpcChannels.appCompleteOnboarding, () => {
    ctx.db.db
      .prepare('UPDATE learner_profile SET onboarding_completed = 1, updated_at = ? WHERE id = ?')
      .run(nowMs(), 'local-user');
    return { ok: true };
  });

  handle(IpcChannels.providersList, () => {
    return ctx.providers.listProfiles();
  });

  handle(IpcChannels.providersCreate, (_event, raw) => {
    const input = CreateProviderProfileInputSchema.parse(raw);
    return ctx.providers.createProfile(input);
  });

  handle(IpcChannels.providersTest, async (_event, raw) => {
    const { profileId, modelId } = raw as { profileId: string; modelId?: string };
    return testProviderConnection(
      ctx.db.db,
      ctx.secretStore,
      UuidV7Schema.parse(profileId),
      modelId,
    );
  });

  handle(IpcChannels.providersSetDefaultModel, (_event, raw) => {
    const { profileId, modelId } = raw as { profileId: string; modelId: string };
    return ctx.providers.updateProfile(UuidV7Schema.parse(profileId), { defaultModelId: modelId });
  });

  handle(IpcChannels.providersDelete, (_event, raw) => {
    const profileId = UuidV7Schema.parse(raw);
    ctx.providers.deleteProfile(profileId);
    return { ok: true };
  });

  handle(IpcChannels.providersListModels, (_event, raw) => {
    const profileId = UuidV7Schema.parse(raw);
    return ctx.providers.listModels(profileId);
  });

  handle(IpcChannels.studiosList, () => {
    return ctx.studios.list();
  });

  handle(IpcChannels.studiosGet, (_event, raw) => {
    const id = UuidV7Schema.parse(raw);
    const studio = ctx.studios.get(id);
    if (!studio) return null;
    return { studio, sources: listStudioSources(ctx, id) };
  });

  handle(IpcChannels.studiosCreate, (_event, raw) => {
    return ctx.studios.create(CreateStudioInputSchema.parse(raw));
  });

  handle(IpcChannels.studiosUpdate, (_event, raw) => {
    return ctx.studios.update(UpdateStudioInputSchema.parse(raw));
  });

  handle(IpcChannels.studiosDelete, (_event, raw) => {
    const id = UuidV7Schema.parse(raw);
    ctx.studios.update({ id, status: 'archived' });
    return { ok: true };
  });

  handle(IpcChannels.studiosAssignSource, (_event, raw) => {
    const input = AssignSourceToStudioInputSchema.parse(raw);
    ctx.studios.assignSource(input.studioId, input.sourceId, input.role);
    return { ok: true };
  });

  handle(IpcChannels.sourcesListInbox, () => {
    return listInboxSources(ctx);
  });

  handle(IpcChannels.sourcesGet, (_event, raw) => {
    return ctx.sources.getSource(UuidV7Schema.parse(raw));
  });

  handle(IpcChannels.sourcesListBlocks, (_event, raw) => {
    const sourceId = UuidV7Schema.parse(raw);
    const source = ctx.sources.getSource(sourceId);
    if (!source?.activeVersionId) return [];
    return ctx.sources.listBlocks(source.activeVersionId);
  });

  handle(IpcChannels.sourcesImportText, async (_event, raw) => {
    const input = ImportTextSourceInputSchema.parse(raw);
    return importTextSource(input, textIngestDeps(ctx));
  });

  handle(IpcChannels.sourcesImportPdf, async (_event, raw) => {
    const input = ImportPdfSourceInputSchema.parse(raw);
    return importPdfSource(input, {
      ...textIngestDeps(ctx),
      jobs: ctx.jobs,
    });
  });

  handle(IpcChannels.sourcesImportUrl, async (_event, raw) => {
    const input = ImportUrlSourceInputSchema.parse(raw);
    const fetched = await fetchUrlMarkdown(input.url);
    return importUrlMarkdown(input.url, fetched.markdown, textIngestDeps(ctx), {
      title: input.title ?? fetched.title,
      studioId: input.studioId,
    });
  });

  handle(IpcChannels.sourcesImportTranscript, async (_event, raw) => {
    const input = ImportTranscriptSourceInputSchema.parse(raw);
    return importTranscriptSource(input, textIngestDeps(ctx));
  });

  handle(IpcChannels.sourcesRetry, (_event, raw) => {
    const sourceId = UuidV7Schema.parse(raw);
    const source = ctx.sources.getSource(sourceId);
    if (!source?.activeVersionId) {
      throw new Error('Source has no active version to retry');
    }
    const jobId = ctx.jobs.enqueue(
      'resume_ingestion',
      { sourceId, sourceVersionId: source.activeVersionId },
      { dedupeKey: `resume:${source.activeVersionId}` },
    );
    ctx.sources.updateSourceProcessingStatus(sourceId, 'embedding');
    return { jobId };
  });

  handle(IpcChannels.sourcesArchive, (_event, raw) => {
    const sourceId = UuidV7Schema.parse(raw);
    ctx.db.db
      .prepare(`UPDATE sources SET lifecycle_status = 'archived', updated_at = ? WHERE id = ?`)
      .run(nowMs(), sourceId);
    return { ok: true };
  });

  handle(IpcChannels.sourcesDelete, (_event, raw) => {
    const sourceId = UuidV7Schema.parse(raw);
    ctx.db.db
      .prepare(
        `UPDATE sources SET lifecycle_status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(nowMs(), nowMs(), sourceId);
    return { ok: true };
  });

  handle(IpcChannels.sourcesPickPdf, async () => {
    const result = await showOpenFiles({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths;
  });

  handle(IpcChannels.sourcesPickTranscript, async () => {
    const result = await showOpenFiles({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Transcript', extensions: ['vtt', 'srt', 'json', 'txt'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths;
  });

  handle(IpcChannels.agentStartSession, (_event, raw) => {
    const input = StartLearnSessionInputSchema.parse(raw);
    return ctx.agent.startSession(input);
  });

  handle(IpcChannels.agentSendMessage, async (event, raw) => {
    const wc = validateSender(event);
    const input = SendAgentMessageInputSchema.parse(raw);
    cancelledSessions.delete(input.sessionId);
    const controller = new AbortController();
    activeStreams.set(input.sessionId, controller);

    try {
      for await (const streamEvent of ctx.agent.sendMessage(input.sessionId, input.message)) {
        if (cancelledSessions.has(input.sessionId)) {
          sendAgentEvent(wc, { type: 'cancelled', sessionId: input.sessionId });
          break;
        }
        sendAgentEvent(wc, streamEvent);
      }
    } finally {
      activeStreams.delete(input.sessionId);
    }
    return { ok: true };
  });

  handle(IpcChannels.agentCancel, (_event, raw) => {
    const sessionId = UuidV7Schema.parse(raw);
    cancelledSessions.add(sessionId);
    activeStreams.get(sessionId)?.abort();
    return { ok: true };
  });

  handle(IpcChannels.probeStart, (_event, raw) => {
    const input = StartProbeInputSchema.parse(raw);
    const defaults = ctx.agent.resolveDefaultProvider();
    const state = ctx.probe.start(input, defaults.profileId, defaults.modelId);
    const turn = ctx.db.db
      .prepare(
        `SELECT m.content_text FROM probe_turns pt
         JOIN messages m ON m.id = pt.question_message_id
         WHERE pt.probe_id = ? AND pt.status = 'awaiting_answer'
         ORDER BY pt.turn_number DESC LIMIT 1`,
      )
      .get(state.probeId) as { content_text: string } | undefined;
    return { ...state, currentQuestion: turn?.content_text ?? null };
  });

  handle(IpcChannels.probeAnswer, async (_event, raw) => {
    const input = AnswerProbeInputSchema.parse(raw);
    const defaults = ctx.agent.resolveDefaultProvider();
    return ctx.probe.submitAnswer(
      input.probeId,
      input.answer,
      defaults.profileId,
      defaults.modelId,
    );
  });

  handle(IpcChannels.probeStop, (_event, raw) => {
    const probeId = UuidV7Schema.parse(raw);
    ctx.db.db
      .prepare(
        `UPDATE probes SET status = 'completed', stop_reason = 'user_stopped', completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(nowMs(), nowMs(), probeId);
    return { ok: true };
  });

  handle(IpcChannels.probeGet, (_event, raw) => {
    const probeId = UuidV7Schema.parse(raw);
    const state = ctx.probe.getState(probeId);
    const turn = ctx.db.db
      .prepare(
        `SELECT pt.*, m.content_text AS question_text,
                fm.content_text AS feedback_text
         FROM probe_turns pt
         LEFT JOIN messages m ON m.id = pt.question_message_id
         LEFT JOIN messages fm ON fm.id = pt.feedback_message_id
         WHERE pt.probe_id = ?
         ORDER BY pt.turn_number DESC LIMIT 1`,
      )
      .get(probeId) as Record<string, unknown> | undefined;
    return {
      state,
      currentQuestion: (turn?.question_text as string | null) ?? null,
      feedback: (turn?.feedback_text as string | null) ?? null,
      turnStatus: (turn?.status as string | null) ?? null,
    };
  });

  handle(IpcChannels.probeGetLearningMap, (_event, raw) => {
    const probeId = UuidV7Schema.parse(raw);
    const probe = ctx.db.db.prepare('SELECT studio_id FROM probes WHERE id = ?').get(probeId) as
      | { studio_id: string }
      | undefined;
    if (!probe) throw new Error('Probe not found');
    return ctx.learningMap.build(probe.studio_id);
  });

  handle(IpcChannels.todayList, () => {
    return getTodayView(ctx);
  });

  handle(IpcChannels.todayCompleteAction, (_event, raw) => {
    const actionId = UuidV7Schema.parse(raw);
    ctx.db.db
      .prepare(`UPDATE next_actions SET status = 'completed', updated_at = ? WHERE id = ?`)
      .run(nowMs(), actionId);
    return { ok: true };
  });

  handle(IpcChannels.todayDismissAction, (_event, raw) => {
    const actionId = UuidV7Schema.parse(raw);
    ctx.db.db
      .prepare(`UPDATE next_actions SET status = 'dismissed', updated_at = ? WHERE id = ?`)
      .run(nowMs(), actionId);
    return { ok: true };
  });

  handle(IpcChannels.learnerGetProfile, () => {
    const row = ctx.db.db.prepare('SELECT * FROM learner_profile WHERE id = ?').get('local-user') as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      displayName: (row.display_name as string | null) ?? null,
      summary: (row.summary as string | null) ?? null,
      background: JSON.parse(row.background_json as string) as string[],
      goals: JSON.parse(row.goals_json as string) as string[],
      preferences: JSON.parse(row.preferences_json as string) as Record<string, unknown>,
      onboardingCompleted: row.onboarding_completed === 1,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  });

  handle(IpcChannels.learnerUpdateProfile, (_event, raw) => {
    const input = raw as {
      displayName?: string | null;
      summary?: string | null;
      background?: string[];
      goals?: string[];
      preferences?: Record<string, unknown>;
    };
    const ts = nowMs();
    const existing = ctx.db.db
      .prepare('SELECT * FROM learner_profile WHERE id = ?')
      .get('local-user') as Record<string, unknown>;
    ctx.db.db
      .prepare(
        `UPDATE learner_profile SET
          display_name = ?,
          summary = ?,
          background_json = ?,
          goals_json = ?,
          preferences_json = ?,
          updated_at = ?
        WHERE id = 'local-user'`,
      )
      .run(
        input.displayName !== undefined
          ? input.displayName
          : (existing.display_name as string | null),
        input.summary !== undefined ? input.summary : (existing.summary as string | null),
        JSON.stringify(input.background ?? JSON.parse(existing.background_json as string)),
        JSON.stringify(input.goals ?? JSON.parse(existing.goals_json as string)),
        JSON.stringify(input.preferences ?? JSON.parse(existing.preferences_json as string)),
        ts,
      );
    return { ok: true };
  });

  handle(IpcChannels.learnerGetConceptStates, (_event, raw) => {
    const studioId = UuidV7Schema.parse(raw);
    return projectConceptStateForStudio(ctx.db.db, studioId) as ConceptState[];
  });

  handle(IpcChannels.learnerCorrect, (_event, raw) => {
    const { conceptId, studioId, rationale } = raw as {
      conceptId: string;
      studioId: string;
      rationale: string;
    };
    const events = new LearningEventsRepo(ctx.db.db);
    events.append({
      studioId: UuidV7Schema.parse(studioId),
      conceptId: UuidV7Schema.parse(conceptId),
      eventKind: 'manual_correction',
      demonstratedLevel: 'can_explain',
      confidence: 0.9,
      rationale,
    });
    return { ok: true };
  });

  handle(IpcChannels.learnerRetract, (_event, raw) => {
    const { eventId, conceptId, studioId, rationale } = raw as {
      eventId: string;
      conceptId: string;
      studioId?: string;
      rationale: string;
    };
    const events = new LearningEventsRepo(ctx.db.db);
    events.append({
      studioId: studioId ? UuidV7Schema.parse(studioId) : null,
      conceptId: UuidV7Schema.parse(conceptId),
      eventKind: 'retraction',
      demonstratedLevel: 'encountered',
      confidence: 1,
      rationale,
      retractsEventId: UuidV7Schema.parse(eventId),
    });
    return { ok: true };
  });

  handle(IpcChannels.usageGetSummary, () => {
    const row = ctx.db.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_microusd), 0) AS total,
                COUNT(*) AS events
         FROM usage_events`,
      )
      .get() as { total: number; events: number };
    return { totalMicrousd: row.total, eventCount: row.events };
  });

  handle(IpcChannels.usageGetLimits, () => {
    return ctx.db.db.prepare('SELECT * FROM usage_limits').all();
  });

  handle(IpcChannels.usageSetLimits, (_event, raw) => {
    const input = raw as {
      scopeType: string;
      scopeId: string;
      period: string;
      warningMicrousd?: number | null;
      hardLimitMicrousd?: number | null;
      enabled?: boolean;
    };
    const ts = nowMs();
    ctx.db.db
      .prepare(
        `INSERT INTO usage_limits (
          scope_type, scope_id, period, warning_microusd, hard_limit_microusd, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope_type, scope_id, period) DO UPDATE SET
          warning_microusd = excluded.warning_microusd,
          hard_limit_microusd = excluded.hard_limit_microusd,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.scopeType,
        input.scopeId,
        input.period,
        input.warningMicrousd ?? null,
        input.hardLimitMicrousd ?? null,
        input.enabled !== false ? 1 : 0,
        ts,
        ts,
      );
    return { ok: true };
  });

  handle(IpcChannels.backupExport, async () => {
    const result = await showSaveFile({
      defaultPath: `omakase-backup-${Date.now()}.omakase-backup`,
      filters: [{ name: 'Omakase backup', extensions: ['omakase-backup'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };

    const stagingDir = path.join(ctx.paths.tmpDir, `backup-staging-${Date.now()}`);
    try {
      const manifest = await createBackup({
        db: ctx.db.db,
        assetsDir: ctx.paths.assetsDir,
        appVersion: app.getVersion(),
        destPath: stagingDir,
      });
      fs.rmSync(result.filePath, { recursive: true, force: true });
      fs.renameSync(stagingDir, result.filePath);
      return { ok: true, path: result.filePath, manifest };
    } catch (error) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      throw error;
    }
  });

  handle(IpcChannels.backupRestore, async () => {
    const result = await showOpenFiles({
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    const backupPath = result.filePaths[0];
    if (!isBackupBundle(backupPath)) {
      throw new Error('Selected folder is not a valid Omakase backup bundle');
    }

    ctx.close();
    restoreBackup({
      backupPath,
      destUserDataPath: path.dirname(ctx.paths.root),
    });
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  handle(IpcChannels.backupExportStudio, (_event, raw) => {
    const studioId = UuidV7Schema.parse(raw);
    const studio = ctx.studios.get(studioId);
    if (!studio) throw new Error('Studio not found');
    const destDir = path.join(ctx.paths.backupsDir, `studio-${studioId}-${Date.now()}`);
    const exported = exportStudioBundle({ db: ctx.db.db, studio, destDir });
    return { ok: true, path: destDir, ...exported };
  });

  handle(IpcChannels.diagnosticsPreview, () => {
    return buildDiagnosticsPreview({
      db: ctx.db.db,
      appVersion: app.getVersion(),
      platform: process.platform,
      embeddingModel: ctx.embeddingService.modelId,
      modelsDir: ctx.paths.modelsDir,
      logsDir: ctx.paths.logsDir,
      providerCount: ctx.providers.listProfiles().length,
    });
  });

  handle(IpcChannels.diagnosticsExport, async () => {
    const preview = buildDiagnosticsPreview({
      db: ctx.db.db,
      appVersion: app.getVersion(),
      platform: process.platform,
      embeddingModel: ctx.embeddingService.modelId,
      modelsDir: ctx.paths.modelsDir,
      logsDir: ctx.paths.logsDir,
      providerCount: ctx.providers.listProfiles().length,
    });
    const result = await showSaveFile({
      defaultPath: `omakase-diagnostics-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    const exported = exportDiagnosticsBundle(preview, result.filePath);
    return { ok: true, ...exported };
  });

  handle(IpcChannels.jobsList, () => {
    return ctx.jobs.list(50);
  });

  handle(IpcChannels.sourceProgress, (_event, raw) => {
    const sourceId = UuidV7Schema.parse(raw);
    const source = ctx.sources.getSource(sourceId);
    if (!source) return null;
    const jobs = ctx.jobs.list(20).filter((j) => j.payloadJson.includes(sourceId));
    return { source, jobs };
  });

  handle(IpcChannels.shellOpenExternal, (_event, raw) => {
    const url = String(raw);
    return { ok: openValidatedExternal(url) };
  });

  handle(IpcChannels.shellOpenPath, (_event, raw) => {
    const target = String(raw);
    return shell.openPath(target);
  });

  handle(IpcChannels.extensionRegisterId, (_event, raw) => {
    return registerExtensionId(ctx, String(raw));
  });

  handle(IpcChannels.extensionListIds, () => {
    return listRegisteredExtensionIds(ctx);
  });
}

/** Create mock provider profile for onboarding/tests. */
export function ensureMockProvider(ctx: AppContext): ProviderProfile {
  const existing = ctx.providers
    .listProfiles()
    .find((p) => p.displayName.toLowerCase().includes('mock'));
  if (existing) return existing;

  return ctx.providers.createProfile({
    provider: 'openai',
    displayName: 'Local mock (testing)',
    apiKey: 'mock-local-key',
    defaultModelId: 'mock-learn-v1',
  });
}
