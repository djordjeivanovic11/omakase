import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { getLogger, initLogger } from '../core/observability/logger.js';
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
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
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
      ctx = createAppContext();
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

      if (process.env.OMAKASE_MOCK_PROVIDER === '1') {
        ensureMockProvider(ctx);
        log.info('Mock provider profile ensured (test mode)');
      }
      if (app.isPackaged) {
        process.env.OMAKASE_PACKAGED = '1';
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
