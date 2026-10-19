/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { db } from './db';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

const BASE = new URL(self.registration.scope).pathname; // e.g. "/" or "/recipe-notebook/"

self.skipWaiting();
clientsClaim();

// App shell + assets: everything the app needs to run offline.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation: every in-scope page loads the cached index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`), {
    denylist: [/\/share-target\/?$/],
  }),
);

// Anything else same-origin that was not precached (rare) is cached on first use.
registerRoute(
  ({ url, request }) => url.origin === self.location.origin && request.method === 'GET',
  new CacheFirst({
    cacheName: 'runtime',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 })],
  }),
);

// --- Web Share Target ------------------------------------------------------
// The manifest posts multipart/form-data here. We store it in IndexedDB and
// redirect to /share, where the app picks it up and starts processing.
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== `${BASE}share-target`) return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const str = (k: string) => {
          const v = form.get(k);
          return typeof v === 'string' && v.trim() ? v : undefined;
        };
        const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
        const id = crypto.randomUUID();
        await db.shares.put({
          id,
          title: str('title'),
          text: str('text'),
          url: str('url'),
          files,
          createdAt: Date.now(),
        });
        return Response.redirect(`${BASE}share?id=${id}`, 303);
      } catch {
        return Response.redirect(`${BASE}share`, 303);
      }
    })(),
  );
});

// --- Timer notifications ----------------------------------------------------
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? BASE;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = all.find((c) => new URL(c.url).pathname.startsWith(BASE));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
