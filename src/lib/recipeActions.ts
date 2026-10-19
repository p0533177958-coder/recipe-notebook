import { db, newId } from '../db';
import { forgetImageUrl } from '../hooks/useImageUrl';
import type { Draft, Recipe } from '../types';

export async function toggleFavorite(r: Recipe): Promise<void> {
  await db.recipes.update(r.id, { favorite: !r.favorite });
}

/** Deletes a recipe together with its images and any draft editing it. */
export async function deleteRecipe(r: Recipe): Promise<void> {
  const imageIds = [...(r.imageId ? [r.imageId] : []), ...(r.sourceImageIds ?? [])];
  await db.transaction('rw', db.recipes, db.images, db.drafts, async () => {
    await db.recipes.delete(r.id);
    await db.images.bulkDelete(imageIds);
    await db.drafts.where('id').equals(`edit-${r.id}`).delete();
  });
  imageIds.forEach(forgetImageUrl);
}

export async function markCooked(id: string): Promise<void> {
  const r = await db.recipes.get(id);
  if (!r) return;
  await db.recipes.update(id, { lastCookedAt: Date.now(), cookCount: (r.cookCount ?? 0) + 1 });
}

/** Opens (or resumes) an edit draft for a saved recipe; returns the draft id. */
export async function draftForEdit(r: Recipe): Promise<string> {
  const id = `edit-${r.id}`;
  const existing = await db.drafts.get(id);
  if (!existing) {
    const now = Date.now();
    const draft: Draft = {
      id,
      createdAt: now,
      updatedAt: now,
      status: 'ready',
      sourceImageIds: r.sourceImageIds ?? [],
      text: r.sourceText,
      recipe: r,
      editingRecipeId: r.id,
    };
    await db.drafts.put(draft);
  }
  return id;
}

export async function createDraft(partial: Partial<Draft>): Promise<string> {
  const now = Date.now();
  const id = newId();
  await db.drafts.put({ id, createdAt: now, updatedAt: now, status: 'pending', sourceImageIds: [], ...partial });
  return id;
}

/** Removes a draft; source images are deleted too unless a saved recipe still uses them. */
export async function discardDraft(id: string): Promise<void> {
  const d = await db.drafts.get(id);
  if (!d) return;
  await db.drafts.delete(id);
  if (d.editingRecipeId) {
    // Editing an existing recipe: only drop a new dish photo that was never saved.
    const saved = await db.recipes.get(d.editingRecipeId);
    if (d.recipe?.imageId && d.recipe.imageId !== saved?.imageId) await db.images.delete(d.recipe.imageId);
    return;
  }
  const ids = [...d.sourceImageIds, ...(d.recipe?.imageId ? [d.recipe.imageId] : [])];
  await db.images.bulkDelete(ids);
  ids.forEach(forgetImageUrl);
}
