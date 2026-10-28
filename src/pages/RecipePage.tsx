import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconClock, IconClose, IconPlate, IconPrint, IconTimer } from '../components/Icons';
import { db } from '../db';
import { useImageUrl } from '../hooks/useImageUrl';
import { useWakeLock } from '../hooks/useWakeLock';
import { CATEGORY_COLORS } from '../lib/categories';
import { planPrep } from '../lib/prepAhead';
import { S } from '../strings.he';
import type { Ingredient, Recipe } from '../types';
import './recipePage.css';

/** Layouts (and ingredient-column widths) tried by the fitting code, in order of preference when sizes tie. */
const LAYOUTS: { layout: 'side' | 'side2' | 'stack'; ing?: string }[] = [
  { layout: 'side', ing: '0.82fr' },
  { layout: 'side', ing: '1.1fr' },
  { layout: 'side', ing: '1.45fr' },
  { layout: 'side2', ing: '0.82fr' },
  { layout: 'side2', ing: '1.1fr' },
  { layout: 'stack' },
];
const MIN_PX = 9;
const MAX_PX = 26;

export function shortDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${Math.max(1, m)} דק׳`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  return rest ? `${hours} ו-${rest} דק׳` : hours;
}

function Corner({ className }: { className: string }) {
  return (
    <svg className={`rp-corner ${className}`} viewBox="0 0 60 60" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M58 6 H22 C12 6 6 12 6 22 V58" strokeWidth="1.6" />
      <path d="M52 12 H26 C17 12 12 17 12 26 V52" strokeWidth="0.8" opacity="0.7" />
      <path d="M22 6 C22 16 16 22 6 22" strokeWidth="1.2" />
      <circle cx="17" cy="17" r="3" fill="currentColor" stroke="none" />
      <path d="M30 6 c3 -4 8 -4 10 0 M6 30 c-4 3 -4 8 0 10" strokeWidth="1.1" />
    </svg>
  );
}

/** Small sprig used in the title divider. */
function Sprig() {
  return (
    <svg viewBox="0 0 64 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <path d="M4 11 H60" opacity="0.55" />
      <path d="M32 11 c-5 -7 -12 -8 -16 -6 c4 4 10 6 16 6 Z" fill="currentColor" opacity="0.85" />
      <path d="M32 11 c5 -7 12 -8 16 -6 c-4 4 -10 6 -16 6 Z" fill="currentColor" opacity="0.85" />
      <circle cx="32" cy="11" r="2.6" fill="currentColor" stroke="none" />
      <path d="M32 11 c-4 5 -9 7 -13 7 M32 11 c4 5 9 7 13 7" opacity="0.7" />
    </svg>
  );
}

function Medallion({ recipe }: { recipe: Recipe }) {
  const url = useImageUrl(recipe.imageId);
  return (
    <div className="rp-medal">
      {url ? (
        <img src={url} alt="" className="object-cover" />
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ background: `radial-gradient(circle at 35% 30%, #ffffff66, transparent 60%), ${CATEGORY_COLORS[recipe.category]}` }}
        >
          <span style={{ fontSize: '3em', lineHeight: 1 }}>{recipe.emoji}</span>
        </div>
      )}
    </div>
  );
}

