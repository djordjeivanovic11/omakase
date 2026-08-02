import fs from 'node:fs';
import path from 'node:path';
import {
  type BrowserCapturePayload,
  BrowserCapturePayloadSchema,
  CaptureNativePayloadSchema,
  CaptureStatusPayloadSchema,
  type NativeMessage,
  NativeMessageSchema,
} from '@omakase/contracts';
import {
  addAllowedExtensionId,
  installNativeMessagingHost,
  readAllowedExtensionIds,
} from '../core/extension/native-host-install.js';
import { getLogger } from '../core/observability/logger.js';
import { importBrowserCapture } from '../core/sources/web-ingest.js';
import type { AppContext } from './app-context.js';

export interface NativeHostHandle {
  stop(): void;
}

const log = getLogger().child('native-host');

/**
 * Watches the native-inbox drop directory (filled by the Chrome/Edge stdio
 * host) and installs/refreshes the native messaging manifests on startup.
 */
export function startNativeHost(ctx: AppContext): NativeHostHandle {
  const inboxDir = path.join(ctx.paths.root, 'native-inbox');
  fs.mkdirSync(inboxDir, { recursive: true });

  try {
    const installed = installNativeMessagingHost({
      libraryRoot: ctx.paths.root,
      resourcesPath: process.resourcesPath || path.resolve(__dirname, '../../resources'),
    });
    log.info('Native messaging host installed', {
      launcher: installed.hostScriptPath,
      manifests: installed.manifestPaths.length,
      allowedIds: installed.allowedExtensionIds.length,
    });
  } catch (error) {
    log.warn('Native messaging host install skipped', { err: error });
  }

  const poll = setInterval(() => {
    for (const file of fs.readdirSync(inboxDir)) {
      if (!file.endsWith('.json')) continue;
      const full = path.join(inboxDir, file);
      const claimed = `${full}.processing`;
      try {
        // Claim before awaiting ingestion so overlapping polls or retries do
        // not import the same inbox file twice.
        fs.renameSync(full, claimed);
      } catch {
        continue;
      }
      void (async () => {
        try {
          const raw = fs.readFileSync(claimed, 'utf8');
          const message = NativeMessageSchema.parse(JSON.parse(raw));
          await handleNativeMessage(ctx, message);
          fs.unlinkSync(claimed);
        } catch (error) {
          log.warn('Rejected native inbox message', { err: error });
          try {
            fs.renameSync(claimed, `${full}.rejected`);
          } catch {
            // ignore
          }
        }
      })();
    }
  }, 2000);

  return {
    stop() {
      clearInterval(poll);
    },
  };
}

export function registerExtensionId(
  ctx: AppContext,
  extensionId: string,
): {
  ok: boolean;
  allowedExtensionIds: string[];
} {
  const ids = addAllowedExtensionId(ctx.paths.root, extensionId);
  installNativeMessagingHost({
    libraryRoot: ctx.paths.root,
    resourcesPath: process.resourcesPath || path.resolve(__dirname, '../../resources'),
    extraExtensionIds: ids,
  });
  return { ok: true, allowedExtensionIds: ids };
}

export function listRegisteredExtensionIds(ctx: AppContext): string[] {
  return readAllowedExtensionIds(ctx.paths.root);
}

