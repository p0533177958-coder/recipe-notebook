import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { IconCamera, IconCheck } from '../components/Icons';
import { RecipeVisual } from '../components/RecipeVisual';
import { Button, Skeleton, toast } from '../components/ui';
import { db } from '../db';
import { storeImages } from '../lib/image';
import { addCookNote, setDishPhoto } from '../lib/recipeActions';
import { S } from '../strings.he';

/** Confetti in the palette: primary, olive and two warm category tints. */
const CONFETTI_COLORS = ['var(--c-primary)', 'var(--c-secondary)', 'var(--cat-1)', 'var(--cat-8)', 'var(--c-primary-strong)'];

function Confetti() {
  // Fixed pseudo-random layout so it renders the same every time (no Math.random during render).
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = (i * 137.5) % 360;
        const d = 70 + ((i * 53) % 90);
        return {
          x: Math.cos((a * Math.PI) / 180) * d,
          y: Math.sin((a * Math.PI) / 180) * d - 30,
          r: (i * 47) % 360,
          c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          w: i % 3 === 0 ? 10 : 6,
          delay: (i % 6) * 25,
        };
      }),
    [],
  );
  return (
    <div className="done-confetti pointer-events-none absolute inset-0" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              '--x': `${p.x}px`,
              '--y': `${p.y}px`,
              '--r': `${p.r}deg`,
              background: p.c,
              width: p.w,
              height: p.w === 10 ? 4 : 10,
              animationDelay: `${150 + p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A check mark drawn with stroke-dashoffset (static under reduced motion, via the global rule). */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 96 96" className="done-check size-28" aria-hidden="true">
      <circle cx="48" cy="48" r="44" fill="none" stroke="var(--c-secondary)" strokeWidth="5" className="done-ring" />
      <path d="M28 50 l13 13 l27 -29" fill="none" stroke="var(--c-secondary)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" className="done-tick" />
    </svg>
  );
}

export default function CookDone() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const recipe = useLiveQuery(() => db.recipes.get(id), [id], null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const back = () => navigate('/', { replace: true, viewTransition: true });

  if (recipe === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4" aria-busy="true">
        <Skeleton className="size-28 rounded-full" />
        <Skeleton className="h-9 w-40 rounded-xl" />
      </div>
    );
  }
  if (!recipe) return <Navigate to="/" replace />;

  const onPhoto = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setSavingPhoto(true);
    try {
      const { ids } = await storeImages([f]);
      if (ids[0]) {
        await setDishPhoto(recipe.id, ids[0]);
        toast(S.done.photoSaved);
      }
    } finally {
      setSavingPhoto(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    await addCookNote(recipe.id, note);
    setSavingNote(false);
    setNote('');
    toast(S.done.noteSaved);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[calc(48px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div className="relative mx-auto flex size-40 items-center justify-center">
        <Confetti />
        <DrawnCheck />
      </div>
      <h1 className="mt-4 text-center font-serif text-3xl">{S.done.title}</h1>
      <p className="mt-1 text-center text-base text-muted">{S.done.times(recipe.cookCount)}</p>

      <div className="mt-6 flex items-center gap-3 rounded-card bg-surface p-3 shadow-soft">
        <RecipeVisual recipe={recipe} className="size-16 shrink-0 rounded-xl" emojiSize="28px" />
        <p className="line-clamp-2 min-w-0 flex-1 font-serif text-lg">{recipe.title}</p>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void onPhoto(e.target.files);
          e.target.value = '';
        }}
      />
      <Button variant="secondary" className="mt-4 w-full" loading={savingPhoto} onClick={() => photoRef.current?.click()}>
        <IconCamera size={20} />
        {recipe.imageId ? S.done.changePhoto : S.done.photo}
      </Button>

      <label className="mt-6 block">
        <span className="mb-1 block text-sm font-medium text-muted">{S.done.noteLabel}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={S.done.notePlaceholder}
          rows={2}
          className="ctl-input py-3"
        />
      </label>
      {note.trim() && (
        <Button variant="secondary" className="mt-2 w-full" loading={savingNote} onClick={() => void saveNote()}>
          <IconCheck size={20} />
          {S.done.noteSave}
        </Button>
      )}

      <div className="flex-1" />
      <Button
        big
        className="mt-8 w-full"
        onClick={async () => {
          // A typed but unsaved note is kept, not lost.
          if (note.trim()) await addCookNote(recipe.id, note);
          back();
        }}
      >
        {S.done.back}
      </Button>
    </div>
  );
}
