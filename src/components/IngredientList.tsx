import type { Ingredient } from '../types';
import { IconCheck } from './Icons';

/** Ingredient list grouped by `group`, with optional "יש לי" check marks. */
export function IngredientList({
  ingredients,
  checked,
  onToggle,
  checkLabel,
}: {
  ingredients: Ingredient[];
  checked?: Set<string>;
  onToggle?: (id: string) => void;
  checkLabel?: string;
}) {
  const groups: { name?: string; items: Ingredient[] }[] = [];
  for (const ing of ingredients) {
    const last = groups[groups.length - 1];
    if (last && last.name === ing.group) last.items.push(ing);
    else groups.push({ name: ing.group, items: [ing] });
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.name && <h3 className="mb-1 font-bold text-secondary">{g.name}</h3>}
          <ul className="flex flex-col">
            {g.items.map((ing) => {
              const on = checked?.has(ing.id) ?? false;
              if (!onToggle) {
                return (
                  <li key={ing.id} className="flex gap-2 py-1.5 text-lg">
                    <span className="text-primary" aria-hidden="true">
                      •
                    </span>
                    {ing.text}
                  </li>
                );
              }
              return (
                <li key={ing.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-line/70 py-2 text-lg">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(ing.id)}
                      className="peer sr-only"
                      aria-label={`${checkLabel ?? ''} ${ing.text}`}
                    />
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${
                        on ? 'border-secondary bg-secondary text-white' : 'border-line bg-surface'
                      }`}
                      aria-hidden="true"
                    >
                      {on && <IconCheck size={20} />}
                    </span>
                    <span className={on ? 'text-muted line-through decoration-1' : ''}>{ing.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
