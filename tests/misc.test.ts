import { describe, expect, it } from 'vitest';
import { BACKUP_APP, parseBackup, recipesToImport } from '../src/lib/backupFormat';
import { fitWithin } from '../src/lib/image';
import { recipeFileName, recipeToShareText } from '../src/lib/shareText';
import { matchVoiceCommand } from '../src/lib/voice';
import { sharedText } from '../src/pages/ShareReceive';
import { sampleRecipes } from '../src/seed';

describe('voice commands', () => {
  it.each([
    ['הבא', 'next'],
    ['תמשיך', 'next'],
    ['קדימה בבקשה', 'next'],
    ['הקודם', 'prev'],
    ['אחורה', 'prev'],
    ['חזור', 'prev'],
    ['הפעל טיימר', 'startTimer'],
    ['תפעיל את הטיימר', 'startTimer'],
    ['עצור', 'stop'],
    ['עצור את הטיימר', 'stop'],
    ['כמה זמן נשאר', 'timeLeft'],
    ['כמה נשאר לטיימר', 'timeLeft'],
    ['תקריא', 'read'],
    ['תקריא לי את השלב', 'read'],
    ['מצרכים', 'ingredients'],
    ['מה צריך לשלב הזה', 'ingredients'],
  ])('"%s" → %s', (text, cmd) => {
    expect(matchVoiceCommand(text)).toBe(cmd);
  });
  it('ignores unrelated speech', () => {
    expect(matchVoiceCommand('איזה ריח טוב')).toBeNull();
    expect(matchVoiceCommand('')).toBeNull();
  });
});

describe('step ingredients in sample recipes', () => {
  it('every step references real ingredients only', () => {
    for (const r of sampleRecipes(0)) {
      const ids = new Set(r.ingredients.map((i) => i.id));
      for (const s of r.steps) for (const id of s.ingredientIds) expect(ids.has(id)).toBe(true);
    }
  });
  it('the challah has rising and baking timers', () => {
    const challah = sampleRecipes(0).find((r) => r.id === 'sample-challah')!;
    const labels = challah.steps.flatMap((s) => s.timers.map((t) => t.label));
    expect(labels).toEqual(expect.arrayContaining(['התפחה ראשונה', 'התפחה שנייה', 'אפייה']));
  });
});

describe('share text', () => {
  it('formats a recipe for WhatsApp', () => {
    const r = sampleRecipes(0)[0];
    const text = recipeToShareText(r);
    expect(text).toContain('*שקשוקה*');
    expect(text).toContain('• 6 ביצים');
    expect(text).toContain('1. מחממים');
  });
  it('builds a safe file name', () => {
    expect(recipeFileName({ ...sampleRecipes(0)[1], title: 'עוגה: "הכי טובה"/2' })).toBe('עוגה-הכי-טובה2.recipe.json');
  });
  it('joins shared title/text/url without duplicates', () => {
    expect(sharedText({ title: 'מתכון', text: 'מתכון לעוגה https://x.co', url: 'https://x.co' })).toBe(
      'מתכון לעוגה https://x.co',
    );
    expect(sharedText({ title: 'עוגה', text: 'קמח וסוכר' })).toBe('עוגה\nקמח וסוכר');
  });
});

describe('backup merge', () => {
  const [a, b, c] = sampleRecipes(0);
  it('skips recipes that exist by id or by identical content', () => {
    const copyOfB = { ...b, id: 'other-id' };
    const out = recipesToImport([a], [a, copyOfB, b, c]);
    expect(out.map((r) => r.id)).toEqual(['other-id', c.id]);
  });
  it('parses an exported file and rejects foreign JSON', () => {
    const file = { app: BACKUP_APP, version: 1, kind: 'backup', exportedAt: 1, recipes: [a], images: [] };
    expect(parseBackup(JSON.stringify(file))?.recipes[0].title).toBe('שקשוקה');
    expect(parseBackup('{"foo": 1}')).toBeNull();
    expect(parseBackup('garbage')).toBeNull();
  });
});

describe('image sizing', () => {
  it('fits the longer edge within the limit and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
});
