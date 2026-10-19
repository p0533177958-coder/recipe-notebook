import { z } from 'zod';
import { CATEGORIES, type Category, type Recipe } from '../types';

/** Shape the model is asked to return (ids are short local refs like "i1"). */
export const aiRecipeSchema = z.object({
  isRecipe: z.boolean(),
  notRecipeReason: z.string().optional().nullable(),
  unreadable: z.boolean().optional().nullable(),
  title: z.string().optional().nullable(),
  emoji: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  servings: z.string().optional().nullable(),
  totalTime: z.string().optional().nullable(),
  ingredients: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        group: z.string().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  steps: z
    .array(
      z.object({
        text: z.string(),
        ingredientIds: z.array(z.string()).optional().nullable(),
        timers: z
          .array(z.object({ label: z.string(), seconds: z.number() }))
          .optional()
          .nullable(),
      }),
    )
    .optional()
    .nullable(),
  notes: z.string().optional().nullable(),
});

export type AiRecipe = z.infer<typeof aiRecipeSchema>;

/** JSON schema (OpenAPI subset) passed to Gemini as responseSchema. */
export const geminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    isRecipe: { type: 'BOOLEAN' },
    notRecipeReason: { type: 'STRING' },
    unreadable: { type: 'BOOLEAN' },
    title: { type: 'STRING' },
    emoji: { type: 'STRING' },
    category: { type: 'STRING', enum: [...CATEGORIES] },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    servings: { type: 'STRING' },
    totalTime: { type: 'STRING' },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          text: { type: 'STRING' },
          group: { type: 'STRING' },
        },
        required: ['id', 'text'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          ingredientIds: { type: 'ARRAY', items: { type: 'STRING' } },
          timers: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { label: { type: 'STRING' }, seconds: { type: 'INTEGER' } },
              required: ['label', 'seconds'],
            },
          },
        },
        required: ['text', 'ingredientIds', 'timers'],
      },
    },
    notes: { type: 'STRING' },
  },
  required: ['isRecipe'],
  propertyOrdering: [
    'isRecipe', 'notRecipeReason', 'unreadable', 'title', 'emoji', 'category', 'tags',
    'servings', 'totalTime', 'ingredients', 'steps', 'notes',
  ],
};

export type ParseResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; reason: 'invalid' | 'not-recipe' | 'unreadable' };

function clean(s: string | null | undefined): string | undefined {
  const v = s?.trim();
  return v ? v : undefined;
}

function toCategory(c: string | null | undefined): Category {
  const v = c?.trim() ?? '';
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : 'אחר';
}

/** Strips ```json fences and surrounding prose some models add despite JSON mode. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('no json');
  }
}

/**
 * Validates the model's answer and converts it to a Recipe with fresh ids.
 * Ingredient references in steps are remapped; unknown references are dropped.
 */
export function parseAiResponse(text: string, makeId: () => string, now: number): ParseResult {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const parsed = aiRecipeSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const ai = parsed.data;
  if (ai.unreadable) return { ok: false, reason: 'unreadable' };
  if (!ai.isRecipe) return { ok: false, reason: 'not-recipe' };

  const title = clean(ai.title);
  const ingredientsIn = (ai.ingredients ?? []).filter((i) => i.text.trim());
  const stepsIn = (ai.steps ?? []).filter((s) => s.text.trim());
  if (!title || (ingredientsIn.length === 0 && stepsIn.length === 0)) {
    return { ok: false, reason: 'invalid' };
  }

  const idMap = new Map<string, string>();
  const ingredients = ingredientsIn.map((i) => {
    const id = makeId();
    idMap.set(i.id.trim(), id);
    return { id, text: i.text.trim(), group: clean(i.group) };
  });

  const steps = stepsIn.map((s) => ({
    id: makeId(),
    text: s.text.trim(),
    ingredientIds: [
      ...new Set(
        (s.ingredientIds ?? [])
          .map((ref) => idMap.get(ref.trim()))
          .filter((x): x is string => !!x),
      ),
    ],
    timers: (s.timers ?? [])
      .filter((t) => Number.isFinite(t.seconds) && t.seconds > 0)
      .map((t) => ({ label: t.label.trim() || 'טיימר', seconds: Math.round(t.seconds) })),
  }));

  const tags = [
    ...new Set((ai.tags ?? []).map((t) => t.trim().replace(/^#/, '')).filter(Boolean)),
  ].slice(0, 5);

  return {
    ok: true,
    recipe: {
      id: makeId(),
      title,
      emoji: clean(ai.emoji) ?? '🍽️',
      category: toCategory(ai.category),
      tags,
      servings: clean(ai.servings),
      totalTime: clean(ai.totalTime),
      ingredients,
      steps,
      notes: clean(ai.notes),
      favorite: false,
      createdAt: now,
      cookCount: 0,
    },
  };
}
