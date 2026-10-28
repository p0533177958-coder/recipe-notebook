import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconArrowRight,
  IconCart,
  IconClock,
  IconEdit,
  IconNote,
  IconPlate,
  IconScroll,
  IconShare,
  IconSource,
  IconStar,
  IconSteps,
} from '../components/Icons';
import { IngredientList } from '../components/IngredientList';
import { PrepCard } from '../components/PrepAhead';
import { RecipeVisual } from '../components/RecipeVisual';
import { ShareSheet } from '../components/ShareSheet';
import { SourceSheet } from '../components/SourceSheet';
import { Button, EmptyState, Skeleton, toast } from '../components/ui';
import { db } from '../db';
import { relativeDate } from '../lib/format';
import { planPrep } from '../lib/prepAhead';
import { addToShopping, draftForEdit, toggleFavorite } from '../lib/recipeActions';
import { S } from '../strings.he';

/** "יש לי" marks survive a trip into cook mode and back, but not app restarts. */
export function useHaveIt(recipeId: string) {
  const key = `rn-have-${recipeId}`;
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        sessionStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  return { checked, toggle };
}

/** A round, translucent, blurred button that sits on top of the hero image. */
function GlassButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="flex size-12 items-center justify-center rounded-full bg-surface/70 text-ink shadow-soft backdrop-blur-md transition duration-150 active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

function MetaChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm text-muted">
      {icon}
      {children}
    </span>
  );
}

export default function RecipeIntro() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const recipe = useLiveQuery(() => db.recipes.get(id), [id], null);
  const { checked, toggle } = useHaveIt(id);
  const [share, setShare] = useState(false);
  const [source, setSource] = useState(false);
  const [scrolled, setScrolled] = useState(0);

  // The compact top bar fades in as the hero scrolls away.
  useEffect(() => {
    const onScroll = () => setScrolled(Math.min(1, Math.max(0, (window.scrollY - 140) / 80)));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const back = () => navigate('/', { viewTransition: true });

  if (recipe === null) return <IntroSkeleton />;
  if (!recipe) {
    return (
      <div className="min-h-dvh pt-[env(safe-area-inset-top)]">
        <EmptyState
          title={S.errors.notFound}
          text=""
          action={
            <Button variant="secondary" className="w-full" onClick={back}>
              {S.common.back}
            </Button>
          }
        />
      </div>
    );
  }

  const hasSource = !!recipe.sourceImageIds?.length || !!recipe.sourceText;
  const prep = planPrep(recipe);

  const addMissing = async () => {
    const n = await addToShopping(recipe, checked);
    toast(S.intro.addedToShopping(n), n ? { label: S.intro.toShopping, run: () => navigate('/shopping') } : undefined);
  };

  const actions = (
    <>
      <GlassButton
        label={recipe.favorite ? S.intro.unfavorite : S.intro.favorite}
        pressed={recipe.favorite}
        onClick={() => void toggleFavorite(recipe)}
      >
        <IconStar filled={recipe.favorite} className={recipe.favorite ? 'text-primary' : ''} />
      </GlassButton>
      <GlassButton label={S.intro.edit} onClick={async () => navigate(`/edit/${await draftForEdit(recipe)}`)}>
        <IconEdit />
      </GlassButton>
      <GlassButton label={S.intro.share} onClick={() => setShare(true)}>
        <IconShare />
      </GlassButton>
      {hasSource && (
        <GlassButton label={S.intro.source} onClick={() => setSource(true)}>
          <IconSource />
        </GlassButton>
      )}
    </>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-36">
      {/* Floating controls over the hero, and a compact bar that fades in on scroll. */}
      <div className="fixed inset-x-0 top-0 z-30 mx-auto max-w-2xl">
        <div
          className="absolute inset-0 border-b border-line bg-bg/95 backdrop-blur-md"
          style={{ opacity: scrolled, pointerEvents: 'none' }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-2 px-4 pt-[calc(8px+env(safe-area-inset-top))] pb-2">
          <GlassButton label={S.common.back} onClick={back}>
            <IconArrowRight />
          </GlassButton>
          <p className="min-w-0 flex-1 truncate font-serif text-lg" style={{ opacity: scrolled }} aria-hidden={scrolled < 0.5}>
            {recipe.title}
          </p>
          {actions}
        </div>
      </div>

      {/* Hero: edge to edge, under the status bar, with a soft fade into the page. */}
      <div className="relative">
        <RecipeVisual recipe={recipe} morph className="aspect-[4/3] w-full sm:rounded-b-[var(--radius-sheet)]" emojiSize="96px" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="relative -mt-12 px-4">
        <h1 className="font-serif text-3xl">{recipe.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {recipe.totalTime && <MetaChip icon={<IconClock size={16} />}>{recipe.totalTime}</MetaChip>}
          {recipe.servings && <MetaChip icon={<IconPlate size={16} />}>{recipe.servings}</MetaChip>}
          <MetaChip icon={<IconSteps size={16} />}>{S.intro.stepsCount(recipe.steps.length)}</MetaChip>
        </div>
        {recipe.cookCount > 0 && recipe.lastCookedAt && (
          <p className="mt-2 text-sm text-muted">{S.intro.cooked(recipe.cookCount, relativeDate(recipe.lastCookedAt))}</p>
        )}
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {recipe.tags.map((t) => (
              <span key={t} className="rounded-full border border-line px-3 py-1 text-sm text-muted">
                #{t}
              </span>
            ))}
          </div>
        )}

        <PrepCard plan={prep} />

        <section className="mt-6 rounded-card bg-surface p-4 shadow-soft" aria-labelledby="ing-h">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 id="ing-h" className="text-xl font-bold">
              {S.intro.ingredients}
            </h2>
            <span className="text-sm text-muted tabular-nums">
              {checked.size}/{recipe.ingredients.length} {S.intro.haveIt}
            </span>
          </div>
          <IngredientList ingredients={recipe.ingredients} checked={checked} onToggle={toggle} checkLabel={S.intro.haveIt} />
          <Button variant="secondary" className="mt-4 w-full" onClick={() => void addMissing()}>
            <IconCart size={20} />
            {S.intro.addToShopping}
          </Button>
        </section>

        {recipe.notes && (
          <section className="mt-4 rounded-card bg-surface-2 p-4">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
              <IconNote size={18} className="text-muted" />
              {S.intro.notes}
            </h2>
            <p className="text-base whitespace-pre-wrap">{recipe.notes}</p>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-6 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-2xl gap-3">
          <Button big className="flex-1" disabled={recipe.steps.length === 0} onClick={() => navigate(`/cook/${recipe.id}`)}>
            {S.intro.startCooking}
          </Button>
          <Button big variant="secondary" aria-label={S.page.open} onClick={() => navigate(`/page/${recipe.id}`)}>
            <IconScroll size={22} />
            {S.page.open}
          </Button>
        </div>
      </div>

      <ShareSheet recipe={share ? recipe : null} onClose={() => setShare(false)} />
      <SourceSheet open={source} onClose={() => setSource(false)} imageIds={recipe.sourceImageIds} text={recipe.sourceText} />
    </div>
  );
}

function IntroSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl" aria-busy="true">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="px-4">
        <Skeleton className="-mt-6 h-9 w-2/3 rounded-xl" />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <div className="mt-6 rounded-card bg-surface p-4 shadow-soft">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="mt-3 h-6 w-full rounded-xl first:mt-0" />
          ))}
        </div>
      </div>
    </div>
  );
}
