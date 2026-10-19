import type { Recipe } from '../types';

/** Plain-text recipe formatted for WhatsApp (*bold*, emoji bullets). */
export function recipeToShareText(r: Recipe): string {
  const lines: string[] = [];
  lines.push(`${r.emoji} *${r.title}*`);
  const meta = [r.totalTime && `⏱ ${r.totalTime}`, r.servings && `🍽 ${r.servings}`].filter(Boolean);
  if (meta.length) lines.push(meta.join('  ·  '));
  lines.push('');
  lines.push('🛒 *מצרכים:*');
  let group: string | undefined;
  for (const ing of r.ingredients) {
    if (ing.group && ing.group !== group) {
      group = ing.group;
      lines.push(`_${group}_`);
    }
    lines.push(`• ${ing.text}`);
  }
  lines.push('');
  lines.push('👩‍🍳 *אופן ההכנה:*');
  r.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.text}`));
  if (r.notes) {
    lines.push('');
    lines.push(`📝 ${r.notes}`);
  }
  lines.push('');
  lines.push('בתיאבון! 😋');
  return lines.join('\n');
}

/** Safe file name from a recipe title (Hebrew letters kept). */
export function recipeFileName(r: Recipe): string {
  const base = r.title.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'recipe';
  return `${base}.recipe.json`;
}
