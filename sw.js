// 앱 화면 파일을 미리 받아 두고 저장본으로 바로 열어요. 새 버전은 이 파일의 SHELL 이름이 바뀌면 뒤에서 받아 두었다가 다음 실행 때 적용돼요.
// 구글 API 요청(가계부 데이터)은 캐시하지 않습니다.
const SHELL = 'alv-shell-v62';
const FILES = ['./', './index.html', './js/core.js', './js/views.js', './js/shell.js', './js/google.js', './js/sync.js', './js/editor.js', './js/ledger.js', './js/onboard.js', './js/native.js', './js/main.js', './theme-boot.js', './fonts/PretendardVariable.subset.woff2', './vendor/xlsx.full.min.js', './vendor/chart.umd.min.js', './vendor/capacitor.js', './manifest.webmanifest', './icon-180.png', './icon-512.png', './demo.xlsx', './demo2025.xlsx', './template.xlsx'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(SHELL).then(c => c.addAll(FILES.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting())));   // 브라우저 캐시를 건너뛰고 새로 받기
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('alv-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // 구글·로그인 서버 요청은 캐시하지 않음
  e.respondWith(caches.open(SHELL).then(c => c.match(e.request, {ignoreSearch: true}).then(hit => hit ||   // 저장본 먼저 (바로 열림)
    fetch(e.request).then(r => { if (r.ok && r.type === 'basic') c.put(e.request, r.clone()); return r; })
      .catch(() => c.match('./index.html')))));
});
