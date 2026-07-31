import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The complete user journey through the shipping application with a real
 * provider: connect a key, add sources, ask a grounded question, run a probe,
 * and recover everything after a restart.
 *
 * Requires OMAKASE_LIVE_TESTS=1, OPENAI_API_KEY or OMAKASE_LIVE_OPENAI_KEY,
 * and a packaged app; skipped otherwise.
 */

const apiKey = process.env.OMAKASE_LIVE_OPENAI_KEY ?? process.env.OPENAI_API_KEY;
const liveTestsEnabled = process.env.OMAKASE_LIVE_TESTS === '1';
const modelId = process.env.OMAKASE_LIVE_MODEL ?? 'gpt-5.6';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(appRoot, '../..');
const executablePath = path.join(
  appRoot,
  'out',
  `Omakase-${process.platform}-${process.arch}`,
  'Omakase.app/Contents/MacOS/Omakase',
);
const pdfFixture = path.join(repoRoot, 'fixtures/pdfs/cache-write-policies.pdf');
const transcriptFixture = path.join(repoRoot, 'fixtures/transcripts/spaced-repetition.vtt');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omakase-live-app-'));
const logPath = path.join(userDataDir, 'omakase', 'logs', 'omakase.log');

const enabled = liveTestsEnabled && Boolean(apiKey) && fs.existsSync(executablePath);

