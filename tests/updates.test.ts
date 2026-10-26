import { describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: () => async () => {} }));

const { isBusyPath } = await import('../src/lib/updates');

describe('isBusyPath', () => {
  it('treats processing, editing, adding, cooking and sharing as busy', () => {
    for (const p of ['/process/abc', '/edit/abc', '/add/text', '/add/images/x', '/cook/r1', '/share', '/recipe-notebook/cook/r1']) {
      expect(isBusyPath(p)).toBe(true);
    }
  });
  it('lets home, recipe and settings update right away', () => {
    for (const p of ['/', '/recipe/r1', '/settings', '/recipe-notebook/', '/recipe/cookies']) {
      expect(isBusyPath(p)).toBe(false);
    }
  });
});
