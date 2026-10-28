// Screenshots of every screen, light and dark, at 393×852 (RTL), for the design review.
// Usage: build, run `npx vite preview --port 4180`, then `node scripts/screenshots.mjs`.
// Uses the installed Microsoft Edge (no browser download). Output: screenshots/<scheme>/<name>.png
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4180';
const OUT = 'screenshots';

/** Runs in the page: writes rows straight into the app's IndexedDB stores. */
async function dbPut(page, store, rows) {
  await page.evaluate(
    ([store, rows]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('recipe-notebook');
        req.onsuccess = () => {
          const tx = req.result.transaction(store, 'readwrite');
          for (const r of rows) tx.objectStore(store).put(r);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    [store, rows],
  );
}

async function dbClear(page, store) {
  await page.evaluate(
    (store) =>
      new Promise((resolve) => {
        const req = indexedDB.open('recipe-notebook');
        req.onsuccess = () => {
          const tx = req.result.transaction(store, 'readwrite');
          tx.objectStore(store).clear();
          tx.oncomplete = () => resolve(true);
        };
      }),
    store,
  );
}

async function getRecipe(page, id) {
  return page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const req = indexedDB.open('recipe-notebook');
        req.onsuccess = () => {
          const g = req.result.transaction('recipes').objectStore('recipes').get(id);
          g.onsuccess = () => resolve(g.result);
        };
      }),
    id,
  );
}

const settle = (page, ms = 700) => page.waitForTimeout(ms);

