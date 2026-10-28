// Small Hebrew formatting helpers used across the app.

/**
 * "אין מתכונים" / "מתכון אחד" / "3 מתכונים". Never "1 מתכונים" or "0 מתכונים".
 * `one` is the full phrase for one ("מתכון אחד"), `many` the plural noun ("מתכונים").
 */
export function countLabel(n: number, forms: { none: string; one: string; many: string; two?: string }): string {
  if (n <= 0) return forms.none;
  if (n === 1) return forms.one;
  if (n === 2 && forms.two) return forms.two;
  return `${n} ${forms.many}`;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "היום", "אתמול", "לפני 3 ימים", "לפני שבוע", "לפני חודשיים", or a date for anything older than a year. */
export function relativeDate(ts: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days === 2) return 'שלשום';
  if (days < 7) return `לפני ${days} ימים`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks === 1 ? 'לפני שבוע' : weeks === 2 ? 'לפני שבועיים' : `לפני ${weeks} שבועות`;
  const months = Math.floor(days / 30);
  if (days < 365) return months === 1 ? 'לפני חודש' : months === 2 ? 'לפני חודשיים' : `לפני ${months} חודשים`;
  return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** Short date for notes, e.g. "28.10". */
export function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

/**
 * Adds a "for next time" note to the recipe notes, dated, on its own line.
 * Empty notes are ignored; existing notes are kept as they are.
 */
export function appendNote(existing: string | undefined, note: string, ts: number): string | undefined {
  const clean = note.trim();
  if (!clean) return existing;
  const line = `${shortDate(ts)}: ${clean}`;
  return existing?.trim() ? `${existing.trim()}\n${line}` : line;
}

/**
 * "What shall we cook today?": a random pick from the favorites when there are at least 3,
 * otherwise from all recipes. `rand` returns a number in [0, 1).
 */
export function pickRecipe<T extends { favorite: boolean }>(recipes: T[], rand: () => number = Math.random): T | undefined {
  const favorites = recipes.filter((r) => r.favorite);
  const pool = favorites.length >= 3 ? favorites : recipes;
  if (pool.length === 0) return undefined;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
