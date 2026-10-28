import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconClose, IconPrint } from '../components/Icons';
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

/**
 * Finds the layout and font size that let the whole card fit the screen with the largest text.
 * Everything in the card is sized in em, so one font-size scales it all.
 */
function useFitToScreen(sheet: React.RefObject<HTMLElement | null>, body: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  const fit = useCallback(() => {
    const s = sheet.current;
    const b = body.current;
    if (!s || !b) return;
    const fits = () =>
      s.scrollHeight <= s.clientHeight + 1 && s.scrollWidth <= s.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1;
    const apply = (c: (typeof LAYOUTS)[number]) => {
      b.dataset.layout = c.layout;
      b.style.setProperty('--rp-ing', c.ing ?? '0.82fr');
    };
    let best: { c: (typeof LAYOUTS)[number]; px: number } | null = null;
    for (const c of LAYOUTS) {
      apply(c);
      s.style.fontSize = `${MIN_PX}px`;
      if (!fits()) continue;
      let lo = MIN_PX;
      let hi = MAX_PX;
      for (let i = 0; i < 12; i++) {
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
      s.style.fontSize = `${Math.floor(best.px * 10) / 10}px`;
      s.style.overflowY = 'hidden';
    } else {
      // Extremely long recipe: smallest readable size, and let it scroll.
      apply({ layout: 'stack' });
      s.style.fontSize = `${MIN_PX}px`;
      s.style.overflowY = 'auto';
    }
  }, [sheet, body]);

  useLayoutEffect(() => {
    fit();
    void document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(() => fit());
    if (sheet.current?.parentElement) ro.observe(sheet.current.parentElement);
    return () => ro.disconnect();
  }, [fit, ...deps]);

}

export default function RecipePage() {
  const { id = '' } = useParams();
  const recipe = useLiveQuery(() => db.recipes.get(id), [id], null);
  if (recipe === null) return <div className="rp" />;
  if (!recipe) return <p className="p-8 text-center text-lg">{S.errors.notFound}</p>;
  return <RecipeSheet recipe={recipe} />;
}

function RecipeSheet({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  const sheet = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const prep = planPrep(recipe);
  useFitToScreen(sheet, body, [recipe]);
  useWakeLock(true);

  const close = useCallback(() => navigate(`/recipe/${recipe.id}`, { replace: true }), [navigate, recipe.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div className="rp" dir="rtl">
      <div className="rp-tools">
        <button type="button" aria-label={S.page.close} title={S.page.close} onClick={close}>
          <IconClose size={22} />
        </button>
        <button type="button" aria-label={S.page.print} title={S.page.print} onClick={() => window.print()}>
          <IconPrint size={22} />
        </button>
      </div>

      <article ref={sheet} className="rp-sheet" aria-label={recipe.title}>
        <div className="rp-frame" aria-hidden="true" />
        <Corner className="tr" />
        <Corner className="tl" />
        <Corner className="br" />
        <Corner className="bl" />

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
                {recipe.totalTime && <span className="rp-chip">⏱ {recipe.totalTime}</span>}
                {recipe.servings && <span className="rp-chip">🍽 {recipe.servings}</span>}
              </div>
            )}
          </div>
        </header>

        {prep.length > 0 && (
          <div className="rp-prep">
            <b>{S.page.before}</b> {prep.map((p) => `${p.emoji} ${p.text}`).join(' · ')}
          </div>
        )}

        <div ref={body} className="rp-body" data-layout="side">
          <section className="rp-ingredients" aria-label={S.page.ingredients}>
            <h2 className="rp-h">{S.page.ingredients}</h2>
            <IngredientGroups ingredients={recipe.ingredients} />
          </section>
          <section aria-label={S.page.method}>
            <h2 className="rp-h">{S.page.method}</h2>
            <ol className="rp-steps-list">
              {recipe.steps.map((s, i) => (
                <li key={s.id} className="rp-step">
                  <span className="rp-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    {s.text}
                    {s.timers.map((t, j) => (
                      <span key={j} className="rp-timer">
                        ⏱ {shortDuration(t.seconds)}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {recipe.notes && (
          <p className="rp-notes">
            <b>{S.page.notes}:</b> {recipe.notes}
          </p>
        )}
        <footer className="rp-footer">✦ {S.page.from} ✦</footer>
      </article>
    </div>
  );
}
