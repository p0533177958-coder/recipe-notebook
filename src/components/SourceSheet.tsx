import { useImageUrl } from '../hooks/useImageUrl';
import { S } from '../strings.he';
import { Sheet } from './ui';

function SourceImage({ id, n }: { id: string; n: number }) {
  const url = useImageUrl(id);
  if (!url) return <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-surface-2" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={S.images.imageN(n)} className="w-full rounded-xl border border-line" />
    </a>
  );
}

/** Shows the original photos and/or text a recipe was extracted from. */
export function SourceSheet({
  open,
  onClose,
  imageIds,
  text,
}: {
  open: boolean;
  onClose: () => void;
  imageIds?: string[];
  text?: string;
}) {
  const hasImages = !!imageIds?.length;
  return (
    <Sheet open={open} onClose={onClose} title={S.source.title}>
      {!hasImages && !text && <p className="py-6 text-center text-muted">{S.source.none}</p>}
      <div className="flex flex-col gap-3">
        {imageIds?.map((id, i) => <SourceImage key={id} id={id} n={i + 1} />)}
        {text && (
          <div>
            <h3 className="mb-1 font-bold">{S.source.text}</h3>
            <pre className="rounded-xl bg-surface-2 p-3 font-sans text-base whitespace-pre-wrap">{text}</pre>
          </div>
        )}
      </div>
    </Sheet>
  );
}
