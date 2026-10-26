// Font styles the user can pick in Settings. Each pairs an interface font with a title font.
// Only Hebrew subsets are loaded for the extra fonts; digits and Latin fall back to Rubik.

export type FontStyleId = 'classic' | 'handwritten' | 'round' | 'bold' | 'vintage';

export type FontStyle = {
  id: FontStyleId;
  name: string;
  description: string;
  ui: string;
  title: string;
  /** Extra weight for titles (some display fonts only come in one weight). */
  titleWeight: number;
  load: () => Promise<unknown>;
};

export const FONT_STYLES: FontStyle[] = [
  {
    id: 'classic',
    name: 'קלאסי',
    description: 'נקי וקריא, עם כותרות בסגנון ספר',
    ui: "'Rubik'",
    title: "'Frank Ruhl Libre'",
    titleWeight: 700,
    load: async () => {}, // bundled with the app
  },
  {
    id: 'handwritten',
    name: 'כתב יד',
    description: 'כאילו נכתב ביד במחברת',
    ui: "'Playpen Sans Hebrew'",
    title: "'Playpen Sans Hebrew'",
    titleWeight: 700,
    load: () =>
      Promise.all([
        import('@fontsource/playpen-sans-hebrew/hebrew-400.css'),
        import('@fontsource/playpen-sans-hebrew/hebrew-500.css'),
        import('@fontsource/playpen-sans-hebrew/hebrew-700.css'),
      ]),
  },
  {
    id: 'round',
    name: 'עגול ורך',
    description: 'אותיות מעוגלות וידידותיות',
    ui: "'Varela Round'",
    title: "'Fredoka'",
    titleWeight: 600,
    load: () =>
      Promise.all([
        import('@fontsource/varela-round/hebrew-400.css'),
        import('@fontsource/fredoka/hebrew-600.css'),
      ]),
  },
  {
    id: 'bold',
    name: 'מודרני ונועז',
    description: 'כותרות עבות ובולטות',
    ui: "'Heebo'",
    title: "'Secular One'",
    titleWeight: 400,
    load: () =>
      Promise.all([
        import('@fontsource/heebo/hebrew-400.css'),
        import('@fontsource/heebo/hebrew-500.css'),
        import('@fontsource/heebo/hebrew-700.css'),
        import('@fontsource/secular-one/hebrew-400.css'),
      ]),
  },
  {
    id: 'vintage',
    name: 'ספר בישול ישן',
    description: 'כותרות מסורתיות עם תגים',
    ui: "'Assistant'",
    title: "'Suez One'",
    titleWeight: 400,
    load: () =>
      Promise.all([
        import('@fontsource/assistant/hebrew-400.css'),
        import('@fontsource/assistant/hebrew-600.css'),
        import('@fontsource/assistant/hebrew-700.css'),
        import('@fontsource/suez-one/hebrew-400.css'),
      ]),
  },
];

export function fontStyle(id: string | undefined): FontStyle {
  return FONT_STYLES.find((f) => f.id === id) ?? FONT_STYLES[0];
}

/** Loads the style's fonts and switches the CSS variables the whole app uses. */
export function applyFontStyle(id: string | undefined): void {
  const f = fontStyle(id);
  void f.load().catch(() => {
    // Offline before the font was ever cached: the fallback (Rubik) stays.
  });
  const root = document.documentElement.style;
  root.setProperty('--font-ui', f.ui);
  root.setProperty('--font-title', f.title);
  root.setProperty('--font-title-weight', String(f.titleWeight));
}

/** For the Settings previews: make every style's fonts available. */
export function loadAllFontStyles(): void {
  for (const f of FONT_STYLES) void f.load().catch(() => {});
}
