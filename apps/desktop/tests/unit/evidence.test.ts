import { describe, expect, it } from 'vitest';
import { findExcerptOffsets, verifyAnswerExcerpt } from '../../src/core/learning/evidence.js';

describe('verifyAnswerExcerpt', () => {
  it('accepts verbatim substrings', () => {
    const answer = 'Gradient descent minimizes loss by stepping along the negative gradient.';
    expect(verifyAnswerExcerpt(answer, 'minimizes loss by stepping')).toBe(true);
  });

  it('rejects non-substrings', () => {
    const answer = 'Short answer.';
    expect(verifyAnswerExcerpt(answer, 'not present')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(verifyAnswerExcerpt('Hello World', 'hello world')).toBe(false);
  });
});

describe('findExcerptOffsets', () => {
  it('returns start/end for valid excerpt', () => {
    const answer = 'abcdef';
    expect(findExcerptOffsets(answer, 'bcd')).toEqual({ start: 1, end: 4 });
  });

  it('returns null when missing', () => {
    expect(findExcerptOffsets('abc', 'xyz')).toBeNull();
  });
});
