import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconEdit, IconShare, IconSource, IconStar } from '../components/Icons';
import { IngredientList } from '../components/IngredientList';
import { RecipeVisual } from '../components/RecipeVisual';
import { ShareSheet } from '../components/ShareSheet';
import { SourceSheet } from '../components/SourceSheet';
import { Button, IconButton, PageHeader } from '../components/ui';
import { db } from '../db';
import { draftForEdit, toggleFavorite } from '../lib/recipeActions';
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

export default function RecipeIntro() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const recipe = useLiveQuery(() => db.recipes.get(id), [id], null);
  const { checked, toggle } = useHaveIt(id);
  const [share, setShare] = useState(false);
  const [source, setSource] = useState(false);

  if (recipe === null) return <div className="min-h-dvh" />;
  if (!recipe) {
    return (
      <div className="min-h-dvh">
        <PageHeader title="" onBack={() => navigate('/')} />
        <p className="p-8 text-center text-lg">{S.errors.notFound}</p>
      </div>
    );
  }

  const hasSource = !!recipe.sourceImageIds?.length || !!recipe.sourceText;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-36">
      <PageHeader
        title=""
        onBack={() => navigate('/')}
        actions={
          <>
            <IconButton
              label={recipe.favorite ? S.intro.unfavorite : S.intro.favorite}
              aria-pressed={recipe.favorite}
              onClick={() => void toggleFavorite(recipe)}
              className="text-primary"
            >
              <IconStar filled={recipe.favorite} />
            </IconButton>
            <IconButton
              label={S.intro.edit}
              onClick={async () => navigate(`/edit/${await draftForEdit(recipe)}`)}
            >
              <IconEdit />
            </IconButton>
            <IconButton label={S.intro.share} onClick={() => setShare(true)}>
              <IconShare />
            </IconButton>
            {hasSource && (
              <IconButton label={S.intro.source} onClick={() => setSource(true)}>
                <IconSource />
              </IconButton>
            )}
          </>
        }
      />

      <div className="anim-fade-up px-4">
        <RecipeVisual recipe={recipe} className="aspect-[16/10] w-full rounded-card shadow-soft" emojiSize="5.5rem" />
        <h1 className="mt-4 font-serif text-4xl leading-tight font-bold">{recipe.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-muted">
          {recipe.totalTime && (
            <span className="rounded-full bg-surface-2 px-3 py-1">⏱ {recipe.totalTime}</span>
          )}
          {recipe.servings && (
            <span className="rounded-full bg-surface-2 px-3 py-1">🍽 {recipe.servings}</span>
          )}
          <span className="rounded-full bg-surface-2 px-3 py-1">👣 {S.intro.stepsCount(recipe.steps.length)}</span>
        </div>
        {recipe.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recipe.tags.map((t) => (
              <span key={t} className="rounded-full border border-line px-3 py-0.5 text-sm text-muted">
                #{t}
              </span>
            ))}
          </div>
        )}

        <section className="mt-6 rounded-card border border-line bg-surface p-4 shadow-soft" aria-labelledby="ing-h">
          <h2 id="ing-h" className="mb-2 text-xl font-bold">
            {S.intro.ingredients}
            <span className="ms-2 text-base font-normal text-muted">
              ({checked.size}/{recipe.ingredients.length} {S.intro.haveIt})
            </span>
          </h2>
          <IngredientList ingredients={recipe.ingredients} checked={checked} onToggle={toggle} checkLabel={S.intro.haveIt} />
        </section>

        {recipe.notes && (
          <section className="mt-4 rounded-card bg-surface-2 p-4">
            <h2 className="mb-1 font-bold">📝 {S.intro.notes}</h2>
            <p className="text-lg whitespace-pre-wrap">{recipe.notes}</p>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button
          big
          className="mx-auto w-full max-w-2xl text-2xl"
          disabled={recipe.steps.length === 0}
          onClick={() => navigate(`/cook/${recipe.id}`)}
        >
          {S.intro.startCooking}
        </Button>
      </div>

      <ShareSheet recipe={share ? recipe : null} onClose={() => setShare(false)} />
      <SourceSheet
        open={source}
        onClose={() => setSource(false)}
        imageIds={recipe.sourceImageIds}
        text={recipe.sourceText}
      />
    </div>
  );
}
