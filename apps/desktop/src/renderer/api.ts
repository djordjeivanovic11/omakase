export function getApi() {
  if (!window.omakase) {
    throw new Error('Omakase API is unavailable — preload bridge not loaded');
  }
  return window.omakase;
}

export const api = {
  get current() {
    return getApi();
  },
};
