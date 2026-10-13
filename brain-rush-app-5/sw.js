/* Brain Rush service worker: lets the game open and run without internet.
   The online leaderboard and accounts (Supabase) are never cached. */
const VERSION = 'brain-rush-v8';

const SHELL = [
  './',
  'index.html',
  'questions.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'favicon-48.png'
];

/* Libraries, icons and fonts the page loads from the internet. They are saved on first visit
   so the game still looks right offline. */
const EXTERNAL = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await Promise.all(EXTERNAL.map(async url => {
      try {
        const res = await fetch(url);
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* saved later, the next time it is loaded online */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Pages: try the internet first (so updates arrive), fall back to the saved copy */
async function pageRequest(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) ||
           (await cache.match('index.html')) ||
           (await cache.match('./')) ||
           Response.error();
  }
}

/* Everything else: show the saved copy straight away and refresh it in the background */
async function assetRequest(req) {
  const cache = await caches.open(VERSION);
  const saved = await cache.match(req);
  const update = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return saved || (await update) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  if (url.hostname.endsWith('.supabase.co')) return; // accounts and leaderboard always go to the internet

  if (req.mode === 'navigate') {
    event.respondWith(pageRequest(req));
    return;
  }
  event.respondWith(assetRequest(req));
});
