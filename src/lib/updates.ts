import { registerSW } from 'virtual:pwa-register';

// Automatic app updates.
// The service worker installs a new version in the background and waits. The app checks for
// a new version whenever it is opened or comes back to the foreground (and every 30 minutes),
// and switches as soon as the user is on a screen where a reload loses nothing.

const CHECK_EVERY_MS = 30 * 60 * 1000;
const UPDATED_FLAG = 'rn-just-updated';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let pending = false;
let registration: ServiceWorkerRegistration | undefined;
let currentPath = typeof location !== 'undefined' ? location.pathname : '/';
const blockers = new Set<string>();

/** Something on screen must not be interrupted (e.g. a ringing timer, whose sound would stop after a reload). */
export function setUpdateBlocked(reason: string, blocked: boolean): void {
  if (blocked) blockers.add(reason);
  else blockers.delete(reason);
  maybeApply();
}

/** Screens where reloading could interrupt something: AI processing, editing, adding, cooking, receiving a share. */
export function isBusyPath(path: string): boolean {
  return /\/(process|edit|add|cook|done|share)(\/|$)/.test(path);
}

function maybeApply() {
  if (!pending || !applyUpdate || blockers.size > 0 || isBusyPath(currentPath)) return;
  pending = false;
  try {
    sessionStorage.setItem(UPDATED_FLAG, '1');
  } catch {
    // ignore
  }
  // Reload ourselves once the new worker controls the page; the plugin's own reload
  // does not fire reliably. The timeout covers a missed controllerchange event.
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  setTimeout(reload, 3000);
  void applyUpdate(true); // tells the waiting worker to take over
}

/** Called by the router on every navigation, so a waiting update applies on the next safe screen. */
export function notifyRoute(path: string): void {
  currentPath = path;
  maybeApply();
}

/** Asks the server for a newer version. Resolves to true if one was found (installing or ready). */
export async function checkForUpdate(): Promise<boolean> {
  if (!navigator.onLine || !registration) return false;
  await registration.update().catch(() => {});
  return pending || !!registration.installing || !!registration.waiting;
}

export function hasPendingUpdate(): boolean {
  return pending;
}

/** True once, right after the app reloaded into a new version. */
export function consumeJustUpdated(): boolean {
  try {
    if (sessionStorage.getItem(UPDATED_FLAG)) {
      sessionStorage.removeItem(UPDATED_FLAG);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function initUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      maybeApply();
    },
    onRegisteredSW(_url, r) {
      registration = r;
      if (!r) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
      setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
    },
  });

  // A screen that loads after a deploy may ask for an old file that no longer exists; reload once.
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    // Guard against a reload loop if the file is really missing.
    const last = Number(sessionStorage.getItem('rn-preload-reload') ?? 0);
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem('rn-preload-reload', String(Date.now()));
      location.reload();
    }
  });
}
