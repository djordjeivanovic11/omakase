import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from '../../src/core/retrieval/rrf.js';

describe('reciprocalRankFusion', () => {
  it('merges two ranked lists with higher score for items in both', () => {
    const listA = [
      { item: 'a', rank: 1 },
      { item: 'b', rank: 2 },
      { item: 'c', rank: 3 },
    ];
    const listB = [
      { item: 'b', rank: 1 },
      { item: 'd', rank: 2 },
      { item: 'a', rank: 3 },
    ];

    const fused = reciprocalRankFusion([listA, listB]);
    expect(fused[0]?.item).toBe('b');
    expect(fused.some((x) => x.item === 'a')).toBe(true);
    expect(fused.some((x) => x.item === 'd')).toBe(true);
  });

  it('returns empty for no lists', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});
