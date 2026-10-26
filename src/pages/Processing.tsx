import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { IconCheck } from '../components/Icons';
import { Button } from '../components/ui';
import { db } from '../db';
import { initialProgress, progressReducer, type AiEvent, type AiProgress, type LogItem } from '../lib/aiProgress';
import { AiError, extractRecipe, type AiErrorCode } from '../lib/gemini';
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
    <li className="anim-fade-up flex items-start gap-3 py-1.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
        {item.state === 'done' && (
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-white">
            <IconCheck size={14} />
          </span>
        )}
        {item.state === 'active' && (
          <span className="size-5 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
        )}
        {item.state === 'warn' && <span className="text-lg leading-none">⚠️</span>}
      </span>
      <span className={`min-w-0 flex-1 text-start text-lg ${item.state === 'active' ? 'font-medium' : 'text-muted'}`}>
        {item.text}
      </span>
    </li>
  );
}

function ProgressView({ id }: { id: string }) {
  const p = useProgress(id);
  const percent = useShownPercent(p);
  const current = [...p.log].reverse().find((l) => l.state === 'active');
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10" aria-busy="true">
      <div className="text-center">
        <p className="text-5xl" aria-hidden="true">
          {p.emoji ?? '📖'}
        </p>
        <p className="mt-3 font-serif text-6xl font-bold tabular-nums text-primary" dir="ltr">
          {percent}%
        </p>
      </div>
      <div
        className="mt-4 h-3 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={current?.text}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-6 flex flex-col" aria-live="polite">
        {p.log.map((item) => (
          <LogLine key={item.key} item={item} />
        ))}
      </ul>
    </div>
  );
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
        const recipe = await extractRecipe(getSettings().apiKey, { text: draft.text, images }, report);
        recipe.sourceImageIds = draft.sourceImageIds.length ? draft.sourceImageIds : undefined;
        recipe.sourceText = draft.text;
        report({ type: 'saving' });
        await db.drafts.update(draftId, { status: 'ready', recipe, updatedAt: Date.now(), errorCode: undefined });
        report({ type: 'done' });
        // A short beat at 100% so the finished state is visible.
        await new Promise((r) => setTimeout(r, 400));
        navigate(`/edit/${draftId}`, { replace: true });
      } catch (e) {
        const code: AiErrorCode = e instanceof AiError ? e.code : 'server';
        const detail = e instanceof AiError ? e.detail : e instanceof Error ? e.message : String(e);
        await db.drafts.update(draftId, { status: 'error', errorCode: code, errorDetail: detail, updatedAt: Date.now() });
      } finally {
        inFlight.delete(draftId);
      }
    })();
  }, [draft, draftId, navigate]);

  if (draft === null) return <div className="min-h-dvh" />;
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
      <div className="anim-fade-up mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-6xl" aria-hidden="true">
          {code === 'offline' ? '📡' : code === 'quota' ? '⏳' : needsSettings ? '🔑' : '🤔'}
        </p>
        <p role="alert" className="text-xl font-medium">
          {S.errors[code] ?? S.errors.generic}
        </p>
        {draft.errorDetail && (
          <p dir="ltr" className="max-w-full break-words rounded-xl bg-surface-2 px-3 py-2 text-start font-mono text-xs text-muted">
            {draft.errorDetail}
          </p>
        )}
        <div className="mt-2 flex w-full flex-col gap-3">
          {needsSettings ? (
            <Button big onClick={() => navigate('/settings')}>
              🔑 {S.processing.toSettings}
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
