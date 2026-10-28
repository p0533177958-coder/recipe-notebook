import { db, newId } from '../db';
import { forgetImageUrl } from '../hooks/useImageUrl';
import type { Draft, Recipe } from '../types';
import { appendNote } from './format';
import { itemsFromRecipe } from './shopping';

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

/**
 * Deletes right away and returns an undo function that restores everything:
 * the recipe, its images and an open edit draft. The copy lives only in memory.
 */
export async function deleteRecipeWithUndo(r: Recipe): Promise<() => Promise<void>> {
  const imageIds = [...(r.imageId ? [r.imageId] : []), ...(r.sourceImageIds ?? [])];
  const images = (await db.images.bulkGet(imageIds)).filter((x) => !!x);
  const draft = await db.drafts.get(`edit-${r.id}`);
  const snapshot = (await db.recipes.get(r.id)) ?? r;
  await deleteRecipe(r);
  return async () => {
    await db.transaction('rw', db.recipes, db.images, db.drafts, async () => {
      await db.images.bulkPut(images);
      if (draft) await db.drafts.put(draft);
      await db.recipes.put(snapshot);
    });
  };
}

/** Stores a new dish photo for a recipe, replacing (and deleting) the previous one. */
export async function setDishPhoto(recipeId: string, imageId: string): Promise<void> {
  const r = await db.recipes.get(recipeId);
  if (!r) return;
  const old = r.imageId;
  await db.transaction('rw', db.recipes, db.images, async () => {
    await db.recipes.update(recipeId, { imageId });
    if (old && old !== imageId) await db.images.delete(old);
  });
  if (old && old !== imageId) forgetImageUrl(old);
}

/** Adds a dated "for next time" note to the recipe's notes. */
export async function addCookNote(recipeId: string, note: string, now = Date.now()): Promise<void> {
  const r = await db.recipes.get(recipeId);
  if (!r) return;
  const notes = appendNote(r.notes, note, now);
  if (notes !== r.notes) await db.recipes.update(recipeId, { notes });
}

/** Adds the ingredients not marked "יש לי" to the shopping list. Returns how many lines were added. */
export async function addToShopping(r: Recipe, haveIds: Set<string>): Promise<number> {
  const existing = await db.shopping.toArray();
  const items = itemsFromRecipe(r, haveIds, existing, newId, Date.now());
  if (items.length) await db.shopping.bulkPut(items);
  return items.length;
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
