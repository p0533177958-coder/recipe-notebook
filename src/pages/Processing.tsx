import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui';
import { db } from '../db';
import { AiError, extractRecipe, type AiErrorCode } from '../lib/gemini';
import { discardDraft } from '../lib/recipeActions';
import { getSettings } from '../settings';
import { S } from '../strings.he';

const inFlight = new Set<string>();

function CookingAnimation() {
  return (
    <svg viewBox="0 0 200 170" className="mx-auto w-56" aria-hidden="true">
      <g fill="none" stroke="var(--c-muted)" strokeWidth="4" strokeLinecap="round" opacity="0.6">
        <path d="M78 52c-8-10 8-16 0-28" style={{ animation: 'steam 2s ease-in-out infinite' }} />
        <path d="M100 48c-8-10 8-16 0-28" style={{ animation: 'steam 2s ease-in-out 0.5s infinite' }} />
        <path d="M122 52c-8-10 8-16 0-28" style={{ animation: 'steam 2s ease-in-out 1s infinite' }} />
      </g>
      <g style={{ transformOrigin: '100px 120px', animation: 'stir 1.6s ease-in-out infinite' }}>
        <rect x="95" y="20" width="10" height="80" rx="5" fill="#A86B3C" />
        <ellipse cx="100" cy="100" rx="13" ry="18" fill="#C68A55" />
      </g>
      <ellipse cx="100" cy="158" rx="72" ry="8" fill="var(--c-border)" />
      <path d="M36 80h128l-10 64a12 12 0 0 1-12 10H58a12 12 0 0 1-12-10z" fill="var(--c-primary)" />
      <rect x="28" y="72" width="144" height="14" rx="7" fill="var(--c-primary-strong)" />
    </svg>
  );
}

export default function Processing() {
  const { draftId = '' } = useParams();
  const navigate = useNavigate();
  const draft = useLiveQuery(() => db.drafts.get(draftId), [draftId], null);
  const [msg, setMsg] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setMsg((m) => (m + 1) % S.processing.messages.length), 2200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!draft || draft.status !== 'pending' || inFlight.has(draftId)) return;
    inFlight.add(draftId);
    void (async () => {
      try {
        const rows = await db.images.bulkGet(draft.sourceImageIds);
        const images = rows.filter((r) => !!r).map((r) => r.blob);
        const recipe = await extractRecipe(getSettings().apiKey, { text: draft.text, images });
        recipe.sourceImageIds = draft.sourceImageIds.length ? draft.sourceImageIds : undefined;
        recipe.sourceText = draft.text;
        await db.drafts.update(draftId, { status: 'ready', recipe, updatedAt: Date.now(), errorCode: undefined });
        navigate(`/edit/${draftId}`, { replace: true });
      } catch (e) {
        const code: AiErrorCode = e instanceof AiError ? e.code : 'server';
        await db.drafts.update(draftId, { status: 'error', errorCode: code, updatedAt: Date.now() });
      } finally {
        inFlight.delete(draftId);
      }
    })();
  }, [draft, draftId, navigate]);

  if (draft === null) return <div className="min-h-dvh" />;
  if (!draft) return <Navigate to="/" replace />;
  if (draft.status === 'ready') return <Navigate to={`/edit/${draftId}`} replace />;
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

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center" aria-busy="true">
      <CookingAnimation />
      <p key={msg} className="anim-fade-up font-serif text-2xl font-bold" aria-live="polite">
        {S.processing.messages[msg]}
      </p>
    </div>
  );
}
