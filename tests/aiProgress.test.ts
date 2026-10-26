import { describe, expect, it } from 'vitest';
import { analyzePartial, initialProgress, progressReducer, type AiEvent } from '../src/lib/aiProgress';
import { createSseParser, type GeminiResponse } from '../src/lib/gemini';

const full = JSON.stringify({
  isRecipe: true,
  title: 'עוגת שמרים',
  emoji: '🍰',
  category: 'אפייה',
  tags: ['שמרים'],
  ingredients: [
    { id: 'i1', text: '500 גרם קמח' },
    { id: 'i2', text: '2 ביצים' },
    { id: 'i3', text: '1 כוס "חלב" חם' },
  ],
  steps: [
    { text: 'מערבבים את הקמח', ingredientIds: ['i1'], timers: [] },
    { text: 'מתפיחים שעה', ingredientIds: [], timers: [{ label: 'התפחה', seconds: 3600 }] },
    { text: 'אופים 30 דקות', ingredientIds: [], timers: [{ label: 'אפייה', seconds: 1800 }] },
  ],
  prepAhead: [{ text: 'לחמם תנור', stepNumber: 3, leadMinutes: 15 }],
  notes: '',
});

/** The JSON cut at the point where `marker` begins, as it would look mid-stream. */
const cut = (marker: string) => full.slice(0, full.indexOf(marker));

describe('analyzePartial', () => {
  it('reads the title and emoji before anything else', () => {
    const p = analyzePartial(cut('"category"'));
    expect(p).toMatchObject({ title: 'עוגת שמרים', emoji: '🍰', section: 'start', ingredients: 0 });
  });

  it('counts complete ingredients while they stream, with the last one', () => {
    const p = analyzePartial(cut('{"id":"i3"'));
    expect(p).toMatchObject({ section: 'ingredients', ingredients: 2, lastIngredient: '2 ביצים' });
  });

  it('decodes escaped quotes in values', () => {
    const p = analyzePartial(cut('"steps"'));
    expect(p.lastIngredient).toBe('1 כוס "חלב" חם');
    expect(p.ingredients).toBe(3);
  });

  it('counts steps and timers in the steps section', () => {
    const p = analyzePartial(cut('{"text":"אופים'));
    expect(p).toMatchObject({ section: 'steps', steps: 2, lastStep: 'מתפיחים שעה', timers: 1, ingredients: 3 });
  });

  it('notices prep-ahead hints after the steps', () => {
    const p = analyzePartial(full);
    expect(p).toMatchObject({ section: 'after', steps: 3, timers: 2, prep: 1 });
  });

  it('spots a "not a recipe" answer early', () => {
    expect(analyzePartial('{"isRecipe": false, "notRe').notRecipe).toBe(true);
  });

  it('handles an empty or garbage stream', () => {
    expect(analyzePartial('')).toMatchObject({ section: 'start', ingredients: 0, steps: 0 });
    expect(analyzePartial('{"tit')).toMatchObject({ title: undefined });
  });
});

describe('progressReducer', () => {
  const run = (events: AiEvent[]) => events.reduce(progressReducer, initialProgress);

  it('walks through the real phases with rising percent', () => {
    const steps: AiEvent[] = [
      { type: 'images', done: 0, total: 2 },
      { type: 'images', done: 2, total: 2 },
      { type: 'request', model: 'm' },
      { type: 'partial', text: cut('"ingredients"') },
      { type: 'partial', text: cut('{"id":"i3"') },
      { type: 'partial', text: cut('{"text":"אופים') },
      { type: 'partial', text: full },
      { type: 'validate' },
      { type: 'saving' },
      { type: 'done' },
    ];
    const percents: number[] = [];
    steps.reduce((s, e) => {
      const next = progressReducer(s, e);
      percents.push(next.percent);
      return next;
    }, initialProgress);
    expect(percents).toEqual([...percents].sort((a, b) => a - b)); // never goes backwards
    expect(percents.at(-1)).toBe(100);
    expect(percents[2]).toBe(12); // request sent
    expect(percents[5]).toBeGreaterThanOrEqual(50); // in the steps section
  });

  it('writes what actually happened, without naming the AI', () => {
    const s = run([
      { type: 'images', done: 1, total: 1 },
      { type: 'request', model: 'gemini-x' },
      { type: 'partial', text: cut('{"text":"אופים') },
    ]);
    const texts = s.log.map((l) => l.text);
    expect(texts).toEqual([
      'הכנתי את התמונה',
      'המתכון נשלח',
      'מצאתי את המתכון: "עוגת שמרים"',
      'זיהיתי 3 מצרכים',
      'מחלק לשלבים (2): מתפיחים שעה',
      'הוספתי טיימר אחד',
    ]);
    expect(texts.join(' ')).not.toMatch(/gemini/i);
    expect(s.log.find((l) => l.key === 'steps')?.state).toBe('active');
    expect(s.emoji).toBe('🍰');
    expect(s.waiting).toBe(false);
  });

  it('is "waiting" only between sending and the first words', () => {
    const sent = run([{ type: 'request', model: 'm' }]);
    expect(sent.waiting).toBe(true);
    expect(sent.log.at(-1)).toMatchObject({ text: 'שולח את המתכון לעיבוד…', state: 'active' });
    expect(progressReducer(sent, { type: 'partial', text: '{"isRecipe":true' }).waiting).toBe(false);
  });

  it('logs fallbacks and retries as warnings', () => {
    const s = run([
      { type: 'request', model: 'a' },
      { type: 'model-unavailable', model: 'a', quota: true },
      { type: 'request', model: 'b' },
      { type: 'server-retry' },
      { type: 'invalid-retry' },
    ]);
    expect(s.log.filter((l) => l.state === 'warn').map((l) => l.text)).toEqual([
      'נגמרה המכסה במודל הראשי, עובר לחלופי',
      'השרת עמוס, מנסה שוב…',
      'התשובה לא הייתה תקינה, מבקש שוב…',
    ]);
  });

  it('marks everything done at the end', () => {
    const s = run([{ type: 'request', model: 'm' }, { type: 'partial', text: full }, { type: 'validate' }, { type: 'saving' }, { type: 'done' }]);
    expect(s.log.every((l) => l.state !== 'active')).toBe(true);
    expect(s.percent).toBe(100);
  });
});

describe('createSseParser', () => {
  it('reassembles chunks split anywhere, including inside a line', () => {
    const got: GeminiResponse[] = [];
    const p = createSseParser((c) => got.push(c));
    const a = 'data: {"candidates":[{"content":{"parts":[{"text":"שלו"}]}}]}\r\n\r\n';
    const b = 'data: {"candidates":[{"content":{"parts":[{"text":"ם"}]}}]}\r\n\r\n';
    const stream = a + b;
    p.push(stream.slice(0, 17));
    p.push(stream.slice(17, 70));
    p.push(stream.slice(70));
    p.end();
    expect(got.map((c) => c.candidates?.[0]?.content?.parts?.[0]?.text).join('')).toBe('שלום');
  });

  it('handles a last line without a newline and ignores junk', () => {
    const got: GeminiResponse[] = [];
    const p = createSseParser((c) => got.push(c));
    p.push(': keep-alive\n');
    p.push('data: not json\n');
    p.push('data: {"error":{"code":429}}');
    p.end();
    expect(got).toEqual([{ error: { code: 429 } }]);
  });
});
