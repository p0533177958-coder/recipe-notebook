import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { exportBackup, importFromText } from '../src/lib/backup';
import { appendNote, countLabel, pickRecipe, relativeDate, shortDate } from '../src/lib/format';
import { addCookNote, addToShopping, deleteRecipeWithUndo } from '../src/lib/recipeActions';
import { groupByRecipe, itemsFromRecipe, shoppingShareText } from '../src/lib/shopping';
import { sampleRecipes } from '../src/seed';
import type { ShoppingItem } from '../src/types';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

let n = 0;
const makeId = () => `x${++n}`;

describe('countLabel', () => {
  const forms = { none: 'אין מתכונים', one: 'מתכון אחד', many: 'מתכונים' };
  it('never says "0 מתכונים" or "1 מתכונים"', () => {
    expect(countLabel(0, forms)).toBe('אין מתכונים');
    expect(countLabel(1, forms)).toBe('מתכון אחד');
    expect(countLabel(3, forms)).toBe('3 מתכונים');
    expect(countLabel(2, { ...forms, two: 'שני מתכונים' })).toBe('שני מתכונים');
  });
});

describe('relativeDate', () => {
  const now = new Date(2026, 9, 28, 18, 0).getTime();
  const daysAgo = (d: number) => new Date(2026, 9, 28 - d, 9, 0).getTime();
  it('speaks in relative Hebrew', () => {
    expect(relativeDate(daysAgo(0), now)).toBe('היום');
    expect(relativeDate(daysAgo(1), now)).toBe('אתמול');
    expect(relativeDate(daysAgo(2), now)).toBe('שלשום');
    expect(relativeDate(daysAgo(3), now)).toBe('לפני 3 ימים');
    expect(relativeDate(daysAgo(7), now)).toBe('לפני שבוע');
    expect(relativeDate(daysAgo(15), now)).toBe('לפני שבועיים');
    expect(relativeDate(daysAgo(40), now)).toBe('לפני חודש');
    expect(relativeDate(daysAgo(70), now)).toBe('לפני חודשיים');
  });
});

describe('notes after cooking', () => {
  const ts = new Date(2026, 9, 28).getTime();
  it('appends a dated line and keeps existing notes', () => {
    expect(shortDate(ts)).toBe('28.10');
    expect(appendNote(undefined, 'פחות סוכר', ts)).toBe('28.10: פחות סוכר');
    expect(appendNote('מגישים חם', '  לאפות 5 דק׳ פחות ', ts)).toBe('מגישים חם\n28.10: לאפות 5 דק׳ פחות');
  });
  it('ignores an empty note', () => {
    expect(appendNote('קיים', '   ', ts)).toBe('קיים');
  });
  it('saves the note on the recipe', async () => {
    const [r] = sampleRecipes(0);
    await db.recipes.put(r);
    await addCookNote(r.id, 'יותר שום', ts);
    expect((await db.recipes.get(r.id))?.notes).toBe(`${r.notes}\n28.10: יותר שום`);
  });
});

describe('pickRecipe', () => {
  const recipes = [
    { id: 'a', favorite: false },
    { id: 'b', favorite: true },
    { id: 'c', favorite: true },
    { id: 'd', favorite: false },
  ];
  it('picks from all recipes when there are fewer than 3 favorites', () => {
    expect(pickRecipe(recipes, () => 0)?.id).toBe('a');
    expect(pickRecipe(recipes, () => 0.99)?.id).toBe('d');
  });
  it('picks only from favorites when there are at least 3', () => {
    const more = [...recipes, { id: 'e', favorite: true }];
    for (const r of [0, 0.4, 0.99]) expect(more.find((x) => x.id === pickRecipe(more, () => r)?.id)?.favorite).toBe(true);
  });
  it('returns nothing for an empty list', () => {
    expect(pickRecipe([])).toBeUndefined();
  });
});

