import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { IconCheck, IconCloudOff, IconHourglass, IconKey, IconQuestion, IconWarning } from '../components/Icons';
import { Button, IconBadge, ScreenSkeleton, Skeleton, Spinner } from '../components/ui';
import { db } from '../db';
import { initialProgress, progressReducer, type AiEvent, type AiProgress, type LogItem } from '../lib/aiProgress';
import { AiError, extractRecipe, type AiErrorCode } from '../lib/gemini';
import { cropDishPhoto } from '../lib/image';
import { discardDraft } from '../lib/recipeActions';
import { getSettings } from '../settings';
import { S } from '../strings.he';

const inFlight = new Set<string>();

// Progress lives outside React so it survives re-mounts while a request is running.
const progress = new Map<string, AiProgress>();
const listeners = new Set<() => void>();

function emit(id: string, e: AiEvent) {
  progress.set(id, progressReducer(progress.get(id) ?? initialProgress, e));
  listeners.forEach((l) => l());
}

function useProgress(id: string): AiProgress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => progress.get(id) ?? initialProgress,
  );
}

/**
 * The shown percent. It only creeps forward on its own while waiting for the model's
 * first words (the one phase with no real signal), and never goes backwards.
 */
function useShownPercent(p: AiProgress): number {
  const [now, setNow] = useState(() => Date.now());
  const waitStart = useRef<number | null>(null);
  const shown = useRef(0);
  useEffect(() => {
    if (!p.waiting) {
      waitStart.current = null;
      return;
    }
    waitStart.current ??= Date.now();
    const iv = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(iv);
  }, [p.waiting]);
  let value = p.percent;
  if (p.waiting && waitStart.current !== null) {
    const t = (now - waitStart.current) / 1000;
    value = Math.max(value, Math.min(29, p.percent + 17 * (1 - Math.exp(-t / 15))));
  }
  shown.current = Math.max(shown.current, Math.round(value));
  return shown.current;
}

function LogLine({ item }: { item: LogItem }) {
  return (
    <li className="anim-fade-up flex items-start gap-2 py-1">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
        {item.state === 'done' && <IconCheck size={16} className="text-secondary" />}
        {item.state === 'active' && <Spinner size={14} />}
        {item.state === 'warn' && <IconWarning size={16} className="text-primary" />}
      </span>
      <span className={`min-w-0 flex-1 text-sm ${item.state === 'active' ? 'text-ink' : 'text-muted'}`}>{item.text}</span>
    </li>
  );
}

