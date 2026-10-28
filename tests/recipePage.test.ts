import { describe, expect, it } from 'vitest';
import { shortDuration, splitSteps } from '../src/pages/RecipePage';

describe('splitSteps', () => {
  it('keeps everything on one page when asked for one', () => {
    expect(splitSteps([100, 100, 100], 300, 1)).toEqual([[0, 3]]);
  });

  it('gives the first page fewer steps, because it also holds the ingredients', () => {
    const ranges = splitSteps(Array(10).fill(100), 600, 2);
    expect(ranges).toEqual([
      [0, 2],
      [2, 10],
    ]);
  });

  it('covers every step exactly once, in order', () => {
    for (const pages of [2, 3, 4, 5]) {
      const lengths = [50, 300, 80, 120, 400, 60, 90, 200, 70, 150, 30, 250];
      const ranges = splitSteps(lengths, 500, pages);
      expect(ranges).toHaveLength(pages);
      expect(ranges[0][0]).toBe(0);
      expect(ranges.at(-1)![1]).toBe(lengths.length);
      for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBe(ranges[i - 1][1]);
    }
  });

  it('lets the first page have no steps when the ingredients alone fill it', () => {
    const ranges = splitSteps([100, 100, 100], 2000, 2);
    expect(ranges[0]).toEqual([0, 0]);
    expect(ranges[1]).toEqual([0, 3]);
  });

  it('never leaves a continuation page empty while steps remain', () => {
    const ranges = splitSteps([1000, 1000], 100, 3);
    for (const [from, to] of ranges.slice(1)) expect(to).toBeGreaterThan(from);
  });
});

describe('shortDuration', () => {
  it('formats timer badges', () => {
    expect(shortDuration(300)).toBe('5 דק׳');
    expect(shortDuration(3600)).toBe('שעה');
    expect(shortDuration(5400)).toBe('שעה ו-30 דק׳');
    expect(shortDuration(7200)).toBe('שעתיים');
    expect(shortDuration(20)).toBe('1 דק׳');
  });
});
