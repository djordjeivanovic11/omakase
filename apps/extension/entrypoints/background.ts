import { LAST_STUDIO_KEY, RETRY_INTERVAL_MS, STUDIOS_CACHE_KEY } from '../lib/constants';
import type {
  BackgroundMessage,
  BackgroundResponse,
  CaptureRequest,
  CaptureResponse,
  ContentExtractMessage,
  ContentExtractResponse,
  PopupStatus,
  StudioOption,
} from '../lib/messages';
import {
  buildCaptureMessage,
  buildListStudiosMessage,
  NativeMessagingError,
  pingNativeHost,
  sendNativeMessage,
} from '../lib/native';
import {
  enqueueCapture,
  flushQueue,
  getPendingCaptureLength,
  getQueueLength,
  pollPendingCaptures,
  recordPendingCapture,
} from '../lib/queue';

const CONTENT_SCRIPT = '/content-scripts/content.js';

async function readStudiosCache(): Promise<StudioOption[]> {
  const stored = await browser.storage.local.get(STUDIOS_CACHE_KEY);
  const value = stored[STUDIOS_CACHE_KEY];
  if (!Array.isArray(value)) return [];
  return value as StudioOption[];
}

async function writeStudiosCache(studios: StudioOption[]): Promise<void> {
  await browser.storage.local.set({ [STUDIOS_CACHE_KEY]: studios });
}

async function refreshStudios(): Promise<StudioOption[]> {
  try {
    const result = await sendNativeMessage(buildListStudiosMessage());
    if (result.ok && Array.isArray(result.response)) {
      const studios = result.response
        .filter(
          (item): item is StudioOption =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as StudioOption).id === 'string' &&
            typeof (item as StudioOption).name === 'string',
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          sourceCount:
            typeof (item as StudioOption).sourceCount === 'number'
              ? (item as StudioOption).sourceCount
              : undefined,
        }));
      const storedLast = await browser.storage.local.get(LAST_STUDIO_KEY);
      const last = storedLast[LAST_STUDIO_KEY];
      const lastStudioId =
        last && typeof last === 'object' && 'studioId' in last
          ? String((last as { studioId: unknown }).studioId)
          : '';
      const lastUsedAt =
        last && typeof last === 'object' && 'usedAt' in last
          ? Number((last as { usedAt: unknown }).usedAt)
          : undefined;
      const withRecent = studios.map((studio) =>
        studio.id === lastStudioId ? { ...studio, lastUsedAt } : studio,
      );
      await writeStudiosCache(withRecent);
      return withRecent;
    }
  } catch {
    // Desktop may not implement list_studios yet.
  }
  return readStudiosCache();
}

async function getStatus(): Promise<PopupStatus> {
  const [desktopConnected, queueLength, processingCount, studios] = await Promise.all([
    pingNativeHost(),
    getQueueLength(),
    getPendingCaptureLength(),
    refreshStudios(),
  ]);
  return { desktopConnected, queueLength, processingCount, studios };
}

async function ensureCaptureListener(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT],
  });
}

async function extractFromTab(
  tabId: number,
  request: CaptureRequest,
): Promise<ContentExtractResponse> {
  const message: ContentExtractMessage = {
    type: 'omakase_extract',
    input: {
      includeSelection: request.includeSelection,
      userNote: request.userNote,
      destination: request.destination,
      studioId: request.studioId,
    },
  };

  try {
    return (await browser.tabs.sendMessage(tabId, message)) as ContentExtractResponse;
  } catch {
    await ensureCaptureListener(tabId);
    return (await browser.tabs.sendMessage(tabId, message)) as ContentExtractResponse;
  }
}

async function captureActiveTab(request: CaptureRequest): Promise<CaptureResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('http')) {
    return { ok: false, error: 'Open a normal web page to capture.' };
  }

  if (request.destination === 'studio' && !request.studioId?.trim()) {
    return { ok: false, error: 'Choose a Studio destination.' };
  }

  const extracted = await extractFromTab(tab.id, request);
  if (!extracted.ok || !extracted.payload) {
    return { ok: false, error: extracted.error ?? 'Page extraction failed.' };
  }

  try {
    const captureMessage = buildCaptureMessage(
      extracted.payload,
      extracted.payload.externalRequestId,
    );
    const sent = await sendNativeMessage(captureMessage);
    if (sent.ok) {
      await recordPendingCapture(captureMessage);
      if (request.studioId) {
        await browser.storage.local.set({
          [LAST_STUDIO_KEY]: { studioId: request.studioId, usedAt: Date.now() },
        });
      }
      void flushQueue();
      await openOmakase(extracted.payload.externalRequestId);
      return {
        ok: true,
        title: extracted.pageTitle,
        queueLength: await getQueueLength(),
      };
    }
  } catch (error) {
    if (
      error instanceof NativeMessagingError &&
      error.code !== 'host_unavailable' &&
      error.code !== 'send_failed'
    ) {
      return { ok: false, error: error.message };
    }
  }

  await enqueueCapture(extracted.payload);
  await openOmakase(extracted.payload.externalRequestId);
  return {
    ok: true,
    queued: true,
    title: extracted.pageTitle,
    queueLength: await getQueueLength(),
  };
}

async function openOmakase(requestId: string): Promise<void> {
  try {
    await browser.tabs.create({ url: `omakase://capture/${encodeURIComponent(requestId)}` });
  } catch {
    // The queue remains durable if protocol registration is unavailable.
  }
}

export default defineBackground(() => {
  void flushQueue();
  void pollPendingCaptures();

  browser.runtime.onInstalled.addListener(() => {
    void flushQueue();
  });

  browser.runtime.onStartup.addListener(() => {
    void flushQueue();
  });

  browser.contextMenus?.create({
    id: 'omakase-save-page',
    title: 'Save page to Omakase',
    contexts: ['page', 'selection'],
  });

  browser.contextMenus?.onClicked.addListener((info) => {
    if (info.menuItemId !== 'omakase-save-page') return;
    void captureActiveTab({
      includeSelection: Boolean(info.selectionText?.trim()),
      userNote: '',
      destination: 'inbox',
    });
  });

  setInterval(() => {
    void flushQueue();
    void pollPendingCaptures();
  }, RETRY_INTERVAL_MS);

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const typed = message as BackgroundMessage;

    void (async (): Promise<BackgroundResponse> => {
      if (typed.type === 'get_status') {
        return getStatus();
      }
      if (typed.type === 'flush_queue') {
        const result = await flushQueue();
        return { ok: true, sent: result.sent, remaining: result.remaining };
      }
      if (typed.type === 'capture') {
        return captureActiveTab(typed.request);
      }
      return { ok: false, error: 'unknown_message' };
    })()
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'background_error',
        });
      });

    return true;
  });
});
