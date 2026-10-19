import { describe, expect, it } from 'vitest';
import { extractJson, parseAiResponse } from '../src/lib/aiRecipe';

let n = 0;
const makeId = () => `id${++n}`;

const good = {
  isRecipe: true,
  title: 'מרק עדשים',
  emoji: '🍲',
  category: 'מרקים',
  tags: ['טבעוני', '#חורף', 'טבעוני'],
  servings: '4 מנות',
  ingredients: [
    { id: 'i1', text: '2 כוסות עדשים כתומות' },
    { id: 'i2', text: '1 בצל', group: '' },
  ],
  steps: [
    { text: 'מטגנים את הבצל, כ-5 דקות', ingredientIds: ['i2'], timers: [{ label: 'טיגון', seconds: 300 }] },
    { text: 'מוסיפים עדשים ומבשלים 20–25 דקות', ingredientIds: ['i1', 'i9'], timers: [{ label: 'בישול', seconds: 1200 }] },
    { text: '   ', ingredientIds: [], timers: [] },
  ],
};

describe('parseAiResponse', () => {
  it('converts a valid answer into a recipe with fresh ids', () => {
    const r = parseAiResponse(JSON.stringify(good), makeId, 42);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = r.recipe;
    expect(rec.title).toBe('מרק עדשים');
    expect(rec.category).toBe('מרקים');
    expect(rec.createdAt).toBe(42);
    expect(rec.favorite).toBe(false);
    expect(rec.cookCount).toBe(0);
    // ingredient text kept exactly
    expect(rec.ingredients.map((i) => i.text)).toEqual(['2 כוסות עדשים כתומות', '1 בצל']);
    expect(rec.ingredients[1].group).toBeUndefined();
    // empty steps removed
    expect(rec.steps).toHaveLength(2);
  });

  it('maps step ingredient refs to new ids and drops unknown refs', () => {
    const r = parseAiResponse(JSON.stringify(good), makeId, 0);
    if (!r.ok) throw new Error('expected ok');
    const [onion, lentils] = [r.recipe.ingredients[1], r.recipe.ingredients[0]];
    expect(r.recipe.steps[0].ingredientIds).toEqual([onion.id]);
    expect(r.recipe.steps[1].ingredientIds).toEqual([lentils.id]);
  });

  it('keeps timers and dedupes tags', () => {
    const r = parseAiResponse(JSON.stringify(good), makeId, 0);
    if (!r.ok) throw new Error('expected ok');
    expect(r.recipe.steps[1].timers).toEqual([{ label: 'בישול', seconds: 1200 }]);
    expect(r.recipe.tags).toEqual(['טבעוני', 'חורף']);
  });

  it('falls back to "אחר" for an unknown category', () => {
    const r = parseAiResponse(JSON.stringify({ ...good, category: 'מנה עיקרית' }), makeId, 0);
    expect(r.ok && r.recipe.category).toBe('אחר');
  });

  it('drops zero or invalid timers', () => {
    const steps = [{ text: 'x', ingredientIds: [], timers: [{ label: '', seconds: 0 }, { label: '', seconds: 59.6 }] }];
    const r = parseAiResponse(JSON.stringify({ ...good, steps }), makeId, 0);
    if (!r.ok) throw new Error('expected ok');
    expect(r.recipe.steps[0].timers).toEqual([{ label: 'טיימר', seconds: 60 }]);
  });

  it('reports "not a recipe"', () => {
    expect(parseAiResponse('{"isRecipe": false, "notRecipeReason": "זו תמונה של חתול"}', makeId, 0)).toEqual({
      ok: false,
      reason: 'not-recipe',
    });
  });

  it('reports unreadable images', () => {
    expect(parseAiResponse('{"isRecipe": false, "unreadable": true}', makeId, 0)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('rejects malformed JSON, wrong shapes and empty recipes', () => {
    expect(parseAiResponse('not json at all', makeId, 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseAiResponse('{"isRecipe": "yes"}', makeId, 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(parseAiResponse('{"isRecipe": true, "title": "x", "ingredients": [], "steps": []}', makeId, 0)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseAiResponse(JSON.stringify({ ...good, title: '  ' }), makeId, 0).ok).toBe(false);
  });

  it('accepts JSON wrapped in a code fence or prose', () => {
    expect(parseAiResponse('```json\n' + JSON.stringify(good) + '\n```', makeId, 0).ok).toBe(true);
    expect(extractJson('הנה: {"a": 1} בהצלחה')).toEqual({ a: 1 });
  });

  it('accepts null optional fields', () => {
    const r = parseAiResponse(JSON.stringify({ ...good, servings: null, notes: null, tags: null }), makeId, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recipe.servings).toBeUndefined();
  });
});
