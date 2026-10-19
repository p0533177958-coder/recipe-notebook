import { useState } from 'react';
import { useTimers } from '../hooks/timers';
import { adjustSeconds, formatClock, remainingMs } from '../lib/timer';
import { S } from '../strings.he';
import type { ActiveTimer, StepTimer } from '../types';
import { IconMinus, IconPause, IconPlay, IconPlus, IconTimer, IconTrash } from './Icons';
import { Button, Sheet } from './ui';

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
      <div className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-secondary/60 px-4 text-lg text-secondary">
        <IconTimer />
        {S.cook.timerRunning} · {timer.label}
      </div>
    );
  }
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        aria-label={`${S.cook.minus} – ${timer.label}`}
        onClick={() => setSeconds((s) => adjustSeconds(s, -1))}
        className="flex w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-ink active:bg-surface-2"
      >
        <IconMinus />
      </button>
      <Button
        big
        variant="olive"
        className="flex-1 tabular-nums"
        onClick={() => void start(timer.label, seconds, recipe)}
      >
        <IconTimer />
        <span>
          {S.cook.startTimer} {formatClock(seconds * 1000)}
          <span className="block text-sm font-normal opacity-90">{timer.label}</span>
        </span>
      </Button>
      <button
        type="button"
        aria-label={`${S.cook.plus} – ${timer.label}`}
        onClick={() => setSeconds((s) => adjustSeconds(s, 1))}
        className="flex w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-ink active:bg-surface-2"
      >
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
      className={`flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-4 transition ${
        ringing
          ? 'anim-pulse border-primary bg-primary text-on-primary'
          : paused
            ? 'border-line bg-surface-2 text-muted'
            : 'border-line bg-surface text-ink'
      }`}
    >
      <IconTimer size={20} className={ringing ? 'anim-wiggle' : ''} />
      <span className="max-w-32 truncate">{t.label}</span>
      <span className="font-bold tabular-nums" dir="ltr">
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
      <div
        role="region"
        aria-label={S.timers.bar}
        className="no-scrollbar flex gap-2 overflow-x-auto border-t border-line bg-bg/95 px-3 py-2 backdrop-blur"
      >
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
      {t.recipeTitle && <p className="-mt-2 mb-2 text-muted">{t.recipeTitle}</p>}
      <p className="py-4 text-center text-6xl font-bold tabular-nums" dir="ltr">
        {t.state === 'ringing' ? '0:00' : formatClock(ms)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {t.state === 'running' && (
          <Button variant="secondary" onClick={() => void pause(t.id)}>
            <IconPause size={20} /> {S.timers.pause}
          </Button>
        )}
        {t.state === 'paused' && (
          <Button variant="olive" onClick={() => void resume(t.id)}>
            <IconPlay size={20} /> {S.timers.resume}
          </Button>
        )}
        {t.state === 'ringing' && (
          <Button
            variant="primary"
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
    <div role="alertdialog" aria-live="assertive" className="fixed inset-0 z-[70] flex items-center justify-center p-5">
      <div className="anim-fade-in absolute inset-0 bg-black/55" />
      <div className="anim-fade-up relative w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-lift">
        <div className="anim-wiggle mx-auto mb-3 text-6xl" aria-hidden="true">
          ⏰
        </div>
        {ringing.map((t) => (
          <div key={t.id} className="mb-4">
            <h2 className="font-serif text-2xl font-bold">{S.timers.ringingTitle(t.label)}</h2>
            {t.recipeTitle && <p className="text-muted">{t.recipeTitle}</p>}
            <button
              type="button"
              className="mt-2 min-h-11 rounded-full border border-line px-4 text-sm"
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
