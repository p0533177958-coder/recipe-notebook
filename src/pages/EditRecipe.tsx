import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { IconClose, IconDrag, IconImage, IconPlus, IconSource, IconTimer, IconTrash } from '../components/Icons';
import { RecipeVisual } from '../components/RecipeVisual';
import { SortableArea, useSortableItem } from '../components/Sortable';
import { SourceSheet } from '../components/SourceSheet';
import { Button, ConfirmSheet, IconButton, PageHeader, toast } from '../components/ui';
import { db, newId } from '../db';
import { forgetImageUrl } from '../hooks/useImageUrl';
import { storeImages } from '../lib/image';
import { leadLabel, planPrep } from '../lib/prepAhead';
import { discardDraft } from '../lib/recipeActions';
import { S } from '../strings.he';
import { CATEGORIES, type Category, type Draft, type Ingredient, type PrepHint, type Recipe, type Step } from '../types';

const input =
  'min-h-12 w-full rounded-xl border border-line bg-bg px-3 text-base outline-none focus:border-primary placeholder:text-muted';

function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Removes empty rows and dangling references before saving. */
function cleanRecipe(r: Recipe): Recipe {
  const ingredients = r.ingredients
    .map((i) => ({ ...i, text: i.text.trim(), group: i.group?.trim() || undefined }))
    .filter((i) => i.text);
  const ids = new Set(ingredients.map((i) => i.id));
  const steps = r.steps
    .map((s) => ({
      ...s,
      text: s.text.trim(),
      ingredientIds: s.ingredientIds.filter((x) => ids.has(x)),
      timers: s.timers.filter((t) => t.seconds > 0).map((t) => ({ ...t, label: t.label.trim() || 'טיימר' })),
    }))
    .filter((s) => s.text);
  const stepIds = new Set(steps.map((s) => s.id));
  return {
    ...r,
    title: r.title.trim(),
    emoji: r.emoji.trim() || '🍽️',
    tags: r.tags.map((t) => t.trim()).filter(Boolean),
    servings: r.servings?.trim() || undefined,
    totalTime: r.totalTime?.trim() || undefined,
    notes: r.notes?.trim() || undefined,
    ingredients,
    steps,
    prepAhead: r.prepAhead?.filter((p) => stepIds.has(p.stepId)),
  };
}

export default function EditRecipe() {
  const { draftId = '' } = useParams();
  const draft = useLiveQuery(() => db.drafts.get(draftId), [draftId], null);
  if (draft === null) return <div className="min-h-dvh" />;
  if (!draft) return <Navigate to="/" replace />;
  if (!draft.recipe) return <Navigate to={`/process/${draftId}`} replace />;
  return <Editor draft={draft as Draft & { recipe: Recipe }} />;
}