interface Session {
  child: ChildProcess;
  browser: Browser;
  page: Page;
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

async function launch(): Promise<Session> {
  const port = await freePort();
  const child = spawn(
    executablePath,
    [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`],
    {
      // No OMAKASE_TEST: this run uses the real OS credential storage.
      env: { ...process.env, OMAKASE_LOG_LEVEL: 'debug' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) break;
    } catch {
      // Still starting.
    }
    if (Date.now() > deadline) throw new Error('Packaged app did not expose a debugging port');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error('No browser context');
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForSelector('#root', { state: 'attached', timeout: 30_000 });
  return { child, browser, page };
}

async function shutdown(session: Session): Promise<void> {
  await session.browser.close().catch(() => undefined);
  session.child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      session.child.kill('SIGKILL');
      resolve();
    }, 15_000);
    session.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Every `electron-forge package` re-signs the bundle, which gives it a new code
 * identity. macOS then asks the user to authorise access to the safeStorage
 * master key created by the previous build, and that prompt blocks the main
 * thread forever in an unattended run. Removing Omakase's own keychain item
 * lets the app create a fresh one silently.
 */
function resetSafeStorageKeychainItem(): void {
  if (process.platform !== 'darwin') return;
  spawnSync('security', ['delete-generic-password', '-s', 'Omakase Safe Storage'], {
    stdio: 'ignore',
  });
}

async function waitForSourceReady(page: Page, sourceId: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const source = (await page.evaluate((id) => window.omakase.getSource(id), sourceId)) as {
      processingStatus: string;
    } | null;
    if (source?.processingStatus === 'ready') return;
    if (source?.processingStatus === 'failed') {
      throw new Error(`Source ${sourceId} failed to process`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Source ${sourceId} stuck at ${source?.processingStatus}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

describe.skipIf(!enabled)('packaged golden path with a real provider', () => {
  let session: Session;
  const ids = { studioId: '', pdfSourceId: '', transcriptSourceId: '', probeId: '' };

  beforeAll(async () => {
    resetSafeStorageKeychainItem();
    session = await launch();
  }, 120_000);

  afterAll(async () => {
    if (session) await shutdown(session);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('stores the API key through the OS credential store, never in the database', async () => {
    const profile = (await session.page.evaluate(
      ([key, model]) =>
        window.omakase.createProvider({
          provider: 'openai',
          displayName: 'OpenAI',
          apiKey: key,
          defaultModelId: model,
        }),
      [apiKey as string, modelId],
    )) as { id: string; keySuffix?: string };

    expect(profile.id).toBeTruthy();
    expect(JSON.stringify(profile)).not.toContain(apiKey as string);

    const dbBytes = fs.readFileSync(path.join(userDataDir, 'omakase', 'library.sqlite'));
    expect(dbBytes.includes(Buffer.from(apiKey as string))).toBe(false);

    const result = (await session.page.evaluate(
      (id) => window.omakase.testProvider(id),
      profile.id,
    )) as { ok: boolean; message?: string };
    expect(result.ok, `provider test failed: ${result.message}`).toBe(true);
  }, 120_000);

  it('imports a PDF and a transcript, extracting them locally', async () => {
    ids.studioId = (
      (await session.page.evaluate(() =>
        window.omakase.createStudio({ name: 'Caching and Memory' }),
      )) as { id: string }
    ).id;

    const pdf = (await session.page.evaluate(
      ([studioId, absolutePath]) =>
        window.omakase.importPdfSource({
          studioId,
          absolutePath,
          title: 'Cache Write Policies',
          role: 'foundation',
        }),
      [ids.studioId, pdfFixture],
    )) as { source: { id: string } };
    ids.pdfSourceId = pdf.source.id;
    await waitForSourceReady(session.page, ids.pdfSourceId);

    const transcript = (await session.page.evaluate(
      ([studioId, absolutePath]) =>
        window.omakase.importTranscriptSource({
          studioId,
          absolutePath,
          title: 'Spaced repetition talk',
          role: 'reference',
        }),
      [ids.studioId, transcriptFixture],
    )) as { source: { id: string }; hasTimestamps: boolean };
    ids.transcriptSourceId = transcript.source.id;
    await waitForSourceReady(session.page, ids.transcriptSourceId);
    expect(transcript.hasTimestamps).toBe(true);

    const pdfBlocks = (await session.page.evaluate(
      (id) => window.omakase.listSourceBlocks(id),
      ids.pdfSourceId,
    )) as Array<{ text: string; pageStart: number | null }>;

    expect(pdfBlocks.length).toBeGreaterThanOrEqual(3);
    expect(pdfBlocks.some((b) => /write-through/i.test(b.text))).toBe(true);
    expect(pdfBlocks.some((b) => b.pageStart !== null)).toBe(true);
    expect(new Set(pdfBlocks.map((b) => b.pageStart)).size).toBeGreaterThan(1);

    const transcriptBlocks = (await session.page.evaluate(
      (id) => window.omakase.listSourceBlocks(id),
      ids.transcriptSourceId,
    )) as Array<{ text: string; timeStartMs: number | null }>;

    expect(transcriptBlocks.length).toBeGreaterThan(2);
    expect(transcriptBlocks.some((b) => b.timeStartMs !== null)).toBe(true);
  }, 240_000);

  it('answers from the PDF with citations that resolve to real blocks', async () => {
    const answer = (await session.page.evaluate(
      async ([studioId, sourceId]) => {
        const events: Array<{ type: string; result?: unknown }> = [];
        const unsubscribe = window.omakase.subscribeToAgentStream((event) => {
          events.push(event as { type: string; result?: unknown });
        });
        const session_ = (await window.omakase.startAgentSession({
          studioId,
          sourceId,
          mode: 'learn',
          objective: 'Understand cache write policies',
        })) as { sessionId: string };

        await window.omakase.sendAgentMessage({
          sessionId: session_.sessionId,
          message: 'When should I use write-back instead of write-through, and what is the risk?',
        });
        unsubscribe();

        const final = events.find((event) => event.type === 'final') as
          | {
              type: 'final';
              result: { answerMarkdown: string; citations: Array<{ handle: string }> };
            }
          | undefined;
        return { final, events };
      },
      [ids.studioId, ids.pdfSourceId],
    )) as {
      final?: {
        result: { answerMarkdown: string; citations: Array<{ handle: string }> };
      };
      events: Array<{ type: string }>;
    };

    expect(answer.final, `missing final event: ${JSON.stringify(answer.events)}`).toBeTruthy();
    if (!answer.final) throw new Error(`missing final event: ${JSON.stringify(answer.events)}`);
    const result = answer.final.result;
    expect(result.answerMarkdown.toLowerCase()).toContain('write-back');
    expect(result.citations.length).toBeGreaterThan(0);
    expect(answer.events.some((e) => e.type === 'text-delta' || e.type === 'final')).toBe(true);

    for (const citation of result.citations) {
      expect(result.answerMarkdown).toContain(`[${citation.handle}]`);
    }
  }, 180_000);

  it('runs an adaptive probe and records only verbatim evidence', async () => {
    const probe = (await session.page.evaluate(
      ([studioId, sourceId]) =>
        window.omakase.startProbe({
          studioId,
          sourceId,
          objective: 'cache write policies',
          desiredDepth: 'apply',
          maxTurns: 4,
        }),
      [ids.studioId, ids.pdfSourceId],
    )) as { probeId: string; currentQuestion: string | null };

    ids.probeId = probe.probeId;
    expect(probe.currentQuestion?.length ?? 0).toBeGreaterThan(10);

    // Phrasing deliberately differs from the source so a lazy model that
    // copies source text fails the verbatim check instead of looking correct.
    const answers = [
      'I would explain write-through as updating the cache and the database together, so both always agree and nothing is lost if the process dies.',
      'Write-back only touches the cache and marks the entry dirty, so it is faster, but a crash before the flush loses those writes.',
      'For a payment ledger I would use write-through because losing a write is unacceptable, and for a page view counter I would use write-back because a few lost increments do not matter.',
    ];

    const prompts = [probe.currentQuestion ?? ''];
    let turns = 0;

    for (const answer of answers) {
      const turn = (await session.page.evaluate(
        ([probeId, text]) => window.omakase.answerProbe({ probeId, answer: text }),
        [ids.probeId, answer],
      )) as {
        completed: boolean;
        result: {
          feedback: string;
          evidence: Array<{ answerExcerpt: string }>;
          nextQuestion?: { prompt: string } | null;
          shouldStop?: boolean;
        };
      };

      turns += 1;
      expect(turn.result.feedback.length).toBeGreaterThan(0);
      for (const evidence of turn.result.evidence) {
        expect(
          answer.includes(evidence.answerExcerpt),
          `evidence not verbatim: ${evidence.answerExcerpt}`,
        ).toBe(true);
      }
      if (turn.result.nextQuestion) prompts.push(turn.result.nextQuestion.prompt);
      if (turn.completed || turn.result.shouldStop) break;
    }

    expect(turns).toBeGreaterThanOrEqual(3);
    expect(new Set(prompts).size, 'each probe question must be new').toBe(prompts.length);

    const map = (await session.page.evaluate(
      (probeId) => window.omakase.getProbeLearningMap(probeId),
      ids.probeId,
    )) as {
      evidenceSummaries: unknown[];
      nextAction: { title: string } | null;
    };

    expect(map.evidenceSummaries.length).toBeGreaterThan(0);
    expect(map.nextAction).not.toBeNull();
  }, 300_000);

  it('recovers everything after closing and reopening the app', async () => {
    await shutdown(session);
    session = await launch();

    const state = (await session.page.evaluate(
      async ([studioId, sourceId]) => ({
        studios: await window.omakase.listStudios(),
        source: await window.omakase.getSource(sourceId),
        blocks: await window.omakase.listSourceBlocks(sourceId),
        providers: await window.omakase.listProviders(),
        concepts: await window.omakase.getConceptStates(studioId),
        today: await window.omakase.listToday(),
      }),
      [ids.studioId, ids.pdfSourceId],
    )) as {
      studios: Array<{ id: string }>;
      source: { processingStatus: string } | null;
      blocks: unknown[];
      providers: unknown[];
      concepts: unknown[];
      today: { primary: unknown | null; secondary: unknown[] };
    };

    expect(state.studios.map((s) => s.id)).toContain(ids.studioId);
    expect(state.source?.processingStatus).toBe('ready');
    expect(state.blocks.length).toBeGreaterThanOrEqual(3);
    expect(state.providers.length).toBe(1);
    expect(state.concepts.length).toBeGreaterThan(0);
    expect(state.today.primary !== null || state.today.secondary.length > 0).toBe(true);
  }, 180_000);

  it('keeps the API key out of the log file', () => {
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    expect(log).not.toContain(apiKey as string);
    expect(log).not.toMatch(/sk-proj-[A-Za-z0-9_-]{20,}/);
  });
});
