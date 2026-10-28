import type { Recipe, ShoppingItem } from '../types';

// Shopping list logic (pure). Lines are kept exactly as written in the recipe:
// no merging of similar items and no unit conversion.

/** New list items for the recipe's ingredients the user does not have, skipping lines already on the list. */
export function itemsFromRecipe(
  recipe: Pick<Recipe, 'id' | 'title' | 'ingredients'>,
  haveIds: Set<string>,
  existing: ShoppingItem[],
  makeId: () => string,
  now: number,
): ShoppingItem[] {
  const already = new Set(existing.filter((i) => i.recipeId === recipe.id).map((i) => i.text));
  let order = existing.reduce((m, i) => Math.max(m, i.order), 0);
  return recipe.ingredients
    .filter((ing) => !haveIds.has(ing.id) && ing.text.trim() && !already.has(ing.text))
    .map((ing) => ({
      id: makeId(),
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      text: ing.text,
      checked: false,
      createdAt: now,
      order: ++order,
    }));
}

export type ShoppingGroup = { key: string; title: string; items: ShoppingItem[] };

/** Groups the list by recipe, in the order recipes were added; items keep their order. */
export function groupByRecipe(items: ShoppingItem[]): ShoppingGroup[] {
  const groups = new Map<string, ShoppingGroup>();
  for (const item of [...items].sort((a, b) => a.order - b.order)) {
    const key = item.recipeId ?? '';
    const g = groups.get(key) ?? { key, title: item.recipeTitle, items: [] };
    g.items.push(item);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** WhatsApp-friendly text of the items still to buy, grouped by recipe. */
export function shoppingShareText(items: ShoppingItem[], heading: string): string {
  const lines = [`*${heading}*`];
  for (const g of groupByRecipe(items.filter((i) => !i.checked))) {
    lines.push('', `_${g.title}_`);
    for (const i of g.items) lines.push(`☐ ${i.text}`);
  }
  return lines.join('\n');
}
