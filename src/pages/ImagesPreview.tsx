import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { IconClose, IconPlus, IconSparkle } from '../components/Icons';
import { SortableArea, useSortableItem } from '../components/Sortable';
import { Button, PageHeader, ScreenSkeleton, toast } from '../components/ui';
import { db } from '../db';
import { forgetImageUrl, useImageUrl } from '../hooks/useImageUrl';
import { storeImages } from '../lib/image';
import { S } from '../strings.he';

function Tile({ id, n, onRemove }: { id: string; n: number; onRemove: () => void }) {
  const url = useImageUrl(id);
  const { setNodeRef, style, handleProps, isDragging } = useSortableItem(id);
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'scale-105 opacity-90' : ''}>
      <div
        {...handleProps}
        aria-label={`${S.images.imageN(n)} – ${S.common.dragToReorder}`}
        className="relative aspect-[3/4] touch-manipulation overflow-hidden rounded-card border border-line bg-surface-2 shadow-soft select-none"
        style={{ WebkitTouchCallout: 'none' }}
      >
        {url && <img src={url} alt="" draggable={false} className="size-full object-cover" />}
        <span className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-primary font-bold text-on-primary shadow">
          {n}
        </span>
      </div>
      <button
        type="button"
        aria-label={`${S.images.removeImage} ${n}`}
        onClick={onRemove}
        className="absolute -top-2 -left-2 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-soft"
      >
        <IconClose size={18} />
      </button>
    </li>
  );
}

export default function ImagesPreview() {
  const { draftId = '' } = useParams();
  const navigate = useNavigate();
  const draft = useLiveQuery(() => db.drafts.get(draftId), [draftId], null);
  const addRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showText, setShowText] = useState(false);

  if (draft === null) return <ScreenSkeleton />;
  if (!draft) return <Navigate to="/" replace />;

  const ids = draft.sourceImageIds;
  const setIds = (next: string[]) => void db.drafts.update(draftId, { sourceImageIds: next, updatedAt: Date.now() });

  const remove = async (id: string) => {
    setIds(ids.filter((x) => x !== id));
    await db.images.delete(id);
    forgetImageUrl(id);
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const { ids: added, failed } = await storeImages([...files]);
    if (failed) toast(S.images.someFailed(failed));
    const fresh = (await db.drafts.get(draftId))?.sourceImageIds ?? [];
    setIds([...fresh, ...added]);
    setBusy(false);
  };

  const process = async () => {
    await db.drafts.update(draftId, { status: 'pending', updatedAt: Date.now() });
    navigate(`/process/${draftId}`, { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <PageHeader title={S.images.title} onBack={() => navigate('/')} />
      <p className="px-4 pb-3 text-muted">{S.images.hint}</p>
      <div className="flex-1 px-4">
        <SortableArea items={ids.map((id) => ({ id }))} onReorder={(items) => setIds(items.map((i) => i.id))} layout="grid">
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {ids.map((id, i) => (
              <Tile key={id} id={id} n={i + 1} onRemove={() => void remove(id)} />
            ))}
            <li>
              <button
                type="button"
                onClick={() => addRef.current?.click()}
                disabled={busy}
                className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line text-muted active:bg-surface-2"
              >
                {busy ? (
                  <span className="size-8 animate-spin rounded-full border-3 border-current border-t-transparent" />
                ) : (
                  <IconPlus size={36} />
                )}
                {busy ? S.images.resizing : S.images.addMore}
              </button>
            </li>
          </ul>
        </SortableArea>
        <input
          ref={addRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="mt-5">
          {showText || draft.text ? (
            <textarea
              value={draft.text ?? ''}
              onChange={(e) => void db.drafts.update(draftId, { text: e.target.value, updatedAt: Date.now() })}
              aria-label={S.images.addText}
              placeholder={S.images.addText}
              className="ctl-input min-h-28 rounded-card! p-3 text-base"
            />
          ) : (
            <button type="button" className="min-h-11 text-primary underline underline-offset-4" onClick={() => setShowText(true)}>
              + {S.images.addText}
            </button>
          )}
        </div>
      </div>
      <div className="sticky bottom-0 bg-bg/95 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        {ids.length === 0 && <p className="mb-2 text-center text-muted">{S.images.none}</p>}
        <Button big className="w-full" disabled={ids.length === 0 || busy} onClick={() => void process()}>
          <IconSparkle size={22} />
          {S.images.process(ids.length)}
        </Button>
      </div>
    </div>
  );
}
