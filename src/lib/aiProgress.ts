// Real progress of an AI extraction, derived from what actually happened:
// image preparation, the request, and the recipe JSON as it streams in.

export type AiEvent =
  | { type: 'images'; done: number; total: number }
  | { type: 'request'; model: string }
  | { type: 'model-unavailable'; model: string; quota: boolean }
  | { type: 'server-retry' }
  | { type: 'partial'; text: string }
  | { type: 'invalid-retry' }
  | { type: 'validate' }
  | { type: 'saving' }
  | { type: 'done' };

export type LogState = 'done' | 'active' | 'warn';
export type LogItem = { key: string; text: string; state: LogState };

export type AiProgress = {
  percent: number;
  /** True while waiting for the model's first words (the only phase without real signal). */
  waiting: boolean;
  emoji?: string;
  log: LogItem[];
};

export const initialProgress: AiProgress = { percent: 0, waiting: false, log: [] };

/** What can be read so far from a partial (still streaming) recipe JSON. */
export type PartialInfo = {
  notRecipe: boolean;
  title?: string;
  emoji?: string;
  section: 'start' | 'ingredients' | 'steps' | 'after';
  ingredients: number;
  lastIngredient?: string;
  steps: number;
  lastStep?: string;
  timers: number;
  prep: number;
  questions: number;
};

