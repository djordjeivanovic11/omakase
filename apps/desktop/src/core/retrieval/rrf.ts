export interface RankedItem<T> {
  item: T;
  rank: number;
}

export interface RrfScore<T> {
  item: T;
  score: number;
  ranks: number[];
}

/**
 * Reciprocal rank fusion across multiple ranked lists.
 * @param lists Each list is ordered best-first (rank 1 = index 0).
 * @param k Smoothing constant (default 60).
 */
export function reciprocalRankFusion<T>(lists: RankedItem<T>[][], k = 60): RrfScore<T>[] {
  const scores = new Map<T, { score: number; ranks: number[] }>();

  for (const list of lists) {
    for (const { item, rank } of list) {
      const existing = scores.get(item) ?? { score: 0, ranks: [] };
      existing.score += 1 / (k + rank);
      existing.ranks.push(rank);
      scores.set(item, existing);
    }
  }

  return [...scores.entries()]
    .map(([item, { score, ranks }]) => ({ item, score, ranks }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.ranks[0] ?? Number.POSITIVE_INFINITY) - (b.ranks[0] ?? Number.POSITIVE_INFINITY),
    );
}
