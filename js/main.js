// 시작
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 시작 ───────── */
applyTheme();
['token','authState','clientId','fileRef'].forEach(k => LS.del(k));   // 이전 로그인 방식 흔적 정리
if (!S.years){ const m = LS.get('model', null); S.years = m ? {[m.year]: m} : {}; LS.set('years', S.years); LS.del('model'); }
if (S.ob.step !== 'done' && (S.gfiles.length || (S.model && S.meta.source !== 'demo'))) { S.ob.step = 'done'; saveOb(); }   // 기존 사용자
setYear(S.year);
render();
if (S.meta.source === 'local') applyReps();
const gPending = gReturn();
if (gPending === 'pick') gPick();
else if (gPending && gPending.startsWith('create:')) gCreate(+gPending.slice(7));
const stale = () => S.gfiles.length && Date.now() - (S.meta.syncedAt || 0) > 60 * 1000;
if (S.queue.length) flushQueue(false);   // 지난번에 못 쓴 입력부터 저장
if (gPending === 'sync' && S.gfiles.length) syncGoogle(true);
else if (!gPending && S.gfiles.length && (S.meta.source !== 'file' && S.meta.source !== 'demo' || !S.model) && stale()) syncNow(false);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.meta.source === 'google' && stale()) syncNow(false);
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
