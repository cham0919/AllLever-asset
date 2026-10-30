// 앱 화면만 캐시합니다. 구글 API 요청(가계부 데이터)은 캐시하지 않습니다.
const SHELL = 'shell-v14';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png', './demo.xlsx', './demo2025.xlsx'];
self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== 'cdn-v1').map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.hostname.endsWith('googleapis.com') || u.hostname.endsWith('google.com')) return;
  if (u.hostname === 'cdnjs.cloudflare.com') {   // 라이브러리: 캐시 우선
    e.respondWith(caches.open('cdn-v1').then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (u.origin === location.origin) {            // 앱 파일: 네트워크 우선, 오프라인이면 캐시
    e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(SHELL).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('./index.html'))));
  }
});
