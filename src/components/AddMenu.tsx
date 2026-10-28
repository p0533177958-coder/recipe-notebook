import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importFromText } from '../lib/backup';
import { storeImages } from '../lib/image';
import { createDraft } from '../lib/recipeActions';
import { S } from '../strings.he';
import { IconCamera, IconClipboard, IconFile, IconImage, IconPlus, IconShare } from './Icons';
import { Button, Sheet, SheetItem, Spinner, toast } from './ui';

/** Shared logic for the four ways of adding a recipe. */
export function useAddActions() {
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const { ids, failed } = await storeImages([...files]);
      if (failed) toast(S.images.someFailed(failed));
      if (ids.length === 0) return;
      const id = await createDraft({ status: 'images', sourceImageIds: ids });
      navigate(`/add/images/${id}`);
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const res = await importFromText(await f.text());
    if (!res) {
      toast(S.errors.importFailed);
      return;
    }
    toast(S.settings.importDone(res.added, res.skipped));
    if (res.added === 1 && res.firstId) navigate(`/recipe/${res.firstId}`);
  };

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void onImages(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void onImages(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void onImport(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );

  return {
    inputs,
    busy,
    camera: () => cameraRef.current?.click(),
    gallery: () => galleryRef.current?.click(),
    importFile: () => importRef.current?.click(),
    paste: () => navigate('/add/text'),
  };
}

export function AddMenuItems({ actions, onPick, onShareHelp }: {
  actions: ReturnType<typeof useAddActions>;
  onPick?: () => void;
  onShareHelp: () => void;
}) {
  const pick = (fn: () => void) => () => {
    onPick?.();
    fn();
  };
  return (
    <div className="flex flex-col gap-1">
      <SheetItem icon={<IconCamera />} label={S.add.camera} hint={S.add.cameraHint} onClick={pick(actions.camera)} />
      <SheetItem icon={<IconImage />} label={S.add.gallery} hint={S.add.galleryHint} onClick={pick(actions.gallery)} />
      <SheetItem icon={<IconClipboard />} label={S.add.paste} hint={S.add.pasteHint} onClick={pick(actions.paste)} />
      <SheetItem icon={<IconShare />} label={S.add.shareFrom} hint={S.add.shareFromHint} onClick={pick(onShareHelp)} />
      <SheetItem icon={<IconFile />} label={S.add.importFile} hint={S.add.importFileHint} onClick={pick(actions.importFile)} />
    </div>
  );
}

export function ShareHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={S.add.shareExplainTitle}>
      <ol className="mb-3 flex list-decimal flex-col gap-2 ps-6 text-lg">
        {S.add.shareExplain.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="mb-4 text-muted">{S.add.shareExplainNote}</p>
      <Button className="w-full" onClick={onClose}>
        {S.add.gotIt}
      </Button>
    </Sheet>
  );
}

/**
 * Floating add button (bottom-left in RTL). Extended with its label while scrolling up or at the top,
 * shrinks to a circle while scrolling down. `autoOpen` opens the menu (home-screen shortcut).
 */
export function AddFab({ autoOpen = false }: { autoOpen?: boolean }) {
  const actions = useAddActions();
  const [open, setOpen] = useState(autoOpen);
  const [help, setHelp] = useState(false);
  const [extended, setExtended] = useState(true);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 6) return;
      setExtended(y < 40 || y < last);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {actions.inputs}
      <button
        type="button"
        aria-label={S.add.fab}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        disabled={actions.busy}
        className={`fixed bottom-[calc(24px+env(safe-area-inset-bottom))] left-[max(16px,env(safe-area-inset-left))] z-30 flex h-14 items-center justify-center gap-2 overflow-hidden rounded-full bg-primary text-on-primary shadow-lift transition-[width,transform] duration-[250ms] active:scale-[0.97] disabled:opacity-60 ${
          extended ? 'w-[156px] px-5' : 'w-14'
        }`}
      >
        {actions.busy ? <Spinner size={22} /> : <IconPlus size={26} className="shrink-0" />}
        <span
          className={`text-base font-medium whitespace-nowrap transition-opacity duration-150 ${extended ? 'opacity-100' : 'w-0 opacity-0'}`}
          aria-hidden="true"
        >
          {S.add.fab}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={S.add.fab}>
        <AddMenuItems actions={actions} onPick={() => setOpen(false)} onShareHelp={() => setHelp(true)} />
      </Sheet>
      <ShareHelpSheet open={help} onClose={() => setHelp(false)} />
    </>
  );
}
