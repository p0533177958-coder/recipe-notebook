import { useRef } from 'react';

/** Long-press (500ms, cancelled by movement) plus right-click; a normal tap calls onClick. */
export function useLongPress(onLong: () => void, onClick: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(20);
        onLong();
      }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        fired.current = false;
        return;
      }
      onClick();
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      // Android Chrome also fires contextmenu on long-press; don't open the menu twice.
      if (fired.current) return;
      fired.current = true;
      onLong();
    },
  };
}
