import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { IconCheck, IconChevronDown, IconClose, IconDrag, IconImage, IconPlus, IconQuestion, IconSource, IconTimer, IconTrash } from '../components/Icons';
import { RecipeVisual } from '../components/RecipeVisual';
import { SortableArea, useSortableItem } from '../components/Sortable';
import { SourceSheet } from '../components/SourceSheet';
import { Button, ConfirmSheet, IconButton, PageHeader, ScreenSkeleton, Sheet, SheetItem, toast } from '../components/ui';
import { db, newId } from '../db';
import { forgetImageUrl } from '../hooks/useImageUrl';
import { storeImages } from '../lib/image';
import { leadLabel, planPrep } from '../lib/prepAhead';
import { discardDraft } from '../lib/recipeActions';
import { S } from '../strings.he';
import { CATEGORIES, type Category, type Draft, type Ingredient, type PrepHint, type Recipe, type Step } from '../types';

const input =
  'ctl-input text-base';

/** Marks an ingredient or step the AI asked about. */
const QUESTION_RING = 'ring-2 ring-primary/50 ring-offset-2 ring-offset-surface';

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
    <section className="rounded-card bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-lg font-bold">{title}</h2>
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
    emoji: r.emoji.trim() || '🍽️', // emoji-ok: recipe illustration (data)
    tags: r.tags.map((t) => t.trim()).filter(Boolean),
    servings: r.servings?.trim() || undefined,
    totalTime: r.totalTime?.trim() || undefined,
    notes: r.notes?.trim() || undefined,
    ingredients,
    steps,
    prepAhead: r.prepAhead?.filter((p) => stepIds.has(p.stepId)),
    questions: undefined, // open questions belong to the draft only
  };
}