function IngredientGroups({ ingredients }: { ingredients: Ingredient[] }) {
  const groups: { name?: string; items: Ingredient[] }[] = [];
  for (const ing of ingredients) {
    const last = groups[groups.length - 1];
    if (last && last.name === ing.group) last.items.push(ing);
    else groups.push({ name: ing.group, items: [ing] });
  }
  return (
    <div className="rp-ing-list">
      {groups.map((g, i) => (
        <div key={i} className="rp-group">
          {g.name && <div className="rp-group-name">{g.name}</div>}
          {g.items.map((ing) => (
            <div key={ing.id} className="rp-ing">
              <span>{ing.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}


type Layout = { layout: 'side' | 'side2' | 'stack' | 'steps1' | 'steps2'; ing?: string };

/** Continuation pages hold only steps: one column, or two newspaper-style columns. */
const STEP_LAYOUTS: Layout[] = [{ layout: 'steps1' }, { layout: 'steps2' }];
/** A first page that ended up with no steps at all (very long ingredient list). */
const INGREDIENT_LAYOUTS: Layout[] = [{ layout: 'stack' }];

/** Below this size text is hard to read on a phone, so the recipe is split into pages instead.
 *  Kept low on purpose: one page is preferred, pages are only for recipes that are really long. */
export const READABLE_PX = 11.5;
const MAX_PAGES = 8;

/**
 * Finds the layout and font size that let one card fit its page with the largest text.
 * Everything in the card is sized in em, so one font-size scales it all.
 * Returns the chosen size, or 0 if nothing fits even at the minimum.
 */
function fitSheet(s: HTMLElement, b: HTMLElement, layouts: Layout[]): number {
  const fits = () =>
    s.scrollHeight <= s.clientHeight + 1 && s.scrollWidth <= s.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1;
  const apply = (c: Layout) => {
    b.dataset.layout = c.layout;
    b.style.setProperty('--rp-ing', c.ing ?? '0.82fr');
  };
  let best: { c: Layout; px: number } | null = null;
  for (const c of layouts) {
    apply(c);
    // Each check forces a full layout, so rule a layout out with one check when it cannot beat the best so far.
    const floor: number = best ? best.px + 0.4 : MIN_PX;
    s.style.fontSize = `${floor}px`;
    if (!fits()) continue;
    let lo: number = floor;
    let hi = MAX_PX;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      s.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid;
    }
    // A clearly larger size wins; near-ties keep the earlier (nicer) layout.
    if (!best || lo > best.px + 0.4) best = { c, px: lo };
  }
  if (best) {
    apply(best.c);
    const px = Math.floor(best.px * 10) / 10;
    s.style.fontSize = `${px}px`;
    s.style.overflowY = 'hidden';
    return px;
  }
  // Nothing fits (only possible at the page limit): smallest size, and let this page scroll.
  apply(layouts[layouts.length - 1]);
  s.style.fontSize = `${MIN_PX}px`;
  s.style.overflowY = 'auto';
  return 0;
}

/**
 * Splits the steps over `pages` pages, balancing the amount of text.
 * The first page also carries the header and the ingredients (`firstPageExtra`, in characters).
 * Returns [from, to) step ranges, one per page.
 */
export function splitSteps(stepLengths: number[], firstPageExtra: number, pages: number): [number, number][] {
  const total = firstPageExtra + stepLengths.reduce((a, b) => a + b, 0);
  const target = total / pages;
  const ranges: [number, number][] = [];
  let start = 0;
  let acc = firstPageExtra;
  for (let p = 0; p < pages - 1; p++) {
    let end = start;
    // Leave at least one step for every later page.
    const maxEnd = stepLengths.length - (pages - 1 - p);
    // Keep adding steps while the page stays under its share (a step counts if half of it fits).
    while (end < maxEnd && acc + stepLengths[end] / 2 <= target) {
      acc += stepLengths[end];
      end++;
    }
    // Every continuation page needs at least one step.
    if (p > 0 && end === start && end < maxEnd) end++;
    ranges.push([start, end]);
    start = end;
    acc = 0;
  }
  ranges.push([start, stepLengths.length]);
  return ranges;
}

const HEADER_WEIGHT = 260; // the header, medallion and meta take about as much room as 260 characters of text
const STEP_OVERHEAD = 40; // number badge, spacing and timer badge per step

export default function RecipePage() {
  const { id = '' } = useParams();
  const recipe = useLiveQuery(() => db.recipes.get(id), [id], null);
  if (recipe === null) return <div className="rp" />;
  if (!recipe) return <p className="p-8 text-center text-lg">{S.errors.notFound}</p>;
  return <RecipePages key={recipe.id} recipe={recipe} />;
}

function RecipePages({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const pagesRef = useRef<HTMLDivElement>(null);
  // The split: how many pages, and how many steps stay on the first page (with the ingredients).
  // A finished split is remembered per recipe content and screen size, so reopening is instant.
  const planKey = `rp-plan-${__BUILD_TIME__}-${recipe.id}-${recipe.steps.length}-${recipe.steps.reduce((a, s) => a + s.text.length, 0)}-${recipe.ingredients.length}-${window.innerWidth}x${window.innerHeight}`;
  const [plan, setPlan] = useState<{ pages: number; firstSteps: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(planKey) ?? 'null') as { pages: number; firstSteps: number } | null;
      if (saved && saved.pages >= 1 && saved.firstSteps <= recipe.steps.length) return saved;
    } catch {
      // ignore
    }
    return { pages: 1, firstSteps: recipe.steps.length };
  });
  const [sizes, setSizes] = useState<Record<number, number>>({});
  const [current, setCurrent] = useState(0);
  const prep = planPrep(recipe);
  const pageCount = plan.pages;
  useWakeLock(true);

  const lengths = useMemo(() => recipe.steps.map((s) => s.text.length + STEP_OVERHEAD), [recipe]);

  const ranges = useMemo<[number, number][]>(() => {
    if (plan.pages === 1) return [[0, recipe.steps.length]];
    const f = plan.firstSteps;
    const rest = splitSteps(lengths.slice(f), 0, plan.pages - 1).map(([a, b]) => [a + f, b + f] as [number, number]);
    return [[0, f], ...rest];
  }, [plan, lengths, recipe.steps.length]);

  // Hidden until the split is final, so the user never sees the pages being rearranged.
  const [ready, setReady] = useState(false);

  // Once every page has measured itself, adjust the split until every page is readable:
  // a cramped first page hands steps to the next pages; a cramped later page gets a new page.
  useEffect(() => {
    if (Object.keys(sizes).length < pageCount) return;
    const next = nextPlan();
    if (next) {
      setSizes({});
      setPlan(next);
    } else {
      setReady(true);
      try {
        localStorage.setItem(planKey, JSON.stringify(plan));
      } catch {
        // ignore
      }
    }

    function nextPlan(): { pages: number; firstSteps: number } | null {
      const n = recipe.steps.length;
      if (plan.pages === 1) {
        if (sizes[0] >= READABLE_PX || n === 0) return null;
        const extra =
          HEADER_WEIGHT + recipe.ingredients.reduce((a, i) => a + i.text.length + 12, 0) + prep.reduce((a, p) => a + p.text.length, 0);
        return { pages: 2, firstSteps: Math.min(n - 1, splitSteps(lengths, extra, 2)[0][1]) };
      }
      // Text area grows with the square of the font size, which gives a good first guess for each jump.
      const shrink = (px: number) => (px > 0 ? (px / READABLE_PX) ** 2 : 0.5);
      if (sizes[0] < READABLE_PX && plan.firstSteps > 0) {
        const f = Math.min(plan.firstSteps - 1, Math.floor(plan.firstSteps * shrink(sizes[0])));
        return { pages: plan.pages, firstSteps: Math.max(0, f) };
      }
      const laterMin = Math.min(...Array.from({ length: pageCount - 1 }, (_, i) => sizes[i + 1]));
      const maxPages = Math.min(MAX_PAGES, n - plan.firstSteps + 1);
      if (laterMin < READABLE_PX && plan.pages < maxPages) {
        const needed = 1 + Math.ceil((plan.pages - 1) / shrink(laterMin));
        return { pages: Math.min(maxPages, Math.max(plan.pages + 1, needed)), firstSteps: plan.firstSteps };
      }
      return null;
    }
  }, [sizes]);

  const onFit = useCallback((index: number, px: number) => {
    setSizes((prev) => (prev[index] === px ? prev : { ...prev, [index]: px }));
  }, []);

  const close = useCallback(() => navigate(`/recipe/${recipe.id}`, { replace: true }), [navigate, recipe.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const goTo = (i: number) => {
    const el = pagesRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <div className={`rp ${pageCount > 1 ? 'rp-multi' : ''}`} dir="rtl">
      <div className="rp-tools">
        <button type="button" aria-label={S.page.close} title={S.page.close} onClick={close}>
          <IconClose size={22} />
        </button>
        <button type="button" aria-label={S.page.print} title={S.page.print} onClick={() => window.print()}>
          <IconPrint size={22} />
        </button>
      </div>

      <div
        ref={pagesRef}
        className={`rp-pages ${ready ? '' : 'rp-arranging'}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          setCurrent(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
        }}
      >
        {ranges.map(([from, to], i) => (
          <RecipeCard
            key={`${plan.pages}-${plan.firstSteps}-${i}`} // every new split re-measures all pages
            recipe={recipe}
            prepText={prep.map((p) => `${p.emoji} ${p.text}`).join(' · ')}
            index={i}
            total={pageCount}
            from={from}
            to={to}
            onFit={onFit}
          />
        ))}
      </div>

      {!ready && <div className="rp-wait">{S.page.arranging}</div>}

      {ready && pageCount > 1 && (
        <nav className="rp-dots" aria-label={S.page.pages}>
          {ranges.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={S.page.pageN(i + 1, pageCount)}
              aria-current={i === current ? 'page' : undefined}
              onClick={() => goTo(i)}
              className={i === current ? 'on' : ''}
            />
          ))}
        </nav>
      )}
    </div>
  );
}

function RecipeCard({
  recipe,
  prepText,
  index,
  total,
  from,
  to,
  onFit,
}: {
  recipe: Recipe;
  prepText: string;
  index: number;
  total: number;
  from: number;
  to: number;
  onFit: (index: number, px: number) => void;
}) {
  const sheet = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const first = index === 0;
  const last = index === total - 1;
  const steps = recipe.steps.slice(from, to);
  const layouts = first ? (steps.length ? LAYOUTS : INGREDIENT_LAYOUTS) : STEP_LAYOUTS;

  const fit = useCallback(() => {
    if (sheet.current && body.current) onFit(index, fitSheet(sheet.current, body.current, layouts));
    // from/to: the page content changed, so it must be measured again.
  }, [index, layouts, onFit, from, to]);

  useLayoutEffect(() => {
    // Each fit costs dozens of forced layouts, so measure once, and again only when something really changed:
    // web fonts finishing to load, or the page size (rotation, window resize).
    fit();
    let alive = true;
    if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => alive && fit());
    const page = sheet.current?.parentElement;
    let lastSize = page ? `${page.clientWidth}x${page.clientHeight}` : '';
    const ro = new ResizeObserver(() => {
      const size = page ? `${page.clientWidth}x${page.clientHeight}` : '';
      if (size === lastSize) return;
      lastSize = size;
      fit();
    });
    if (page) ro.observe(page);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [fit]);

  return (
    <div className="rp-page">
      <article ref={sheet} className="rp-sheet" aria-label={total > 1 ? `${recipe.title} – ${S.page.pageN(index + 1, total)}` : recipe.title}>
        <div className="rp-frame" aria-hidden="true" />
        <Corner className="tr" />
        <Corner className="tl" />
        <Corner className="br" />
        <Corner className="bl" />

        {first ? (
          <header className="rp-head">
            <Medallion recipe={recipe} />
            <div className="rp-titles">
              <div className="rp-category">~ {recipe.category} ~</div>
              <h1 className="rp-title">{recipe.title}</h1>
              <div className="rp-divider">
                <Sprig />
              </div>
              {(recipe.totalTime || recipe.servings) && (
                <div className="rp-meta">
                  {recipe.totalTime && (
                    <span className="rp-chip">
                      <IconClock size={14} /> {recipe.totalTime}
                    </span>
                  )}
                  {recipe.servings && (
                    <span className="rp-chip">
                      <IconPlate size={14} /> {recipe.servings}
                    </span>
                  )}
                </div>
              )}
            </div>
          </header>
        ) : (
          <header className="rp-head rp-head-mini">
            <div className="rp-titles">
              <div className="rp-category">~ {S.page.continued(index + 1, total)} ~</div>
              <h2 className="rp-title">{recipe.title}</h2>
              <div className="rp-divider">
                <Sprig />
              </div>
            </div>
          </header>
        )}

        {first && prepText && (
          <div className="rp-prep">
            <b>{S.page.before}</b> {prepText}
          </div>
        )}

        <div ref={body} className="rp-body" data-layout={layouts[0].layout}>
          {first && (
            <section className="rp-ingredients" aria-label={S.page.ingredients}>
              <h2 className="rp-h">{S.page.ingredients}</h2>
              <IngredientGroups ingredients={recipe.ingredients} />
            </section>
          )}
          {steps.length > 0 && (
            <section aria-label={S.page.method}>
              <h2 className="rp-h">{first ? S.page.method : S.page.methodContinued}</h2>
              <ol className="rp-steps-list">
                {steps.map((s, i) => (
                  <li key={s.id} className="rp-step">
                    <span className="rp-num" aria-hidden="true">
                      {from + i + 1}
                    </span>
                    <span>
                      {s.text}
                      {s.timers.map((t, j) => (
                        <span key={j} className="rp-timer">
                          <IconTimer size={12} /> {shortDuration(t.seconds)}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {last && recipe.notes && (
          <p className="rp-notes">
            <b>{S.page.notes}:</b> {recipe.notes}
          </p>
        )}
        <footer className="rp-footer">
          <span className="rp-diamond" aria-hidden="true" /> {total > 1 ? S.page.pageN(index + 1, total) : S.page.from}{' '}
          <span className="rp-diamond" aria-hidden="true" />
        </footer>
      </article>
    </div>
  );
}
