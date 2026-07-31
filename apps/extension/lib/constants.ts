/** Native messaging host registered by the Omakase desktop installer. */
export const NATIVE_HOST_NAME = 'com.omakase.desktop';

/**
 * Extension IDs allowlisted by the desktop native host during packaging.
 * Replace placeholders with store-assigned IDs before release.
 */
export const EXPECTED_EXTENSION_IDS = {
  chrome: 'PLACEHOLDER_CHROME_EXTENSION_ID',
  edge: 'PLACEHOLDER_EDGE_EXTENSION_ID',
} as const;

export const QUEUE_STORAGE_KEY = 'omakase_capture_queue_v1';
export const STUDIOS_CACHE_KEY = 'omakase_studios_cache_v1';

export const RETRY_INTERVAL_MS = 60_000;
export const MAX_QUEUE_ATTEMPTS = 12;
