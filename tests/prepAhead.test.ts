import { describe, expect, it } from 'vitest';
import { parseAiResponse } from '../src/lib/aiRecipe';
import { detectPrepHints, planPrep, prepTimerLabel } from '../src/lib/prepAhead';
import { sampleRecipes } from '../src/seed';
import type { Recipe, Step } from '../src/types';

function step(id: string, text: string, timerMin?: number, ingredientIds: string[] = []): Step {
  return { id, text, ingredientIds, timers: timerMin ? [{ label: 'x', seconds: timerMin * 60 }] : [] };
}

function recipe(steps: Step[], ingredients: Recipe['ingredients'] = []): Pick<Recipe, 'steps' | 'ingredients' | 'prepAhead' | 'prepReviewed'> {
  return { steps, ingredients };
}

describe('detectPrepHints', () => {
  it('finds a late oven preheat with its temperature', () => {
    const hints = detectPrepHints(
      recipe([step('a', 'מערבבים בצק'), step('b', 'מתפיחים שעתיים', 120), step('c', 'מחממים תנור ל-200 מעלות ואופים 30 דקות', 30)]),
    );
    expect(hints).toEqual([{ emoji: '🔥', text: 'לחמם את התנור ל-200 מעלות', stepId: 'c', leadMinutes: 15 }]);
  });

  it('ignores something already in the first step', () => {
    expect(detectPrepHints(recipe([step('a', 'מחממים תנור ל-180 מעלות'), step('b', 'מערבבים')]))).toEqual([]);
  });

  it('lists only fridge items for room temperature', () => {
    const ingredients = [
      { id: 'i1', text: '200 גרם חמאה רכה' },
      { id: 'i2', text: '1 כוס סוכר' },
      { id: 'i3', text: '3 ביצים' },
    ];
    const hints = detectPrepHints(
      recipe([step('a', 'מנפים קמח'), step('b', 'מקציפים חמאה וביצים בטמפרטורת החדר עם הסוכר', undefined, ['i1', 'i2', 'i3'])], ingredients),
    );
    expect(hints[0].text).toBe('להוציא מהמקרר: חמאה רכה, ביצים');
    expect(hints[0].leadMinutes).toBe(30);
  });

  it('uses the step timer or "overnight" for soaking', () => {
    const hints = detectPrepHints(recipe([step('a', 'שוטפים'), step('b', 'משרים את החומוס במים למשך לילה')]));
    expect(hints[0]).toMatchObject({ emoji: '💧', leadMinutes: 480 });
  });

  it('detects boiling water for pasta', () => {
    const hints = detectPrepHints(recipe([step('a', 'קוצצים שום'), step('b', 'מבשלים את הפסטה במים רותחים עם מלח', 10)]));
    expect(hints[0]).toMatchObject({ emoji: '♨️', text: 'להרתיח מים' });
  });
});

describe('planPrep timing', () => {
  it('starts the oven during a long rise, not at the very beginning', () => {
    const plan = planPrep(
      recipe([
        step('s1', 'לשים בצק', 10),
        step('s2', 'מתפיחים שעה', 60),
        step('s3', 'קולעים חלה'),
        step('s4', 'מחממים תנור ל-180 מעלות ואופים', 25),
      ]),
    );
    // 3 min (s3) < 15 min lead, so start during the rise (s2).
    expect(plan[0]).toMatchObject({ neededIndex: 3, startIndex: 1, tooLate: false });
  });

  it('starts right away when the recipe is short', () => {
    const plan = planPrep(recipe([step('s1', 'קוצצים'), step('s2', 'מערבבים'), step('s3', 'מחממים תנור ל-200 מעלות')]));
    expect(plan[0]).toMatchObject({ startIndex: 0, tooLate: false });
  });

  it('flags long soaks that do not fit in the recipe time', () => {
    const plan = planPrep(recipe([step('s1', 'שוטפים'), step('s2', 'משרים את השעועית לילה')]));
    expect(plan[0]).toMatchObject({ startIndex: 0, tooLate: true });
  });

  it('prefers AI hints and adds local ones only for other steps', () => {
    const r = recipe([step('s1', 'א'), step('s2', 'מחממים תנור ל-200 מעלות'), step('s3', 'מבשלים פסטה במים רותחים')]);
    r.prepAhead = [{ text: 'לחמם תנור (AI)', stepId: 's2', leadMinutes: 20, emoji: '🔥' }];
    expect(planPrep(r).map((p) => p.text)).toEqual(['לחמם תנור (AI)', 'להרתיח מים']);
  });

  it('stops auto-detection once the user reviewed the hints', () => {
    const r = recipe([step('s1', 'א'), step('s2', 'מחממים תנור')]);
    r.prepReviewed = true;
    r.prepAhead = [];
    expect(planPrep(r)).toEqual([]);
  });

  it('drops hints whose step no longer exists', () => {
    const r = recipe([step('s1', 'א'), step('s2', 'ב')]);
    r.prepAhead = [{ text: 'x', stepId: 'gone', leadMinutes: 10 }];
    expect(planPrep(r)).toEqual([]);
  });

  it('reminds to preheat during the challah\'s second rise', () => {
    const challah = sampleRecipes(0).find((r) => r.id === 'sample-challah')!;
    const plan = planPrep(challah);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ text: 'לחמם את התנור ל-180 מעלות', neededIndex: 6, startIndex: 5 });
  });

  it('has short timer labels that read well when spoken', () => {
    expect(prepTimerLabel({ emoji: '🔥' })).toBe('תנור');
    expect(prepTimerLabel({ emoji: '🥚' })).toBe('הכנה מראש');
  });
});

describe('AI prepAhead parsing', () => {
  let n = 0;
  const makeId = () => `id${++n}`;
  it('maps step numbers to step ids, skipping empty steps and first-step hints', () => {
    const r = parseAiResponse(
      JSON.stringify({
        isRecipe: true,
        title: 'עוגה',
        ingredients: [{ id: 'i1', text: 'קמח' }],
        steps: [
          { text: 'מערבבים', ingredientIds: [], timers: [] },
          { text: '  ', ingredientIds: [], timers: [] },
          { text: 'אופים ב-180', ingredientIds: [], timers: [] },
        ],
        prepAhead: [
          { text: 'לחמם תנור ל-180', stepNumber: 3, leadMinutes: 15, emoji: '🔥' },
          { text: 'משהו בשלב 1', stepNumber: 1, leadMinutes: 5 },
          { text: 'שלב לא קיים', stepNumber: 9, leadMinutes: 5 },
        ],
      }),
      makeId,
      0,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.recipe.prepAhead).toEqual([{ text: 'לחמם תנור ל-180', stepId: r.recipe.steps[1].id, leadMinutes: 15, emoji: '🔥' }]);
  });
});
