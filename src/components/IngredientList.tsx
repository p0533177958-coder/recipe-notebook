import type { Ingredient } from '../types';
import { Checkbox } from './ui';

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
          {g.name && <h3 className="mb-1 text-sm font-bold text-muted">{g.name}</h3>}
          <ul className="flex flex-col">
            {g.items.map((ing) => {
              const on = checked?.has(ing.id) ?? false;
              if (!onToggle) {
                return (
                  <li key={ing.id} className="flex gap-2 py-1 text-base">
                    <span className="text-muted" aria-hidden="true">
                      •
                    </span>
                    {ing.text}
                  </li>
                );
              }
              return (
                <li key={ing.id} className="border-b border-line last:border-b-0">
                  <Checkbox checked={on} onChange={() => onToggle(ing.id)} label={`${checkLabel ?? ''} ${ing.text}`} className="py-1">
                    <span className={`text-base transition-colors duration-150 ${on ? 'text-muted line-through decoration-1' : ''}`}>{ing.text}</span>
                  </Checkbox>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
