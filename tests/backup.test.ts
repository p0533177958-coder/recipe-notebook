import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { exportBackup, exportRecipeFile, importFromText } from '../src/lib/backup';
import { sampleRecipes } from '../src/seed';

// Runs against fake-indexeddb (see vitest.config.ts setupFiles).

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5]);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('backup round trip', () => {
  it('exports everything with images and restores it into an empty database', async () => {
    const [a, b, c] = sampleRecipes(0);
    await db.images.put({ id: 'img1', blob: new Blob([PNG], { type: 'image/png' }), createdAt: 0 });
    await db.images.put({ id: 'src1', blob: new Blob([PNG], { type: 'image/jpeg' }), createdAt: 0 });
    await db.recipes.bulkPut([{ ...a, imageId: 'img1', sourceImageIds: ['src1'], favorite: true, cookCount: 3 }, b, c]);

    const text = await (await exportBackup()).text();
    await Promise.all(db.tables.map((t) => t.clear()));

    const res = await importFromText(text);
    expect(res).toMatchObject({ added: 3, skipped: 0 });
    const restored = await db.recipes.get(a.id);
    expect(restored).toMatchObject({ title: 'שקשוקה', favorite: true, cookCount: 3, imageId: 'img1' });
    const img = await db.images.get('img1');
    expect(new Uint8Array(await img!.blob.arrayBuffer())).toEqual(PNG);
    expect(await db.images.get('src1')).toBeTruthy();
  });

  it('merges without duplicates', async () => {
    const [a, b] = sampleRecipes(0);
    await db.recipes.bulkPut([a, b]);
    const text = await (await exportBackup()).text();
    const res = await importFromText(text);
    expect(res).toMatchObject({ added: 0, skipped: 2 });
    expect(await db.recipes.count()).toBe(2);
  });

  it('a shared .recipe.json imports on another device and drops personal stats', async () => {
    const [a] = sampleRecipes(0);
    await db.images.put({ id: 'dish', blob: new Blob([PNG], { type: 'image/png' }), createdAt: 0 });
    const file = await exportRecipeFile({ ...a, imageId: 'dish', favorite: true, cookCount: 9, sourceImageIds: ['gone'] });
    expect(file.name).toBe('שקשוקה.recipe.json');
    await Promise.all(db.tables.map((t) => t.clear()));

    const res = await importFromText(await file.text());
    expect(res).toMatchObject({ added: 1, firstId: a.id });
    const r = await db.recipes.get(a.id);
    expect(r).toMatchObject({ favorite: false, cookCount: 0, imageId: 'dish' });
    expect(r?.sourceImageIds).toBeUndefined();
    expect(await db.images.get('dish')).toBeTruthy();
  });

  it('rejects files that are not app backups', async () => {
    expect(await importFromText('{"hello": "world"}')).toBeNull();
  });
});