function decode(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

const STRING = '"((?:[^"\\\\]|\\\\.)*)"';

function field(text: string, name: string): string | undefined {
  const m = text.match(new RegExp(`"${name}"\\s*:\\s*${STRING}`));
  return m ? decode(m[1]) : undefined;
}

/** All complete `"text": "…"` values in a slice of the JSON. */
function texts(slice: string): string[] {
  return [...slice.matchAll(new RegExp(`"text"\\s*:\\s*${STRING}`, 'g'))].map((m) => decode(m[1]));
}

const count = (slice: string, re: RegExp) => (slice.match(re) ?? []).length;

/** Reads the streamed JSON without needing it to be complete (relies on the schema's property order). */
export function analyzePartial(text: string): PartialInfo {
  const iIdx = text.indexOf('"ingredients"');
  const sIdx = text.indexOf('"steps"');
  // The steps section ends at whichever later field appears first.
  const later = [text.indexOf('"prepAhead"'), text.indexOf('"notes"')].filter((i) => i > sIdx && sIdx >= 0);
  const afterIdx = later.length ? Math.min(...later) : -1;
  const end = text.length;
  const ingSlice = iIdx >= 0 ? text.slice(iIdx, sIdx >= 0 ? sIdx : end) : '';
  const stepSlice = sIdx >= 0 ? text.slice(sIdx, afterIdx > sIdx ? afterIdx : end) : '';
  const afterSlice = afterIdx > sIdx && sIdx >= 0 ? text.slice(afterIdx) : '';
  const ingTexts = texts(ingSlice);
  const stepTexts = texts(stepSlice);
  return {
    notRecipe: /"isRecipe"\s*:\s*false/.test(text),
    title: field(text, 'title'),
    emoji: field(text, 'emoji'),
    section: afterSlice ? 'after' : sIdx >= 0 ? 'steps' : iIdx >= 0 ? 'ingredients' : 'start',
    ingredients: ingTexts.length,
    lastIngredient: ingTexts.at(-1),
    steps: stepTexts.length,
    lastStep: stepTexts.at(-1),
    timers: count(stepSlice, /"seconds"\s*:/g),
    // Questions also carry stepNumber, so count prep hints only before the questions list.
    prep: count(afterSlice.split('"questions"')[0], /"stepNumber"\s*:/g),
    questions: count(afterSlice, /"question"\s*:/g),
  };
}

const short = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Adds or replaces a log line by key, marking every earlier active line as done. */
function upsert(log: LogItem[], item: LogItem, finishOthers = true): LogItem[] {
  const i = log.findIndex((l) => l.key === item.key);
  if (i >= 0) return log.map((l, j) => (j === i ? item : l));
  if (!finishOthers) return [...log, item];
  return [...log.map((l) => (l.state === 'active' ? { ...l, state: 'done' as const } : l)), item];
}

function finishAll(log: LogItem[]): LogItem[] {
  return log.map((l) => (l.state === 'active' ? { ...l, state: 'done' } : l));
}

/** Percent for the streaming phase, by section and item counts (30% → 92%). */
function streamPercent(p: PartialInfo): number {
  if (p.section === 'start') return p.title ? 32 : 30;
  if (p.section === 'ingredients') return 32 + Math.min(18, p.ingredients * 1.5);
  if (p.section === 'steps') return 50 + Math.min(38, p.steps * 4);
  return 90 + Math.min(2, p.prep);
}

export function progressReducer(state: AiProgress, e: AiEvent): AiProgress {
  let log = state.log;
  let percent = state.percent;
  let waiting = state.waiting;
  let emoji = state.emoji;

  switch (e.type) {
    case 'images': {
      const text = e.done < e.total ? `מכין תמונה ${e.done + 1} מתוך ${e.total}…` : e.total === 1 ? 'הכנתי את התמונה' : `הכנתי ${e.total} תמונות`;
      log = upsert(log, { key: 'images', text, state: e.done < e.total ? 'active' : 'done' });
      percent = Math.max(percent, Math.round((e.done / Math.max(1, e.total)) * 10));
      break;
    }
    case 'request':
      log = upsert(log, { key: 'send', text: 'שולח את המתכון לעיבוד…', state: 'active' });
      percent = Math.max(percent, 12);
      waiting = true;
      break;
    case 'model-unavailable':
      log = upsert(log, {
        key: `fallback-${e.model}`,
        text: e.quota ? 'נגמרה המכסה במודל הראשי, עובר לחלופי' : 'המודל הראשי לא זמין, עובר לחלופי',
        state: 'warn',
      });
      break;
    case 'server-retry':
      log = upsert(log, { key: `retry-${log.length}`, text: 'השרת עמוס, מנסה שוב…', state: 'warn' });
      break;
    case 'partial': {
      const p = analyzePartial(e.text);
      waiting = false;
      log = upsert(log, { key: 'send', text: 'המתכון נשלח', state: 'done' });
      if (p.notRecipe) {
        log = upsert(log, { key: 'title', text: 'נראה שזה לא מתכון…', state: 'warn' });
        break;
      }
      if (p.emoji) emoji = p.emoji;
      if (p.title) log = upsert(log, { key: 'title', text: `מצאתי את המתכון: "${short(p.title, 36)}"`, state: 'done' });
      if (p.section === 'ingredients' || p.ingredients > 0) {
        const busy = p.section === 'ingredients';
        log = upsert(log, {
          key: 'ingredients',
          text: busy
            ? `מזהה מצרכים (${p.ingredients})${p.lastIngredient ? `: ${short(p.lastIngredient)}` : '…'}`
            : `זיהיתי ${p.ingredients} מצרכים`,
          state: busy ? 'active' : 'done',
        });
      }
      if (p.section === 'steps' || p.steps > 0) {
        const busy = p.section === 'steps';
        log = upsert(log, {
          key: 'steps',
          text: busy
            ? `מחלק לשלבים (${p.steps})${p.lastStep ? `: ${short(p.lastStep)}` : '…'}`
            : `חילקתי ל-${p.steps} שלבים`,
          state: busy ? 'active' : 'done',
        });
      }
      if (p.timers > 0) {
        log = upsert(log, {
          key: 'timers',
          text: p.timers === 1 ? 'הוספתי טיימר אחד' : `הוספתי ${p.timers} טיימרים`,
          state: 'done',
        }, false);
      }
      if (p.section === 'after') {
        log = upsert(log, {
          key: 'prep',
          text: p.prep ? `מצאתי ${p.prep === 1 ? 'הכנה אחת' : `${p.prep} הכנות`} מראש` : 'בודק אם יש מה להכין מראש…',
          state: 'active',
        });
      }
      if (p.questions > 0) {
        log = upsert(
          log,
          {
            key: 'questions',
            text: p.questions === 1 ? 'יש שורה אחת לא ברורה – אשאל אותך עליה' : `יש ${p.questions} שורות לא ברורות – אשאל אותך עליהן`,
            state: 'warn',
          },
          false,
        );
      }
      percent = Math.max(percent, Math.round(streamPercent(p)));
      break;
    }
    case 'invalid-retry':
      log = upsert(log, { key: `invalid-${log.length}`, text: 'התשובה לא הייתה תקינה, מבקש שוב…', state: 'warn' });
      break;
    case 'validate':
      log = upsert(finishAll(log), { key: 'validate', text: 'בודק שהמתכון שלם ותקין…', state: 'active' });
      percent = Math.max(percent, 95);
      waiting = false;
      break;
    case 'saving':
      log = upsert(log, { key: 'save', text: 'שומר טיוטה לעריכה…', state: 'active' });
      percent = Math.max(percent, 98);
      break;
    case 'done':
      log = finishAll(log);
      percent = 100;
      waiting = false;
      break;
  }
  return { percent, waiting, emoji, log };
}
