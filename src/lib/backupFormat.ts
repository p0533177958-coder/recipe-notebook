import { z } from 'zod';
import { CATEGORIES, type Recipe } from '../types';

// Pure parts of backup/import (no IndexedDB), so they can be unit-tested.

export const BACKUP_APP = 'recipe-notebook';

const recipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  emoji: z.string().default('🍽️'),
  imageId: z.string().optional(),
  sourceImageIds: z.array(z.string()).optional(),
  sourceText: z.string().optional(),
  category: z.enum(CATEGORIES).catch('אחר'),
  tags: z.array(z.string()).default([]),
  servings: z.string().optional(),
  totalTime: z.string().optional(),
  ingredients: z.array(z.object({ id: z.string(), text: z.string(), group: z.string().optional() })),
  steps: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      ingredientIds: z.array(z.string()).default([]),
      timers: z.array(z.object({ label: z.string(), seconds: z.number() })).default([]),
    }),
  ),
  notes: z.string().optional(),
  favorite: z.boolean().default(false),
  createdAt: z.number().default(() => Date.now()),
  lastCookedAt: z.number().optional(),
  cookCount: z.number().default(0),
});

export const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number(),
  kind: z.enum(['backup', 'recipe']),
  exportedAt: z.number(),
  recipes: z.array(recipeSchema),
  images: z.array(z.object({ id: z.string(), dataUrl: z.string() })).default([]),
});

export type BackupFile = z.infer<typeof backupSchema>;

export function parseBackup(text: string): BackupFile | null {
  try {
    const r = backupSchema.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Content fingerprint: same title and same ingredient lines means the same recipe. */
export function recipeFingerprint(r: Pick<Recipe, 'title' | 'ingredients'>): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  return `${norm(r.title)}|${r.ingredients.map((i) => norm(i.text)).join('|')}`;
}

/** Returns the incoming recipes that are not already present (by id or by content). */
export function recipesToImport(existing: Recipe[], incoming: Recipe[]): Recipe[] {
  const ids = new Set(existing.map((r) => r.id));
  const prints = new Set(existing.map(recipeFingerprint));
  const out: Recipe[] = [];
  for (const r of incoming) {
    const fp = recipeFingerprint(r);
    if (ids.has(r.id) || prints.has(fp)) continue;
    ids.add(r.id);
    prints.add(fp);
    out.push(r);
  }
  return out;
}
