import { useImageUrl } from '../hooks/useImageUrl';
import { CATEGORY_COLORS } from '../lib/categories';
import type { Recipe } from '../types';

/** Dish photo, or the recipe emoji on a warm category-coloured background. */
export function RecipeVisual({
  recipe,
  className = '',
  emojiSize = '3rem',
}: {
  recipe: Pick<Recipe, 'imageId' | 'emoji' | 'category' | 'title'>;
  className?: string;
  emojiSize?: string;
}) {
  const url = useImageUrl(recipe.imageId);
  if (url) {
    return <img src={url} alt="" loading="lazy" decoding="async" className={`object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 25%, #ffffff55, transparent 60%), ${CATEGORY_COLORS[recipe.category]}`,
      }}
      aria-hidden="true"
    >
      <span style={{ fontSize: emojiSize, lineHeight: 1 }} className="drop-shadow-sm">
        {recipe.emoji}
      </span>
    </div>
  );
}
