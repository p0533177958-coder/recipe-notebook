import { db } from '../db';
import type { Recipe } from '../types';
import { BACKUP_APP, parseBackup, recipesToImport, type BackupFile } from './backupFormat';
import { blobToDataUrl, dataUrlToBlob } from './image';
import { recipeFileName } from './shareText';

async function collectImages(ids: string[]): Promise<BackupFile['images']> {
  const unique = [...new Set(ids)];
  const rows = await db.images.bulkGet(unique);
  const out: BackupFile['images'] = [];
  for (const row of rows) {
    if (row) out.push({ id: row.id, dataUrl: await blobToDataUrl(row.blob) });
  }
  return out;
}

function imageIdsOf(r: Recipe, withSources: boolean): string[] {
  return [...(r.imageId ? [r.imageId] : []), ...(withSources ? (r.sourceImageIds ?? []) : [])];
}

/** Every recipe plus all its images (dish photo and source photos). */
export async function exportBackup(): Promise<Blob> {
  const recipes = await db.recipes.toArray();
  const images = await collectImages(recipes.flatMap((r) => imageIdsOf(r, true)));
  const file: BackupFile = {
    app: BACKUP_APP,
    version: 1,
    kind: 'backup',
    exportedAt: Date.now(),
    recipes,
    images,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export function backupFileName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `מתכונים-גיבוי-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** A single recipe as a shareable .recipe.json (dish photo included, source photos left out). */
export async function exportRecipeFile(r: Recipe): Promise<File> {
  const recipe: Recipe = { ...r, sourceImageIds: undefined, lastCookedAt: undefined, cookCount: 0, favorite: false };
  const file: BackupFile = {
    app: BACKUP_APP,
    version: 1,
    kind: 'recipe',
    exportedAt: Date.now(),
    recipes: [recipe],
    images: await collectImages(imageIdsOf(r, false)),
  };
  return new File([JSON.stringify(file)], recipeFileName(r), { type: 'application/json' });
}

export type ImportResult = { added: number; skipped: number; firstId?: string };

/** Merges a backup or a shared recipe file into the database, skipping duplicates. */
export async function importFromText(text: string): Promise<ImportResult | null> {
  const data = parseBackup(text);
  if (!data) return null;
  const existing = await db.recipes.toArray();
  const toAdd = recipesToImport(existing, data.recipes as Recipe[]);
  const neededImages = new Set(toAdd.flatMap((r) => imageIdsOf(r, true)));
  // Decode images before the transaction: awaiting non-IndexedDB work inside it would end it.
  const images = await Promise.all(
    data.images
      .filter((img) => neededImages.has(img.id))
      .map(async (img) => ({ id: img.id, blob: await dataUrlToBlob(img.dataUrl), createdAt: Date.now() })),
  );
  await db.transaction('rw', db.recipes, db.images, async () => {
    for (const img of images) {
      if (!(await db.images.get(img.id))) await db.images.put(img);
    }
    await db.recipes.bulkPut(toAdd);
  });
  return { added: toAdd.length, skipped: data.recipes.length - toAdd.length, firstId: toAdd[0]?.id };
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