export async function handleNativeMessage(
  ctx: AppContext,
  message: NativeMessage,
): Promise<{ ok: boolean; error?: string; payload?: unknown }> {
  if (message.type === 'ping' || message.type === 'pong') {
    return { ok: true };
  }

  if (message.type === 'list_studios') {
    const studios = ctx.studios.list().map((studio) => {
      const row = ctx.db.db
        .prepare(
          `SELECT COUNT(*) AS source_count
           FROM studio_sources ss
           JOIN sources s ON s.id = ss.source_id
           WHERE ss.studio_id = ? AND s.deleted_at IS NULL AND s.lifecycle_status <> 'deleted'`,
        )
        .get(studio.id) as { source_count: number };
      return { id: studio.id, name: studio.name, sourceCount: row.source_count };
    });
    return { ok: true, payload: studios };
  }

  if (message.type === 'capture_status') {
    const payload = CaptureStatusPayloadSchema.parse(message.payload);
    const extensionId = message.extensionId ?? 'native-unknown';
    const row = ctx.db.db
      .prepare(
        `SELECT status, source_id, error_code, error_message
         FROM capture_requests
         WHERE extension_id = ? AND external_request_id = ?`,
      )
      .get(extensionId, payload.externalRequestId) as
      | {
          status: string;
          source_id: string | null;
          error_code: string | null;
          error_message: string | null;
        }
      | undefined;
    return {
      ok: true,
      payload: row
        ? {
            status: row.status,
            sourceId: row.source_id,
            errorCode: row.error_code,
            errorMessage: row.error_message,
          }
        : { status: 'pending' },
    };
  }

  if (message.type === 'capture') {
    const payload = CaptureNativePayloadSchema.parse(message.payload) as BrowserCapturePayload;
    BrowserCapturePayloadSchema.parse(payload);
    const extensionId = message.extensionId ?? 'native-unknown';
    const existing = ctx.db.db
      .prepare(
        `SELECT status, source_id FROM capture_requests
         WHERE extension_id = ? AND external_request_id = ?`,
      )
      .get(extensionId, payload.externalRequestId) as
      | { status: string; source_id: string | null }
      | undefined;
    if (existing?.status === 'imported') {
      return {
        ok: true,
        payload: { status: 'imported', sourceId: existing.source_id, idempotent: true },
      };
    }
    if (existing?.status === 'validating') {
      return { ok: true, payload: { status: 'pending', idempotent: true } };
    }

    const receivedAt = Date.now();
    ctx.db.db
      .prepare(
        `INSERT INTO capture_requests (
          id, external_request_id, extension_id, browser, payload_json, status, received_at
        ) VALUES (?, ?, ?, 'unknown', ?, 'validating', ?)
        ON CONFLICT(extension_id, external_request_id) DO UPDATE SET
          payload_json = excluded.payload_json,
          status = 'validating',
          error_code = NULL,
          error_message = NULL`,
      )
      .run(
        message.requestId,
        payload.externalRequestId,
        extensionId,
        JSON.stringify(payload),
        receivedAt,
      );

    try {
      const result = await importBrowserCapture(payload, {
        db: ctx.db.db,
        assets: ctx.assets,
        sources: ctx.sources,
        studios: ctx.studios,
        jobs: ctx.jobs,
        derivedDir: ctx.paths.derivedDir,
      });
      ctx.db.db
        .prepare(
          `UPDATE capture_requests SET status = 'imported', source_id = ?, completed_at = ?
           WHERE extension_id = ? AND external_request_id = ?`,
        )
        .run(result.source.id, Date.now(), extensionId, payload.externalRequestId);
      return {
        ok: true,
        payload: {
          status: 'imported',
          sourceId: result.source.id,
          sourceVersionId: result.sourceVersionId,
          deduped: result.deduped,
        },
      };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      ctx.db.db
        .prepare(
          `UPDATE capture_requests SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?
           WHERE extension_id = ? AND external_request_id = ?`,
        )
        .run(
          'capture_failed',
          messageText.slice(0, 400),
          Date.now(),
          extensionId,
          payload.externalRequestId,
        );
      throw error;
    }
  }

  return { ok: false, error: 'unsupported_message_type' };
}

/** Stdio protocol entry for packaged native host binary (tests / Electron mode). */
export async function readStdioNativeMessage(): Promise<NativeMessage | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }
      try {
        const firstChunk = chunks[0];
        if (!firstChunk) {
          resolve(null);
          return;
        }
        const length = firstChunk.readUInt32LE(0);
        const body = Buffer.concat(chunks).subarray(4, 4 + length);
        resolve(NativeMessageSchema.parse(JSON.parse(body.toString('utf8'))));
      } catch {
        resolve(null);
      }
    });
  });
}
