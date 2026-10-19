import { describe, expect, it } from 'vitest';
import {
  addTime,
  adjustSeconds,
  createTimer,
  formatClock,
  isDue,
  pauseTimer,
  remainingMs,
  resumeTimer,
  spokenDuration,
} from '../src/lib/timer';

const T0 = 1_000_000;

describe('timer math', () => {
  it('counts down from an end timestamp', () => {
    const t = createTimer('a', 'אפייה', 300, T0);
    expect(remainingMs(t, T0)).toBe(300_000);
    expect(remainingMs(t, T0 + 60_000)).toBe(240_000);
    expect(remainingMs(t, T0 + 999_999)).toBe(0);
  });

  it('is correct after a "reload" (only timestamps are stored)', () => {
    const stored = JSON.parse(JSON.stringify(createTimer('a', 'x', 60, T0)));
    expect(remainingMs(stored, T0 + 45_000)).toBe(15_000);
  });

  it('becomes due at its end time', () => {
    const t = createTimer('a', 'x', 10, T0);
    expect(isDue(t, T0 + 9_999)).toBe(false);
    expect(isDue(t, T0 + 10_000)).toBe(true);
  });

  it('pauses and resumes without losing time', () => {
    let t = createTimer('a', 'x', 100, T0);
    t = pauseTimer(t, T0 + 30_000);
    expect(t.state).toBe('paused');
    expect(remainingMs(t, T0 + 500_000)).toBe(70_000);
    expect(isDue(t, T0 + 500_000)).toBe(false);
    t = resumeTimer(t, T0 + 500_000);
    expect(remainingMs(t, T0 + 510_000)).toBe(60_000);
  });

  it('adds a minute while running, paused or ringing', () => {
    const run = createTimer('a', 'x', 60, T0);
    expect(remainingMs(addTime(run, 60_000, T0), T0)).toBe(120_000);
    const paused = pauseTimer(run, T0 + 30_000);
    expect(remainingMs(addTime(paused, 60_000, T0), T0)).toBe(90_000);
    const ringing = { ...run, state: 'ringing' as const };
    const again = addTime(ringing, 60_000, T0 + 100_000);
    expect(again.state).toBe('running');
    expect(remainingMs(again, T0 + 100_000)).toBe(60_000);
  });

  it('runs several timers independently', () => {
    const a = createTimer('a', 'אורז', 600, T0);
    const b = createTimer('b', 'תנור', 120, T0 + 5_000);
    const now = T0 + 125_000;
    expect(isDue(a, now)).toBe(false);
    expect(isDue(b, now)).toBe(true);
    expect(remainingMs(a, now)).toBe(475_000);
  });
});

describe('formatting', () => {
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5 * 60_000)).toBe('5:00');
    expect(formatClock(754_000)).toBe('12:34');
    expect(formatClock(3_723_000)).toBe('1:02:03');
    expect(formatClock(59_001)).toBe('1:00'); // rounds up
  });
  it('speaks durations in Hebrew', () => {
    expect(spokenDuration(60_000)).toBe('דקה');
    expect(spokenDuration(5 * 60_000)).toBe('5 דקות');
    expect(spokenDuration(3 * 60_000 + 20_000)).toBe('3 דקות ו-20 שניות');
    expect(spokenDuration(3_600_000 + 5 * 60_000)).toBe('שעה ו-5 דקות');
  });
  it('adjusts by minutes before starting but never below one minute', () => {
    expect(adjustSeconds(300, 1)).toBe(360);
    expect(adjustSeconds(300, -1)).toBe(240);
    expect(adjustSeconds(60, -1)).toBe(60);
    expect(adjustSeconds(30, -1)).toBe(30);
  });
});
