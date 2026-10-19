import { useEffect, useState } from 'react';
import { db } from '../db';

// Object URLs are cached per image id so scrolling a long list does not re-read blobs.
const cache = new Map<string, string>();

export function useImageUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(id ? cache.get(id) : undefined);
  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    const hit = cache.get(id);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    void db.images.get(id).then((row) => {
      if (!row || !alive) return;
      const u = URL.createObjectURL(row.blob);
      cache.set(id, u);
      setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function forgetImageUrl(id: string): void {
  const u = cache.get(id);
  if (u) URL.revokeObjectURL(u);
  cache.delete(id);
}
