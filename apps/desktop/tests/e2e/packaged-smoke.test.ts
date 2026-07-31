import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * This drives the real shipping binary, including the production fuse
 * configuration. Playwright's `_electron.launch` cannot be used because it
 * attaches through `--inspect`, which the packaged app deliberately disables;
 * the Chromium debugging port works without weakening the release build.
 */

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const executablePath = path.join(
  appRoot,
  'out',
  `Omakase-${process.platform}-${process.arch}`,
  process.platform === 'darwin' ? 'Omakase.app/Contents/MacOS/Omakase' : 'Omakase',
);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-smoke-'));
const logPath = path.join(userDataDir, 'omakase', 'logs', 'omakase.log');

interface Session {
  child: ChildProcess;
  browser: Browser;
  page: Page;
  stdout: string[];
  consoleErrors: string[];
  pageErrors: string[];
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForDebugger(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Packaged app did not open a debugging port within ${timeoutMs}ms`);
}

async function launch(): Promise<Session> {
  const port = await freePort();
  const stdout: string[] = [];

  const child = spawn(
    executablePath,
    [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`],
    {
      env: {
        ...process.env,
        OMAKASE_SMOKE: '1',
        OMAKASE_MOCK_PROVIDER: '1',
        OMAKASE_LOG_LEVEL: 'debug',
        // The OS keychain shows a blocking authorisation prompt whenever the
        // app is re-signed, which no unattended test can answer.
        OMAKASE_TEST: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => stdout.push(chunk.toString()));

  await waitForDebugger(port, 60_000);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error('Packaged app exposed no browser context');

  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.waitForSelector('#root', { state: 'attached', timeout: 30_000 });
  return { child, browser, page, stdout, consoleErrors, pageErrors };
}

async function shutdown(session: Session): Promise<void> {
  await session.browser.close().catch(() => undefined);
  session.child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      session.child.kill('SIGKILL');
      resolve();
    }, 10_000);
    session.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function readLog(): string {
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
}

function logErrorLines(): string[] {
  return readLog()
    .split('\n')
    .filter((line) => line.includes('"level":"error"'));
}

describe('packaged application', () => {
  let session: Session;

  beforeAll(async () => {
    if (!fs.existsSync(executablePath)) {
      throw new Error(
        `Packaged app not found at ${executablePath}. Run "pnpm --filter @omakase/desktop package" first.`,
      );
    }
    session = await launch();
  });

  afterAll(async () => {
    if (session) await shutdown(session);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('loads the renderer and reports a healthy local library', async () => {
    const info = (await session.page.evaluate(() => window.omakase.getAppInfo())) as {
      name: string;
      version: string;
      schemaOk: boolean;
      packaged: boolean;
    };

    expect(info.name).toBe('Omakase');
    expect(info.packaged).toBe(true);
    expect(info.schemaOk).toBe(true);
    expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('creates the local library on disk and runs migrations', () => {
    expect(fs.existsSync(path.join(userDataDir, 'omakase', 'library.sqlite'))).toBe(true);
    for (const dir of ['assets', 'derived', 'secrets', 'logs', 'backups']) {
      expect(fs.existsSync(path.join(userDataDir, 'omakase', dir))).toBe(true);
    }
  });

  it('loads the renderer from disk rather than a development server', () => {
    const log = readLog();
    expect(log).toContain('Loading renderer from disk');
    expect(log).not.toContain('Loading renderer from dev server');
  });

  it('completes first-run setup and navigates the whole product', async () => {
    const { page } = session;

    // With OMAKASE_MOCK_PROVIDER the profile is provisioned at startup, so the
    // first screen offers "Continue" instead of the mock connect button.
    const continueButton = page.getByRole('button', { name: /^continue$/i });
    const mockButton = page.getByRole('button', { name: /local mock/i });
    await continueButton.or(mockButton).first().click();

    await page.getByLabel('Studio name').fill('Smoke Studio');
    await page.getByRole('button', { name: /start learning/i }).click();

    await page.getByRole('navigation', { name: 'Main' }).waitFor({ state: 'visible' });

    for (const link of ['Studios', 'Inbox', 'You', 'Today']) {
      const navLink = page.getByRole('link', { name: link, exact: true });
      await navLink.click();
      await page.waitForFunction(
        (name) =>
          Array.from(document.querySelectorAll('.nav-link.active')).some(
            (el) => el.textContent?.trim() === name,
          ),
        link,
      );
    }

    await page.getByRole('link', { name: 'Studios', exact: true }).click();
    await page.getByText('Smoke Studio').waitFor({ state: 'visible' });
  });

  it('reports no renderer or main-process errors', () => {
    expect(session.pageErrors).toEqual([]);
    expect(session.consoleErrors).toEqual([]);
    expect(logErrorLines()).toEqual([]);
  });

  it('keeps local state after closing and reopening', async () => {
    await shutdown(session);
    session = await launch();

    const studios = (await session.page.evaluate(() => window.omakase.listStudios())) as Array<{
      name: string;
    }>;
    expect(studios.map((s) => s.name)).toContain('Smoke Studio');

    const onboarding = (await session.page.evaluate(() => window.omakase.getOnboardingState())) as {
      completed: boolean;
    };
    expect(onboarding.completed).toBe(true);

    expect(session.pageErrors).toEqual([]);
    expect(logErrorLines()).toEqual([]);
  });

  it('never writes an API key to the log', () => {
    const log = readLog();
    expect(log).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(log).not.toContain('mock-local-key');
  });
});