function Editor({ draft }: { draft: Draft & { recipe: Recipe } }) {
  const navigate = useNavigate();
  const [r, setR] = useState<Recipe>(draft.recipe);
  const [tagInput, setTagInput] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const initial = useRef(JSON.stringify(draft.recipe));

  // Autosave to the draft so closing the app mid-edit loses nothing.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!saving.current) void db.drafts.update(draft.id, { recipe: r, updatedAt: Date.now() });
    }, 400);
    return () => clearTimeout(t);
  }, [r, draft.id]);

  const patch = (p: Partial<Recipe>) => setR((prev) => ({ ...prev, ...p }));
  const setIngredient = (id: string, p: Partial<Ingredient>) =>
    patch({ ingredients: r.ingredients.map((i) => (i.id === id ? { ...i, ...p } : i)) });
  const setStep = (id: string, p: Partial<Step>) => patch({ steps: r.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !r.tags.includes(t)) patch({ tags: [...r.tags, t] });
    setTagInput('');
  };

  const onPhoto = async (files: FileList | null) => {
    if (!files?.[0]) return;
    const { ids } = await storeImages([files[0]]);
    if (!ids[0]) return;
    const old = r.imageId;
    patch({ imageId: ids[0] });
    // Drop a replaced photo right away unless the saved recipe still uses it.
    const saved = draft.editingRecipeId ? await db.recipes.get(draft.editingRecipeId) : undefined;
    if (old && old !== saved?.imageId) {
      await db.images.delete(old);
      forgetImageUrl(old);
    }
  };

  const save = async () => {
    const clean = cleanRecipe(r);
    if (!clean.title) {
      setError(S.edit.needTitle);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    saving.current = true;
    const existing = draft.editingRecipeId ? await db.recipes.get(draft.editingRecipeId) : undefined;
    const final: Recipe = existing
      ? {
          ...clean,
          id: existing.id,
          favorite: existing.favorite,
          cookCount: existing.cookCount,
          lastCookedAt: existing.lastCookedAt,
          createdAt: existing.createdAt,
        }
      : { ...clean, createdAt: Date.now() };
    await db.transaction('rw', db.recipes, db.drafts, db.images, async () => {
      await db.recipes.put(final);
      await db.drafts.delete(draft.id);
      if (existing?.imageId && existing.imageId !== final.imageId) await db.images.delete(existing.imageId);
    });
    toast(S.edit.saved);
    navigate(`/recipe/${final.id}`, { replace: true });
  };

  const hasSource = draft.sourceImageIds.length > 0 || !!draft.text;
  const isNew = !draft.editingRecipeId;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-32">
      <PageHeader
        title={isNew ? S.edit.titleNew : S.edit.titleExisting}
        onBack={async () => {
          // Leaving an unchanged edit needs no confirmation.
          if (!isNew && JSON.stringify(r) === initial.current) {
            saving.current = true;
            await discardDraft(draft.id);
            navigate(-1);
          } else setConfirmDiscard(true);
        }}
        actions={
          hasSource && (
            <IconButton label={S.edit.showSource} onClick={() => setShowSource(true)}>
              <IconSource />
            </IconButton>
          )
        }
      />
      <div className="flex flex-col gap-4 px-4">
        {isNew && <p className="text-muted">{S.edit.hint}</p>}

        <Card title={S.edit.dishPhoto}>
          <div className="flex items-center gap-4">
            <RecipeVisual recipe={r} className="size-28 shrink-0 rounded-card" emojiSize="3rem" />
            <div className="flex flex-col gap-2">
              <Button variant="secondary" onClick={() => photoRef.current?.click()}>
                <IconImage size={20} /> {r.imageId ? S.edit.changeDishPhoto : S.edit.addDishPhoto}
              </Button>
              {r.imageId && (
                <Button variant="ghost" onClick={() => patch({ imageId: undefined })}>
                  {S.edit.removeDishPhoto}
                </Button>
              )}
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
          </div>
        </Card>

        <Card title={S.edit.recipeTitle}>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="w-20 shrink-0">
                <Field label={S.edit.emoji} htmlFor="emoji">
                  <input
                    id="emoji"
                    value={r.emoji}
                    onChange={(e) => patch({ emoji: [...e.target.value].slice(-2).join('') })}
                    className={`${input} text-center text-2xl`}
                  />
                </Field>
              </div>
              <div className="flex-1">
                <Field label={S.edit.recipeTitle} htmlFor="title">
                  <input
                    id="title"
                    value={r.title}
                    onChange={(e) => {
                      patch({ title: e.target.value });
                      setError('');
                    }}
                    aria-invalid={!!error}
                    className={`${input} font-serif text-xl font-bold`}
                  />
                </Field>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-primary">
                {error}
              </p>
            )}
            <Field label={S.edit.category} htmlFor="cat">
              <select
                id="cat"
                value={r.category}
                onChange={(e) => patch({ category: e.target.value as Category })}
                className={input}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={S.edit.servings} htmlFor="serv">
                <input id="serv" value={r.servings ?? ''} onChange={(e) => patch({ servings: e.target.value })} className={input} />
              </Field>
              <Field label={S.edit.totalTime} htmlFor="time">
                <input id="time" value={r.totalTime ?? ''} onChange={(e) => patch({ totalTime: e.target.value })} className={input} />
              </Field>
            </div>
            <Field label={S.edit.tags} htmlFor="tag">
              <div className="flex flex-wrap gap-2">
                {r.tags.map((t) => (
                  <span key={t} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-secondary/15 ps-3 text-secondary">
                    #{t}
                    <button
                      type="button"
                      aria-label={S.edit.removeTag(t)}
                      onClick={() => patch({ tags: r.tags.filter((x) => x !== t) })}
                      className="flex size-10 items-center justify-center rounded-full"
                    >
                      <IconClose size={16} />
                    </button>
                  </span>
                ))}
                <input
                  id="tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder={`+ ${S.edit.addTag}`}
                  enterKeyHint="done"
                  className="min-h-10 w-32 rounded-full border border-dashed border-line bg-transparent px-3 outline-none focus:border-primary"
                />
              </div>
            </Field>
          </div>
        </Card>

        <Card
          title={`${S.edit.ingredients} (${r.ingredients.length})`}
          action={
            <Button
              variant="secondary"
              className="min-h-11! px-3!"
              onClick={() =>
                patch({ ingredients: [...r.ingredients, { id: newId(), text: '', group: r.ingredients.at(-1)?.group }] })
              }
            >
              <IconPlus size={18} /> {S.edit.addIngredient}
            </Button>
          }
        >
          <SortableArea items={r.ingredients} onReorder={(ingredients) => patch({ ingredients })}>
            <ul className="flex flex-col gap-2">
              {r.ingredients.map((ing) => (
                <IngredientRow
                  key={ing.id}
                  ing={ing}
                  onChange={(p) => setIngredient(ing.id, p)}
                  onDelete={() =>
                    patch({
                      ingredients: r.ingredients.filter((x) => x.id !== ing.id),
                      steps: r.steps.map((s) => ({ ...s, ingredientIds: s.ingredientIds.filter((x) => x !== ing.id) })),
                    })
                  }
                />
              ))}
            </ul>
          </SortableArea>
        </Card>

        <Card
          title={`${S.edit.steps} (${r.steps.length})`}
          action={
            <Button
              variant="secondary"
              className="min-h-11! px-3!"
              onClick={() => patch({ steps: [...r.steps, { id: newId(), text: '', ingredientIds: [], timers: [] }] })}
            >
              <IconPlus size={18} /> {S.edit.addStep}
            </Button>
          }
        >
          <SortableArea items={r.steps} onReorder={(steps) => patch({ steps })}>
            <ol className="flex flex-col gap-3">
              {r.steps.map((s, i) => (
                <StepEditor
                  key={s.id}
                  step={s}
                  n={i + 1}
                  ingredients={r.ingredients}
                  onChange={(p) => setStep(s.id, p)}
                  onDelete={() => patch({ steps: r.steps.filter((x) => x.id !== s.id) })}
                />
              ))}
            </ol>
          </SortableArea>
        </Card>

        <PrepEditor recipe={r} onChange={(prepAhead) => patch({ prepAhead, prepReviewed: true })} />

        <Card title={S.edit.notes}>
          <textarea
            value={r.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value })}
            aria-label={S.edit.notes}
            className={`${input} min-h-24 py-2`}
          />
        </Card>

        {isNew && (
          <Button variant="ghost" className="text-primary" onClick={() => setConfirmDiscard(true)}>
            <IconTrash size={20} /> {S.edit.discardDraft}
          </Button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-bg/95 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button big className="mx-auto w-full max-w-2xl" onClick={() => void save()}>
          ✓ {S.edit.save}
        </Button>
      </div>

      <SourceSheet open={showSource} onClose={() => setShowSource(false)} imageIds={draft.sourceImageIds} text={draft.text} />
      <ConfirmSheet
        open={confirmDiscard}
        message={S.edit.discardConfirm}
        confirmLabel={S.edit.discardDraft}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={async () => {
          saving.current = true;
          await discardDraft(draft.id);
          if (isNew) navigate('/', { replace: true });
          else navigate(-1);
        }}
      />
    </div>
  );
}

