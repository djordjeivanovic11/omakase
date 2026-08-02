import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { UuidV7Schema } from '@omakase/contracts';
import { app, BrowserWindow, dialog, net, protocol } from 'electron';
import { getLogger, initLogger } from '../core/observability/logger.js';
import { isMockProviderRuntimeAllowed } from '../core/providers/model-defaults.js';
import { type AppContext, createAppContext } from './app-context.js';
import { ensureMockProvider, registerIpcHandlers } from './ipc.js';
import { startJobWorker, stopJobWorker } from './job-worker.js';
import { type NativeHostHandle, startNativeHost } from './native-host.js';
import { createMainWindow } from './window.js';

let ctx: AppContext | null = null;
let nativeHost: NativeHostHandle | null = null;

const log = initLogger(
  path.join(app.getPath('userData'), 'omakase', 'logs'),
  process.env.OMAKASE_LOG_LEVEL === 'debug' ? 'debug' : 'info',
);

function reportFatal(stage: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  getLogger().error(`Fatal error during ${stage}`, { stage, err });
  if (process.env.OMAKASE_SMOKE === '1') {
    app.exit(1);
    return;
  }
  dialog.showErrorBox(
    'Omakase could not start',
    `${err.message}\n\nA detailed log was written to:\n${path.join(app.getPath('userData'), 'omakase', 'logs', 'omakase.log')}`,
  );
  app.exit(1);
}

function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

/**
 * Serves only immutable PDF assets already owned by the local library. The
 * renderer never receives an arbitrary filesystem path and the protocol does
 * not expose the database or non-PDF assets.
 */
function registerPdfProtocol(context: AppContext): void {
  protocol.handle('omakase-pdf', async (request) => {
    try {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
      }
      const parsed = new URL(request.url);
      if (parsed.hostname !== 'source-version') {
        return new Response('Not found', { status: 404 });
      }
      const sourceVersionId = parsed.pathname.replace(/^\//, '');
      if (!UuidV7Schema.safeParse(sourceVersionId).success) {
        return new Response('Not found', { status: 404 });
      }
      const row = context.db.db
        .prepare(
          `SELECT a.relative_path
           FROM source_versions sv
           JOIN sources s ON s.id = sv.source_id
           JOIN assets a ON a.sha256 = sv.asset_hash
           WHERE sv.id = ? AND s.kind = 'pdf' AND s.deleted_at IS NULL`,
        )
        .get(sourceVersionId) as { relative_path: string } | undefined;
      if (!row) return new Response('Not found', { status: 404 });

      const assetPath = context.assets.absolutePath(row.relative_path);
      return net.fetch(pathToFileURL(assetPath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function acceptDeepLink(value: string | undefined): void {
  if (!value || !value.startsWith('omakase://')) return;
  try {
    const url = new URL(value);
    if (url.protocol !== 'omakase:' || url.hostname !== 'capture') return;
    const requestId = url.pathname.replace(/^\//, '');
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return;
    focusMainWindow();
    getLogger().info('Accepted Omakase deep link', { requestId });
  } catch {
    getLogger().warn('Rejected malformed Omakase deep link');
  }
}

process.on('uncaughtException', (error) => {
  getLogger().error('Uncaught exception in main process', { err: error });
});
process.on('unhandledRejection', (reason) => {
  getLogger().error('Unhandled rejection in main process', { err: reason });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    acceptDeepLink(commandLine.find((value) => value.startsWith('omakase://')));
    focusMainWindow();
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    acceptDeepLink(url);
  });

  app.whenReady().then(async () => {
    log.info('App ready', {
      version: app.getVersion(),
      electron: process.versions.electron,
      packaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
    });

    try {
      try {
        app.setAsDefaultProtocolClient('omakase');
      } catch (error) {
        log.warn('Could not register omakase:// protocol', { err: error });
      }
      ctx = createAppContext();
      registerPdfProtocol(ctx);
      log.info('Local library opened', {
        root: ctx.paths.root,
        modelsDir: ctx.paths.modelsDir,
        embeddingModel: ctx.embeddingService.modelId,
      });
    } catch (error) {
      reportFatal('database initialisation', error);
      return;
    }

    try {
      registerIpcHandlers(ctx);
      // The window comes up before anything that can touch the OS keychain.
      // macOS blocks the main thread on the authorisation prompt, and a prompt
      // behind an invisible app looks exactly like a hang.
      createMainWindow();
      acceptDeepLink(process.argv.find((value) => value.startsWith('omakase://')));

      if (app.isPackaged) {
        process.env.OMAKASE_PACKAGED = '1';
      }

      if (isMockProviderRuntimeAllowed({ packaged: app.isPackaged })) {
        ensureMockProvider(ctx);
        log.info('Mock provider profile ensured (test mode)');
      }

      const recovered = ctx.jobs.recoverStale();
      if (recovered > 0) {
        log.info('Recovered stale jobs', { count: recovered });
      }

      startJobWorker(ctx);
      nativeHost = startNativeHost(ctx);
      log.info('Startup complete');
    } catch (error) {
      reportFatal('startup', error);
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    getLogger().info('Shutting down');
    stopJobWorker();
    nativeHost?.stop();
    ctx?.close();
  });

  // Without this a `kill` leaves the database without a checkpoint.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(signal, () => {
      getLogger().info('Received termination signal', { signal });
      app.quit();
    });
  }
}
