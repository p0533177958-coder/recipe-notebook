import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { S } from '../strings.he';
import { IconArrowRight, IconCheck, IconClose } from './Icons';

// Shared building blocks. Design rules (index.css / DECISIONS.md): radius 12 small parts, 16 cards,
// 24 sheets, full for round buttons and chips; shadow-soft for cards, shadow-lift for sheets and the FAB;
// tap targets of at least 48×48; 150 / 250 / 400ms motion on one curve.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'olive';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary shadow-soft active:bg-primary-strong',
  olive: 'bg-secondary text-on-secondary shadow-soft',
  secondary: 'bg-surface text-ink border border-line shadow-soft active:bg-surface-2',
  ghost: 'bg-transparent text-ink active:bg-surface-2',
  danger: 'bg-surface text-primary border border-line active:bg-surface-2',
};

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

/** Pressed: scale 0.97 and a darker fill. Disabled: faded and inert. Loading: a small spinner inside. */
export function Button({
  variant = 'primary',
  className = '',
  big,
  loading,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-[transform,background-color,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${
        big ? 'min-h-14 px-6 text-lg' : 'min-h-12 px-4 text-base'
      } ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full text-ink transition duration-150 active:scale-[0.97] active:bg-surface-2 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  title,
  onBack,
  actions,
}: {
  title: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-1 bg-bg/90 ps-[max(8px,env(safe-area-inset-right))] pe-[max(8px,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <IconButton label={S.common.back} onClick={onBack ?? (() => navigate(-1))}>
        <IconArrowRight />
      </IconButton>
      <h1 className="min-w-0 flex-1 truncate font-serif text-xl">{title}</h1>
      {actions}
    </header>
  );
}

/**
 * Bottom sheet: closes on scrim tap, Escape, or dragging it down. Traps focus while open
 * and returns focus to where it was.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setDrag(0);
  }, [open]);

  if (!open) return null;

  // Drag to dismiss: follows the finger from the handle area, or anywhere when the content is not scrolled.
  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    const fromHandle = (e.target as HTMLElement).closest('[data-sheet-handle]');
    if (!el || (!fromHandle && el.scrollTop > 0) || e.pointerType === 'mouse') return;
    start.current = { y: e.clientY, t: Date.now() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onPointerEnd = () => {
    if (!start.current) return;
    const velocity = drag / Math.max(1, Date.now() - start.current.t);
    start.current = null;
    if (drag > 110 || velocity > 0.6) onClose();
    else setDrag(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="anim-fade-in absolute inset-0 bg-scrim"
        style={{ opacity: drag ? Math.max(0.2, 1 - drag / 400) : undefined }}
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: drag ? 'none' : 'transform 250ms var(--ease-app)',
          touchAction: drag ? 'none' : undefined,
        }}
        className="anim-sheet relative max-h-[85dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-[var(--radius-sheet)] bg-surface px-4 pt-2 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-lift outline-none"
      >
        <div data-sheet-handle className="-mx-4 flex h-6 cursor-grab items-center justify-center" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>
        {title && (
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-lg font-bold">{title}</h2>
            <IconButton label={S.common.close} onClick={onClose}>
              <IconClose />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function SheetItem({
  icon,
  label,
  hint,
  onClick,
  danger,
  selected,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-14 w-full items-center gap-4 rounded-xl px-3 py-2 text-start transition duration-150 active:scale-[0.99] active:bg-surface-2 ${
        danger ? 'text-primary' : 'text-ink'
      }`}
    >
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">{icon}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-medium">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
      {selected && <IconCheck size={20} className="text-primary" />}
    </button>
  );
}

/** Only for wide-reaching actions (deleting everything, replacing from a backup). Single deletes use undo. */
export function ConfirmSheet({
  open,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel}>
      <p className="px-1 pt-2 pb-6 text-lg">{message}</p>
      <div className="flex gap-3">
        <Button variant="primary" className="flex-1" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onCancel}>
          {S.common.cancel}
        </Button>
      </div>
    </Sheet>
  );
}

// --- Toasts ---------------------------------------------------------------

type ToastAction = { label: string; run: () => void };
type Toast = { id: number; text: string; action?: ToastAction; leaving?: boolean };
let toasts: Toast[] = [];
let nextToast = 1;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

/** A short message at the bottom; with an action (e.g. "ביטול") it stays 6 seconds. */
export function toast(text: string, action?: ToastAction, durationMs = action ? 6000 : 3200): void {
  const id = nextToast++;
  // One undo at a time: a new message replaces any waiting one.
  toasts = [...toasts.filter((t) => !t.action), { id, text, action }];
  emitToasts();
  setTimeout(() => dismissToast(id), durationMs);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="anim-fade-up pointer-events-auto flex min-h-12 max-w-md items-center gap-3 rounded-2xl bg-ink ps-4 pe-2 text-bg shadow-lift"
        >
          <span className="py-3 text-sm">{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
              className="min-h-12 shrink-0 rounded-xl px-3 font-bold text-bg active:scale-[0.97]"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  ...rest
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      {...rest}
      className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm whitespace-nowrap transition duration-150 active:scale-[0.97] ${
        active ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink active:bg-surface-2'
      } ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** Our own checkbox: 28px box in a 48px row target, olive when checked (done / have it). */
export function Checkbox({
  checked,
  onChange,
  label,
  children,
  className = '',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 ${className}`}>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span
        aria-hidden="true"
        className={`flex size-7 shrink-0 items-center justify-center rounded-xl border-2 transition duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary ${
          checked ? 'border-secondary bg-secondary text-on-secondary' : 'border-line bg-surface'
        }`}
      >
        {checked && <IconCheck size={18} />}
      </span>
      {children}
    </label>
  );
}

/** Our own on/off switch (olive when on). */
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span className="font-medium">{label}</span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-8 w-14 shrink-0 rounded-full bg-line transition duration-150 peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-primary after:absolute after:top-1 after:right-1 after:size-6 after:rounded-full after:bg-surface after:shadow-soft after:transition after:duration-150 peer-checked:after:-translate-x-6"
      />
    </label>
  );
}

/** A large icon in a soft primary circle (error and info screens). */
export function IconBadge({ children, tone = 'primary' }: { children: ReactNode; tone?: 'primary' | 'secondary' }) {
  return (
    <div
      className={`mx-auto flex size-24 items-center justify-center rounded-full ${
        tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-secondary/12 text-secondary'
      }`}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

/** The pot with rising steam: the house illustration for empty states. */
export function PotIllustration({ className = 'w-40' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={`mx-auto ${className}`} aria-hidden="true">
      <g fill="none" stroke="var(--c-muted)" strokeWidth="4" strokeLinecap="round" opacity="0.5">
        <path d="M80 40c-8-10 8-16 0-28" style={{ animation: 'steam 2.4s ease-in-out infinite' }} />
        <path d="M100 36c-8-10 8-16 0-28" style={{ animation: 'steam 2.4s ease-in-out 0.6s infinite' }} />
        <path d="M120 40c-8-10 8-16 0-28" style={{ animation: 'steam 2.4s ease-in-out 1.2s infinite' }} />
      </g>
      <ellipse cx="100" cy="132" rx="70" ry="8" fill="var(--c-border)" />
      <path d="M40 60h120l-10 62a10 10 0 0 1-10 8H60a10 10 0 0 1-10-8z" fill="var(--c-primary)" />
      <rect x="32" y="52" width="136" height="14" rx="7" fill="var(--c-primary-strong)" />
      <path d="M32 72h-12M168 72h12" stroke="var(--c-primary-strong)" strokeWidth="8" strokeLinecap="round" />
      <circle cx="100" cy="94" r="12" fill="var(--c-surface)" opacity="0.25" />
    </svg>
  );
}

/** Empty state: small illustration, title, one line of explanation and an action. */
export function EmptyState({
  title,
  text,
  action,
  illustration,
}: {
  title: string;
  text: string;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  return (
    <div className="anim-fade-up mx-auto flex max-w-sm flex-col items-center px-4 py-12 text-center">
      {illustration ?? <PotIllustration className="w-36" />}
      <h2 className="mt-4 font-serif text-xl">{title}</h2>
      <p className="mt-2 text-base text-muted">{text}</p>
      {action && <div className="mt-6 w-full">{action}</div>}
    </div>
  );
}

/** A shimmering placeholder block. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** Generic screen skeleton (header, title, a few rows): shown instead of a blank screen while loading. */
export function ScreenSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 pt-[calc(8px+env(safe-area-inset-top))]" aria-busy="true">
      <div className="flex min-h-16 items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-7 w-40 rounded-xl" />
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-card bg-surface p-4 shadow-soft">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-card bg-surface p-4 shadow-soft">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
