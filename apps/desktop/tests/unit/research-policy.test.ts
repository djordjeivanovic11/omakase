import { describe, expect, it } from 'vitest';
import { researchToolsAllowed, shouldPreferLocalBeforeWeb } from '../../src/core/agent/research.js';

describe('research policy', () => {
  it('disables web search when capability missing', () => {
    const result = researchToolsAllowed({ webSearch: false });
    expect(result.allowWebSearch).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('prefers local sources for non-current questions', () => {
    expect(shouldPreferLocalBeforeWeb('What is gradient descent?', true)).toBe(true);
    expect(shouldPreferLocalBeforeWeb('What is the latest news today?', true)).toBe(false);
  });
});
