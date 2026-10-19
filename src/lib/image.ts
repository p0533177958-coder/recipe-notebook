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
