// End-to-end check of voice control in a real browser (Edge), with the microphone replaced by a fake
// SpeechRecognition that "says" commands, and speechSynthesis replaced by a recorder.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4180';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ channel: 'msedge' });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'he-IL', serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  // Fake microphone: the test calls window.__say(text), window.__end(), window.__error(code).
  class FakeRecognition {
    constructor() {
      window.__recs = (window.__recs || 0) + 1;
      window.__rec = this;
      this.starts = 0;
    }
    start() {
      this.starts++;
      window.__starts = (window.__starts || 0) + 1;
    }
    stop() {}
    abort() {
      this.aborted = true;
    }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
  window.__say = (text) =>
    window.__rec?.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true, 0: { transcript: text } })] });
  window.__end = () => window.__rec?.onend?.();
  window.__error = (code) => window.__rec?.onerror?.({ error: code });
  // Fake text-to-speech: records what the app says.
  window.__spoken = [];
  const synth = {
    speaking: false,
    speak: (u) => {
      window.__spoken.push(u.text);
      // Like the real thing: speaking for a moment, then onend.
      synth.speaking = true;
      setTimeout(() => {
        synth.speaking = false;
        u.onend?.();
      }, 300);
    },
    cancel: () => {},
    getVoices: () => [],
    onvoiceschanged: null,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
});

const page = await ctx.newPage();
const stepLabel = () => page.locator('header p.font-bold').first().textContent();
const lastSpoken = () => page.evaluate(() => window.__spoken.at(-1) ?? '');
const say = async (text) => {
  await page.evaluate((t) => window.__say(t), text);
  await page.waitForTimeout(1300); // reading (0.3s) + echo window (0.8s)
};

await page.goto(`${BASE}/`);
await page.waitForSelector('text=שקשוקה');
await page.goto(`${BASE}/cook/sample-shakshuka?step=1`);
await page.waitForSelector('text=שלב 1 מתוך 7');

const mic = page.getByRole('button', { name: 'הפעלת שליטה קולית' });
check('mic button is shown when the browser supports speech', (await mic.count()) === 1);
await mic.click();
await page.waitForTimeout(200);
check('tapping the mic starts listening', (await page.evaluate(() => window.__starts)) === 1);
check('a "listening" hint is shown', await page.getByText('מקשיבים…').isVisible());
check('the button shows it is on', (await page.getByRole('button', { name: 'כיבוי שליטה קולית' }).getAttribute('aria-pressed')) === 'true');

await say('הבא');
check('"הבא" moves to the next step', (await stepLabel())?.includes('שלב 2 מתוך 7'));
check('…and reads the new step aloud', (await lastSpoken()).startsWith('שלב 2.'), await lastSpoken());

await say('הקודם');
check('"הקודם" goes back', (await stepLabel())?.includes('שלב 1 מתוך 7'));

await say('אוקיי תמשיך בבקשה');
check('"תמשיך" inside a longer sentence also works', (await stepLabel())?.includes('שלב 2 מתוך 7'));

await say('הפעל טיימר');
check('"הפעל טיימר" starts the step timer', await page.getByRole('region', { name: 'טיימרים פעילים' }).getByText('טיגון הבצל').isVisible());
check('…and says so', (await lastSpoken()).includes('הטיימר הופעל: טיגון הבצל'), await lastSpoken());

await say('הפעל טיימר');
check('a second "הפעל טיימר" does not start it twice', (await lastSpoken()) === 'הטיימר כבר רץ', await lastSpoken());

await say('כמה זמן נשאר');
check('"כמה זמן נשאר" reads the time left', (await lastSpoken()).startsWith('לטיגון הבצל נשארו'), await lastSpoken());

await say('מצרכים');
check('"מצרכים" reads the step ingredients', (await lastSpoken()).includes('בצל גדול'), await lastSpoken());

await say('תקריא');
check('"תקריא" reads the current step', (await lastSpoken()).startsWith('שלב 2.'), await lastSpoken());

// Echo: right after the app reads aloud, a command-like word is its own voice and must be ignored.
await page.evaluate(() => { window.__say('תקריא'); window.__say('הבא'); });
await page.waitForTimeout(200);
check('a command heard right after the app spoke (its own echo) is ignored', (await stepLabel())?.includes('שלב 2 מתוך 7'));
await page.waitForTimeout(1300);

await say('איזה ריח טוב יש פה');
check('unrelated speech does nothing', (await stepLabel())?.includes('שלב 2 מתוך 7'));

const startsBefore = await page.evaluate(() => window.__starts);
await page.evaluate(() => window.__end());
await page.waitForTimeout(500);
check('after a pause (recognition ended) listening restarts by itself', (await page.evaluate(() => window.__starts)) === startsBefore + 1);

await say('חזור');
await say('חזור');
check('"חזור" at the first step says it is the first step', (await lastSpoken()) === 'זה השלב הראשון', await lastSpoken());

await page.goto(`${BASE}/cook/sample-shakshuka?step=7`);
await page.waitForSelector('text=שלב 7 מתוך 7');
await page.getByRole('button', { name: 'הפעלת שליטה קולית' }).click();
await say('הבא');
check('"הבא" at the last step says it is the last step', (await lastSpoken()) === 'זה השלב האחרון', await lastSpoken());

await page.getByRole('button', { name: 'כיבוי שליטה קולית' }).click();
await page.waitForTimeout(200);
check('tapping again stops listening', await page.evaluate(() => window.__rec.aborted === true));
const startsOff = await page.evaluate(() => window.__starts);
await page.evaluate(() => window.__end());
await page.waitForTimeout(500);
check('…and it does not restart after stopping', (await page.evaluate(() => window.__starts)) === startsOff);

// Permission denied
await page.getByRole('button', { name: 'הפעלת שליטה קולית' }).click();
await page.evaluate(() => window.__error('not-allowed'));
await page.waitForTimeout(300);
check('denied microphone permission turns listening off', (await page.getByRole('button', { name: 'הפעלת שליטה קולית' }).count()) === 1);
const toastText = await page.locator('[aria-live=polite] div').allTextContents();
check('…and explains why', toastText.some((t) => t.includes('מיקרופון')), toastText.join(' | '));

// Stop ringing by voice
await page.goto(`${BASE}/cook/sample-shakshuka?step=2`);
await page.waitForSelector('text=שלב 2 מתוך 7');
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const q = indexedDB.open('recipe-notebook');
      q.onsuccess = () => {
        const tx = q.result.transaction('timers', 'readwrite');
        tx.objectStore('timers').clear();
        tx.objectStore('timers').put({ id: 'tv', label: 'בדיקה', recipeId: 'sample-shakshuka', endAt: Date.now() + 1500, remainingMs: 1500, state: 'running', createdAt: Date.now() });
        tx.oncomplete = resolve;
      };
    }),
);
await page.reload();
await page.getByRole('button', { name: 'הפעלת שליטה קולית' }).click();
await page.waitForSelector('text=הזמן נגמר', { timeout: 8000 });
await say('עצור');
await page.waitForTimeout(400);
check('"עצור" silences a ringing timer', (await page.getByText('הזמן נגמר').count()) === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exitCode = failed ? 1 : 0;
