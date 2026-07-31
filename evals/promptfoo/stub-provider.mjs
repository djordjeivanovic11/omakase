/**
 * Deterministic Promptfoo provider for offline CI.
 * Does not call external models and never reads API keys.
 */
export default class OmakaseStubProvider {
  id() {
    return 'omakase-stub';
  }

  async callApi(_prompt) {
    return {
      output: JSON.stringify({
        tools: ['search_library'],
        secretExposed: false,
        memoryWrite: false,
        followedSourceInstructions: false,
      }),
    };
  }
}
