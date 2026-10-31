/* FAROS only handles push here. It never caches account or API responses. */
const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('faros-alerts', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('meta');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function account(value, write = false) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('meta', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('meta');
      const request = write ? store.put(value, 'account') : store.get('account');
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'FAROS_ACCOUNT') return;
  if (event.source?.url && new URL(event.source.url).origin !== self.location.origin) return;
  const userId = typeof event.data.userId === 'string' ? event.data.userId : null;
  event.waitUntil((async () => {
    await account(userId, true);
    if (!userId) for (const notification of await self.registration.getNotifications()) notification.close();
    event.ports[0]?.postMessage({ ok: true });
  })());
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || !payload.userId || payload.userId !== await account() || typeof payload.title !== 'string') return;
    let target;
    try { target = new URL(payload.url || '/', self.location.origin); } catch { target = new URL('/', self.location.origin); }
    const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
    await self.registration.showNotification(payload.title.slice(0, 140), {
      body: typeof payload.body === 'string' ? payload.body.slice(0, 240) : '',
      tag: String(payload.tag || payload.id || 'faros').slice(0, 128),
      renotify: false,
      icon: '/icons/faros-192.png',
      badge: '/icons/faros-192.png',
      data: { url, userId: payload.userId }
    });
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) client.postMessage({ type: 'FAROS_NOTIFICATION' });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    if (event.notification.data?.userId !== await account()) return;
    const target = new URL(event.notification.data?.url || '/', self.location.origin);
    if (target.origin !== self.location.origin) return;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target.href); return existing.focus(); }
    return self.clients.openWindow(target.href);
  })());
});
