// Friends service worker. Network-first for the app's own files (always revalidated, so updates show on the next launch);
// the cached copy keeps the app opening offline. Firebase handles its own data caching.
const CACHE = 'friends-v1';
const TIMEOUT = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), TIMEOUT);
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
      clearTimeout(t);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      resolve(res);
    }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fromNetwork(req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(m => m || caches.match('./'))));
  } else if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    // fonts and the pinned Firebase SDK never change at a given URL
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});

// Push from the Friends sender (push/Code.gs via Firebase Cloud Messaging): shown even when the site is closed.
// FCM delivers { notification: { title, body }, data: { kind, cid, gid, sender } }
self.addEventListener('push', e => {
  let n = {}, d = {};
  try { const p = e.data.json(); n = p.notification || {}; d = p.data || {}; if (!p.notification && p.title) n = p; } catch (x) {}
  e.waitUntil((async () => {
    const call = d.kind === 'call', tag = d.cid || d.gid || d.kind || 'friends';
    // the site is open in front of the user: it shows its own banner (calls and tests still pop)
    const ws = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!call && d.kind !== 'test' && ws.some(w => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(n.title || 'Friends', {
      body: n.body || '', tag, renotify: true, requireInteraction: call, lang: 'he', dir: 'rtl',
      vibrate: call ? [600, 200, 600, 200, 600] : [200],
      icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', data: d
    });
  })());
});

// Tapping a notification opens the right chat or group
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) { w.postMessage({ type: 'open-push', data: d }); return w.focus(); }
    const q = d.cid ? '?pc=' + encodeURIComponent(d.cid) : d.gid ? '?pg=' + encodeURIComponent(d.gid) : '';
    return self.clients.openWindow('./app.html' + q);
  }));
});
