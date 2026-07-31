import { extractPageCapture, finalizeCapturePayload } from '../lib/capture';
import type { ContentExtractMessage, ContentExtractResponse } from '../lib/messages';

export default defineContentScript({
  matches: ['*://*/*'],
  excludeMatches: [
    '*://chrome.google.com/*',
    '*://microsoftedge.microsoft.com/*',
    '*://chromewebstore.google.com/*',
  ],
  runAt: 'document_idle',
  registration: 'runtime',
  main() {
    if (globalThis.__OMAKASE_CAPTURE_LISTENER__) return;
    globalThis.__OMAKASE_CAPTURE_LISTENER__ = true;

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const typed = message as ContentExtractMessage;
      if (typed?.type !== 'omakase_extract') return;

      void (async () => {
        try {
          const extracted = await extractPageCapture(typed.input);
          const payload = finalizeCapturePayload(extracted.payload);
          const response: ContentExtractResponse = {
            ok: true,
            payload,
            pageTitle: extracted.pageTitle,
          };
          sendResponse(response);
        } catch (error) {
          const response: ContentExtractResponse = {
            ok: false,
            error: error instanceof Error ? error.message : 'extract_failed',
          };
          sendResponse(response);
        }
      })();

      return true;
    });
  },
});

declare global {
  var __OMAKASE_CAPTURE_LISTENER__: boolean | undefined;
}
