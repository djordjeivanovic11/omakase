import type { AgentMode } from '@omakase/contracts';

/**
 * Research mode policy: only available when explicitly requested.
 * Provider-native web search is gated by model capabilities.
 * Snippets alone are never durable evidence — capture must materialize a local source.
 */
export function researchToolsAllowed(capabilities: { webSearch: boolean }): {
  allowWebSearch: boolean;
  reason?: string;
} {
  if (!capabilities.webSearch) {
    return {
      allowWebSearch: false,
      reason:
        'The selected model does not support native web search. Capture a source locally or choose a model with search support.',
    };
  }
  return { allowWebSearch: true };
}

export function isResearchMode(mode: AgentMode): boolean {
  return mode === 'research';
}

export function shouldPreferLocalBeforeWeb(question: string, hasLocalSources: boolean): boolean {
  if (!hasLocalSources) return false;
  const currentInfo = /\b(today|latest|current|news|as of|this week|202[4-9]|203\d)\b/i.test(
    question,
  );
  return !currentInfo;
}