function DragHandle({ props }: { props: ReturnType<typeof useSortableItem>['handleProps'] }) {
  return (
    <button
      type="button"
      {...props}
      aria-label={S.common.dragToReorder}
      className="flex size-11 shrink-0 touch-none items-center justify-center rounded-lg text-muted active:bg-surface-2"
    >
      <IconDrag size={20} />
    </button>
  );
}

function IngredientRow({
  ing,
  onChange,
  onDelete,
}: {
  ing: Ingredient;
  onChange: (p: Partial<Ingredient>) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, style, handleProps, isDragging } = useSortableItem(ing.id);
  return (
    <li ref={setNodeRef} style={style} className={`flex items-start gap-1 rounded-xl ${isDragging ? 'bg-surface shadow-lift' : ''}`}>
      <DragHandle props={handleProps} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          value={ing.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={S.edit.ingredientPlaceholder}
          aria-label={S.edit.ingredients}
          className={input}
        />
        {(ing.group !== undefined || ing.text) && (
          <input
            value={ing.group ?? ''}
            onChange={(e) => onChange({ group: e.target.value || undefined })}
            placeholder={S.edit.groupPlaceholder}
            aria-label={S.edit.group}
            className="min-h-9 w-full rounded-lg bg-transparent px-3 text-sm text-muted outline-none focus:bg-bg"
          />
        )}
      </div>
      <IconButton label={S.edit.deleteItem} onClick={onDelete} className="text-muted">
        <IconTrash size={20} />
      </IconButton>
    </li>
  );
}

function StepEditor({
  step,
  n,
  ingredients,
  onChange,
  onDelete,
}: {
  step: Step;
  n: number;
  ingredients: Ingredient[];
  onChange: (p: Partial<Step>) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, style, handleProps, isDragging } = useSortableItem(step.id);
  const toggleIng = (id: string) =>
    onChange({
      ingredientIds: step.ingredientIds.includes(id)
        ? step.ingredientIds.filter((x) => x !== id)
        : // keep the recipe's ingredient order
          ingredients.map((i) => i.id).filter((x) => x === id || step.ingredientIds.includes(x)),
    });
  const setTimer = (i: number, p: Partial<Step['timers'][number]>) =>
    onChange({ timers: step.timers.map((t, j) => (j === i ? { ...t, ...p } : t)) });

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-line bg-bg p-2 ${isDragging ? 'shadow-lift' : ''}`}
    >
      <div className="flex items-center gap-1">
        <DragHandle props={handleProps} />
        <span className="flex-1 font-bold">{S.edit.stepN(n)}</span>
        <IconButton label={S.edit.deleteItem} onClick={onDelete} className="text-muted">
          <IconTrash size={20} />
        </IconButton>
      </div>
      <textarea
        value={step.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder={S.edit.stepPlaceholder}
        aria-label={S.edit.stepN(n)}
        rows={3}
        className={`${input} bg-surface py-2 text-lg`}
      />
      {ingredients.length > 0 && (
        <fieldset className="mt-2">
          <legend className="mb-1 text-sm text-muted">{S.edit.stepIngredients}</legend>
          <div className="flex flex-wrap gap-1.5">
            {ingredients
              .filter((i) => i.text.trim())
              .map((i) => {
                const on = step.ingredientIds.includes(i.id);
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleIng(i.id)}
                    className={`min-h-10 max-w-full truncate rounded-full border px-3 text-sm transition ${
                      on ? 'border-secondary bg-secondary text-white' : 'border-line bg-surface text-muted'
                    }`}
                  >
                    {i.text}
                  </button>
                );
              })}
          </div>
        </fieldset>
      )}
      <div className="mt-2 flex flex-col gap-2">
        {step.timers.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/10 p-2">
            <IconTimer size={20} className="text-secondary" />
            <input
              value={t.label}
              onChange={(e) => setTimer(i, { label: e.target.value })}
              aria-label={S.edit.timerLabel}
              placeholder={S.edit.timerLabel}
              className="min-h-11 min-w-24 flex-1 rounded-lg border border-line bg-surface px-2"
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={Math.floor(t.seconds / 60)}
                onChange={(e) => setTimer(i, { seconds: Math.max(0, Number(e.target.value) || 0) * 60 + (t.seconds % 60) })}
                className="min-h-11 w-16 rounded-lg border border-line bg-surface px-2 text-center"
              />
              {S.edit.timerMinutes}
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={t.seconds % 60}
                onChange={(e) =>
                  setTimer(i, { seconds: Math.floor(t.seconds / 60) * 60 + Math.min(59, Math.max(0, Number(e.target.value) || 0)) })
                }
                className="min-h-11 w-14 rounded-lg border border-line bg-surface px-2 text-center"
              />
              {S.edit.timerSeconds}
            </label>
            <IconButton
              label={S.edit.deleteItem}
              onClick={() => onChange({ timers: step.timers.filter((_, j) => j !== i) })}
              className="size-11! text-muted"
            >
              <IconTrash size={18} />
            </IconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ timers: [...step.timers, { label: '', seconds: 300 }] })}
          className="inline-flex min-h-11 items-center gap-1 self-start rounded-full px-3 text-secondary active:bg-surface-2"
        >
          <IconPlus size={18} /> <IconTimer size={18} /> {S.edit.addTimer}
        </button>
      </div>
    </li>
  );
}

/** Lists prep-ahead hints (AI and auto-detected) and lets the user remove wrong ones. */
function PrepEditor({ recipe, onChange }: { recipe: Recipe; onChange: (hints: PrepHint[]) => void }) {
  const plan = planPrep(recipe);
  if (plan.length === 0) return null;
  const remove = (i: number) =>
    onChange(plan.filter((_, j) => j !== i).map(({ text, stepId, leadMinutes, emoji }) => ({ text, stepId, leadMinutes, emoji })));
  return (
    <Card title={S.prep.editTitle}>
      <p className="-mt-2 mb-2 text-sm text-muted">{S.prep.editHint}</p>
      <ul className="flex flex-col gap-2">
        {plan.map((p, i) => (
          <li key={`${p.stepId}-${i}`} className="flex items-center gap-2 rounded-xl bg-secondary/10 p-2">
            <span className="text-xl" aria-hidden="true">
              {p.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.text}</p>
              <p className="text-sm text-muted">
                {S.prep.takes(leadLabel(p.leadMinutes))} · {S.prep.neededAt(p.neededIndex + 1)}
              </p>
            </div>
            <IconButton label={`${S.edit.deleteItem}: ${p.text}`} onClick={() => remove(i)} className="text-muted">
              <IconTrash size={20} />
            </IconButton>
          </li>
        ))}
      </ul>
    </Card>
  );
}
