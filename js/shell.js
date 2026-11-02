// 라우팅 · 테마 · 설정 탭 · 데이터 반영
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 라우팅 ───────── */
const TITLES = {home:'홈', budget:'가계부', asset:'자산', analysis:'목표', settings:'설정'};
const TAB_USE = {budget: 'ledger', asset: 'asset', analysis: 'asset'};
const tabOn = t => !TAB_USE[t] || S.use[TAB_USE[t]];
const isYearView = () => S.tab === 'budget' && effView() === 'rep' && S.rview === 'y';   // 가계부 › 리포트 › 올해 (예전 월별추이)
function render(){
  ghostClear(); killCharts();
  renderHead();
  if (S.tab === 'settings'){ syncSheet(); sPage(S.spage || 'main'); return; }
  if (!S.model) return emptyMonth(null, '');
  ({home:viewHome, budget:viewBudget, asset:viewAsset, analysis:viewAnalysis})[S.tab]();
}
function renderHead(){
  if (!tabOn(S.tab)) S.tab = 'home';
  document.body.classList.remove('onboarding');
  document.querySelectorAll('nav.tabs button').forEach(b => b.hidden = !tabOn(b.dataset.tab));
  document.body.classList.toggle('tab-settings', S.tab === 'settings');
  $('#title').innerHTML = TITLES[S.tab] + (S.meta.source==='demo' ? '<span class="demo-badge">예시</span>' : '');
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab===S.tab));
  const key = S.tab==='asset' ? 'asset' : 'budget';
  const step = $('#stepper'); step.style.display = (S.model && ['budget', 'asset'].includes(S.tab)) ? 'flex' : 'none';
  if (S.model){
    const fn = key==='asset' ? aMonth : bMonth;
    const now = new Date();
    if (S.month[key]==null) S.month[key] = S.year === now.getFullYear() && canEdit() && (key === 'asset' || S.model.txMode) ? now.getMonth() + 1 : lastWith(fn);   // 올해는 이번 달부터
    const trend = isYearView();
    $('#prevM').disabled = !canShift(-1); $('#nextM').disabled = !canShift(1);
    $('#ymLabel').textContent = trend ? `${S.year}년` : `${S.year}년 ${S.month[key]}월`;
    $('#prevM').setAttribute('aria-label', trend ? '이전 연도' : '이전 달'); $('#nextM').setAttribute('aria-label', trend ? '다음 연도' : '다음 달');
  }
  updateStatus();
}
function go(tab){ if (!tabOn(tab)) tab = 'home'; if ($('#ed').classList.contains('on')) closeEd(); if (tab !== 'settings'){ S.spage = 'main'; hPop(); } S.tab = tab; LS.set('tab', tab); window.scrollTo(0,0); render(); }
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'settings' && S.tab === 'settings'){ syncSheet(); sPage('main', true); return; } go(b.dataset.tab); });
const yearsList = () => Object.keys(S.years || {}).map(Number).sort((a,b) => b-a);
const adjYear = n => { const asc = [...yearsList()].reverse(), i = asc.indexOf(S.year); return asc[i+n] ?? null; };
function defaultYear(){ const ys = yearsList(), cy = new Date().getFullYear(); return ys.includes(cy) ? cy : ys[0]; }
function setYear(y){
  const ys = yearsList();
  if (!ys.length){ S.year = null; S.model = null; return; }
  if (!ys.includes(y)) y = defaultYear();
  if (y !== S.year) S.month = {budget:null, asset:null};
  S.year = y; S.model = S.years[y]; LS.set('year', y);
}
function canShift(n){
  if (isYearView()) return adjYear(n) != null;
  const key = S.tab==='asset'?'asset':'budget', m = S.month[key] + n;
  return (m >= 1 && m <= 12) || adjYear(n) != null;
}
function stepState(n){
  if (isYearView()) return setYear(adjYear(n));
  const key = S.tab==='asset'?'asset':'budget', m = S.month[key] + n;
  if (m < 1 || m > 12){ setYear(adjYear(n)); S.month[key] = m < 1 ? 12 : 1; }   // 연도 넘어가기
  else S.month[key] = m;
}
function shift(n){
  if (!S.model || !canShift(n)) return;
  stepState(n); render();
}
// 월 넘김: 아이폰처럼 옆 달 화면이 미리 붙어 있다가 손가락을 따라 함께 움직여요 (위쪽 탭 버튼은 고정)
// 옆 달 화면(GH)은 #view 바로 앞에 따로 그려 두고, 넘기면 그 화면을 그대로 #view로 옮겨요 → 다시 그리지 않아서 깜빡임이 없어요
const vw = () => document.documentElement.clientWidth;
const RMOT = window.matchMedia('(prefers-reduced-motion: reduce)');
const GH = {el: null, n: 0, st: null};
const dropCharts = keep => { for (let i = charts.length - 1; i >= 0; i--) if (!keep(charts[i])){ charts[i].destroy(); charts.splice(i, 1); } };
function ghostClear(){
  if (!GH.el) return;
  const g = GH.el; dropCharts(c => !g.contains(c.canvas));
  GH.el.remove(); GH.el = null; GH.n = 0;
}
function ghostBuild(n){
  if (GH.el && GH.n === n) return GH.el;
  ghostClear();
  const view = $('#view'), snap = {year: S.year, model: S.model, month: {...S.month}, sel: S.sel};
  const el = document.createElement('main'); el.className = 'vghost'; el.setAttribute('aria-hidden', 'true'); el.inert = true;
  view.before(el);   // 앞에 둬야 같은 id의 차트 캔버스를 이쪽에서 먼저 찾아요
  stepState(n); S.ghost = true; view.id = 'viewCur'; el.id = 'view';
  try { ({budget: viewBudget, asset: viewAsset})[S.tab](); } catch (e){ console.error(e); }
  el.id = ''; view.id = 'view'; S.ghost = false;
  GH.st = {year: S.year, month: {...S.month}};
  S.year = snap.year; S.model = snap.model; S.month = snap.month; S.sel = snap.sel; LS.set('year', snap.year);
  el.style.top = (view.getBoundingClientRect().top + scrollY) + 'px';
  GH.el = el; GH.n = n;
  return el;
}
function ghostAdopt(){
  const el = GH.el, view = $('#view');
  dropCharts(c => el.contains(c.canvas));
  S.year = GH.st.year; S.model = S.years[S.year]; S.month = GH.st.month; LS.set('year', S.year);
  view.replaceChildren(...el.childNodes); el.remove(); GH.el = null; GH.n = 0;
  renderHead();
  if (S.tab === 'budget' && effView() === 'bud') setTimeout(() => budCarry(S.year, S.month.budget), 0);
}
const curEls = () => [...$('#view').children].filter(el => !el.matches('.bseg,.rseg'));
const tx = (el, x, tr) => { el.style.transition = tr || 'none'; el.style.transform = x ? `translate3d(${x}px,0,0)` : ''; };
let sliding = false;
function dragTo(n, dx, els){   // n: 넘어갈 방향(1 다음 달, -1 이전 달), dx: 손가락 이동
  if (!canShift(n)){ ghostClear(); els.forEach(e => tx(e, dx * .25)); return; }   // 더 갈 달이 없으면 고무줄처럼
  const g = ghostBuild(n); els.forEach(e => tx(e, dx)); tx(g, n * vw() + dx);
}
function slideTo(n, fromX = 0, els = curEls()){
  if (!S.model || !canShift(n) || sliding) return;
  if (RMOT.matches){ els.forEach(e => tx(e, 0)); return shift(n); }
  sliding = true;
  const g = ghostBuild(n), W = vw(), ms = fromX ? 300 : 360, ease = `transform ${ms}ms cubic-bezier(.25,.85,.3,1)`;
  els.forEach(e => tx(e, fromX)); tx(g, n * W + fromX); void g.offsetWidth;
  els.forEach(e => tx(e, -n * W, ease)); tx(g, 0, ease);
  setTimeout(() => { ghostAdopt(); [...$('#view').children].forEach(e => tx(e, 0)); sliding = false; }, ms + 20);
}
function slideBack(els, n){
  sliding = true; const ease = 'transform 280ms cubic-bezier(.25,.85,.3,1)';
  els.forEach(e => tx(e, 0, ease)); if (GH.el) tx(GH.el, n * vw(), ease);
  setTimeout(() => { els.forEach(e => tx(e, 0)); ghostClear(); sliding = false; }, 300);
}
$('#prevM').onclick = () => slideTo(-1); $('#nextM').onclick = () => slideTo(1);
// 좌우 스와이프로 월 이동
(() => { let x0 = null, y0 = 0, t0 = 0, dx = 0, lock = '', els = [];
  const on = () => S.model && (S.tab === 'budget' || S.tab === 'asset') && !$('#ed').classList.contains('on') && !sliding;
  document.addEventListener('touchstart', e => { x0 = null;
    if (e.touches.length > 1 || !on() || e.target.closest('canvas,.sheet,select,input,textarea,.swrap,#ed')) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); dx = 0; lock = ''; }, {passive: true});
  document.addEventListener('touchmove', e => { if (x0 == null) return;
    dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
    if (!lock){ if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; if (lock === 'x') els = curEls(); }
    if (lock !== 'x') return;
    if (e.cancelable) e.preventDefault();
    dragTo(dx < 0 ? 1 : -1, dx, els);
  }, {passive: false});
  const end = () => { if (x0 == null) return; x0 = null; if (lock !== 'x') return;
    const n = dx < 0 ? 1 : -1, v = Math.abs(dx) / Math.max(1, Date.now() - t0);
    if (canShift(n) && (Math.abs(dx) > vw() * .3 || (v > .45 && Math.abs(dx) > 30))) slideTo(n, dx, els);
    else slideBack(els, n);
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();

/* ───────── 테마 ───────── */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  const t = S.theme==='system' ? (mq.matches?'dark':'light') : S.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t==='dark' ? '#0E1013' : '#F1F1EE';
  document.documentElement.style.backgroundColor = t==='dark' ? '#15171B' : '#F9F9F6'; document.documentElement.style.colorScheme = t;
  if (NATIVE) nativePlugin('SystemBars')?.setStyle({style: t==='dark' ? 'DARK' : 'LIGHT'}).catch(() => {});   // 앱: 상단 시계·배터리 글자색
}
mq.addEventListener?.('change', () => { if (S.theme==='system'){ applyTheme(); render(); } });

/* ───────── 설정 시트 ───────── */
function seg(id, val, cb){ const el = $(id); el.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v===val); b.onclick = () => cb(b.dataset.v); }); }
function goalFields(){   // 설정 › 목표: 목록 → 항목별 화면 (바꾸면 바로 저장)
  const g = S.goal, pts = S.model ? assetPoints() : [], first = pts[0], cur = pts.at(-1);
  const f = (v, d = 2) => +(+v).toFixed(d), setv = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
  const div = g.divRate ?? 0.04;
  $('#svGoal').textContent = `${f(g.target / 1e8)}억 · 연 ${f(g.planRate * 100)}%`;
  $('#gvTarget').textContent = `${f(g.target / 1e8)}억`; $('#gvRate').textContent = `${f(g.planRate * 100)}%`;
  $('#gvSave').textContent = money(g.planSave); $('#gvYear').textContent = `${g.planYear}년`;
  $('#gvBase').textContent = g.planBase == null ? '자동' : money(g.planBase); $('#gvDiv').textContent = `${f(div * 100)}%`;
  setv('#gTarget', f(g.target / 1e8)); setv('#gRate', f(g.planRate * 100)); setv('#gSave', f(g.planSave / 1e4, 0)); setv('#gDiv', f(div * 100));
  setv('#gBase', g.planBase == null ? (first ? Math.round(first.net / 1e4) : '') : f(g.planBase / 1e4, 0));
  $('#gnTarget').textContent = cur ? `지금 순자산 ${money(cur.net)} · ${pctPlain(Math.max(0, cur.net / g.target), 0)}` : '';
  const inp = pts.length >= 2 ? analysisInputs(pts) : null;
  $('#gnRate').textContent = '저축을 뺀 1년 수익률이에요.' + (inp?.rateMonths ? ` 내 실제 수익률은 ${pct(inp.rate, 1).replace('+', '')}예요 (${inp.rateMonths}개월)` : '');
  $('#gnSave').textContent = '1년 동안 모을 금액이에요';
  $('#gnDiv').textContent = '배당소득세 15.4%를 뗀 금액으로 계산해요';
  const ys = [...new Set([...yearsList(), new Date().getFullYear(), g.planYear])].sort((a, b) => a - b);
  $('#gYearList').innerHTML = ys.map(y => `<button class="srow${y === g.planYear ? ' on' : ''}" data-y="${y}"><span>${y}년</span><b class="chk">✓</b></button>`).join('');
  $('#gYearList').querySelectorAll('[data-y]').forEach(b => b.onclick = () => goalSet('planYear', +b.dataset.y));
  $('#gbAutoV').textContent = first ? `첫 기록 ${first.y}년 ${first.m}월 · ${money(first.net)}` : '첫 기록';
  $('#gbAuto').classList.toggle('on', g.planBase == null); $('#gbDirect').classList.toggle('on', g.planBase != null); $('#gbWrap').hidden = g.planBase == null;
}
function goalSet(k, v){ S.goal = {...S.goal, [k]: v}; LS.set('goal', S.goal); S.sim = null; goalFields(); }
(() => {
  const num = el => { const v = el.value.trim(); return v === '' || !isFinite(+v) ? null : +v; };
  const bind = (id, k, conv, ok = v => v != null) => { $(id).oninput = e => { const v = num(e.target); if (ok(v)) goalSet(k, conv(v)); }; $(id).onblur = () => goalFields(); };
  bind('#gTarget', 'target', v => v * 1e8, v => v > 0);
  bind('#gRate', 'planRate', v => v / 100);
  bind('#gSave', 'planSave', v => v * 1e4);
  bind('#gDiv', 'divRate', v => v / 100);
  bind('#gBase', 'planBase', v => v * 1e4);
  $('#gbAuto').onclick = () => goalSet('planBase', null);
  $('#gbDirect').onclick = () => { if (S.goal.planBase != null) return; const p = S.model ? assetPoints()[0] : null; goalSet('planBase', p ? Math.round(p.net / 1e4) * 1e4 : 0); };
})();
function syncSheet(){
  goalFields();
  seg('#segTheme', S.theme, v => { S.theme=v; LS.set('theme',v); applyTheme(); syncSheet(); render(); });
  seg('#segUnit', S.unit, v => { S.unit=v; LS.set('unit',v); syncSheet(); render(); });
  for (const k of ['ledger', 'asset']) $('#use-' + k).setAttribute('aria-checked', S.use[k]);
  $('#sGoalSec').hidden = !S.use.asset;
  $('#svUse').textContent = [S.use.ledger && '가계부', S.use.asset && '자산'].filter(Boolean).join(' · ');
  const ys = yearsList().slice().reverse().join(', '), src = S.meta.source, g = S.goal;
  $('#svData').textContent = !S.model ? '없음' : src === 'google' ? `구글 시트 · ${ys}년` : src === 'local' ? `이 기기에 저장 · ${ys}년` : src === 'file' ? `기기 파일 · ${ys}년` : `예시 데이터 · ${ys}년`;
  $('#btnAddYear').hidden = src !== 'local'; $('#btnExport').hidden = !S.model || src === 'demo';
  $('#btnExport').querySelector('span').textContent = src === 'google' && S.gfiles.length ? '엑셀로 내보내기' : '백업 파일 만들기'; $('#btnSync').hidden = src !== 'google';
  $('#svSync').textContent = S.meta.syncedAt ? fmtTime(S.meta.syncedAt) : '';
  renderG();
  $('#svGoogle').textContent = S.guser || (S.gfiles.length ? '로그인 필요' : '연결 안 됨');
  $('#svView').textContent = `${{system: '시스템', light: '라이트', dark: '다크'}[S.theme] || '시스템'} · ${S.unit === 'full' ? '원 단위' : '억·만원'}`;
  appVersion().then(v => { $('#sVer').textContent = v; $('#sVerRow').hidden = !v || v === '-'; });
  syncNativeSheet();
}
// 앱 버전 = sw.js의 SHELL 이름 끝 (예: alv-shell-v40 → v40). 버전은 sw.js 한 곳에서만 올려요
const appVersion = () => window.ALV_APP_VERSION ? Promise.resolve(window.ALV_APP_VERSION) : (window.caches ? caches.keys() : Promise.resolve([])).then(ks => (ks.find(k => /^alv-shell-v\d+$/.test(k)) || '').replace('alv-shell-', '') || '-').catch(() => '-');
function sPage(key, back){   // 설정 두 단계: main(목록) ↔ 상세
  S.spage = key; if (key === 'noti' && NATIVE){ notiAsked = false; notiSoon(); } if (key !== 'main') hPush(); else if (!$('#ed').classList.contains('on')) hPop();
  $('#sheet').querySelectorAll('.spage').forEach(p => { const on = p.dataset.page === key; p.classList.toggle('on', on); p.classList.toggle('back', on && !!back); });
  window.scrollTo(0, 0);
}
function openSheet(page = 'main'){ S.spage = page; go('settings'); }
$('#sheet').addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g){ if (g.classList.contains('sback')) return goBack(); syncSheet(); sPage(g.dataset.go); return; }
});
for (const k of ['ledger', 'asset']) $('#use-' + k).onclick = () => {
  const other = k === 'ledger' ? 'asset' : 'ledger';
  if (S.use[k] && !S.use[other]) return toast('하나는 켜 두어야 해요');
  S.use[k] = !S.use[k]; LS.set('use', S.use); haptic('light');
  syncSheet(); renderHead(); notiSoon();
};
function closeSheet(){ if (S.tab === 'settings') go('home'); }
$('#setBtn').onclick = () => openSheet();
$('#btnSync').onclick = () => syncNow(true);
$('#btnDemo').onclick = async () => { if (S.meta.source === 'local' && !(await ask('이 기기에 저장된 데이터가 화면에서 사라져요.\n먼저 엑셀로 내보내기를 권해요.', {title: '예시 데이터로 바꿀까요?', ok: '바꾸기'}))) return; closeSheet(); loadDemo(); };
$('#btnExport').onclick = () => exportAll();
$('#btnAddYear').onclick = () => addLocalYear();
$('#btnRestart').onclick = async () => { if (S.meta.source !== 'local' && !(await ask('연결한 구글 시트는 그대로 남아요.', {title: '처음 화면으로 돌아갈까요?', ok: '처음으로'}))) return; restartOb(); };
$('#btnFile').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = async e => { const f = e.target.files[0]; if (!f) return; closeSheet();
  try { const md = parseWorkbook(await f.arrayBuffer());
    if (S.meta.source === 'google' && !(await ask('구글 시트 연결은 유지돼요.', {title: '이 파일을 이 기기에 저장해서 쓸까요?', ok: '이 파일 쓰기'}))) { e.target.value=''; return; }
    if (S.meta.source === 'local' && S.years[md.year] && !(await ask('', {title: `이 기기의 ${md.year}년 데이터를 이 파일 내용으로 바꿀까요?`, ok: '바꾸기', danger: true}))) { e.target.value=''; return; }
    const ys = S.meta.source === 'local' ? {...S.years} : {}; ys[md.year] = md;   // 이 기기 저장 데이터에 연도별로 합침
    finishOb(); setYears(ys, {source:'local', name:f.name}); setYear(md.year); render(); toast(`${md.year}년 파일을 불러왔어요. 이제 앱에서 입력할 수 있어요`); }
  catch(err){ toast('파일을 읽지 못했어요: ' + err.message); } e.target.value=''; };
