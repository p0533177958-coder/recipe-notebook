import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { IconClose, IconShare, IconTrash } from '../components/Icons';
import { Button, Checkbox, EmptyState, IconButton, PageHeader, Skeleton, toast } from '../components/ui';
import { db } from '../db';
import { groupByRecipe, shoppingShareText } from '../lib/shopping';
import { S } from '../strings.he';
import type { ShoppingItem } from '../types';

function isAbort(e: unknown) {
  return e instanceof DOMException && e.name === 'AbortError';
}

export default function Shopping() {
  const navigate = useNavigate();
  const items = useLiveQuery(() => db.shopping.orderBy('order').toArray(), [], null as ShoppingItem[] | null);

  if (items === null) {
    return (
      <div className="mx-auto min-h-dvh max-w-2xl">
        <PageHeader title={S.shopping.title} onBack={() => navigate('/')} />
        <div className="flex flex-col gap-3 px-4" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const left = items.filter((i) => !i.checked).length;
  const bought = items.length - left;
  const groups = groupByRecipe(items);

  const share = async () => {
    const text = shoppingShareText(items, S.shopping.shareHeading);
    if (navigator.share) {
      try {
        await navigator.share({ title: S.shopping.title, text });
        return;
      } catch (e) {
        if (isAbort(e)) return;
      }
    }
    await navigator.clipboard?.writeText(text);
    toast(S.shopping.copied);
  };

  const clearBought = async () => {
    const ids = items.filter((i) => i.checked).map((i) => i.id);
    await db.shopping.bulkDelete(ids);
    toast(S.shopping.removedBought(ids.length));
  };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-32">
      <PageHeader
        title={S.shopping.title}
        onBack={() => navigate('/')}
      />

      {items.length === 0 ? (
        <EmptyState
          title={S.shopping.emptyTitle}
          text={S.shopping.emptyText}
          action={
            <Button variant="secondary" className="w-full" onClick={() => navigate('/')}>
              {S.shopping.toRecipes}
            </Button>
          }
        />
      ) : (
        <>
          <p className="px-4 pb-2 text-sm text-muted">{S.shopping.left(left)}</p>
          <div className="flex flex-col gap-4 px-4">
            {groups.map((g) => (
              <section key={g.key} className="rounded-card bg-surface p-4 shadow-soft" aria-label={g.title}>
                <h2 className="mb-1 font-serif text-lg">{g.title}</h2>
                <ul>
                  {g.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-1">
                      <Checkbox
                        checked={item.checked}
                        onChange={(v) => void db.shopping.update(item.id, { checked: v })}
                        label={item.text}
                        className="min-w-0 flex-1"
                      >
                        <span className={`text-base transition-colors duration-150 ${item.checked ? 'text-muted line-through' : ''}`}>
                          {item.text}
                        </span>
                      </Checkbox>
                      <IconButton label={S.shopping.removeItem(item.text)} onClick={() => void db.shopping.delete(item.id)} className="text-muted">
                        <IconClose size={18} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 bg-bg/95 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur">
            <div className="mx-auto flex max-w-2xl gap-3">
              <Button big className="flex-1 whitespace-nowrap" onClick={() => void share()} disabled={left === 0}>
                <IconShare size={20} />
                {S.common.share}
              </Button>
              <Button big variant="secondary" className="flex-1 whitespace-nowrap" onClick={() => void clearBought()} disabled={bought === 0}>
                <IconTrash size={20} />
                {S.shopping.clearBought}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
