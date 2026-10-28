import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AddFab, AddMenuItems, ShareHelpSheet, useAddActions } from '../components/AddMenu';
import {
  IconCart,
  IconChevronDown,
  IconClock,
  IconClose,
  IconEdit,
  IconGrid,
  IconNote,
  IconRows,
  IconScroll,
  IconSearch,
  IconSettings,
  IconShare,
  IconShuffle,
  IconStar,
  IconTrash,
  Logo,
} from '../components/Icons';
import { RecipeVisual } from '../components/RecipeVisual';
import { ShareSheet } from '../components/ShareSheet';
import { Button, Chip, EmptyState, IconButton, Sheet, SheetItem, Skeleton, toast } from '../components/ui';
import { db } from '../db';
import { useLongPress } from '../hooks/useLongPress';
import { pickRecipe } from '../lib/format';
import { deleteRecipeWithUndo, discardDraft, draftForEdit, toggleFavorite } from '../lib/recipeActions';
import { matchesQuery, recipeHaystack } from '../lib/search';
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

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function draftRoute(d: Draft): string {
  if (d.status === 'images') return `/add/images/${d.id}`;
  if (d.status === 'ready') return `/edit/${d.id}`;
  return `/process/${d.id}`;
}

function sortRecipes(list: Recipe[], mode: SortMode): Recipe[] {
  const out = [...list];
  if (mode === 'alpha') out.sort((a, b) => a.title.localeCompare(b.title, 'he'));
  else if (mode === 'cooked') out.sort((a, b) => b.cookCount - a.cookCount || (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0));
  else out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

const SORT_LABELS: Record<SortMode, string> = {
  recent: S.home.sortRecent,
  alpha: S.home.sortAlpha,
  cooked: S.home.sortCooked,
};

/** Cards animate in only on the first visit of the session, never on every filter change. */
let listAnimatedThisSession = false;

export default function Home() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const drafts = useLiveQuery(() => db.drafts.orderBy('updatedAt').reverse().toArray(), [], [] as Draft[]);
  const toBuy = useLiveQuery(() => db.shopping.filter((i) => !i.checked).count(), [], 0);
  const [query, setQueryState] = useState(() => sessionGet('rn-q'));
  const [filter, setFilterState] = useState<Filter>(() => (sessionGet('rn-f') as Filter) || 'all');
  const [menuFor, setMenuFor] = useState<Recipe | null>(null);
  const [shareFor, setShareFor] = useState<Recipe | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [animate] = useState(() => !listAnimatedThisSession);
  const autoAdd = params.get('add') === '1';

  const setQuery = (q: string) => {
    setQueryState(q);
    sessionSet('rn-q', q);
  };
  const setFilter = (f: Filter) => {
    setFilterState(f);
    sessionSet('rn-f', f);
  };

  const haystacks = useMemo(() => new Map((recipes ?? []).map((r) => [r.id, recipeHaystack(r)])), [recipes]);
  const usedCategories = useMemo(() => CATEGORIES.filter((c) => recipes?.some((r) => r.category === c)), [recipes]);
  const hasFavorites = recipes?.some((r) => r.favorite) ?? false;

  const visible = useMemo(() => {
    let list = recipes ?? [];
    if (filter === 'fav') list = list.filter((r) => r.favorite);
    else if (filter !== 'all') list = list.filter((r) => r.category === filter);
    if (query.trim()) list = list.filter((r) => matchesQuery(haystacks.get(r.id) ?? '', query));
    return sortRecipes(list, settings.sort);
  }, [recipes, filter, query, haystacks, settings.sort]);

  const recent = useMemo(
    () =>
      (recipes ?? [])
        .filter((r) => r.lastCookedAt)
        .sort((a, b) => (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0))
        .slice(0, 5),
    [recipes],
  );

  const searching = query.trim().length > 0 || filter !== 'all';

  useEffect(() => {
    if (recipes && animate) setTimeout(() => (listAnimatedThisSession = true), 800);
  }, [recipes, animate]);

  // Keep the scroll position when coming back from a recipe.
  useLayoutEffect(() => {
    if (!recipes) return;
    const y = Number(sessionGet('rn-home-scroll') || 0);
    if (y) window.scrollTo({ top: y });
    const save = () => sessionSet('rn-home-scroll', String(window.scrollY));
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [recipes === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  // Home-screen shortcut: "מה נבשל היום?"
  useEffect(() => {
    if (params.get('random') === '1' && recipes?.length) {
      setParams({}, { replace: true });
      setShuffling(true);
    }
  }, [params, recipes, setParams]);

  const open = (r: Recipe) => navigate(`/recipe/${r.id}`, { viewTransition: true });
  const draft = drafts[0];

  const remove = async (r: Recipe) => {
    const undo = await deleteRecipeWithUndo(r);
    toast(S.menu.deleted, {
      label: S.common.undo,
      run: () => void undo().then(() => toast(S.menu.restored)),
    });
  };

  if (recipes === undefined) return <HomeSkeleton />;

  const isEmpty = recipes.length === 0;

  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-32">
      <header className="flex items-center gap-1 ps-[max(16px,env(safe-area-inset-right))] pe-[max(8px,env(safe-area-inset-left))] pt-[calc(12px+env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })}
          aria-label={S.home.scrollTop}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-start"
        >
          <Logo size={32} />
          <h1 className="truncate font-serif text-2xl text-ink">{S.appName}</h1>
        </button>
        <Link
          to="/shopping"
          viewTransition
          aria-label={S.home.shoppingCount(toBuy)}
          className="relative flex size-12 items-center justify-center rounded-full transition duration-150 active:scale-[0.97] active:bg-surface-2"
        >
          <IconCart />
          {toBuy > 0 && (
            <span className="absolute top-1 left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-on-primary tabular-nums">
              {toBuy > 99 ? '99+' : toBuy}
            </span>
          )}
        </Link>
        <Link
          to="/settings"
          viewTransition
          aria-label={S.home.settings}
          className="flex size-12 items-center justify-center rounded-full transition duration-150 active:scale-[0.97] active:bg-surface-2"
        >
          <IconSettings />
        </Link>
      </header>

      {draft && (
        <div className="anim-fade-up mx-4 mb-3 flex items-center gap-3 rounded-card bg-surface-2 p-3">
          <IconNote className="shrink-0 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{S.home.draftBanner}</p>
            <p className="truncate text-sm text-muted">{draft.recipe?.title ?? S.home.untitledDraft}</p>
          </div>
          <Button className="min-h-12! rounded-full px-4" onClick={() => navigate(draftRoute(draft))}>
            {S.home.draftContinue}
          </Button>
          <IconButton label={S.home.draftDiscard} onClick={() => void discardDraft(draft.id)}>
            <IconClose size={20} />
          </IconButton>
        </div>
      )}

      {isEmpty ? (
        <FirstRecipe />
      ) : (
        <>
          {recent.length >= 2 && !searching && (
            <section className="mb-2" aria-labelledby="recent-h">
              <h2 id="recent-h" className="mb-2 px-4 text-sm font-medium text-muted">
                {S.home.recentlyCooked}
              </h2>
              <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-2">
                {recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => open(r)}
                    className="flex w-16 shrink-0 flex-col items-center gap-1 transition duration-150 active:scale-[0.97]"
                  >
                    <RecipeVisual recipe={r} className="size-16 rounded-full shadow-soft" emojiSize="28px" />
                    <span className="line-clamp-2 text-center text-xs">{r.title}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="px-4">
            <SearchBox query={query} setQuery={setQuery} />
          </div>

          <nav aria-label="קטגוריות" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              {S.home.all}
            </Chip>
            {(hasFavorites || filter === 'fav') && (
              <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>
                <IconStar size={16} filled={filter === 'fav'} />
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
            <p className="text-sm whitespace-nowrap text-muted">{S.home.recipesCount(visible.length)}</p>
            {recipes.length > 1 && (
              <IconButton label={S.home.whatToCook} onClick={() => setShuffling(true)}>
                <IconShuffle size={20} />
              </IconButton>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              aria-haspopup="dialog"
              aria-label={S.home.sortButton(SORT_LABELS[settings.sort])}
              className="flex min-h-12 items-center gap-1 rounded-full border border-line bg-surface ps-3 pe-2 text-sm whitespace-nowrap transition duration-150 active:scale-[0.97] active:bg-surface-2"
            >
              {S.home.sortButton(S.home.sortShort[settings.sort])}
              <IconChevronDown size={16} />
            </button>
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
            filter === 'fav' && !query.trim() ? (
              <EmptyState
                title={S.home.noFavorites}
                text={S.home.noFavoritesHint}
                action={
                  <Button variant="secondary" className="w-full" onClick={() => setFilter('all')}>
                    {S.home.showAll}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={S.home.noResults}
                text={S.home.noResultsHint}
                illustration={<IconSearch size={56} className="mx-auto text-muted" />}
                action={
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                    }}
                  >
                    {S.home.clearFilters}
                  </Button>
                }
              />
            )
          ) : settings.view === 'grid' ? (
            <ul className="mt-3 grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
              {visible.map((r, i) => (
                <GridCard key={r.id} r={r} index={animate ? i : -1} onOpen={() => open(r)} onMenu={() => setMenuFor(r)} />
              ))}
            </ul>
          ) : (
            <ul className="mt-2 px-4">
              {visible.map((r, i) => (
                <RowItem key={r.id} r={r} index={animate ? i : -1} onOpen={() => open(r)} onMenu={() => setMenuFor(r)} />
              ))}
            </ul>
          )}
        </>
      )}

      <AddFab autoOpen={autoAdd} />

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={S.home.sortLabel}>
        <div className="flex flex-col gap-1">
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <SheetItem
              key={mode}
              label={SORT_LABELS[mode]}
              selected={settings.sort === mode}
              onClick={() => {
                updateSettings({ sort: mode });
                setSortOpen(false);
              }}
            />
          ))}
        </div>
      </Sheet>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title}>
        {menuFor && (
          <div className="flex flex-col gap-1">
            <SheetItem
              icon={<IconStar filled={menuFor.favorite} />}
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
                const r = menuFor;
                setMenuFor(null);
                void remove(r);
              }}
            />
          </div>
        )}
      </Sheet>
      <ShareSheet recipe={shareFor} onClose={() => setShareFor(null)} />
      {shuffling && <ShuffleOverlay recipes={recipes} onDone={(r) => (setShuffling(false), r && open(r))} />}
    </div>
  );
}

