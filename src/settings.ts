import { useSyncExternalStore } from 'react';
import { MIN_COOK_FONT } from './config';
import { applyFontStyle, type FontStyleId } from './lib/fonts';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ListView = 'grid' | 'rows';
export type SortMode = 'recent' | 'alpha' | 'cooked';

export type Settings = {
  apiKey: string;
  theme: ThemeMode;
  view: ListView;
  sort: SortMode;
  cookFontSize: number;
  speakTimers: boolean;
  font: FontStyleId;
};

const KEY = 'rn-settings';
const DEFAULTS: Settings = {
  apiKey: '',
  theme: 'auto',
  view: 'grid',
  sort: 'recent',
  cookFontSize: 30,
  speakTimers: true,
  font: 'classic',
};

function load(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as Settings;
    s.cookFontSize = Math.max(MIN_COOK_FONT, s.cookFontSize);
    return s;
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  if (patch.font) applyFontStyle(patch.font);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: keep the in-memory value for this session.
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function applyTheme(): void {
  const root = document.documentElement;
  if (current.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = current.theme;
  // The status bar always matches the background. In "auto" each meta keeps its own media query;
  // a manual choice overrides both, since the system preference no longer decides.
  const LIGHT_BG = '#FBF6EE';
  const DARK_BG = '#1F1A17';
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const isDarkMeta = meta.media.includes('dark');
    const color = current.theme === 'auto' ? (isDarkMeta ? DARK_BG : LIGHT_BG) : current.theme === 'dark' ? DARK_BG : LIGHT_BG;
    meta.setAttribute('content', color);
  }
}
