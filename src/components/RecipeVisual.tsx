import { useState, type CSSProperties } from 'react';
import { useImageUrl } from '../hooks/useImageUrl';
import { CATEGORY_COLORS } from '../lib/categories';
import type { Recipe } from '../types';

/** View-transition name shared by the card image and the recipe hero, so one morphs into the other. */
export function recipeImageTransition(id: string): string {
  return `r-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/**
 * Dish photo (skeleton while it loads, then a fade-in), or the recipe emoji on a warm category tint.
 * The emoji here is the recipe's own illustration, not an interface icon.
 */
export function RecipeVisual({
  recipe,
  className = '',
  emojiSize = '3rem',
  morph,
}: {
  recipe: Pick<Recipe, 'imageId' | 'emoji' | 'category' | 'title'> & { id?: string };
  className?: string;
  emojiSize?: string;
  /** Give this image the shared view-transition name (only one element per screen may have it). */
  morph?: boolean;
}) {
  const url = useImageUrl(recipe.imageId);
  const [loaded, setLoaded] = useState(false);
  const style: CSSProperties = morph && recipe.id ? { viewTransitionName: recipeImageTransition(recipe.id) } : {};

  if (recipe.imageId) {
    return (
      <div className={`relative overflow-hidden ${loaded ? 'bg-surface-2' : 'skeleton'} ${className}`} style={style}>
        {url && (
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 size-full object-cover transition-opacity duration-[250ms] ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
      </div>
    );
  }
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ ...style, background: CATEGORY_COLORS[recipe.category] }}
      aria-hidden="true"
    >
      <span style={{ fontSize: emojiSize, lineHeight: 1 }}>{recipe.emoji}</span>
    </div>
  );
}
