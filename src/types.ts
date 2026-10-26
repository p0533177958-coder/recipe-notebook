export const CATEGORIES = [
  'בוקר',
  'ארוחות צהריים',
  'ארוחות ערב',
  'תוספות',
  'סלטים',
  'מרקים',
  'אפייה',
  'קינוחים',
  'שבת וחגים',
  'אחר',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Ingredient = { id: string; text: string; group?: string };

export type StepTimer = { label: string; seconds: number };

export type Step = {
  id: string;
  text: string;
  ingredientIds: string[];
  timers: StepTimer[];
};

/** Something to start ahead of time (preheat oven, soak, take butter out…), needed by stepId. */
export type PrepHint = { text: string; stepId: string; leadMinutes: number; emoji?: string };

export type Recipe = {
  id: string;
  title: string;
  emoji: string;
  imageId?: string;
  sourceImageIds?: string[];
  /** Original pasted/shared text, kept so "הצג מקור" works for text recipes too. */
  sourceText?: string;
  category: Category;
  tags: string[];
  servings?: string;
  totalTime?: string;
  ingredients: Ingredient[];
  steps: Step[];
  /** Prep-ahead hints suggested by the AI. Older recipes have none; they are detected locally. */
  prepAhead?: PrepHint[];
  /** Set once the user edited the hints; local detection then stops adding its own. */
  prepReviewed?: boolean;
  notes?: string;
  favorite: boolean;
  createdAt: number;
  lastCookedAt?: number;
  cookCount: number;
};

export type StoredImage = { id: string; blob: Blob; createdAt: number };

export type TimerState = 'running' | 'paused' | 'ringing';

export type ActiveTimer = {
  id: string;
  recipeId?: string;
  recipeTitle?: string;
  label: string;
  /** Epoch ms when a running timer ends. */
  endAt: number;
  /** Remaining ms, only meaningful while paused. */
  remainingMs: number;
  state: TimerState;
  createdAt: number;
};

export type DraftStatus = 'images' | 'pending' | 'ready' | 'error';

export type Draft = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: DraftStatus;
  text?: string;
  sourceImageIds: string[];
  recipe?: Recipe;
  /** Set when the draft is an edit of an already-saved recipe. */
  editingRecipeId?: string;
  errorCode?: string;
  /** Technical detail of the last AI error (HTTP status, model, API message). */
  errorDetail?: string;
};

/** Raw content received through the Web Share Target, written by the service worker. */
export type IncomingShare = {
  id: string;
  title?: string;
  text?: string;
  url?: string;
  files: File[];
  createdAt: number;
};
