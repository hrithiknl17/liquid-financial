/*
 * Minimal offline shell. Vite fingerprints its assets, so instead of a
 * precache manifest this uses runtime caching:
 *   - navigations: network first, fall back to the cached shell when offline
 *   - same-origin assets: stale-while-revalidate
 * Bump CACHE_VERSION to evict old entries after a deploy.
 */
const CACHE_VERSION = 'liquid-v2';
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll([SHELL_URL, '/manifest.webmanifest', '/icon.svg']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/**
 * Share target: another app posts a bill here. Stash the file in a cache and
 * bounce the user into the app, which picks it up and opens the scanner.
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const form = await event.request.formData();
          const file = form.get('bill');
          if (file) {
            const cache = await caches.open('liquid-share');
            await cache.put('/shared-bill', new Response(file, { headers: { 'Content-Type': file.type } }));
          }
        } catch {
          // Fall through to the app either way.
        }
        return Response.redirect('/?share=1', 303);
      })()
    );
    return;
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(SHELL_URL, copy));
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  if (!sameOrigin && url.hostname !== 'fonts.googleapis.com' && url.hostname !== 'fonts.gstatic.com') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});

/* ===================== REMINDERS ===================== */

let reminderSettings = { enabled: false, morning: '08:00', evening: '20:30' };

self.addEventListener('message', (event) => {
  if (event.data?.type === 'reminder-settings') {
    reminderSettings = {
      enabled: Boolean(event.data.enabled),
      morning: event.data.morning ?? '08:00',
      evening: event.data.evening ?? '20:30',
    };
  }
});

/**
 * Chromium wakes us roughly twice a day when the app is installed. We can't
 * read the ledger from here, so the notification is a prompt, not a summary —
 * opening the app renders the real brief.
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'liquid-daily-nudge') return;
  if (!reminderSettings.enabled) return;

  const hour = new Date().getHours();
  const evening = hour >= 17;

  event.waitUntil(
    self.registration.showNotification(evening ? 'How did today go?' : 'Your morning brief', {
      body: evening
        ? 'Log what you spent before you forget. Ten seconds.'
        : 'Yesterday’s spend, safe-to-spend today, and what renews soon.',
      tag: evening ? 'brief-evening' : 'brief-morning',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
