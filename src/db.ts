import Dexie, { type EntityTable } from 'dexie';
import type { ActiveTimer, Draft, IncomingShare, Recipe, ShoppingItem, StoredImage } from './types';

// Kept free of app imports: the service worker imports this module too.
export const db = new Dexie('recipe-notebook') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>;
  images: EntityTable<StoredImage, 'id'>;
  timers: EntityTable<ActiveTimer, 'id'>;
  drafts: EntityTable<Draft, 'id'>;
  shares: EntityTable<IncomingShare, 'id'>;
  shopping: EntityTable<ShoppingItem, 'id'>;
};

db.version(1).stores({
  recipes: 'id, title, category, createdAt, lastCookedAt, cookCount, favorite',
  images: 'id',
  timers: 'id, state',
  drafts: 'id, updatedAt',
  shares: 'id, createdAt',
});

// Version 2: the shopping list. Existing tables are unchanged, so no data migration is needed.
db.version(2).stores({
  shopping: 'id, recipeId, order',
});

export function newId(): string {
  return crypto.randomUUID();
}
