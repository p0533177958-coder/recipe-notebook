import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeHebrew, recipeHaystack, searchRecipes } from '../src/lib/search';
import { sampleRecipes } from '../src/seed';
import type { Recipe } from '../src/types';

function recipe(title: string, ingredients: string[], tags: string[] = []): Recipe {
  return {
    id: title,
    title,
    emoji: '🍽️',
    category: 'אחר',
    tags,
    ingredients: ingredients.map((text, i) => ({ id: `i${i}`, text })),
    steps: [],
    favorite: false,
    createdAt: 0,
    cookCount: 0,
  };
}

describe('normalizeHebrew', () => {
  it('strips niqqud', () => {
    expect(normalizeHebrew('שָׁלוֹם')).toBe(normalizeHebrew('שלום'));
  });
  it('treats full and defective spelling the same', () => {
    expect(normalizeHebrew('שוקולד')).toBe(normalizeHebrew('שקולד'));
    expect(normalizeHebrew('ברוקולי')).toBe(normalizeHebrew('ברקולי'));
  });
  it('unifies final letters', () => {
    expect(normalizeHebrew('עגבניות')).toContain('עגבנ');
    expect(normalizeHebrew('בצלים')).toBe(normalizeHebrew('בצלימ'));
  });
});

describe('search', () => {
  const list = [
    recipe('פשטידת ברוקולי', ['1 ראש ברוקולי', '3 ביצים']),
    recipe('מרק עדשים', ['2 כוסות עדשים כתומות', '1 בצל']),
    recipe('סלט ירקות', ['2 עגבניות', '1 מלפפון'], ['צמחוני']),
  ];

  it('finds a recipe by an ingredient', () => {
    expect(searchRecipes(list, 'ברוקולי').map((r) => r.title)).toEqual(['פשטידת ברוקולי']);
  });
  it('finds by an ingredient spelled differently', () => {
    expect(searchRecipes(list, 'ברקולי').map((r) => r.title)).toEqual(['פשטידת ברוקולי']);
  });
  it('ignores the definite article', () => {
    expect(searchRecipes(list, 'הבצל').map((r) => r.title)).toEqual(['מרק עדשים']);
  });
  it('finds by tag', () => {
    expect(searchRecipes(list, 'צמחוני').map((r) => r.title)).toEqual(['סלט ירקות']);
  });
  it('requires every word to match', () => {
    expect(searchRecipes(list, 'מרק ברוקולי')).toHaveLength(0);
  });
  it('returns all for an empty query', () => {
    expect(searchRecipes(list, '  ')).toHaveLength(3);
  });
  it('finds sample recipes by ingredient', () => {
    const samples = sampleRecipes(0);
    const hits = samples.filter((r) => matchesQuery(recipeHaystack(r), 'שמרים'));
    expect(hits.map((r) => r.title)).toEqual(['חלה לשבת']);
    expect(samples.filter((r) => matchesQuery(recipeHaystack(r), 'ביצים'))).toHaveLength(3);
  });
});