/** A recipe card that starts as a skeleton and fills in with what has really been read so far. */
function FillingCard({ p }: { p: AiProgress }) {
  const { title, ingredients, steps } = p.preview;
  const ingRows = Math.max(4, Math.min(6, ingredients.length));
  const stepRows = Math.max(2, Math.min(3, steps.length));
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-soft">
      <div className="flex aspect-[16/7] items-center justify-center bg-surface-2">
        {p.emoji ? (
          <span className="anim-fade-in text-3xl" aria-hidden="true">
            {p.emoji}
          </span>
        ) : (
          <Skeleton className="size-14 rounded-full" />
        )}
      </div>
      <div className="p-4">
        {title ? <h2 className="anim-fade-in font-serif text-xl">{title}</h2> : <Skeleton className="h-7 w-2/3 rounded-xl" />}
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: ingRows }, (_, i) =>
            ingredients[i] ? (
              <p key={i} className="anim-fade-in truncate text-sm">
                <span className="text-muted">• </span>
                {ingredients[i]}
              </p>
            ) : (
              <Skeleton key={i} className="h-4 rounded-xl" />
            ),
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: stepRows }, (_, i) =>
            steps[i] ? (
              <p key={i} className="anim-fade-in line-clamp-2 text-sm">
                <span className="font-bold text-muted tabular-nums">{i + 1}. </span>
                {steps[i]}
              </p>
            ) : (
              <Skeleton key={i} className="h-8 rounded-xl" />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressView({ id }: { id: string }) {
  const p = useProgress(id);
  const percent = useShownPercent(p);
  const current = [...p.log].reverse().find((l) => l.state === 'active') ?? p.log.at(-1);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[calc(24px+env(safe-area-inset-top))] pb-8" aria-busy="true">
      <h1 className="text-center font-serif text-2xl">{S.processing.title}</h1>
      <div className="mt-6">
        <FillingCard p={p} />
      </div>
      <div className="mt-6 flex items-center gap-3">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={current?.text}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-[400ms]" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-12 text-end text-base font-bold tabular-nums" dir="ltr">
          {percent}%
        </span>
      </div>
      <p key={current?.text} className="anim-fade-in mt-2 min-h-6 text-center text-base" aria-live="polite">
        {current?.text}
      </p>
      {p.log.length > 1 && (
        <ul className="mt-4 rounded-card bg-surface-2 px-3 py-2">
          {p.log.map((item) => (
            <LogLine key={item.key} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ErrorIcon({ code }: { code: AiErrorCode }) {
  const icon =
    code === 'offline' ? (
      <IconCloudOff size={44} />
    ) : code === 'quota' ? (
      <IconHourglass size={44} />
    ) : code === 'no-key' || code === 'bad-key' ? (
      <IconKey size={44} />
    ) : (
      <IconQuestion size={44} />
    );
  return <IconBadge>{icon}</IconBadge>;
}

export default function Processing() {
  const { draftId = '' } = useParams();
  const navigate = useNavigate();
  const draft = useLiveQuery(() => db.drafts.get(draftId), [draftId], null);

  useEffect(() => {
    if (!draft || draft.status !== 'pending' || inFlight.has(draftId)) return;
    inFlight.add(draftId);
    progress.set(draftId, initialProgress);
    const report = (e: AiEvent) => emit(draftId, e);
    void (async () => {
      try {
        const rows = await db.images.bulkGet(draft.sourceImageIds);
        const images = rows.filter((r) => !!r).map((r) => r.blob);
        const { recipe, dishBox } = await extractRecipe(getSettings().apiKey, { text: draft.text, images }, report);
        recipe.sourceImageIds = draft.sourceImageIds.length ? draft.sourceImageIds : undefined;
        recipe.sourceText = draft.text;
        // A photo of the finished dish in the source: crop it out as the dish photo.
        const source = dishBox ? images[dishBox.imageNumber - 1] : undefined;
        if (dishBox && source && !recipe.imageId) {
          const cropped = await cropDishPhoto(source, dishBox);
          if (cropped) recipe.imageId = cropped;
        }
        report({ type: 'saving' });
        await db.drafts.update(draftId, { status: 'ready', recipe, updatedAt: Date.now(), errorCode: undefined });
        report({ type: 'done' });
        // A short beat at 100% so the finished state is visible.
        await new Promise((r) => setTimeout(r, 400));
        navigate(`/edit/${draftId}`, { replace: true, viewTransition: true });
      } catch (e) {
        const code: AiErrorCode = e instanceof AiError ? e.code : 'server';
        const detail = e instanceof AiError ? e.detail : e instanceof Error ? e.message : String(e);
        await db.drafts.update(draftId, { status: 'error', errorCode: code, errorDetail: detail, updatedAt: Date.now() });
      } finally {
        inFlight.delete(draftId);
      }
    })();
  }, [draft, draftId, navigate]);

  if (draft === null) return <ScreenSkeleton />;
  if (!draft) return <Navigate to="/" replace />;
  // While finishing, stay on the progress screen until the 100% beat is over.
  if (draft.status === 'ready' && !inFlight.has(draftId)) return <Navigate to={`/edit/${draftId}`} replace />;
  if (draft.status === 'images') return <Navigate to={`/add/images/${draftId}`} replace />;

  const retry = async () => {
    await db.drafts.update(draftId, { status: 'pending', errorCode: undefined });
  };

  const backToEdit = async () => {
    if (draft.sourceImageIds.length) {
      await db.drafts.update(draftId, { status: 'images', errorCode: undefined });
      navigate(`/add/images/${draftId}`, { replace: true });
    } else {
      try {
        localStorage.setItem('rn-paste-draft', draft.text ?? '');
      } catch {
        // ignore
      }
      await discardDraft(draftId);
      navigate('/add/text', { replace: true });
    }
  };

  if (draft.status === 'error') {
    const code = (draft.errorCode ?? 'server') as AiErrorCode;
    const needsSettings = code === 'no-key' || code === 'bad-key';
    return (
      <div className="anim-fade-up mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8 text-center">
        <ErrorIcon code={code} />
        <h1 className="mt-4 font-serif text-2xl">{S.errorTitles[code] ?? S.errorTitles.generic}</h1>
        <p role="alert" className="mt-2 text-base text-muted">
          {S.errors[code] ?? S.errors.generic}
        </p>
        {draft.errorDetail && (
          <details className="mt-4 text-start">
            <summary className="min-h-12 cursor-pointer py-3 text-center text-sm text-muted">{S.processing.details}</summary>
            <p dir="ltr" className="rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs break-words text-muted">
              {draft.errorDetail}
            </p>
          </details>
        )}
        <div className="mt-6 flex w-full flex-col gap-3">
          {needsSettings ? (
            <Button big onClick={() => navigate('/settings')}>
              <IconKey size={20} />
              {S.processing.toSettings}
            </Button>
          ) : (
            <Button big onClick={() => void retry()}>
              {S.processing.retry}
            </Button>
          )}
          {needsSettings && (
            <Button variant="secondary" onClick={() => void retry()}>
              {S.processing.retry}
            </Button>
          )}
          <Button variant="secondary" onClick={() => void backToEdit()}>
            {S.processing.editText}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await discardDraft(draftId);
              navigate('/', { replace: true });
            }}
          >
            {S.processing.discard}
          </Button>
        </div>
      </div>
    );
  }

  return <ProgressView id={draftId} />;
}
