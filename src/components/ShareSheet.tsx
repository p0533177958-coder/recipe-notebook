import { downloadBlob, exportRecipeFile } from '../lib/backup';
import { recipeToShareText } from '../lib/shareText';
import { S } from '../strings.he';
import type { Recipe } from '../types';
import { IconFile, IconShare } from './Icons';
import { Sheet, SheetItem, toast } from './ui';

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export async function shareRecipeText(r: Recipe): Promise<void> {
  const text = recipeToShareText(r);
  if (navigator.share) {
    try {
      await navigator.share({ title: r.title, text });
      return;
    } catch (e) {
      if (isAbort(e)) return;
    }
  }
  await navigator.clipboard?.writeText(text);
  toast(S.share.copied);
}

export async function shareRecipeFile(r: Recipe): Promise<void> {
  const file = await exportRecipeFile(r);
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: r.title });
      return;
    } catch (e) {
      if (isAbort(e)) return;
    }
  }
  downloadBlob(file, file.name);
  toast(S.share.downloaded);
}

export function ShareSheet({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  return (
    <Sheet open={!!recipe} onClose={onClose} title={S.share.title}>
      {recipe && (
        <div className="flex flex-col gap-1">
          <SheetItem
            icon={<IconShare />}
            label={S.share.shareText}
            hint={S.share.shareTextHint}
            onClick={() => {
              onClose();
              void shareRecipeText(recipe);
            }}
          />
          <SheetItem
            icon={<IconFile />}
            label={S.share.shareFile}
            hint={S.share.shareFileHint}
            onClick={() => {
              onClose();
              void shareRecipeFile(recipe);
            }}
          />
        </div>
      )}
    </Sheet>
  );
}
