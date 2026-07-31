import { describe, expect, it } from 'vitest';
import {
  extractHandlesFromMarkdown,
  validateCitationProposals,
} from '../../src/core/agent/citations.js';

describe('validateCitationProposals', () => {
  const context = [
    { handle: 'S1', sourceBlockId: 101, locatorJson: '{"kind":"paragraph"}' },
    { handle: 'S2', sourceBlockId: 102, locatorJson: '{"kind":"paragraph"}' },
  ];

  it('accepts handles present in context', () => {
    const result = validateCitationProposals(
      [{ handle: 'S1', claimSummary: 'Claim about S1' }],
      context,
    );
    expect(result.validated).toHaveLength(1);
    expect(result.validated[0]?.sourceBlockId).toBe(101);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects unknown handles fail-closed', () => {
    const result = validateCitationProposals([{ handle: 'S9', claimSummary: 'Invalid' }], context);
    expect(result.validated).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('invalid_handle');
  });
});

describe('extractHandlesFromMarkdown', () => {
  it('finds citation handles in markdown', () => {
    expect(extractHandlesFromMarkdown('See [S1] and [S2] for details.')).toEqual(['S1', 'S2']);
  });
});
