import type { ActiveTimer } from '../types';

/** Timers are stored as an end timestamp, so they survive reloads and backgrounding. */
export function remainingMs(t: ActiveTimer, now: number): number {
  if (t.state === 'paused') return Math.max(0, t.remainingMs);
  if (t.state === 'ringing') return 0;
  return Math.max(0, t.endAt - now);
}

export function isDue(t: ActiveTimer, now: number): boolean {
  return t.state === 'running' && t.endAt <= now;
}

export function createTimer(
  id: string,
  label: string,
  seconds: number,
  now: number,
  recipe?: { id: string; title: string },
): ActiveTimer {
  const ms = Math.max(1, Math.round(seconds)) * 1000;
  return {
    id,
    label,
    recipeId: recipe?.id,
    recipeTitle: recipe?.title,
    endAt: now + ms,
    remainingMs: ms,
    state: 'running',
    createdAt: now,
  };
}

export function pauseTimer(t: ActiveTimer, now: number): ActiveTimer {
  if (t.state !== 'running') return t;
  return { ...t, state: 'paused', remainingMs: Math.max(0, t.endAt - now) };
}

export function resumeTimer(t: ActiveTimer, now: number): ActiveTimer {
  if (t.state !== 'paused') return t;
  return { ...t, state: 'running', endAt: now + t.remainingMs };
}

export function addTime(t: ActiveTimer, ms: number, now: number): ActiveTimer {
  if (t.state === 'paused') return { ...t, remainingMs: t.remainingMs + ms };
  if (t.state === 'ringing') return { ...t, state: 'running', endAt: now + ms, remainingMs: ms };
  return { ...t, endAt: t.endAt + ms };
}

/** "12:34", or "1:02:03" for an hour and above. Rounds up so 0:00 is shown only at the end. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Spoken Hebrew duration, e.g. "שעה ו-5 דקות", "3 דקות ו-20 שניות". */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`);
  if (m) parts.push(m === 1 ? 'דקה' : `${m} דקות`);
  if (s && h === 0) parts.push(s === 1 ? 'שנייה' : `${s} שניות`);
  if (parts.length === 0) return 'פחות משנייה';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} ו-${parts[parts.length - 1]}`;
}

/** Adjust a pre-start duration by whole minutes, never below one minute (or the original if shorter). */
export function adjustSeconds(seconds: number, deltaMinutes: number): number {
  const next = seconds + deltaMinutes * 60;
  const floor = Math.min(seconds, 60);
  return Math.max(floor, next);
}
