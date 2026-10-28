import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IconArrowLeft, IconArrowRight, IconCheck, IconClose, IconList, IconMic, IconMore, IconSteps, IconSun } from '../components/Icons';
import { IngredientList } from '../components/IngredientList';
import { PrepReminders } from '../components/PrepAhead';
import { StepTimerButton, TimerBar } from '../components/TimerUI';
import { Button, EmptyState, IconButton, Sheet, SheetItem, Skeleton, toast } from '../components/ui';
import { MAX_COOK_FONT, MIN_COOK_FONT } from '../config';
import { db } from '../db';
import { useTimers } from '../hooks/timers';
import { useVoiceControl } from '../hooks/useVoiceControl';
import { useWakeLock } from '../hooks/useWakeLock';
import { planPrep } from '../lib/prepAhead';
import { markCooked } from '../lib/recipeActions';
import { speak, stopSpeaking } from '../lib/speech';
import { remainingMs, spokenDuration } from '../lib/timer';
import type { VoiceCommand } from '../lib/voice';
import { updateSettings, useSettings } from '../settings';
import { S } from '../strings.he';
import type { Recipe } from '../types';
import { useHaveIt } from './RecipeIntro';

/** Above this many steps the progress dots become a thin continuous bar. */
const DOTS_MAX = 10;

export default function Cook() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const recipe = useLiveQuery(() => db.recipes.get(id), [id], null);
  if (recipe === null) return <CookSkeleton />;
  if (!recipe || recipe.steps.length === 0) {
    return (
      <EmptyState
        title={S.errors.notFound}
        text=""
        action={
          <Button variant="secondary" className="w-full" onClick={() => navigate('/')}>
            {S.common.back}
          </Button>
        }
      />
    );
  }
  return <CookView recipe={recipe} />;
}