/** Search field whose placeholder cycles through examples while empty and not focused. */
function SearchBox({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  const [focused, setFocused] = useState(false);
  const [i, setI] = useState(0);
  const rotate = !query && !focused && !reducedMotion();
  useEffect(() => {
    if (!rotate) return;
    const t = setInterval(() => setI((n) => (n + 1) % S.home.searchExamples.length), 3000);
    return () => clearInterval(t);
  }, [rotate]);
  const hint = reducedMotion() ? S.home.searchPlaceholder : S.home.searchExamples[i];
  return (
    <label className="relative block">
      <span className="sr-only">{S.home.searchLabel}</span>
      <IconSearch className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted" size={22} />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? S.home.searchPlaceholder : ''}
        enterKeyHint="search"
        className="ctl-input min-h-14! rounded-full! ps-12! pe-12! text-lg shadow-soft"
      />
      {!query && !focused && (
        <span key={hint} className="anim-fade-in pointer-events-none absolute top-1/2 right-12 -translate-y-1/2 text-lg text-muted">
          {hint}
        </span>
      )}
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
  );
}

function GridCard({ r, index, onOpen, onMenu }: { r: Recipe; index: number; onOpen: () => void; onMenu: () => void }) {
  const press = useLongPress(onMenu, onOpen);
  return (
    <li className={`cv-auto ${index >= 0 ? 'anim-stagger' : ''}`} style={{ '--i': index } as React.CSSProperties}>
      <button
        type="button"
        {...press}
        className="block w-full overflow-hidden rounded-card bg-surface text-start shadow-soft transition duration-150 select-none active:scale-[0.97]"
        style={{ WebkitTouchCallout: 'none' }}
      >
        <div className="relative">
          <RecipeVisual recipe={r} morph className="aspect-[4/3] w-full" emojiSize="48px" />
          {r.favorite && (
            <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-surface/90 text-primary shadow-soft">
              <IconStar filled size={16} />
            </span>
          )}
        </div>
        <div className="px-3 py-3">
          <p className="line-clamp-2 font-serif text-lg">{r.title}</p>
          {r.totalTime && (
            <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
              <IconClock size={14} className="shrink-0" />
              <span className="truncate">{r.totalTime}</span>
            </p>
          )}
        </div>
      </button>
    </li>
  );
}

function RowItem({ r, index, onOpen, onMenu }: { r: Recipe; index: number; onOpen: () => void; onMenu: () => void }) {
  const press = useLongPress(onMenu, onOpen);
  return (
    <li
      className={`cv-auto group ${index >= 0 ? 'anim-stagger' : ''}`}
      style={{ containIntrinsicSize: 'auto 88px', '--i': index } as React.CSSProperties}
    >
      <button
        type="button"
        {...press}
        className="flex w-full items-center gap-3 text-start transition duration-150 select-none active:opacity-70"
        style={{ WebkitTouchCallout: 'none' }}
      >
        <RecipeVisual recipe={r} morph className="size-16 shrink-0 rounded-xl" emojiSize="28px" />
        {/* The separator starts after the thumbnail, not at the screen edge. */}
        <div className="min-w-0 flex-1 border-b border-line py-4 group-last:border-b-0">
          <p className="flex items-center gap-1 font-serif text-lg">
            <span className="truncate">{r.title}</span>
            {r.favorite && <IconStar filled size={14} className="shrink-0 text-primary" />}
          </p>
          <p className="flex items-center gap-1 truncate text-sm text-muted">
            {r.totalTime && (
              <>
                <IconClock size={14} className="shrink-0" />
                <span className="truncate">{r.totalTime}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="truncate">{r.category}</span>
          </p>
        </div>
      </button>
    </li>
  );
}

/** "What shall we cook today?": a short shuffle of cards, then the chosen recipe opens. */
function ShuffleOverlay({ recipes, onDone }: { recipes: Recipe[]; onDone: (r: Recipe | undefined) => void }) {
  const [chosen] = useState(() => pickRecipe(recipes));
  const deck = useMemo(() => {
    const others = recipes.filter((r) => r.id !== chosen?.id).sort(() => Math.random() - 0.5).slice(0, 3);
    return [...others, ...(chosen ? [chosen] : [])];
  }, [recipes, chosen]);
  const [i, setI] = useState(0);
  // The parent re-renders on database changes; keep the latest callback without restarting the shuffle.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (reducedMotion()) {
      const t = setTimeout(() => done.current(chosen), 400);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => setI((n) => Math.min(n + 1, deck.length - 1)), 260);
    const end = setTimeout(() => done.current(chosen), 260 * deck.length + 400);
    return () => {
      clearInterval(t);
      clearTimeout(end);
    };
  }, [chosen, deck.length]);
  const r = deck[reducedMotion() ? deck.length - 1 : i];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-scrim px-8" role="status" aria-live="polite">
      {r && (
        <div key={r.id} className="anim-fade-up w-56 overflow-hidden rounded-card bg-surface shadow-lift">
          <RecipeVisual recipe={r} className="aspect-[4/3] w-full" emojiSize="56px" />
          <p className="line-clamp-2 px-4 py-3 text-center font-serif text-lg">{r.title}</p>
        </div>
      )}
      <p className="text-base text-bg">{S.home.shuffling}</p>
    </div>
  );
}

function FirstRecipe() {
  const actions = useAddActions();
  const [help, setHelp] = useState(false);
  return (
    <div className="px-4">
      {actions.inputs}
      <EmptyState title={S.home.emptyTitle} text={S.home.emptyText} />
      <div className="mx-auto -mt-6 max-w-sm rounded-card bg-surface p-2 shadow-soft">
        <AddMenuItems actions={actions} onShareHelp={() => setHelp(true)} />
      </div>
      <ShareHelpSheet open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

/** Skeleton of the home screen shown while the database opens. */
function HomeSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pt-[calc(12px+env(safe-area-inset-top))]" aria-busy="true">
      <div className="flex min-h-12 items-center gap-2">
        <Logo size={32} />
        <Skeleton className="h-7 w-40 rounded-xl" />
      </div>
      <Skeleton className="mt-4 h-14 w-full rounded-full" />
      <div className="mt-3 flex gap-2">
        {['w-16', 'w-20', 'w-24'].map((w) => (
          <Skeleton key={w} className={`h-12 rounded-full ${w}`} />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-card bg-surface shadow-soft">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="p-3">
              <Skeleton className="h-5 w-3/4 rounded-xl" />
              <Skeleton className="mt-2 h-4 w-1/2 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
