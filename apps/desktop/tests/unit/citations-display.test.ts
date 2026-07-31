import { describe, expect, it } from 'vitest';
import {
  formatCitationLabel,
  referenceLabel,
  stripCitationHandles,
} from '../../src/renderer/lib/citations-display.js';

describe('citation display', () => {
  it('formats human labels without raw handles', () => {
    expect(
      formatCitationLabel({
        handle: 'S1',
        sourceTitle: 'Score-Based Generative Modeling',
        headingPathText: '3',
        pageStart: 4,
      }),
    ).toBe('Score-Based Generative Modeling, §3, p. 4');
  });

  it('strips [S1] markers from assistant prose', () => {
    const text = 'The score is the gradient of log density [S1]. That matters for sampling [S2].';
    expect(stripCitationHandles(text)).toBe(
      'The score is the gradient of log density. That matters for sampling.',
    );
  });

  it('renders source handles as compact reference numbers', () => {
    expect(referenceLabel('S1')).toBe('1');
    expect(referenceLabel('S12')).toBe('12');
    expect(referenceLabel('Appendix')).toBe('Appendix');
  });
});
