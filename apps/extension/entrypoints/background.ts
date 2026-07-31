import { RETRY_INTERVAL_MS, STUDIOS_CACHE_KEY } from '../lib/constants';
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
  buildListStudiosMessage,
  NativeMessagingError,
  pingNativeHost,
  sendNativeMessage,
} from '../lib/native';
import { enqueueCapture, flushQueue, getQueueLength } from '../lib/queue';

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
        .map((item) => ({ id: item.id, name: item.name }));
      await writeStudiosCache(studios);
      return studios;
    }
  } catch {
    // Desktop may not implement list_studios yet.
  }
  return readStudiosCache();
}

async function getStatus(): Promise<PopupStatus> {
  const [desktopConnected, queueLength, studios] = await Promise.all([
    pingNativeHost(),
    getQueueLength(),
    refreshStudios(),
  ]);
  return { desktopConnected, queueLength, studios };
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
    const sent = await sendNativeMessage({
      type: 'capture',
      requestId: extracted.payload.externalRequestId,
      payload: extracted.payload,
    });
    if (sent.ok) {
      void flushQueue();
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
  return {
    ok: true,
    queued: true,
    title: extracted.pageTitle,
    queueLength: await getQueueLength(),
  };
}

export default defineBackground(() => {
  void flushQueue();

  browser.runtime.onInstalled.addListener(() => {
    void flushQueue();
  });

  browser.runtime.onStartup.addListener(() => {
    void flushQueue();
  });

  setInterval(() => {
    void flushQueue();
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