async function run(browser, scheme) {
  const dir = `${OUT}/${scheme}`;
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    reducedMotion: 'reduce', // stable frames: no half-finished animations in the screenshots
    locale: 'he-IL',
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const shot = async (name) => {
    await settle(page);
    await page.screenshot({ path: `${dir}/${name}.png` });
    console.log(`${scheme}/${name}`);
  };

  // Home (first run loads the sample recipes). Mark a couple as cooked so "בישלתם לאחרונה" shows.
  await page.goto(`${BASE}/`);
  await page.waitForSelector('text=שקשוקה');
  const now = Date.now();
  for (const [id, days, count] of [
    ['sample-shakshuka', 1, 3],
    ['sample-challah', 3, 1],
  ]) {
    const r = await getRecipe(page, id);
    await dbPut(page, 'recipes', [{ ...r, lastCookedAt: now - days * 864e5, cookCount: count, favorite: id === 'sample-challah' }]);
  }
  await page.reload();
  await page.waitForSelector('text=שקשוקה');
  await shot('01-home-grid');

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rn-settings') || '{}');
    localStorage.setItem('rn-settings', JSON.stringify({ ...s, view: 'rows' }));
  });
  await page.reload();
  await page.waitForSelector('text=שקשוקה');
  await shot('02-home-rows');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rn-settings') || '{}');
    localStorage.setItem('rn-settings', JSON.stringify({ ...s, view: 'grid', apiKey: 'TEST-KEY' }));
  });

  // Recipe screen
  await page.goto(`${BASE}/recipe/sample-challah`);
  await page.waitForSelector('h1');
  await shot('04-recipe');
  await page.evaluate(() => window.scrollTo(0, 700));
  await shot('04b-recipe-scrolled');

  // Cook mode: a plain step, a step with a timer, and a ringing timer
  await page.goto(`${BASE}/cook/sample-shakshuka?step=1`);
  await page.waitForSelector('text=שלב 1 מתוך 7');
  await shot('05-cook-step');
  await page.goto(`${BASE}/cook/sample-shakshuka?step=2`);
  await page.waitForSelector('text=שלב 2 מתוך 7');
  await shot('06-cook-timer');
  await dbPut(page, 'timers', [
    { id: 't1', label: 'טיגון הבצל', recipeId: 'sample-shakshuka', recipeTitle: 'שקשוקה', endAt: now - 1000, remainingMs: 0, state: 'ringing', createdAt: now - 300000 },
    { id: 't2', label: 'בישול הרוטב', recipeId: 'sample-shakshuka', recipeTitle: 'שקשוקה', endAt: now + 480000, remainingMs: 480000, state: 'running', createdAt: now },
  ]);
  await page.reload();
  await page.waitForSelector('text=הזמן נגמר');
  await shot('07-cook-ringing');
  await dbClear(page, 'timers');

  // Finish screen
  await page.goto(`${BASE}/done/sample-shakshuka`);
  await page.waitForSelector('text=בתאבון');
  await shot('08-done');

  // Shopping list
  const shak = await getRecipe(page, 'sample-shakshuka');
  await dbPut(
    page,
    'shopping',
    shak.ingredients.slice(0, 6).map((ing, i) => ({
      id: `s${i}`,
      recipeId: shak.id,
      recipeTitle: shak.title,
      text: ing.text,
      checked: i < 2,
      createdAt: now,
      order: i,
    })),
  );
  await page.goto(`${BASE}/shopping`);
  await page.waitForSelector('text=רשימת קניות');
  await shot('09-shopping');

  // AI processing (the request is held, so the screen stays mid-way) and an error
  await page.route('**/generativelanguage.googleapis.com/**', () => {
    /* never answered: keeps the progress screen on screen */
  });
  await dbPut(page, 'drafts', [{ id: 'd-proc', createdAt: now, updatedAt: now, status: 'pending', sourceImageIds: [], text: 'מתכון לבדיקה' }]);
  await page.goto(`${BASE}/process/d-proc`);
  await page.waitForSelector('[role=progressbar]');
  await settle(page, 2500);
  await shot('10-processing');
  await page.unroute('**/generativelanguage.googleapis.com/**');
  await dbPut(page, 'drafts', [
    { id: 'd-err', createdAt: now, updatedAt: now, status: 'error', errorCode: 'quota', errorDetail: 'gemini-3.8-flash · HTTP 429 · RESOURCE_EXHAUSTED', sourceImageIds: [], text: 'x' },
  ]);
  await page.goto(`${BASE}/process/d-err`);
  await page.waitForSelector('[role=alert]');
  await shot('11-error');

  // Edit screen, with an open AI question
  const draftRecipe = {
    ...shak,
    id: 'new-r',
    questions: [{ id: 'q1', question: 'לא הצלחנו לקרוא את הכמות של העגבניות. כמה עגבניות?', quote: '[?] עגבניות בשלות', ingredientId: shak.ingredients[4].id }],
  };
  await dbPut(page, 'drafts', [{ id: 'd-edit', createdAt: now, updatedAt: now, status: 'ready', sourceImageIds: [], text: 'x', recipe: draftRecipe }]);
  await page.goto(`${BASE}/edit/d-edit`);
  await page.waitForSelector('text=יש לנו שאלה אליכם');
  await shot('12-edit');
  await dbClear(page, 'drafts');

  // Settings
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector('text=הגדרות');
  await shot('13-settings');

  // Recipe card page
  await page.goto(`${BASE}/page/sample-chocolate-cake`);
  await page.waitForSelector('.rp-sheet');
  await settle(page, 1500);
  await shot('14-recipe-card');

  // Empty home: a fresh profile where the samples were already removed.
  const empty = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    reducedMotion: 'reduce',
    locale: 'he-IL',
    serviceWorkers: 'block',
  });
  await empty.addInitScript(() => localStorage.setItem('rn-seeded', '1'));
  const ep = await empty.newPage();
  await ep.goto(`${BASE}/`);
  await ep.waitForSelector('text=בואו נוסיף');
  await ep.waitForTimeout(700);
  await ep.screenshot({ path: `${dir}/03-home-empty.png` });
  console.log(`${scheme}/03-home-empty`);
  await empty.close();

  await ctx.close();
}

const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const scheme of ['light', 'dark']) await run(browser, scheme);
} finally {
  await browser.close();
}
