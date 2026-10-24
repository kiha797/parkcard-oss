// 차주 기기에서 돌아가는 서비스 워커: 푸시를 받아 알림으로 띄우고, 누르면 응답 화면을 연다
// 앱(화면)이 열려 있으면 그 화면에도 알려서 딩동댕 소리를 내게 함
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const shown = self.registration.showNotification(d.title || '🚗 주차 연락이 왔어요', {
    body: d.body || '',
    tag: d.tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300],
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/' },
  });
  const tellPages = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      c.postMessage({ type: d.kind === 'reply' ? 'parkcard-reply' : 'parkcard-alert', title: d.title, message: d.message, url: d.url });
    }
  });
  e.waitUntil(Promise.all([shown, tellPages]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data.url, self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url === url && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
