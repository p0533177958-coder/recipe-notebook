import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db, newId } from '../db';
import { startAlarm, stopAlarm, unlockAudio } from '../lib/sound';
import { speak } from '../lib/speech';
import { addTime, createTimer, isDue, pauseTimer, resumeTimer } from '../lib/timer';
import { getSettings } from '../settings';
import { S } from '../strings.he';
import type { ActiveTimer } from '../types';

type TimerApi = {
  timers: ActiveTimer[];
  now: number;
  start: (label: string, seconds: number, recipe?: { id: string; title: string }) => Promise<string>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  addMinute: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  /** Silences and clears every ringing timer. Returns how many were ringing. */
  stopRinging: () => Promise<number>;
};

const Ctx = createContext<TimerApi | null>(null);

export function useTimers(): TimerApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('TimerProvider missing');
  return v;
}

async function ensureNotificationPermission(): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    // Ignored: notifications are optional.
  }
}

async function notifyDone(t: ActiveTimer): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean; requireInteraction?: boolean } = {
    body: S.timers.notificationBody(t.recipeTitle),
    tag: `timer-${t.id}`,
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
    vibrate: [400, 200, 400, 200, 400],
    renotify: true,
    requireInteraction: true,
    data: { url: t.recipeId ? `${import.meta.env.BASE_URL}cook/${t.recipeId}` : import.meta.env.BASE_URL },
  };
  if (reg) await reg.showNotification(S.timers.notificationTitle(t.label), options);
  else new Notification(S.timers.notificationTitle(t.label), options);
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const timers = useLiveQuery(() => db.timers.orderBy('id').toArray(), [], [] as ActiveTimer[]);
  const sorted = useMemo(() => [...timers].sort((a, b) => a.createdAt - b.createdAt), [timers]);
  const [now, setNow] = useState(() => Date.now());
  const handled = useRef(new Set<string>());

  const active = sorted.some((t) => t.state !== 'paused');

  // Tick while something is running; also wake exactly at the next due time.
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const iv = window.setInterval(tick, 250);
    const next = Math.min(...sorted.filter((t) => t.state === 'running').map((t) => t.endAt));
    const to = Number.isFinite(next) ? window.setTimeout(tick, Math.max(0, next - Date.now()) + 20) : undefined;
    const onVis = () => tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      if (to) clearTimeout(to);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, sorted]);

  // Fire timers that have reached their end time.
  useEffect(() => {
    const due = sorted.filter((t) => isDue(t, now) && !handled.current.has(t.id));
    if (due.length === 0) return;
    for (const t of due) {
      handled.current.add(t.id);
      void db.timers.update(t.id, { state: 'ringing', remainingMs: 0 });
      if (getSettings().speakTimers) speak(S.timers.spokenDone(t.label), { interrupt: false });
      if (document.visibilityState === 'hidden') void notifyDone(t);
    }
  }, [now, sorted]);

  const ringing = sorted.some((t) => t.state === 'ringing');
  useEffect(() => {
    if (ringing) startAlarm();
    else stopAlarm();
  }, [ringing]);
  useEffect(() => () => stopAlarm(), []);

  const start = useCallback<TimerApi['start']>(async (label, seconds, recipe) => {
    unlockAudio();
    void ensureNotificationPermission();
    const t = createTimer(newId(), label, seconds, Date.now(), recipe);
    await db.timers.put(t);
    setNow(Date.now());
    return t.id;
  }, []);

  const mutate = useCallback(async (id: string, fn: (t: ActiveTimer, now: number) => ActiveTimer) => {
    const t = await db.timers.get(id);
    if (!t) return;
    const n = Date.now();
    const next = fn(t, n);
    if (next.state === 'running') handled.current.delete(id);
    await db.timers.put(next);
    setNow(n);
  }, []);

  const api = useMemo<TimerApi>(
    () => ({
      timers: sorted,
      now,
      start,
      pause: (id) => mutate(id, pauseTimer),
      resume: (id) => mutate(id, resumeTimer),
      addMinute: (id) => mutate(id, (t, n) => addTime(t, 60_000, n)),
      cancel: async (id) => {
        handled.current.delete(id);
        await db.timers.delete(id);
        void (await navigator.serviceWorker?.getRegistration())
          ?.getNotifications({ tag: `timer-${id}` })
          .then((ns) => ns.forEach((n) => n.close()));
      },
      stopRinging: async () => {
        const ids = sorted.filter((t) => t.state === 'ringing').map((t) => t.id);
        stopAlarm();
        await db.timers.bulkDelete(ids);
        ids.forEach((id) => handled.current.delete(id));
        return ids.length;
      },
    }),
    [sorted, now, start, mutate],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
