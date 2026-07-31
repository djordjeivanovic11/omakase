# Omakase browser extension

Manifest V3 extension for Chrome and Edge. Captures the **rendered page** with [Defuddle](https://github.com/kepano/defuddle), optional selection and note, and sends it to the local Omakase desktop app through **native messaging**.

No model calls run in the extension.

## Features

- Defuddle extraction of the active tab into Markdown
- URL, title, author, publication date (when available), selection, and user note
- Destination: **Inbox** or **Studio**
- Native messaging via `@omakase/contracts` schemas (`NativeMessageSchema`, `BrowserCapturePayloadSchema`)
- Local retry queue in extension storage when the desktop app is unavailable
- Simple popup UI with connection and queue status

## Build

From the repository root:

```bash
pnpm install
pnpm --filter @omakase/contracts build
pnpm --filter @omakase/extension build        # Chrome
pnpm --filter @omakase/extension build:edge   # Edge
pnpm --filter @omakase/extension build:all    # Both
```

Development:

```bash
pnpm --filter @omakase/extension dev
```

Load the unpacked build from `apps/extension/.output/chrome-mv3` (or `edge-mv3` for Edge).

## Native messaging

| Constant | Value |
| --- | --- |
| Host name | `com.omakase.desktop` |
| Max payload | 512 KB (`NATIVE_MESSAGE_MAX_BYTES` in `@omakase/contracts`) |

Message shape (validated on both sides):

```json
{
  "type": "capture",
  "requestId": "<uuidv7>",
  "payload": { "...BrowserCapturePayload..." }
}
```

Ping:

```json
{ "type": "ping", "requestId": "<uuidv7>" }
```

The desktop native host lives in `apps/desktop/src/main/native-host.ts` and imports captures through `importBrowserCapture`.

## Expected extension IDs (desktop allowlist)

The desktop app must reject native messages from unknown extension IDs. Replace these placeholders with store-assigned IDs during packaging:

| Browser | Expected extension ID |
| --- | --- |
| Chrome | `PLACEHOLDER_CHROME_EXTENSION_ID` |
| Edge | `PLACEHOLDER_EDGE_EXTENSION_ID` |

Constants are defined in `lib/constants.ts` for documentation and release automation.

### Connect an unpacked build (local use)

1. Build the extension (`pnpm --filter @omakase/extension build`).
2. Open `chrome://extensions` (or Edge’s equivalent), enable **Developer mode**, and **Load unpacked** → `apps/extension/.output/chrome-mv3` (or `edge-mv3`).
3. Copy the 32-character **Extension ID**.
4. Start Omakase desktop (`pnpm dev` or the packaged app). On first launch it installs the native messaging host (`com.omakase.desktop`) for Chrome / Edge / Brave / Chromium.
5. In Omakase go to **You → Browser capture**, paste the Extension ID, and click **Connect extension**.
6. Open the extension popup on any page and choose **Save page** (Inbox or a Studio). Captures land in Inbox when the desktop app is running; otherwise they queue locally and retry.

If capture fails after registering an ID, fully quit and reopen the browser so it reloads the native messaging manifest.

## Permissions

- `activeTab` — capture only the tab the user invokes
- `storage` — offline retry queue and cached Studio list
- `scripting` — inject the capture content script on demand
- `nativeMessaging` — talk to the Omakase desktop host

No broad host permissions are declared. Capture runs when the user opens the popup and clicks **Save page**.

## Offline queue

When the native host is missing or Omakase is closed, captures are persisted under `omakase_capture_queue_v1` in `chrome.storage.local`. The background worker retries on startup, on a timer, and after successful sends.

## Project layout

```text
apps/extension/
├── entrypoints/
│   ├── background.ts      # native messaging + retry queue
│   ├── content.ts         # Defuddle extraction in page context
│   └── popup/             # capture UI
├── lib/
│   ├── capture.ts         # Defuddle → BrowserCapturePayload
│   ├── native.ts          # schema validation + size limits
│   ├── queue.ts           # persisted failed captures
│   └── constants.ts       # host name + expected extension IDs
└── wxt.config.ts
```
