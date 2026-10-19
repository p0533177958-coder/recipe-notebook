import { db } from './db';
import type { Recipe } from './types';

type SeedStep = { text: string; ing?: number[]; timers?: [string, number][] };

function build(
  id: string,
  base: Omit<Recipe, 'id' | 'ingredients' | 'steps' | 'favorite' | 'cookCount' | 'createdAt'>,
  ingredients: (string | [string, string])[],
  steps: SeedStep[],
  createdAt: number,
): Recipe {
  const ings = ingredients.map((x, i) => {
    const [text, group] = Array.isArray(x) ? x : [x, undefined];
    return { id: `${id}-i${i + 1}`, text, group };
  });
  return {
    id,
    ...base,
    ingredients: ings,
    steps: steps.map((s, i) => ({
      id: `${id}-s${i + 1}`,
      text: s.text,
      ingredientIds: (s.ing ?? []).map((n) => ings[n - 1].id),
      timers: (s.timers ?? []).map(([label, minutes]) => ({ label, seconds: Math.round(minutes * 60) })),
    })),
    favorite: false,
    cookCount: 0,
    createdAt,
  };
}

export function sampleRecipes(now = Date.now()): Recipe[] {
  return [
    build(
      'sample-shakshuka',
      {
        title: 'שקשוקה',
        emoji: '🍳',
        category: 'בוקר',
        tags: ['צמחוני', 'מהיר', 'ביצים'],
        servings: '4 מנות',
        totalTime: '30 דקות',
        notes: 'מגישים עם לחם טרי או חלה לטבילה.',
      },
      [
        '3 כפות שמן זית',
        '1 בצל גדול, קצוץ',
        '1 פלפל אדום, פרוס לרצועות',
        '3 שיני שום, כתושות',
        '6 עגבניות בשלות, מגורדות (או קופסת עגבניות מרוסקות)',
        '2 כפות רסק עגבניות',
        '1 כפית פפריקה מתוקה',
        '1/2 כפית כמון',
        'מלח ופלפל שחור לפי הטעם',
        '6 ביצים',
        'חופן פטרוזיליה קצוצה',
      ],
      [
        { text: 'מחממים את שמן הזית במחבת רחבה על אש בינונית.', ing: [1] },
        { text: 'מוסיפים את הבצל ומטגנים עד שהוא שקוף ומזהב, כ-5 דקות.', ing: [2], timers: [['טיגון הבצל', 5]] },
        { text: 'מוסיפים את הפלפל והשום ומטגנים עוד 3 דקות.', ing: [3, 4], timers: [['טיגון', 3]] },
        {
          text: 'מוסיפים את העגבניות, הרסק והתבלינים. מבשלים על אש נמוכה 10–15 דקות עד שהרוטב מסמיך.',
          ing: [5, 6, 7, 8, 9],
          timers: [['בישול הרוטב', 10]],
        },
        { text: 'יוצרים בעזרת כף 6 גומות ברוטב ושוברים ביצה לתוך כל גומה.', ing: [10] },
        { text: 'מכסים ומבשלים 6–8 דקות, עד שהחלבון מתקשה והחלמון עדיין רך.', timers: [['בישול הביצים', 6]] },
        { text: 'מפזרים פטרוזיליה ומגישים מיד, ישר מהמחבת.', ing: [11] },
      ],
      now - 2000,
    ),
    build(
      'sample-chocolate-cake',
      {
        title: 'עוגת שוקולד בחושה',
        emoji: '🍫',
        category: 'קינוחים',
        tags: ['עוגה', 'קל להכנה', 'בלי מיקסר'],
        servings: 'תבנית 24 ס"מ',
        totalTime: 'שעה',
        notes: 'אפשר להחליף את המים בקפה חזק לטעם עמוק יותר.',
      },
      [
        ['2 כוסות קמח', 'לעוגה'],
        ['2 כוסות סוכר', 'לעוגה'],
        ['3/4 כוס קקאו', 'לעוגה'],
        ['1 שקית אבקת אפייה', 'לעוגה'],
        ['קורט מלח', 'לעוגה'],
        ['3 ביצים', 'לעוגה'],
        ['1 כוס שמן', 'לעוגה'],
        ['1 כוס מים רותחים', 'לעוגה'],
        ['1 כפית תמצית וניל', 'לעוגה'],
        ['200 גרם שוקולד מריר', 'לציפוי'],
        ['1/2 כוס שמנת מתוקה', 'לציפוי'],
      ],
      [
        { text: 'מחממים תנור ל-180 מעלות ומשמנים תבנית עגולה בקוטר 24 ס"מ.' },
        { text: 'בקערה גדולה מערבבים את הקמח, הסוכר, הקקאו, אבקת האפייה והמלח.', ing: [1, 2, 3, 4, 5] },
        { text: 'מוסיפים את הביצים, השמן ותמצית הווניל ובוחשים בכף עד שהתערובת אחידה.', ing: [6, 7, 9] },
        { text: 'מוסיפים בהדרגה את המים הרותחים ובוחשים עד שמתקבלת בלילה חלקה ונוזלית.', ing: [8] },
        { text: 'יוצקים לתבנית ואופים 35–40 דקות, עד שקיסם יוצא עם פירורים לחים.', timers: [['אפייה', 35]] },
        { text: 'מצננים את העוגה בתבנית לפחות 20 דקות.', timers: [['צינון', 20]] },
        {
          text: 'מחממים את השמנת עד סף רתיחה, יוצקים על השוקולד הקצוץ, מחכים דקה ומערבבים לגנאש חלק.',
          ing: [10, 11],
          timers: [['המסת השוקולד', 1]],
        },
        { text: 'יוצקים את הגנאש על העוגה ומיישרים. בתיאבון!' },
      ],
      now - 1000,
    ),
    build(
      'sample-challah',
      {
        title: 'חלה לשבת',
        emoji: '🍞',
        category: 'שבת וחגים',
        tags: ['שבת', 'אפייה', 'שמרים', 'פרווה'],
        servings: '2 חלות',
        totalTime: '3 שעות (רובן התפחה)',
        notes: 'לחלה מבריקה במיוחד – מורחים ביצה פעמיים: לפני ההתפחה השנייה ולפני האפייה.',
      },
      [
        ['1 קילו קמח לבן', 'לבצק'],
        ['1 כף גדושה שמרים יבשים', 'לבצק'],
        ['1/2 כוס סוכר', 'לבצק'],
        ['1 כף מלח', 'לבצק'],
        ['2 ביצים', 'לבצק'],
        ['1/2 כוס שמן', 'לבצק'],
        ['1.5 כוסות מים פושרים', 'לבצק'],
        ['1 ביצה טרופה', 'למריחה'],
        ['שומשום או קצח לפיזור', 'למריחה'],
      ],
      [
        { text: 'בקערת מיקסר מערבבים את הקמח, השמרים והסוכר.', ing: [1, 2, 3] },
        { text: 'מוסיפים את הביצים, השמן והמים ולשים 2 דקות במהירות נמוכה.', ing: [5, 6, 7] },
        { text: 'מוסיפים את המלח ולשים עוד 8–10 דקות עד שהבצק רך, חלק וגמיש.', ing: [4], timers: [['לישה', 8]] },
        {
          text: 'משמנים קערה, מניחים בה את הבצק, מכסים ומתפיחים כשעה עד שהבצק מכפיל את נפחו.',
          timers: [['התפחה ראשונה', 60]],
        },
        { text: 'מחלקים את הבצק לשניים, מחלקים כל חצי ל-3 גלילים וקולעים שתי חלות.' },
        { text: 'מניחים בתבנית עם נייר אפייה, מורחים בביצה ומתפיחים שוב כ-40 דקות.', ing: [8], timers: [['התפחה שנייה', 40]] },
        { text: 'בינתיים מחממים תנור ל-180 מעלות.' },
        { text: 'מורחים שוב בביצה ומפזרים שומשום.', ing: [8, 9] },
        {
          text: 'אופים 25–30 דקות עד שהחלות שזופות ונשמעות חלולות כשמקישים על התחתית.',
          timers: [['אפייה', 25]],
        },
        { text: 'מצננים על רשת. שבת שלום!' },
      ],
      now,
    ),
  ];
}

const SEEDED_KEY = 'rn-seeded';

/** Loads the sample recipes once, on the very first launch. */
export async function seedOnFirstRun(): Promise<void> {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    return;
  }
  if ((await db.recipes.count()) > 0) return;
  await db.recipes.bulkPut(sampleRecipes());
}

/** Restores any missing sample recipe (used from Settings). */
export async function restoreSamples(): Promise<void> {
  const samples = sampleRecipes();
  const existing = await db.recipes.bulkGet(samples.map((s) => s.id));
  await db.recipes.bulkPut(samples.filter((_, i) => !existing[i]));
}
