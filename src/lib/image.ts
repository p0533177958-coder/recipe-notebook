import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from '../config';
import { db, newId } from '../db';

/** Target size keeping aspect ratio so the longer edge is at most maxEdge. */
export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Downscales an image to IMAGE_MAX_EDGE and re-encodes it as JPEG. */
export async function resizeImage(file: Blob): Promise<Blob> {
  // imageOrientation honours EXIF rotation from phone cameras.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, IMAGE_MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', IMAGE_QUALITY),
  );
}

/** Resizes and stores images; returns their ids in the same order. Unreadable files are skipped. */
export async function storeImages(files: Blob[]): Promise<{ ids: string[]; failed: number }> {
  const ids: string[] = [];
  let failed = 0;
  for (const f of files) {
    try {
      const blob = await resizeImage(f);
      const id = newId();
      await db.images.put({ id, blob, createdAt: Date.now() });
      ids.push(id);
    } catch {
      failed++;
    }
  }
  return { ids, failed };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(bin);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return `data:${blob.type || 'application/octet-stream'};base64,${await blobToBase64(blob)}`;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Where the finished dish appears in a source photo, in percent of the image (from the AI). */
export type DishBox = { x: number; y: number; w: number; h: number };

/**
 * Converts a percentage box to pixel crop coordinates, clamped to the image.
 * Returns null for boxes too small to make a useful dish photo (under 15% of either side).
 */
export function cropRect(box: DishBox, width: number, height: number): { sx: number; sy: number; sw: number; sh: number } | null {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const x1 = clamp(box.x);
  const y1 = clamp(box.y);
  const x2 = clamp(box.x + box.w);
  const y2 = clamp(box.y + box.h);
  if (x2 - x1 < 15 || y2 - y1 < 15) return null;
  const sx = Math.round((x1 / 100) * width);
  const sy = Math.round((y1 / 100) * height);
  return { sx, sy, sw: Math.round((x2 / 100) * width) - sx, sh: Math.round((y2 / 100) * height) - sy };
}

/** Crops the dish out of a source photo and stores it as a new image. Returns its id, or null. */
export async function cropDishPhoto(source: Blob, box: DishBox): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    const rect = cropRect(box, bitmap.width, bitmap.height);
    if (!rect) {
      bitmap.close();
      return null;
    }
    const { width, height } = fitWithin(rect.sw, rect.sh, IMAGE_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', IMAGE_QUALITY));
    if (!blob) return null;
    const id = newId();
    await db.images.put({ id, blob, createdAt: Date.now() });
    return id;
  } catch {
    return null;
  }
}