$('#syncBtn').onclick = () => S.gfiles.length ? syncNow(true) : openSheet('google');

/* ───────── 데이터 반영 ───────── */
function setYears(years, meta, keepView){
  const y = S.year, keep = {...S.month};
  if (meta.source === 'google' && S.queue?.length) reapplyQueue(years);   // 아직 시트에 못 쓴 입력은 유지
  S.years = years; S.meta = {...meta, syncedAt: Date.now()};
  LS.set('years', years); LS.set('meta', S.meta);
  S.year = null; setYear(keepView && years[y] ? y : defaultYear());
  if (keepView && S.year === y) S.month = keep;
  render();
}
async function loadDemo(){
  try {
    const ys = {};
    for (const f of ['demo2025.xlsx', 'demo.xlsx']){ const r = await fetch(f); if (!r.ok) throw new Error(r.status); const md = parseWorkbook(await r.arrayBuffer()); ys[md.year] = md; }
    setYears(ys, {source:'demo'}); toast('예시 데이터를 불러왔어요 (2025 · 2026년)');
  } catch(e){ toast('예시 파일을 불러오지 못했어요'); }
}
const fmtTime = t => { const d = new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
function updateStatus(){
  const q = S.queue?.length || 0;
  if (q && S.model){ const bad = S.queue.some(o => o.err);
    $('#status').innerHTML = `<button class="pend${bad ? ' bad' : ''}" data-act="pending">${flushing ? '저장 중…' : !navigator.onLine ? '오프라인 · 대기 ' + q + '건' : bad ? '저장 안 됨 ' + q + '건' : '저장 대기 ' + q + '건'}</button>`; return; }
  if (S.model && S.meta.source === 'demo'){ $('#status').innerHTML = '<button class="slink" data-act="obRestart">내 데이터로 시작</button>'; return; }
  $('#status').textContent = !S.model ? '' : S.meta.source==='google' ? `업데이트 ${fmtTime(S.meta.syncedAt)}` : S.meta.source==='local' ? '이 기기에 저장' : `기기 파일 · ${fmtTime(S.meta.syncedAt)}`;
}
let toastT; function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'), 2600); }

