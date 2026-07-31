/**
 * Verifies that an evidence excerpt is a verbatim substring of the learner answer.
 * Comparison is case-sensitive and whitespace-preserving per spec.
 */
export function verifyAnswerExcerpt(answer: string, excerpt: string): boolean {
  if (!excerpt || excerpt.length === 0) return false;
  return answer.includes(excerpt);
}

export function findExcerptOffsets(
  answer: string,
  excerpt: string,
): { start: number; end: number } | null {
  const start = answer.indexOf(excerpt);
  if (start < 0) return null;
  return { start, end: start + excerpt.length };
}
