import { useEffect, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { S } from '../strings.he';
import { IconArrowRight, IconClose } from './Icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'olive';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary shadow-soft active:bg-primary-strong',
  olive: 'bg-secondary text-white shadow-soft dark:text-bg',
  secondary: 'bg-surface text-ink border border-line shadow-soft active:bg-surface-2',
  ghost: 'bg-transparent text-ink active:bg-surface-2',
  danger: 'bg-surface text-primary border border-primary/40 active:bg-surface-2',
};

export function Button({
  variant = 'primary',
  className = '',
  big,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-[transform,background-color] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
        big ? 'min-h-16 px-6 text-xl' : 'min-h-12 px-5 text-base'
      } ${VARIANTS[variant]} ${className}`}
    />
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
      className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full text-ink transition active:scale-95 active:bg-surface-2 disabled:opacity-40 ${className}`}
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
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-1 bg-bg/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <IconButton label={S.common.back} onClick={onBack ?? (() => navigate(-1))}>
        <IconArrowRight />
      </IconButton>
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{title}</h1>
      {actions}
    </header>
  );
}

/** Bottom sheet with backdrop; closes on backdrop tap or Escape. */
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="anim-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className="anim-sheet relative max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lift outline-none"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" />
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
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-4 rounded-2xl px-3 py-2 text-start transition active:bg-surface-2 ${
        danger ? 'text-primary' : 'text-ink'
      }`}
    >
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-primary/10' : 'bg-surface-2'}`}>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-base font-medium">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
    </button>
  );
}

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
      <p className="px-1 pt-2 pb-5 text-lg">{message}</p>
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

type Toast = { id: number; text: string };
let toasts: Toast[] = [];
let nextToast = 1;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(text: string): void {
  const id = nextToast++;
  toasts = [...toasts, { id, text }];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, 3200);
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
      className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex flex-col items-center gap-2 px-4"
    >
      {list.map((t) => (
        <div key={t.id} className="anim-fade-up rounded-full bg-ink px-5 py-3 text-center text-bg shadow-lift">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-[15px] whitespace-nowrap transition ${
        active ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink active:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}
