import type { Category } from '../types';

/** Warm background tints for recipes without a photo, picked by category. */
export const CATEGORY_COLORS: Record<Category, string> = {
  'בוקר': '#F6D9A8',
  'ארוחות צהריים': '#F2C4A6',
  'ארוחות ערב': '#E8B4A0',
  'תוספות': '#E4D3A2',
  'סלטים': '#CFDDA8',
  'מרקים': '#F0C08E',
  'אפייה': '#EBCB9B',
  'קינוחים': '#F2C1C4',
  'שבת וחגים': '#E9CFA0',
  'אחר': '#E6D8C6',
};

export const CATEGORY_EMOJI: Record<Category, string> = {
  'בוקר': '🍳',
  'ארוחות צהריים': '🍲',
  'ארוחות ערב': '🥘',
  'תוספות': '🍚',
  'סלטים': '🥗',
  'מרקים': '🍜',
  'אפייה': '🍞',
  'קינוחים': '🍰',
  'שבת וחגים': '🕯️',
  'אחר': '🍽️',
};
