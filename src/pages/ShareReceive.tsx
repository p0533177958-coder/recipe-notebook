import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconQuestion } from '../components/Icons';
import { Button, IconBadge, Spinner, toast } from '../components/ui';
import { db } from '../db';
import { importFromText } from '../lib/backup';
import { storeImages } from '../lib/image';
import { createDraft } from '../lib/recipeActions';
import { S } from '../strings.he';
import type { IncomingShare } from '../types';

/** Joins the shared title/text/url without repeating parts that are already contained in the text. */
export function sharedText(s: Pick<IncomingShare, 'title' | 'text' | 'url'>): string {
  const parts: string[] = [];
  const text = s.text?.trim() ?? '';
  const title = s.title?.trim() ?? '';
  const url = s.url?.trim() ?? '';
  if (title && !text.includes(title)) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return parts.join('\n');
}

function isJson(f: File) {
  return f.type === 'application/json' || f.name.toLowerCase().endsWith('.json');
}

/**
 * Landing page for the Web Share Target. The service worker stores the POSTed
 * content in IndexedDB and redirects here with ?id=…; GET shares arrive as query params.
 */
export default function ShareReceive() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [empty, setEmpty] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      const id = params.get('id');
      let share: IncomingShare | undefined;
      if (id) {
        share = await db.shares.get(id);
        await db.shares.delete(id);
      } else if (params.get('text') || params.get('title') || params.get('url')) {
        share = {
          id: 'get',
          title: params.get('title') ?? undefined,
          text: params.get('text') ?? undefined,
          url: params.get('url') ?? undefined,
          files: [],
          createdAt: Date.now(),
        };
      }
      // Clean up leftovers from shares that were never opened.
      await db.shares.where('createdAt').below(Date.now() - 86_400_000).delete();

      if (!share) {
        setEmpty(true);
        return;
      }

      const jsonFile = share.files.find(isJson);
      if (jsonFile) {
        const res = await importFromText(await jsonFile.text());
        toast(res ? S.settings.importDone(res.added, res.skipped) : S.errors.importFailed);
        navigate(res?.firstId && res.added === 1 ? `/recipe/${res.firstId}` : '/', { replace: true });
        return;
      }

      const text = sharedText(share);
      const images = share.files.filter((f) => f.type.startsWith('image/'));
      if (images.length) {
        const { ids, failed } = await storeImages(images);
        if (failed) toast(S.images.someFailed(failed));
        if (ids.length) {
          const draftId = await createDraft({ status: 'images', sourceImageIds: ids, text: text || undefined });
          navigate(`/add/images/${draftId}`, { replace: true });
          return;
        }
      }
      if (text) {
        const draftId = await createDraft({ status: 'pending', text });
        navigate(`/process/${draftId}`, { replace: true });
        return;
      }
      setEmpty(true);
    })();
  }, [params, navigate]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {empty ? (
        <>
          <IconBadge>
            <IconQuestion size={44} />
          </IconBadge>
          <p className="text-lg">{S.share.nothing}</p>
          <Button onClick={() => navigate('/', { replace: true })}>{S.common.back}</Button>
        </>
      ) : (
        <>
          <span className="text-primary">
            <Spinner size={44} />
          </span>
          <p className="text-lg">{S.share.receiving}</p>
        </>
      )}
    </div>
  );
}
