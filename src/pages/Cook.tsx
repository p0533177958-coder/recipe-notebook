import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IconArrowLeft, IconArrowRight, IconClose, IconList, IconMic } from '../components/Icons';
import { IngredientList } from '../components/IngredientList';
import { PrepReminders } from '../components/PrepAhead';
import { StepTimerButton, TimerBar } from '../components/TimerUI';
import { Button, IconButton, Sheet, toast } from '../components/ui';
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

export default function Cook() {
  const { id = '' } = useParams();
  const recipe = useLiveQuery(() => db.recipes.get(id), [id], null);
  if (recipe === null) return <div className="min-h-dvh" />;
  if (!recipe || recipe.steps.length === 0) return <p className="p-8 text-center text-lg">{S.errors.notFound}</p>;
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
  const [showAll, setShowAll] = useState(false);
  const wake = useWakeLock(true);

  const step = recipe.steps[stepIndex];
  const ingredientById = new Map(recipe.ingredients.map((i) => [i.id, i]));
  const stepIngredients = step.ingredientIds.map((x) => ingredientById.get(x)).filter((x) => !!x);
  const isLast = stepIndex === total - 1;
  const recipeRef = { id: recipe.id, title: recipe.title };
  const prepPlan = useMemo(() => planPrep(recipe), [recipe]);

  const goTo = (i: number) => {
    if (i < 0 || i >= total || i === stepIndex) return;
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
    toast(S.cook.finishedBravo);
    navigate('/', { replace: true });
  };

  /** Running (or paused) timer started from this step for a given label. */
  const runningFor = (label: string) =>
    timers.timers.find((t) => t.recipeId === recipe.id && t.label === label && t.state !== 'ringing')?.id;

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
        speak(
          stepIngredients.length
            ? stepIngredients.map((i) => i.text).join('. ')
            : S.voice.noStepIngredients,
        );
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
      <header className="shrink-0 px-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-1">
          <IconButton label={S.cook.exit} onClick={() => navigate(`/recipe/${recipe.id}`, { replace: true })}>
            <IconClose />
          </IconButton>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm text-muted">{recipe.title}</p>
            <p className="font-bold" aria-live="polite">
              {S.cook.stepOf(stepIndex + 1, total)}
            </p>
          </div>
          <IconButton label={S.cook.fontSmaller} onClick={() => setFont(font - 2)} disabled={font <= MIN_COOK_FONT}>
            <span className="text-sm font-bold">א-</span>
          </IconButton>
          <IconButton label={S.cook.fontBigger} onClick={() => setFont(font + 2)} disabled={font >= MAX_COOK_FONT}>
            <span className="text-lg font-bold">א+</span>
          </IconButton>
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
        </div>
        <div className="flex flex-wrap justify-center gap-0.5 py-1" role="tablist" aria-label="שלבים">
          {recipe.steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === stepIndex}
              aria-label={S.cook.goToStep(i + 1)}
              onClick={() => goTo(i)}
              className="flex size-8 items-center justify-center"
            >
              <span
                className={`block rounded-full transition-all ${
                  i === stepIndex ? 'h-3 w-6 bg-primary' : i < stepIndex ? 'size-3 bg-primary/50' : 'size-3 bg-line'
                }`}
              />
            </button>
          ))}
        </div>
        {voice.listening && (
          <p className="anim-fade-in rounded-xl bg-primary/10 px-3 py-1.5 text-center text-sm text-primary">
            🎙 {S.cook.listening} {S.cook.voiceHelp}
          </p>
        )}
      </header>

      <main
        className="flex-1 overflow-y-auto px-5 pt-4 pb-4"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={step.id} className={dir === 'next' ? 'anim-next' : 'anim-prev'}>
          <PrepReminders plan={prepPlan} stepIndex={stepIndex} recipe={recipeRef} runningFor={runningFor} />
          <p className="font-medium" style={{ fontSize: `${font}px`, lineHeight: 1.4 }}>
            {step.text}
          </p>

          {stepIngredients.length > 0 && (
            <section className="mt-6 rounded-card bg-surface-2 p-4" aria-label={S.cook.stepIngredients}>
              <h2 className="mb-1 text-base font-bold text-muted">{S.cook.stepIngredients}</h2>
              <ul className="flex flex-col gap-1" style={{ fontSize: `${Math.max(20, font - 8)}px` }}>
                {stepIngredients.map((ing) => (
                  <li key={ing.id} className="flex gap-2">
                    <span className="text-primary" aria-hidden="true">
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

          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-muted active:bg-surface-2"
          >
            <IconList size={20} />
            {S.cook.allIngredients}
          </button>
          {wake && <p className="mt-3 text-xs text-muted">☀️ {S.cook.wakeLockOn}</p>}
        </div>
      </main>

      <footer className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <div className="flex gap-3 px-4 py-3">
          <Button
            big
            variant="secondary"
            className="flex-1"
            disabled={stepIndex === 0}
            onClick={() => goTo(stepIndex - 1)}
          >
            <IconArrowRight /> {S.cook.prev}
          </Button>
          {isLast ? (
            <Button big variant="olive" className="flex-[1.4]" onClick={() => void finish()}>
              {S.cook.done}
            </Button>
          ) : (
            <Button big className="flex-[1.4]" onClick={() => goTo(stepIndex + 1)}>
              {S.cook.next} <IconArrowLeft />
            </Button>
          )}
        </div>
        <TimerBar />
      </footer>

      <Sheet open={showAll} onClose={() => setShowAll(false)} title={S.intro.ingredients}>
        <IngredientList ingredients={recipe.ingredients} checked={checked} onToggle={toggle} checkLabel={S.intro.haveIt} />
      </Sheet>
    </div>
  );
}
