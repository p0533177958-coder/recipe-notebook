import type { Category } from '../types';

/**
 * Warm background tints for recipes without a photo, picked by category.
 * The values are CSS tokens (src/index.css): matched pastels in light mode, deep muted tones in dark mode.
 */
export const CATEGORY_COLORS: Record<Category, string> = {
  'בוקר': 'var(--cat-1)',
  'ארוחות צהריים': 'var(--cat-2)',
  'ארוחות ערב': 'var(--cat-3)',
  'תוספות': 'var(--cat-4)',
  'סלטים': 'var(--cat-5)',
  'מרקים': 'var(--cat-6)',
  'אפייה': 'var(--cat-7)',
  'קינוחים': 'var(--cat-8)',
  'שבת וחגים': 'var(--cat-9)',
  'אחר': 'var(--cat-10)',
};