export default function EditRecipe() {
  const { draftId = '' } = useParams();
  const draft = useLiveQuery(() => db.drafts.get(draftId), [draftId], null);
  if (draft === null) return <ScreenSkeleton />;
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
  const [confirmQuestions, setConfirmQuestions] = useState(false);
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

  const questions = r.questions ?? [];
  const flaggedIds = new Set(questions.flatMap((q) => [q.ingredientId, q.stepId].filter((x): x is string => !!x)));
  const resolveQuestion = (id: string) => patch({ questions: questions.filter((q) => q.id !== id) });

  const save = async (force = false) => {
    if (!force && questions.length > 0) {
      setConfirmQuestions(true);
      return;
    }
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

        {questions.length > 0 && (
          <QuestionsCard
            recipe={r}
            onChangeIngredient={(id, text) => setIngredient(id, { text })}
            onChangeStep={(id, text) => setStep(id, { text })}
            onResolve={resolveQuestion}
          />
        )}

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
              <CategoryPicker value={r.category} onChange={(category) => patch({ category })} />
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
                  className="min-h-12 w-36 rounded-full border border-dashed border-line bg-transparent px-4 text-sm outline-none focus:border-primary"
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
                  flagged={flaggedIds.has(ing.id)}
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
                  flagged={flaggedIds.has(s.id)}
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
          <IconCheck size={20} />
          {S.edit.save}
        </Button>
      </div>

      <SourceSheet open={showSource} onClose={() => setShowSource(false)} imageIds={draft.sourceImageIds} text={draft.text} />
      <ConfirmSheet
        open={confirmQuestions}
        message={S.questions.saveConfirm(questions.length)}
        confirmLabel={S.questions.saveAnyway}
        onCancel={() => {
          setConfirmQuestions(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onConfirm={() => {
          setConfirmQuestions(false);
          void save(true);
        }}
      />
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
      className="flex size-12 shrink-0 touch-none items-center justify-center rounded-xl text-muted active:bg-surface-2"
    >
      <IconDrag size={20} />
    </button>
  );
}

function IngredientRow({
  ing,
  flagged,
  onChange,
  onDelete,
}: {
  ing: Ingredient;
  flagged?: boolean;
  onChange: (p: Partial<Ingredient>) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, style, handleProps, isDragging } = useSortableItem(ing.id);
  return (
    <li ref={setNodeRef} style={style} className={`flex items-start gap-1 rounded-xl ${isDragging ? 'bg-surface shadow-lift' : ''} ${flagged ? QUESTION_RING : ''}`}>
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
            className="min-h-10 w-full rounded-xl bg-transparent px-3 text-sm text-muted outline-none focus:bg-surface-2"
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
  flagged,
  n,
  ingredients,
  onChange,
  onDelete,
}: {
  step: Step;
  flagged?: boolean;
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
      className={`rounded-xl border border-line bg-bg p-2 ${isDragging ? 'shadow-lift' : ''} ${flagged ? QUESTION_RING : ''}`}
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
                      on ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-muted'
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
              className="ctl-input min-w-24 flex-1"
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={Math.floor(t.seconds / 60)}
                onChange={(e) => setTimer(i, { seconds: Math.max(0, Number(e.target.value) || 0) * 60 + (t.seconds % 60) })}
                className="ctl-input w-16! px-2! text-center"
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
                className="ctl-input w-16! px-2! text-center"
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

/** The AI's questions about lines it could not read for sure, each with an inline fix. */
function QuestionsCard({
  recipe,
  onChangeIngredient,
  onChangeStep,
  onResolve,
}: {
  recipe: Recipe;
  onChangeIngredient: (id: string, text: string) => void;
  onChangeStep: (id: string, text: string) => void;
  onResolve: (questionId: string) => void;
}) {
  const questions = recipe.questions ?? [];
  return (
    <section
      className="anim-fade-up rounded-card bg-surface-2 p-4"
      aria-labelledby="q-h"
    >
      <h2 id="q-h" className="flex items-center gap-2 text-lg font-bold">
        <IconQuestion size={22} className="text-primary" />
        {S.questions.title(questions.length)}
      </h2>
      <p className="mb-3 text-sm text-muted">{S.questions.hint}</p>
      <ul className="flex flex-col gap-3">
        {questions.map((q) => {
          const ingIndex = q.ingredientId ? recipe.ingredients.findIndex((i) => i.id === q.ingredientId) : -1;
          const stepIndex = q.stepId ? recipe.steps.findIndex((s) => s.id === q.stepId) : -1;
          const target =
            ingIndex >= 0
              ? { label: S.questions.ingredient, value: recipe.ingredients[ingIndex].text, set: (t: string) => onChangeIngredient(q.ingredientId!, t) }
              : stepIndex >= 0
                ? { label: S.questions.step(stepIndex + 1), value: recipe.steps[stepIndex].text, set: (t: string) => onChangeStep(q.stepId!, t) }
                : null;
          return (
            <li key={q.id} className="rounded-xl bg-surface p-3">
              <p className="font-medium">{q.question}</p>
              {q.quote && (
                <p className="mt-1 text-sm text-muted">
                  {S.questions.original} <q className="italic">{q.quote}</q>
                </p>
              )}
              {target && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-sm text-muted">{target.label}</span>
                  {stepIndex >= 0 ? (
                    <textarea value={target.value} onChange={(e) => target.set(e.target.value)} rows={2} className={`${input} py-2`} />
                  ) : (
                    <input value={target.value} onChange={(e) => target.set(e.target.value)} className={input} />
                  )}
                </label>
              )}
              <div className="mt-2 flex justify-end">
                <Button variant="olive" className="min-h-11!" onClick={() => onResolve(q.id)}>
                  {target ? S.questions.fixed : S.questions.understood}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Category choice: our own button and sheet instead of the browser's <select>. */
function CategoryPicker({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        id="cat"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="ctl-input flex items-center justify-between text-start transition duration-150 active:scale-[0.99]"
      >
        <span>{value}</span>
        <IconChevronDown size={18} className="text-muted" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={S.edit.category}>
        <div className="flex flex-col gap-1">
          {CATEGORIES.map((c) => (
            <SheetItem
              key={c}
              label={c}
              selected={c === value}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}
