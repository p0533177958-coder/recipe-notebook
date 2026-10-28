import { useState } from 'react';
import { useTimers } from '../hooks/timers';
import { adjustSeconds, formatClock, remainingMs } from '../lib/timer';
import { S } from '../strings.he';
import type { ActiveTimer, StepTimer } from '../types';
import { IconBell, IconMinus, IconPause, IconPlay, IconPlus, IconTimer, IconTrash } from './Icons';
import { Button, IconBadge, Sheet } from './ui';

/** Start button for one timer in a step, with ±1 minute adjustment before starting. */
export function StepTimerButton({
  timer,
  recipe,
  runningId,
}: {
  timer: StepTimer;
  recipe: { id: string; title: string };
  runningId?: string;
}) {
  const { start } = useTimers();
  const [seconds, setSeconds] = useState(timer.seconds);
  if (runningId) {
    return (
      <div className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-surface-2 px-4 text-base text-muted">
        <IconTimer size={20} />
        {S.cook.timerRunning} · {timer.label}
      </div>
    );
  }
  const stepBtn =
    'flex w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-ink transition duration-150 active:scale-[0.97] active:bg-surface-2';
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" aria-label={`${S.cook.minus} – ${timer.label}`} onClick={() => setSeconds((s) => adjustSeconds(s, -1))} className={stepBtn}>
        <IconMinus />
      </button>
      <Button big variant="secondary" className="flex-1" onClick={() => void start(timer.label, seconds, recipe)}>
        <IconTimer className="text-primary" />
        <span className="flex flex-col items-start">
          <span>
            {S.cook.startTimer} <span className="tabular-nums" dir="ltr">{formatClock(seconds * 1000)}</span>
          </span>
          <span className="text-sm font-normal text-muted">{timer.label}</span>
        </span>
      </Button>
      <button type="button" aria-label={`${S.cook.plus} – ${timer.label}`} onClick={() => setSeconds((s) => adjustSeconds(s, 1))} className={stepBtn}>
        <IconPlus />
      </button>
    </div>
  );
}

function TimerChip({ t, now, onOpen }: { t: ActiveTimer; now: number; onOpen: () => void }) {
  const ms = remainingMs(t, now);
  const ringing = t.state === 'ringing';
  const paused = t.state === 'paused';
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-4 transition duration-150 active:scale-[0.97] ${
        ringing ? 'anim-pulse border-primary bg-primary text-on-primary' : paused ? 'border-line bg-surface-2 text-muted' : 'border-line bg-surface text-ink'
      }`}
    >
      <IconTimer size={18} className={ringing ? 'anim-wiggle' : ''} />
      <span className="max-w-32 truncate text-sm">{t.label}</span>
      <span className="text-base font-bold tabular-nums" dir="ltr">
        {ringing ? S.timers.finished : formatClock(ms)}
      </span>
      {paused && <span className="text-xs">({S.timers.paused})</span>}
    </button>
  );
}

/** Fixed bar of all running timers, shown at the bottom of cook mode. */
export function TimerBar() {
  const { timers, now } = useTimers();
  const [openId, setOpenId] = useState<string | null>(null);
  if (timers.length === 0) return null;
  return (
    <>
      <div role="region" aria-label={S.timers.bar} className="no-scrollbar flex gap-2 overflow-x-auto border-t border-line bg-bg/95 px-4 py-2 backdrop-blur">
        {timers.map((t) => (
          <TimerChip key={t.id} t={t} now={now} onOpen={() => setOpenId(t.id)} />
        ))}
      </div>
      <TimerControlSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}

function TimerControlSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { timers, now, pause, resume, cancel, addMinute, stopRinging } = useTimers();
  const t = timers.find((x) => x.id === id);
  if (!t) return null;
  const ms = remainingMs(t, now);
  return (
    <Sheet open onClose={onClose} title={t.label}>
      {t.recipeTitle && <p className="-mt-2 mb-2 text-sm text-muted">{t.recipeTitle}</p>}
      <p className="py-4 text-center text-3xl font-bold tabular-nums" dir="ltr">
        {t.state === 'ringing' ? '0:00' : formatClock(ms)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {t.state === 'running' && (
          <Button variant="secondary" onClick={() => void pause(t.id)}>
            <IconPause size={20} /> {S.timers.pause}
          </Button>
        )}
        {t.state === 'paused' && (
          <Button onClick={() => void resume(t.id)}>
            <IconPlay size={20} /> {S.timers.resume}
          </Button>
        )}
        {t.state === 'ringing' && (
          <Button
            onClick={() => {
              void stopRinging();
              onClose();
            }}
          >
            {S.timers.stop}
          </Button>
        )}
        <Button variant="secondary" onClick={() => void addMinute(t.id)}>
          {S.timers.plusMinute}
        </Button>
        <Button
          variant="danger"
          className="col-span-2"
          onClick={() => {
            void cancel(t.id);
            onClose();
          }}
        >
          <IconTrash size={20} /> {S.timers.cancel}
        </Button>
      </div>
    </Sheet>
  );
}

/** Full-screen alert while any timer is ringing; shown on every screen. */
export function RingingOverlay() {
  const { timers, stopRinging, addMinute } = useTimers();
  const ringing = timers.filter((t) => t.state === 'ringing');
  if (ringing.length === 0) return null;
  return (
    <div role="alertdialog" aria-live="assertive" className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="anim-fade-in absolute inset-0 bg-scrim" />
      <div className="anim-fade-up relative w-full max-w-sm rounded-[var(--radius-sheet)] bg-surface p-6 text-center shadow-lift">
        <div className="anim-wiggle mb-4">
          <IconBadge>
            <IconBell size={44} />
          </IconBadge>
        </div>
        {ringing.map((t) => (
          <div key={t.id} className="mb-4">
            <h2 className="font-serif text-2xl">{S.timers.ringingTitle(t.label)}</h2>
            {t.recipeTitle && <p className="text-sm text-muted">{t.recipeTitle}</p>}
            <button
              type="button"
              className="mt-2 min-h-12 rounded-full border border-line px-4 text-sm tabular-nums transition duration-150 active:scale-[0.97]"
              onClick={() => void addMinute(t.id)}
            >
              {S.timers.plusMinute}
            </button>
          </div>
        ))}
        <Button big className="w-full" onClick={() => void stopRinging()}>
          {S.timers.stop}
        </Button>
      </div>
    </div>
  );
}
