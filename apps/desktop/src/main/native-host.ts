import fs from 'node:fs';
import path from 'node:path';
import {
  type BrowserCapturePayload,
  BrowserCapturePayloadSchema,
  CaptureNativePayloadSchema,
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
      void (async () => {
        try {
          const raw = fs.readFileSync(full, 'utf8');
          const message = NativeMessageSchema.parse(JSON.parse(raw));
          await handleNativeMessage(ctx, message);
          fs.unlinkSync(full);
        } catch (error) {
          log.warn('Rejected native inbox message', { err: error });
          try {
            fs.renameSync(full, `${full}.rejected`);
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

export function registerExtensionId(ctx: AppContext, extensionId: string): {
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
    const studios = ctx.studios.list().map((studio) => ({ id: studio.id, name: studio.name }));
    return { ok: true, payload: studios };
  }

  if (message.type === 'capture') {
    const payload = CaptureNativePayloadSchema.parse(message.payload) as BrowserCapturePayload;
    BrowserCapturePayloadSchema.parse(payload);
    await importBrowserCapture(payload, {
      db: ctx.db.db,
      assets: ctx.assets,
      sources: ctx.sources,
      studios: ctx.studios,
      jobs: ctx.jobs,
      derivedDir: ctx.paths.derivedDir,
    });
    return { ok: true };
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
        const length = chunks[0]!.readUInt32LE(0);
        const body = Buffer.concat(chunks).subarray(4, 4 + length);
        resolve(NativeMessageSchema.parse(JSON.parse(body.toString('utf8'))));
      } catch {
        resolve(null);
      }
    });
  });
}
