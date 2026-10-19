import type { Recipe } from '../types';

const NIQQUD = /[֑-ׇ]/g;
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const PREFIXES = 'הובלמכש';

/**
 * Normalises Hebrew text for fuzzy matching:
 * strips niqqud and punctuation, unifies final letters, and drops ו/י that are not
 * word-initial so that full and defective spelling (כתיב מלא/חסר) compare equal.
 */
export function normalizeHebrew(input: string): string {
  return input
    .toLowerCase()
    .replace(NIQQUD, '')
    .replace(/[׳״'"`]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 1 ? w[0] + w.slice(1).replace(/[וי]/g, '') : w))
    .join(' ');
}

/** Variants of a query word: itself, and without a single-letter prefix (ה הידיעה, ו, ב, ל…). */
function wordVariants(word: string): string[] {
  const out = [word];
  if (word.length >= 3 && PREFIXES.includes(word[0])) {
    // The prefix may have hidden a ו/י that normalisation would keep at word start.
    out.push(word.slice(1));
  }
  return out;
}

export function recipeHaystack(r: Recipe): string {
  return normalizeHebrew(
    [r.title, r.category, ...r.tags, ...r.ingredients.map((i) => i.text)].join(' '),
  );
}

/** Each query word must match somewhere (title, tag, category or ingredient). */
export function matchesQuery(haystack: string, query: string): boolean {
  const raw = query
    .toLowerCase()
    .replace(NIQQUD, '')
    .split(/\s+/)
    .filter(Boolean);
  if (raw.length === 0) return true;
  return raw.every((rawWord) => {
    const [whole, ...stripped] = wordVariants(rawWord).map(normalizeHebrew);
    if (!whole) return true;
    if (haystack.includes(whole)) return true;
    // A prefix-stripped form must start a word, otherwise "מרק" → "רק" would match "ברוקולי".
    const padded = ` ${haystack}`;
    return stripped.some((c) => c.length >= 2 && padded.includes(` ${c}`));
  });
}

export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  if (!query.trim()) return recipes;
  return recipes.filter((r) => matchesQuery(recipeHaystack(r), query));
}
