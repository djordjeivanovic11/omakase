import type { OmakaseApi } from '../../preload/preload.js';

declare global {
  interface Window {
    omakase: OmakaseApi;
  }
}