function CookView({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const timers = useTimers();
  const { checked, toggle } = useHaveIt(recipe.id);
  const total = recipe.steps.length;
  const stepIndex = Math.min(Math.max(0, Number(params.get('step') ?? '1') - 1 || 0), total - 1);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [sheet, setSheet] = useState<null | 'menu' | 'ingredients' | 'steps'>(null);
  const wake = useWakeLock(true);

  const step = recipe.steps[stepIndex];
  const ingredientById = new Map(recipe.ingredients.map((i) => [i.id, i]));
  const stepIngredients = step.ingredientIds.map((x) => ingredientById.get(x)).filter((x) => !!x);
  const isLast = stepIndex === total - 1;
  const recipeRef = { id: recipe.id, title: recipe.title };
  const prepPlan = useMemo(() => planPrep(recipe), [recipe]);

  // Tell once per session that the screen stays on, instead of a permanent line in every step.
  useEffect(() => {
    if (!wake) return;
    try {
      if (sessionStorage.getItem('rn-wake-told')) return;
      sessionStorage.setItem('rn-wake-told', '1');
    } catch {
      return;
    }
    toast(S.cook.wakeLockOn);
  }, [wake]);

  const goTo = (i: number) => {
    if (i < 0 || i >= total || i === stepIndex) return;
    navigator.vibrate?.(10);
    setDir(i > stepIndex ? 'next' : 'prev');
    setParams({ step: String(i + 1) }, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const finish = async () => {
    await markCooked(recipe.id);
    try {
      sessionStorage.removeItem(`rn-have-${recipe.id}`);
    } catch {
      // ignore
    }
    navigate(`/done/${recipe.id}`, { replace: true, viewTransition: true });
  };

  /** Running (or paused) timer started from this step for a given label. */
  const runningFor = (label: string) => timers.timers.find((t) => t.recipeId === recipe.id && t.label === label && t.state !== 'ringing')?.id;

  const stepSpeech = (i: number) => `${S.voice.stepPrefix(i + 1)} ${recipe.steps[i].text}`;

  const onVoice = (cmd: VoiceCommand) => {
    switch (cmd) {
      case 'next':
        if (isLast) speak(S.voice.lastStep);
        else {
          goTo(stepIndex + 1);
          speak(stepSpeech(stepIndex + 1));
        }
        break;
      case 'prev':
        if (stepIndex === 0) speak(S.voice.firstStep);
        else {
          goTo(stepIndex - 1);
          speak(stepSpeech(stepIndex - 1));
        }
        break;
      case 'read':
        speak(stepSpeech(stepIndex));
        break;
      case 'ingredients':
        speak(stepIngredients.length ? stepIngredients.map((i) => i.text).join('. ') : S.voice.noStepIngredients);
        break;
      case 'startTimer': {
        const t = step.timers.find((x) => !runningFor(x.label));
        if (!t) {
          speak(step.timers.length ? S.timers.alreadyRunning : S.cook.noTimerInStep);
          break;
        }
        void timers.start(t.label, t.seconds, recipeRef);
        speak(S.voice.started(t.label, spokenDuration(t.seconds * 1000)));
        break;
      }
      case 'stop':
        void timers.stopRinging().then((n) => {
          if (n === 0) stopSpeaking();
        });
        break;
      case 'timeLeft': {
        const active = timers.timers.filter((t) => t.state !== 'ringing');
        speak(
          active.length
            ? active.map((t) => S.timers.spokenLeft(t.label, spokenDuration(remainingMs(t, Date.now())))).join('. ')
            : S.timers.spokenNone,
        );
        break;
      }
    }
  };
  const voice = useVoiceControl(onVoice);

  // Swipe navigation, RTL: swiping right brings the next step (like turning a Hebrew book's page).
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goTo(dx > 0 ? stepIndex + 1 : stepIndex - 1);
  };

  // Keyboard arrows follow the visual direction in RTL.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(stepIndex + 1);
      if (e.key === 'ArrowRight') goTo(stepIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => () => stopSpeaking(), []);

  const font = settings.cookFontSize;
  const setFont = (v: number) => updateSettings({ cookFontSize: Math.min(MAX_COOK_FONT, Math.max(MIN_COOK_FONT, v)) });

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="shrink-0 ps-[max(8px,env(safe-area-inset-right))] pe-[max(8px,env(safe-area-inset-left))] pt-[calc(8px+env(safe-area-inset-top))]">
        <div className="flex items-center gap-1">
          <IconButton label={S.cook.exit} onClick={() => navigate(`/recipe/${recipe.id}`, { replace: true })}>
            <IconClose />
          </IconButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm text-muted">{recipe.title}</p>
            <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums" aria-live="polite">
              {S.cook.stepOf(stepIndex + 1, total)}
              {wake && <IconSun size={14} className="text-muted" aria-label={S.cook.wakeLockIcon} />}
            </p>
          </div>
          {voice.supported && (
            <IconButton
              label={voice.listening ? S.cook.micOff : S.cook.micOn}
              aria-pressed={voice.listening}
              onClick={voice.toggle}
              className={voice.listening ? 'anim-pulse bg-primary text-on-primary' : ''}
            >
              <IconMic />
            </IconButton>
          )}
          <IconButton label={S.cook.menu} aria-haspopup="dialog" onClick={() => setSheet('menu')}>
            <IconMore />
          </IconButton>
        </div>

        {total <= DOTS_MAX ? (
          <div className="flex justify-center gap-0.5 py-1" role="tablist" aria-label={S.cook.allSteps}>
            {recipe.steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === stepIndex}
                aria-label={S.cook.goToStep(i + 1)}
                onClick={() => goTo(i)}
                className="flex h-8 w-7 items-center justify-center"
              >
                <span
                  className={`block rounded-full transition-all duration-[250ms] ${
                    i === stepIndex ? 'h-2.5 w-6 bg-primary' : i < stepIndex ? 'size-2.5 bg-ink/40' : 'size-2.5 bg-line'
                  }`}
                />
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSheet('steps')}
            aria-label={S.cook.allSteps}
            className="flex h-8 w-full items-center px-4"
          >
            <span className="h-1 w-full overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-[250ms]"
                style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
              />
            </span>
          </button>
        )}

        {voice.listening && (
          <p className="anim-fade-in mx-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <IconMic size={16} className="shrink-0 text-primary" />
            {S.cook.listening} {S.cook.voiceHelp}
          </p>
        )}
      </header>

      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div key={step.id} className={dir === 'next' ? 'anim-next' : 'anim-prev'}>
          <PrepReminders plan={prepPlan} stepIndex={stepIndex} recipe={recipeRef} runningFor={runningFor} />
          <p className="font-medium" style={{ fontSize: `${font}px`, lineHeight: 1.4 }}>
            {step.text}
          </p>

          {stepIngredients.length > 0 && (
            <section className="mt-6 rounded-card bg-surface-2 p-4" aria-label={S.cook.stepIngredients}>
              <h2 className="mb-1 text-sm font-bold text-muted">{S.cook.stepIngredients}</h2>
              <ul className="flex flex-col gap-1" style={{ fontSize: `${Math.max(18, font - 8)}px` }}>
                {stepIngredients.map((ing) => (
                  <li key={ing.id} className="flex gap-2">
                    <span className="text-muted" aria-hidden="true">
                      •
                    </span>
                    {ing.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {step.timers.length > 0 && (
            <div className="mt-6 flex flex-col gap-3">
              {step.timers.map((t, i) => (
                <StepTimerButton key={`${step.id}-${i}`} timer={t} recipe={recipeRef} runningId={runningFor(t.label)} />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="flex gap-3 px-4 py-3">
          <Button big variant="secondary" className="flex-1" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>
            <IconArrowRight /> {S.cook.prev}
          </Button>
          {isLast ? (
            <Button big variant="olive" className="flex-[1.4]" onClick={() => void finish()}>
              <IconCheck /> {S.cook.done}
            </Button>
          ) : (
            <Button big className="flex-[1.4]" onClick={() => goTo(stepIndex + 1)}>
              {S.cook.next} <IconArrowLeft />
            </Button>
          )}
        </div>
        <TimerBar />
      </footer>

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={S.cook.menu}>
        <div className="flex min-h-14 items-center gap-3 px-3">
          <span className="flex-1 text-base font-medium">{S.cook.textSize}</span>
          <IconButton label={S.cook.fontSmaller} onClick={() => setFont(font - 2)} disabled={font <= MIN_COOK_FONT} className="border border-line">
            <span className="text-sm font-bold">א-</span>
          </IconButton>
          <span className="w-10 text-center text-base tabular-nums">{font}</span>
          <IconButton label={S.cook.fontBigger} onClick={() => setFont(font + 2)} disabled={font >= MAX_COOK_FONT} className="border border-line">
            <span className="text-lg font-bold">א+</span>
          </IconButton>
        </div>
        <SheetItem icon={<IconList />} label={S.cook.allIngredients} onClick={() => setSheet('ingredients')} />
        <SheetItem icon={<IconSteps />} label={S.cook.allSteps} onClick={() => setSheet('steps')} />
      </Sheet>

      <Sheet open={sheet === 'ingredients'} onClose={() => setSheet(null)} title={S.intro.ingredients}>
        <IngredientList ingredients={recipe.ingredients} checked={checked} onToggle={toggle} checkLabel={S.intro.haveIt} />
      </Sheet>

      <Sheet open={sheet === 'steps'} onClose={() => setSheet(null)} title={S.cook.allSteps}>
        <ol className="flex flex-col gap-1">
          {recipe.steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  goTo(i);
                  setSheet(null);
                }}
                aria-current={i === stepIndex ? 'step' : undefined}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition duration-150 active:bg-surface-2 ${
                  i === stepIndex ? 'bg-surface-2' : ''
                }`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                    i === stepIndex ? 'bg-primary text-on-primary' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="line-clamp-1 text-base">{s.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </Sheet>
    </div>
  );
}

function CookSkeleton() {
  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-4 pt-[calc(8px+env(safe-area-inset-top))]" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="size-12 rounded-full" />
      </div>
      <Skeleton className="mt-8 h-9 w-full rounded-xl" />
      <Skeleton className="mt-3 h-9 w-5/6 rounded-xl" />
      <Skeleton className="mt-3 h-9 w-2/3 rounded-xl" />
      <div className="flex-1" />
      <div className="flex gap-3 pb-4">
        <Skeleton className="h-14 flex-1 rounded-2xl" />
        <Skeleton className="h-14 flex-[1.4] rounded-2xl" />
      </div>
    </div>
  );
}
