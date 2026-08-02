import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, session, shell } from 'electron';
import { getLogger } from '../core/observability/logger.js';
import { validateHttpUrl } from '../core/security/url-policy.js';

/** Strict CSP for the packaged app (file:// renderer). */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' omakase-pdf:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Vite needs inline preamble scripts, eval for HMR transforms, and websocket
 * connections to the local dev server. Keep this scoped to localhost only.
 */
function developmentCsp(devServerUrl: string): string {
  let origin = 'http://localhost:*';
  try {
    origin = new URL(devServerUrl).origin;
  } catch {
    // keep wildcard localhost fallback
  }
  const wsOrigin = origin.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${origin}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' omakase-pdf: ${origin} ${wsOrigin} ws://localhost:* http://localhost:*`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

const log = getLogger().child('window');

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, 'preload.js');
  const csp = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? developmentCsp(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    : PRODUCTION_CSP;

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: 'Omakase',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openValidatedExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    log.info('Main window shown');
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error('Renderer failed to load', { errorCode, errorDescription, url: validatedURL });
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone', { reason: details.reason, exitCode: details.exitCode });
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      log.warn('Renderer console', { level, message, line, sourceId });
    }
  });

  // Forge Vite replaces these identifiers at compile time (not process.env).
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    log.info('Loading renderer from dev server');
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
    if (!fs.existsSync(indexPath)) {
      log.error('Renderer bundle is missing from the packaged app', { indexPath });
    }
    log.info('Loading renderer from disk', { indexPath });
    void win.loadFile(indexPath);
  }

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

function isAllowedNavigation(url: string): boolean {
  if (url.startsWith('devtools://')) return true;
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

export function openValidatedExternal(rawUrl: string): boolean {
  const result = validateHttpUrl(rawUrl);
  if (!result.ok || !result.url) {
    return false;
  }
  void shell.openExternal(result.url.toString());
  return true;
}
