import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AddFab, AddMenuItems, ShareHelpSheet, useAddActions } from '../components/AddMenu';
import { IconClose, IconEdit, IconGrid, IconRows, IconScroll, IconSearch, IconSettings, IconShare, IconStar, IconTrash } from '../components/Icons';
import { RecipeVisual } from '../components/RecipeVisual';
import { ShareSheet } from '../components/ShareSheet';
import { Chip, ConfirmSheet, IconButton, Sheet, SheetItem, toast } from '../components/ui';
import { db } from '../db';
import { useLongPress } from '../hooks/useLongPress';
import { recipeHaystack, matchesQuery } from '../lib/search';
import { deleteRecipe, discardDraft, draftForEdit, toggleFavorite } from '../lib/recipeActions';
import { updateSettings, useSettings, type SortMode } from '../settings';
import { S } from '../strings.he';
import { CATEGORIES, type Category, type Draft, type Recipe } from '../types';

type Filter = 'all' | 'fav' | Category;

function sessionGet(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function sessionSet(key: string, v: string) {
  try {
    sessionStorage.setItem(key, v);
  } catch {
    // ignore
  }
}

export function draftRoute(d: Draft): string {
  if (d.status === 'images') return `/add/images/${d.id}`;
  if (d.status === 'ready') return `/edit/${d.id}`;
  return `/process/${d.id}`;
}

function sortRecipes(list: Recipe[], mode: SortMode): Recipe[] {
  const out = [...list];
  if (mode === 'alpha') out.sort((a, b) => a.title.localeCompare(b.title, 'he'));
  else if (mode === 'cooked')
    out.sort((a, b) => b.cookCount - a.cookCount || (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0));
  else out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export default function Home() {
  const navigate = useNavigate();
  const settings = useSettings();
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const drafts = useLiveQuery(() => db.drafts.orderBy('updatedAt').reverse().toArray(), [], [] as Draft[]);
  const [query, setQueryState] = useState(() => sessionGet('rn-q'));
  const [filter, setFilterState] = useState<Filter>(() => (sessionGet('rn-f') as Filter) || 'all');
  const [menuFor, setMenuFor] = useState<Recipe | null>(null);
  const [shareFor, setShareFor] = useState<Recipe | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Recipe | null>(null);

  const setQuery = (q: string) => {
    setQueryState(q);
    sessionSet('rn-q', q);
  };
  const setFilter = (f: Filter) => {
    setFilterState(f);
    sessionSet('rn-f', f);
  };

  const haystacks = useMemo(() => new Map((recipes ?? []).map((r) => [r.id, recipeHaystack(r)])), [recipes]);

  const usedCategories = useMemo(
    () => CATEGORIES.filter((c) => recipes?.some((r) => r.category === c)),
    [recipes],
  );
  const hasFavorites = recipes?.some((r) => r.favorite) ?? false;

  const visible = useMemo(() => {
    let list = recipes ?? [];
    if (filter === 'fav') list = list.filter((r) => r.favorite);
    else if (filter !== 'all') list = list.filter((r) => r.category === filter);
    if (query.trim()) list = list.filter((r) => matchesQuery(haystacks.get(r.id) ?? '', query));
    return sortRecipes(list, settings.sort);
  }, [recipes, filter, query, haystacks, settings.sort]);

  const open = (r: Recipe) => navigate(`/recipe/${r.id}`);
  const draft = drafts[0];

  if (recipes === undefined) return <div className="min-h-dvh" />;

  const isEmpty = recipes.length === 0;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-32">
      <header className="flex items-center gap-2 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-2">
        <span className="text-3xl" aria-hidden="true">
          📖
        </span>
        <h1 className="flex-1 font-serif text-3xl font-bold text-primary">{S.appName}</h1>
        <Link
          to="/settings"
          aria-label={S.home.settings}
          className="flex size-12 items-center justify-center rounded-full active:bg-surface-2"
        >
          <IconSettings />
        </Link>
      </header>

      {draft && (
        <div className="anim-fade-up mx-4 mb-3 flex items-center gap-3 rounded-card border border-primary/30 bg-primary/10 p-3">
          <span className="text-2xl" aria-hidden="true">
            📝
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{S.home.draftBanner}</p>
            <p className="truncate text-sm text-muted">{draft.recipe?.title ?? S.home.untitledDraft}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(draftRoute(draft))}
            className="min-h-12 rounded-full bg-primary px-4 font-medium text-on-primary"
          >
            {S.home.draftContinue}
          </button>
          <IconButton label={S.home.draftDiscard} onClick={() => void discardDraft(draft.id)}>
            <IconClose size={20} />
          </IconButton>
        </div>
      )}

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <div className="px-4">
            <label className="relative block">
              <span className="sr-only">{S.home.searchLabel}</span>
              <IconSearch className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted" size={22} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={S.home.searchPlaceholder}
                enterKeyHint="search"
                className="min-h-14 w-full rounded-full border border-line bg-surface ps-12 pe-12 text-lg shadow-soft outline-none placeholder:text-muted focus:border-primary [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  aria-label={S.home.clearSearch}
                  onClick={() => setQuery('')}
                  className="absolute top-1/2 left-1 flex size-12 -translate-y-1/2 items-center justify-center rounded-full text-muted"
                >
                  <IconClose size={20} />
                </button>
              )}
            </label>
          </div>

          <nav aria-label="קטגוריות" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              {S.home.all}
            </Chip>
            {(hasFavorites || filter === 'fav') && (
              <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>
                {S.home.favorites}
              </Chip>
            )}
            {usedCategories.map((c) => (
              <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
                {c}
              </Chip>
            ))}
          </nav>

          <div className="mt-4 flex items-center gap-2 px-4">
            <p className="flex-1 text-sm text-muted">{S.home.recipesCount(visible.length)}</p>
            <label className="flex items-center gap-1 text-sm text-muted">
              <span className="sr-only">{S.home.sortLabel}</span>
              <select
                value={settings.sort}
                onChange={(e) => updateSettings({ sort: e.target.value as SortMode })}
                className="min-h-11 rounded-full border border-line bg-surface px-3 text-ink"
              >
                <option value="recent">{S.home.sortRecent}</option>
                <option value="alpha">{S.home.sortAlpha}</option>
                <option value="cooked">{S.home.sortCooked}</option>
              </select>
            </label>
            <div className="flex rounded-full border border-line bg-surface p-0.5" role="group" aria-label="תצוגה">
              <IconButton
                label={S.home.viewGrid}
                aria-pressed={settings.view === 'grid'}
                onClick={() => updateSettings({ view: 'grid' })}
                className={`size-11! ${settings.view === 'grid' ? 'bg-primary text-on-primary' : ''}`}
              >
                <IconGrid size={20} />
              </IconButton>
              <IconButton
                label={S.home.viewRows}
                aria-pressed={settings.view === 'rows'}
                onClick={() => updateSettings({ view: 'rows' })}
                className={`size-11! ${settings.view === 'rows' ? 'bg-primary text-on-primary' : ''}`}
              >
                <IconRows size={20} />
              </IconButton>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="anim-fade-up px-6 py-16 text-center">
              <p className="mb-2 text-5xl" aria-hidden="true">
                🔍
              </p>
              <p className="text-lg font-medium">{S.home.noResults}</p>
              <p className="text-muted">{S.home.noResultsHint}</p>
            </div>
          ) : settings.view === 'grid' ? (
            <ul className="mt-3 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
              {visible.map((r) => (
                <GridCard key={r.id} r={r} onOpen={() => open(r)} onMenu={() => setMenuFor(r)} />
              ))}
            </ul>
          ) : (
            <ul className="mt-2 px-4">
              {visible.map((r) => (
                <RowItem key={r.id} r={r} onOpen={() => open(r)} onMenu={() => setMenuFor(r)} />
              ))}
            </ul>
          )}
        </>
      )}

      <AddFab />

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title}>
        {menuFor && (
          <div className="flex flex-col gap-1">
            <SheetItem
              icon={<IconStar filled={menuFor.favorite} className="text-primary" />}
              label={menuFor.favorite ? S.menu.unfavorite : S.menu.favorite}
              onClick={() => {
                void toggleFavorite(menuFor);
                setMenuFor(null);
              }}
            />
            <SheetItem
              icon={<IconScroll />}
              label={S.page.open}
              onClick={() => {
                navigate(`/page/${menuFor.id}`);
                setMenuFor(null);
              }}
            />
            <SheetItem
              icon={<IconShare />}
              label={S.menu.share}
              onClick={() => {
                setShareFor(menuFor);
                setMenuFor(null);
              }}
            />
            <SheetItem
              icon={<IconEdit />}
              label={S.menu.edit}
              onClick={async () => {
                const id = await draftForEdit(menuFor);
                setMenuFor(null);
                navigate(`/edit/${id}`);
              }}
            />
            <SheetItem
              danger
              icon={<IconTrash />}
              label={S.menu.delete}
              onClick={() => {
                setConfirmDelete(menuFor);
                setMenuFor(null);
              }}
            />
          </div>
        )}
      </Sheet>
      <ShareSheet recipe={shareFor} onClose={() => setShareFor(null)} />
      <ConfirmSheet
        open={!!confirmDelete}
        message={confirmDelete ? S.menu.deleteConfirm(confirmDelete.title) : ''}
        confirmLabel={S.common.delete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void deleteRecipe(confirmDelete).then(() => toast(S.menu.deleted));
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function GridCard({ r, onOpen, onMenu }: { r: Recipe; onOpen: () => void; onMenu: () => void }) {
  const press = useLongPress(onMenu, onOpen);
  return (
    <li className="cv-auto">
      <button
        type="button"
        {...press}
        className="block w-full overflow-hidden rounded-card border border-line bg-surface text-start shadow-soft transition select-none active:scale-[0.98]"
        style={{ WebkitTouchCallout: 'none' }}
      >
        <div className="relative">
          <RecipeVisual recipe={r} className="aspect-[4/3] w-full" emojiSize="3.5rem" />
          {r.favorite && (
            <span className="absolute top-2 left-2 rounded-full bg-surface/90 p-1 text-primary shadow-soft">
              <IconStar filled size={16} />
            </span>
          )}
        </div>
        <div className="px-3 py-2.5">
          <p className="line-clamp-2 font-serif text-lg leading-tight font-bold">{r.title}</p>
          {r.totalTime && <p className="mt-1 truncate text-sm text-muted">⏱ {r.totalTime}</p>}
        </div>
      </button>
    </li>
  );
}

function RowItem({ r, onOpen, onMenu }: { r: Recipe; onOpen: () => void; onMenu: () => void }) {
  const press = useLongPress(onMenu, onOpen);
  return (
    <li className="cv-auto border-b border-line last:border-b-0" style={{ containIntrinsicSize: 'auto 88px' }}>
      <button
        type="button"
        {...press}
        className="flex w-full items-center gap-3 py-3 text-start select-none active:opacity-70"
        style={{ WebkitTouchCallout: 'none' }}
      >
        <RecipeVisual recipe={r} className="size-16 shrink-0 rounded-xl" emojiSize="2rem" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg font-bold">
            {r.title} {r.favorite && <IconStar filled size={14} className="inline text-primary" />}
          </p>
          <p className="truncate text-sm text-muted">{[r.totalTime && `⏱ ${r.totalTime}`, r.category].filter(Boolean).join(' · ')}</p>
        </div>
      </button>
    </li>
  );
}

function EmptyState() {
  const actions = useAddActions();
  const [help, setHelp] = useState(false);
  return (
    <div className="anim-fade-up px-6 pt-8 text-center">
      {actions.inputs}
      <svg viewBox="0 0 200 150" className="mx-auto mb-4 w-52" aria-hidden="true">
        <g fill="none" stroke="var(--c-muted)" strokeWidth="4" strokeLinecap="round" opacity="0.6">
          <path d="M80 40c-8-10 8-16 0-28" style={{ animation: 'steam 2.4s ease-in-out infinite' }} />
          <path d="M100 36c-8-10 8-16 0-28" style={{ animation: 'steam 2.4s ease-in-out 0.6s infinite' }} />
          <path d="M120 40c-8-10 8-16 0-28" style={{ animation: 'steam 2.4s ease-in-out 1.2s infinite' }} />
        </g>
        <ellipse cx="100" cy="132" rx="70" ry="8" fill="var(--c-border)" />
        <path d="M40 60h120l-10 62a10 10 0 0 1-10 8H60a10 10 0 0 1-10-8z" fill="var(--c-primary)" />
        <rect x="32" y="52" width="136" height="14" rx="7" fill="var(--c-primary-strong)" />
        <path d="M32 72h-12M168 72h12" stroke="var(--c-primary-strong)" strokeWidth="8" strokeLinecap="round" />
        <circle cx="100" cy="94" r="12" fill="#fff" opacity="0.25" />
      </svg>
      <h2 className="mb-2 font-serif text-3xl font-bold">{S.home.emptyTitle}</h2>
      <p className="mx-auto mb-6 max-w-sm text-lg text-muted">{S.home.emptyText}</p>
      <div className="mx-auto max-w-sm rounded-card border border-line bg-surface p-2 text-start shadow-soft">
        <AddMenuItems actions={actions} onShareHelp={() => setHelp(true)} />
      </div>
      <ShareHelpSheet open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