describe('shopping list', () => {
  const [shakshuka, cake] = sampleRecipes(0);

  it('adds only what the user does not have, exactly as written', () => {
    const have = new Set([shakshuka.ingredients[0].id, shakshuka.ingredients[1].id]);
    const items = itemsFromRecipe(shakshuka, have, [], makeId, 1);
    expect(items).toHaveLength(shakshuka.ingredients.length - 2);
    expect(items.map((i) => i.text)).toEqual(shakshuka.ingredients.slice(2).map((i) => i.text));
    expect(items.every((i) => i.recipeId === shakshuka.id && i.recipeTitle === 'שקשוקה' && !i.checked)).toBe(true);
  });

  it('does not add the same line twice, and never merges lines across recipes', () => {
    const first = itemsFromRecipe(shakshuka, new Set(), [], makeId, 1);
    expect(itemsFromRecipe(shakshuka, new Set(), first, makeId, 2)).toEqual([]);
    const fromCake = itemsFromRecipe(cake, new Set(), first, makeId, 3);
    // Both recipes use eggs; each keeps its own line, unmerged.
    const eggs = [...first, ...fromCake].filter((i) => i.text.includes('ביצים'));
    expect(eggs.map((i) => i.text)).toEqual(['6 ביצים', '3 ביצים']);
  });

  it('groups by recipe in the order added, and shares only what is left to buy', () => {
    const a = itemsFromRecipe(shakshuka, new Set(), [], makeId, 1);
    const b = itemsFromRecipe(cake, new Set(), a, makeId, 2);
    const all: ShoppingItem[] = [...b, ...a].map((i, k) => (k === 0 ? { ...i, checked: true } : i));
    expect(groupByRecipe(all).map((g) => g.title)).toEqual(['שקשוקה', 'עוגת שוקולד בחושה']);
    const text = shoppingShareText(all, 'רשימת קניות');
    expect(text.startsWith('*רשימת קניות*')).toBe(true);
    expect(text).toContain('_שקשוקה_');
    expect(text).not.toContain(`☐ ${b[0].text}`);
  });

  it('stores lines in the database', async () => {
    expect(await addToShopping(shakshuka, new Set())).toBe(shakshuka.ingredients.length);
    expect(await addToShopping(shakshuka, new Set())).toBe(0);
    expect(await db.shopping.count()).toBe(shakshuka.ingredients.length);
  });

  it('is part of the full backup', async () => {
    await addToShopping(shakshuka, new Set());
    const text = await (await exportBackup()).text();
    await db.shopping.clear();
    await importFromText(text);
    expect(await db.shopping.count()).toBe(shakshuka.ingredients.length);
    await importFromText(text); // importing again adds nothing
    expect(await db.shopping.count()).toBe(shakshuka.ingredients.length);
  });
});

describe('delete with undo', () => {
  it('deletes right away and restores the recipe, its images and its edit draft', async () => {
    const [r] = sampleRecipes(0);
    const withImg = { ...r, imageId: 'dish', sourceImageIds: ['src'] };
    await db.recipes.put(withImg);
    await db.images.bulkPut([
      { id: 'dish', blob: new Blob(['a']), createdAt: 0 },
      { id: 'src', blob: new Blob(['b']), createdAt: 0 },
    ]);
    await db.drafts.put({ id: `edit-${r.id}`, createdAt: 0, updatedAt: 0, status: 'ready', sourceImageIds: [], recipe: withImg, editingRecipeId: r.id });

    const undo = await deleteRecipeWithUndo(withImg);
    expect(await db.recipes.get(r.id)).toBeUndefined();
    expect(await db.images.count()).toBe(0);
    expect(await db.drafts.count()).toBe(0);

    await undo();
    expect((await db.recipes.get(r.id))?.title).toBe('שקשוקה');
    expect((await db.images.bulkGet(['dish', 'src'])).every(Boolean)).toBe(true);
    expect(await db.drafts.get(`edit-${r.id}`)).toBeTruthy();
  });
});

describe('dish photo crop', async () => {
  const { cropRect } = await import('../src/lib/image');
  const { parseAiResponse } = await import('../src/lib/aiRecipe');

  it('converts a percentage box to pixels', () => {
    expect(cropRect({ x: 10, y: 20, w: 50, h: 40 }, 1000, 800)).toEqual({ sx: 100, sy: 160, sw: 500, sh: 320 });
  });

  it('clamps boxes that spill outside the image', () => {
    expect(cropRect({ x: 80, y: -10, w: 40, h: 60 }, 1000, 1000)).toEqual({ sx: 800, sy: 0, sw: 200, sh: 500 });
  });

  it('ignores boxes too small to be a dish photo', () => {
    expect(cropRect({ x: 10, y: 10, w: 8, h: 50 }, 1000, 1000)).toBeNull();
  });

  const base = { isRecipe: true, title: 'עוגה', ingredients: [{ id: 'i1', text: 'קמח' }], steps: [] };
  it('reads an optional dishBox from the AI answer', () => {
    const r = parseAiResponse(JSON.stringify({ ...base, dishBox: { imageNumber: 2, x: 5, y: 10, w: 60, h: 50 } }), makeId, 0);
    expect(r.ok && r.dishBox).toEqual({ imageNumber: 2, x: 5, y: 10, w: 60, h: 50 });
  });

  it('works without a dishBox (null or missing) and drops invalid ones', () => {
    for (const dishBox of [null, undefined, { imageNumber: 0, x: 1, y: 1, w: 50, h: 50 }, { imageNumber: 1, x: 1, y: 1, w: 0, h: 50 }]) {
      const r = parseAiResponse(JSON.stringify({ ...base, dishBox }), makeId, 0);
      expect(r.ok).toBe(true);
      expect(r.ok && r.dishBox).toBeUndefined();
    }
  });
});
