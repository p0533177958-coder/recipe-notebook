import type { PrepHint, Recipe, Step } from '../types';

/** Assumed duration of a step without a timer, for timing estimates. */
const STEP_WITHOUT_TIMER_SEC = 3 * 60;

export type PrepPlanItem = PrepHint & {
  /** Index of the step that needs it. */
  neededIndex: number;
  /** Index of the step during which it should be started (0 = before starting). */
  startIndex: number;
  /** Even starting right away leaves less time than it needs (e.g. soaking overnight). */
  tooLate: boolean;
};

type Rule = {
  emoji: string;
  match: RegExp;
  /** Builds the hint text from the step (and its ingredient lines). */
  text: (step: Step, ingredients: string[]) => string;
  /** Minutes it takes; may use the step's own timer. */
  lead: (step: Step) => number;
};

const stepTimerMinutes = (s: Step) => Math.max(0, ...s.timers.map((t) => t.seconds / 60));

/** Shortens "250 גרם חמאה רכה" → "חמאה רכה" for compact hint text. */
function ingredientName(line: string): string {
  return line
    .replace(/^[\d\s.,/½¼¾⅓⅔-]+/, '')
    .replace(/^(גרם|ג׳|ג'|קילו|ק"ג|כוס(ות)?|כף|כפות|כפית|כפיות|מ"ל|ליטר|יחידות|חבילה|חבילות|שקית|שקיות)\s+/, '')
    .trim();
}

const FRIDGE = /חמא|ביצ|שמנת|גבינ|חלב|יוגורט|מרגרינ|לבנה/;

const RULES: Rule[] = [
  {
    emoji: '🔥',
    match: /(מחממים|לחמם|חממו|מחממת|מחמם|חמם|חימום|מדליקים|להדליק)\s+(את\s+)?(ה)?תנור/,
    text: (s) => {
      const deg = s.text.match(/(\d{2,3})\s*(מעלות|°)/);
      return deg ? `לחמם את התנור ל-${deg[1]} מעלות` : 'לחמם את התנור';
    },
    lead: () => 15,
  },
  {
    emoji: '🧈',
    match: /טמפרטורת\s+(ה)?חדר/,
    text: (_s, ings) => {
      const names = ings.filter((l) => FRIDGE.test(l)).map(ingredientName).filter(Boolean);
      return names.length ? `להוציא מהמקרר: ${names.join(', ')}` : 'להוציא מהמקרר את מה שצריך להיות בטמפרטורת החדר';
    },
    lead: () => 30,
  },
  {
    emoji: '❄️',
    match: /(להפשיר|מפשירים|מופשר|מופשרים|מופשרת|הפשרה|הפשירו)/,
    text: (_s, ings) => {
      const names = ings.map(ingredientName).filter(Boolean);
      return names.length ? `להפשיר: ${names.join(', ')}` : 'להפשיר מראש';
    },
    lead: (s) => Math.max(120, stepTimerMinutes(s)),
  },
  {
    emoji: '🍖',
    match: /מרינדה|במרינדה|(משרים|להשרות|משרה)\s+[^.]*בתיבול/,
    text: (_s, ings) => {
      const names = ings.map(ingredientName).filter(Boolean).slice(0, 3);
      return names.length ? `להכין מרינדה ולהשרות: ${names.join(', ')}` : 'להכין מרינדה ולהשרות מראש';
    },
    lead: (s) => Math.max(30, stepTimerMinutes(s) || (/לילה/.test(s.text) ? 480 : 60)),
  },
  {
    emoji: '💧',
    match: /(משרים|להשרות|השרו|השריה|מושרים|מושרות)/,
    text: (_s, ings) => {
      const names = ings.map(ingredientName).filter(Boolean).slice(0, 3);
      return names.length ? `להשרות: ${names.join(', ')}` : 'להשרות מראש';
    },
    lead: (s) => Math.max(20, stepTimerMinutes(s) || (/לילה/.test(s.text) ? 480 : 60)),
  },
  {
    emoji: '♨️',
    match: /(מרתיחים|להרתיח|הרתיחו|מביאים לרתיחה|להביא לרתיחה)\s+([^.,]*\s)?מים|סיר\s+(גדול\s+)?(עם|של)\s+מים\s+רותחים|במים\s+רותחים/,
    text: () => 'להרתיח מים',
    lead: () => 10,
  },
];

/** Finds prep-ahead needs in a recipe's steps by simple Hebrew text rules. */
export function detectPrepHints(recipe: Pick<Recipe, 'steps' | 'ingredients'>): PrepHint[] {
  const byId = new Map(recipe.ingredients.map((i) => [i.id, i.text]));
  const out: PrepHint[] = [];
  const seen = new Set<string>();
  recipe.steps.forEach((step, i) => {
    if (i === 0) return; // already the first thing you do
    for (const rule of RULES) {
      if (!rule.match.test(step.text)) continue;
      if (seen.has(rule.emoji)) break; // one hint per kind is enough (e.g. the first preheat)
      seen.add(rule.emoji);
      const ings = step.ingredientIds.map((id) => byId.get(id)).filter((x): x is string => !!x);
      out.push({ emoji: rule.emoji, text: rule.text(step, ings), stepId: step.id, leadMinutes: Math.round(rule.lead(step)) });
      break; // one rule per step; the order puts the most specific first
    }
  });
  return out;
}

function stepSeconds(s: Step): number {
  return s.timers.length ? Math.max(...s.timers.map((t) => t.seconds)) : STEP_WITHOUT_TIMER_SEC;
}

/**
 * AI hints (when present) plus locally detected ones for steps the AI did not cover,
 * each with the step to start it in: the latest step that still leaves enough time.
 */
export function planPrep(recipe: Pick<Recipe, 'steps' | 'ingredients' | 'prepAhead' | 'prepReviewed'>): PrepPlanItem[] {
  const index = new Map(recipe.steps.map((s, i) => [s.id, i]));
  const ai = (recipe.prepAhead ?? []).filter((h) => index.has(h.stepId));
  const covered = new Set(ai.map((h) => h.stepId));
  const local = (recipe.prepReviewed ? [] : detectPrepHints(recipe)).filter((h) => !covered.has(h.stepId));

  return [...ai, ...local]
    .map((h) => {
      const neededIndex = index.get(h.stepId)!;
      const leadSec = Math.max(1, h.leadMinutes) * 60;
      let startIndex = 0;
      let acc = 0;
      for (let j = neededIndex - 1; j >= 0; j--) {
        acc += stepSeconds(recipe.steps[j]);
        if (acc >= leadSec) {
          startIndex = j;
          break;
        }
      }
      const available = recipe.steps.slice(0, neededIndex).reduce((sum, s) => sum + stepSeconds(s), 0);
      return { ...h, emoji: h.emoji ?? '💡', neededIndex, startIndex, tooLate: available < leadSec && leadSec >= 4 * 3600 };
    })
    .filter((p) => p.neededIndex > 0)
    .sort((a, b) => a.startIndex - b.startIndex || a.neededIndex - b.neededIndex);
}

const TIMER_LABELS: Record<string, string> = {
  '🔥': 'תנור',
  '🧈': 'הוצאה מהמקרר',
  '❄️': 'הפשרה',
  '🍖': 'מרינדה',
  '💧': 'השריה',
  '♨️': 'מים',
};

/** Short timer label that reads well in "הטיימר של ה… הסתיים". */
export function prepTimerLabel(p: Pick<PrepHint, 'emoji'>): string {
  return TIMER_LABELS[p.emoji ?? ''] ?? 'הכנה מראש';
}

/** "15 דק׳", "שעה", "8 שעות". */
export function leadLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} דק׳`;
  const h = Math.round(minutes / 60);
  return h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
}
