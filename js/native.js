// 확인창(웹·앱 공통)과 아이폰·안드로이드 앱 전용 기능: 앱 잠금, 알림, 진동, 링크·내보내기
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)

/* ───────── 확인창: 브라우저 기본 confirm·prompt 대신 앱 화면 ───────── */
function dialog({msg = '', title = '', ok = '확인', cancel = '취소', danger = false, input = null}){
  return new Promise(done => {
    const prev = document.activeElement, el = document.createElement('div');
    el.className = 'dlg-bg'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="dlg">${title ? `<b class="dlg-t">${esc(title)}</b>` : ''}${msg ? `<p class="dlg-m">${esc(msg).replace(/\n/g, '<br>')}</p>` : ''}
      ${input ? `<input class="dlg-i" maxlength="${input.max || 30}" inputmode="${input.mode || 'text'}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value ?? '')}">` : ''}
      <div class="dlg-b">${cancel ? `<button class="dlg-c">${esc(cancel)}</button>` : ''}<button class="dlg-o${danger ? ' danger' : ''}">${esc(ok)}</button></div></div>`;
    document.body.append(el);
    const inp = el.querySelector('.dlg-i');
    const end = v => { el.classList.add('out'); setTimeout(() => el.remove(), 160); document.removeEventListener('keydown', key, true); prev?.focus?.(); done(v); };
    const key = e => { if (e.key === 'Escape'){ e.preventDefault(); end(input ? null : false); } else if (e.key === 'Enter' && (inp || !e.target.closest('.dlg-c'))){ e.preventDefault(); el.querySelector('.dlg-o').click(); } };
    document.addEventListener('keydown', key, true);
    el.querySelector('.dlg-o').onclick = () => end(input ? inp.value : true);
    const c = el.querySelector('.dlg-c'); if (c) c.onclick = () => end(input ? null : false);
    el.onclick = e => { if (e.target === el) end(input ? null : false); };
    requestAnimationFrame(() => { el.classList.add('on'); (inp || el.querySelector('.dlg-o')).focus(); if (inp) inp.select(); });
  });
}
const ask = (msg, opt = {}) => dialog({msg, ...opt});
const askText = (title, opt = {}) => dialog({title, msg: opt.msg || '', ok: opt.ok || '확인', input: {value: opt.value, placeholder: opt.placeholder, mode: opt.mode, max: opt.max}});

/* ───────── 진동 (앱에서만) ───────── */
function haptic(kind = 'light'){
  if (!NATIVE) return;
  const H = nativePlugin('Haptics'); if (!H) return;
  (kind === 'warn' ? H.notification({type: 'WARNING'}) : H.impact({style: kind === 'medium' ? 'MEDIUM' : 'LIGHT'})).catch(() => {});
}

/* ───────── 앱에서 다른 화면을 잠깐 열 때 (로그인 창·공유·파일 고르기·링크) 잠금이 걸리지 않게 ───────── */
let lockHold = 0;
async function holdLock(fn){ lockHold++; try { return await fn(); } finally { setTimeout(() => { lockHold = Math.max(0, lockHold - 1); }, 1500); } }

/* ───────── 링크: 앱에서는 앱 안 브라우저 창으로 ───────── */
const WEB_BASE = 'https://cham0919.github.io/AllLever-asset/';   // 앱 안의 페이지(개인정보 처리방침 등)는 웹 주소로 열어요
function openExternal(url){
  let u; try { u = new URL(url, location.href); } catch(e){ return; }
  if (u.origin === location.origin) u = new URL(u.pathname.replace(/^\//, '') + u.search + u.hash, WEB_BASE);
  if (!/^https?:$/.test(u.protocol)) return;
  holdLock(() => nativePlugin('Browser').open({url: u.href, presentationStyle: 'popover'})).catch(() => toast('링크를 열지 못했어요'));
}
if (NATIVE) document.addEventListener('click', e => {
  const a = e.target.closest('a[href]'); if (!a) return;
  const href = a.getAttribute('href'); if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
  if (a.target === '_blank' || /^https?:/i.test(href)){ e.preventDefault(); openExternal(a.href); }
}, true);

/* ───────── 엑셀 파일 내보내기: 웹은 다운로드, 앱은 공유 창(파일 앱 저장·메시지·메일) ───────── */
const b64Of = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function saveFiles(list){   // list: [{name, wb}] (앱에서 만든 엑셀) 또는 [{name, buf}] (받은 파일 그대로)
  if (!NATIVE){
    list.forEach(({name, wb, buf}, i) => setTimeout(() => {
      if (wb) return XLSX.writeFile(wb, name);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], {type: MIME_XLSX})); a.download = name;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, i * 400));
    return true;
  }
  const FS = nativePlugin('Filesystem'), Share = nativePlugin('Share'), files = [];
  for (const {name, wb, buf} of list){
    const r = await FS.writeFile({path: name, data: wb ? XLSX.write(wb, {type: 'base64', bookType: 'xlsx'}) : b64Of(buf), directory: 'CACHE'});
    files.push(r.uri);
  }
  try { await holdLock(() => Share.share({title: '머니머슬', files})); return true; }
  catch(e){ return false; }   // 공유 창을 닫은 경우
}

/* ───────── 앱 잠금 (Face ID·Touch ID·지문·기기 암호) ───────── */
const lockCfg = () => Object.assign({on: false, delay: 0}, LS.get('lock', {}));
let bgAt = 0, unlocking = false;
const lockName = () => ({faceID: 'Face ID', touchID: 'Touch ID', opticID: 'Optic ID'})[S.bioType] || (window.Capacitor?.getPlatform?.() === 'android' ? '지문·얼굴 인식' : '기기 암호');
function setLocked(on){ document.documentElement.classList.toggle('locked', on); }
async function unlock(){
  if (unlocking) return; unlocking = true;
  try {
    const boot = window.__bootUnlock; window.__bootUnlock = null;   // 시작할 때 이미 띄운 Face ID 결과가 있으면 그걸로
    if (boot){ const r = await boot; if (!r.ok) throw Object.assign(new Error('잠금 해제 실패'), {code: r.code}); }
    else await nativePlugin('Biometric').authenticate({reason: '머니머슬 잠금 해제'});
    setLocked(false);
  } catch(e){
    if (e.code === 'unavailable'){   // 기기 암호를 꺼서 확인할 방법이 없으면 잠금을 풀고 꺼요
      LS.set('lock', {...lockCfg(), on: false}); setPrivacy(false); setLocked(false); toast('기기 암호가 꺼져 있어 앱 잠금을 껐어요');
    }   // 취소·실패: 잠금 화면에 남아요 ("잠금 해제" 버튼으로 다시)
  } finally { unlocking = false; }
}
function setPrivacy(on){ nativePlugin('Biometric')?.setPrivacy({on}).catch(() => {}); }
async function lockToggle(){
  const c = lockCfg();
  if (c.on){ LS.set('lock', {...c, on: false}); setPrivacy(false); haptic(); return syncSheet(); }
  let st = {}; try { st = await nativePlugin('Biometric').check(); } catch(e){}
  if (!st.available) return ask('이 기기에 화면 잠금(Face ID·지문·암호)이 설정돼 있지 않아요. 기기 설정에서 먼저 켜 주세요.', {cancel: ''});
  try { await nativePlugin('Biometric').authenticate({reason: '앱 잠금을 켜려면 확인해 주세요'}); }
  catch(e){ return; }
  LS.set('lock', {...c, on: true}); setPrivacy(true); haptic(); syncSheet(); toast('앱 잠금을 켰어요');
}
function lockInit(){
  const App = nativePlugin('App');
  nativePlugin('Biometric').check().then(r => { S.bioType = r.type; syncSheet(); }).catch(() => {});
  setPrivacy(lockCfg().on);
  if (lockCfg().on) unlock(); else setLocked(false);
  $('#lockBtn').onclick = () => unlock();
  App.addListener('pause', () => {   // 다른 앱으로 갔을 때
    if (lockHold || !lockCfg().on) return;
    bgAt = Date.now(); if (!lockCfg().delay) setLocked(true);
  });
  App.addListener('resume', () => {   // 돌아왔을 때
    notiSoon();
    if (lockHold || !lockCfg().on || !bgAt) return;
    const away = Date.now() - bgAt; bgAt = 0;
    if (away >= lockCfg().delay * 1000){ setLocked(true); unlock(); } else setLocked(false);
  });
}

/* ───────── 알림 (휴대폰 안에서 예약하는 알림 · 서버 없음) ───────── */
const notiCfg = () => Object.assign({daily: false, time: '21:00'}, LS.get('noti', {}));
const NOTI_SKIP_TODAY = false;   // 임시(알림 테스트): 입력한 날도 울리게. 테스트 끝나면 true로
const NOTI_IDS = n => n >= 1000 && n < 4000;
let notiT = null;
function notiSoon(){ if (!NATIVE) return; clearTimeout(notiT); notiT = setTimeout(() => notiSchedule().catch(e => { notiState = {err: e?.message || String(e)}; notiShow(); }), 1200); }
// 설정 › 알림에 실제로 예약된 다음 알림을 보여줘요 (예약이 안 됐으면 이유를)
let notiState = null;
const fmtNoti = d => { const t = new Date(), k = (d - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5;
  const day = k < 1 ? '오늘' : k < 2 ? '내일' : `${d.getMonth() + 1}월 ${d.getDate()}일`, h = d.getHours();
  return `${day} ${h < 12 ? '오전' : '오후'} ${(h % 12) || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };
function notiShow(){
  const el = $('#ntNext'); if (!el) return; const st = notiState;
  el.textContent = !st || !notiCfg().daily ? '' : st.err ? `예약하지 못했어요 (${st.err})` : st.perm ? '휴대폰 설정에서 머니머슬 알림이 꺼져 있어요'
    : st.pending ? `다음 알림 ${fmtNoti(st.next)}${st.skip ? ' · 오늘은 이미 입력해서 건너뛰어요' : ''}` : '예약된 알림이 없어요';
}
const ymdKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
async function notiSchedule(){
  const LN = nativePlugin('LocalNotifications'); if (!LN) return;
  const c0 = notiCfg(), c = {...c0, daily: c0.daily && S.use.ledger}, perm = await LN.checkPermissions().catch(() => ({}));
  const pend = await LN.getPending().catch(() => ({notifications: []}));
  const mine = (pend.notifications || []).filter(n => NOTI_IDS(n.id)).map(n => ({id: n.id}));
  if (mine.length) await LN.cancel({notifications: mine}).catch(() => {});
  if (perm.display !== 'granted' || !c.daily){ notiState = c.daily ? {perm: true} : null; notiShow(); return; }
  const now = new Date(), list = [], at = (d, h, mi) => { const x = new Date(d); x.setHours(h, mi, 0, 0); return x; };
  if (c.daily){   // 기록 알림: 앞으로 14일, 오늘 이미 입력했으면 오늘은 건너뛰어요
    const [h, mi] = c.time.split(':').map(Number), today = NOTI_SKIP_TODAY && LS.get('lastInput', '') === ymdKey(now);
    for (let i = 0; i < 14; i++){ const d = new Date(now); d.setDate(d.getDate() + i); const t = at(d, h, mi);
      if (t <= now || (i === 0 && today)) continue;
      list.push({id: 1000 + i, title: '머니머슬', body: '오늘 쓴 돈을 기록해 볼까요?', schedule: {at: t, allowWhileIdle: true}, extra: {tab: 'budget'}}); }
  }
  if (list.length) await LN.schedule({notifications: list});
  const after = await LN.getPending().catch(() => ({notifications: []}));
  notiState = {pending: (after.notifications || []).filter(n => NOTI_IDS(+n.id)).length, next: list[0]?.schedule.at, skip: NOTI_SKIP_TODAY && LS.get('lastInput', '') === ymdKey(now)};
  notiShow();
}
async function notiToggle(key){
  const c = notiCfg(), LN = nativePlugin('LocalNotifications');
  if (!c[key]){   // 켤 때: 처음이면 알림 허용 질문
    let p = await LN.checkPermissions().catch(() => ({}));
    if (p.display !== 'granted') p = await holdLock(() => LN.requestPermissions()).catch(() => ({}));
    if (p.display !== 'granted') return ask('알림이 꺼져 있어요. 휴대폰 설정 → 머니머슬 → 알림에서 허용해 주세요.', {cancel: ''});
  }
  c[key] = !c[key]; LS.set('noti', c); haptic(); syncSheet(); notiSoon();
}
async function notiTime(){
  const c = notiCfg(), v = await askText('기록 알림 시간', {value: c.time, placeholder: '21:00', msg: '24시간 형식으로 넣어 주세요 (예: 21:00)', mode: 'numeric', max: 5});
  if (v == null) return;
  const m = /^(\d{1,2}):?(\d{2})$/.exec(v.trim()); if (!m || +m[1] > 23 || +m[2] > 59) return toast('시간을 21:00처럼 넣어 주세요');
  c.time = `${m[1].padStart(2, '0')}:${m[2]}`; LS.set('noti', c); syncSheet(); notiSoon();
}
// 거래를 입력해서 이번 달 지출이 예산의 80%·100%를 넘으면 바로 알려줘요 (알림 대신 화면 안내)
function budgetCross(before, after){
  for (const [k, b] of Object.entries(before)){ const a = after[k]; if (!a || !b.bud) continue;
    const r0 = b.exp / b.bud, r1 = a.exp / a.bud;
    if (r0 < 1 && r1 >= 1){ haptic('warn'); return toast(`${k.split('-')[1]}월 지출이 예산을 넘었어요 (${money(a.exp - a.bud)} 초과)`); }
    if (r0 < .8 && r1 >= .8){ haptic('warn'); return toast(`${k.split('-')[1]}월 예산의 ${Math.floor(r1 * 100)}%를 썼어요`); } }
}
function budgetSnap(ops){
  const out = {};
  for (const o of ops) if (o.t === 'tx' && o.y && o.m){ const k = o.y + '-' + o.m; if (out[k]) continue;
    const Y = S.years?.[o.y]; if (!Y) continue;
    const bud = (Y.budget[o.m] || []).filter(i => EXP_KINDS.includes(i.kind)).reduce((a, i) => a + (i.bud || 0), 0);
    out[k] = {bud, exp: bMonth(o.m, o.y).expense}; }
  return out;
}

/* ───────── 설정 화면 (앱 잠금·알림) ───────── */
function syncNativeSheet(){
  if (!NATIVE) return;
  const L = lockCfg(), N = notiCfg();
  $('#svLock').textContent = L.on ? `켜짐 · ${L.delay ? L.delay / 60 + '분 후' : '바로'}` : '꺼짐';
  const U = S.use;
  $('#svNoti').textContent = U.ledger && N.daily ? '기록' : '꺼짐';
  $('#lkName').textContent = `${lockName()}로 잠금`;
  $('#lkOn').setAttribute('aria-checked', L.on); $('#lkDelay').hidden = !L.on;
  $('#lkDelay').querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', +b.dataset.d === L.delay));
  for (const k of ['daily']) $('#nt-' + k).setAttribute('aria-checked', N[k]);
  $('#ntTime').hidden = !N.daily; notiShow();
  $('#ntDailyH').hidden = $('#nt-daily').parentElement.hidden = !U.ledger;   // 끈 기능의 알림은 숨기고 예약도 안 해요
  $('#ntTimeV').textContent = N.time.replace(/^(\d+):(\d+)$/, (_, h, m) => `${+h < 12 ? '오전' : '오후'} ${(+h % 12) || 12}:${m}`);
}
function nativeInit(){
  if (!NATIVE) return;
  try { console.log('[alv] native plugins: ' + (window.Capacitor.PluginHeaders || []).map(h => h.name).join(',')); } catch(e){}
  document.documentElement.classList.add('native');
  lockInit();
  $('#lkOn').onclick = () => lockToggle();
  $('#lkDelay').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { LS.set('lock', {...lockCfg(), delay: +b.dataset.d}); haptic(); syncSheet(); });
  for (const k of ['daily']) $('#nt-' + k).onclick = () => notiToggle(k);
  $('#ntTime').onclick = () => notiTime();
  $('#btnFile').addEventListener('click', () => holdLock(() => new Promise(ok => {   // 파일 고르는 동안 (고르거나 닫으면 끝)
    const fi = $('#fileInput'); fi.addEventListener('change', ok, {once: true}); fi.addEventListener('cancel', ok, {once: true}); setTimeout(ok, 120000); })), true);
  nativePlugin('LocalNotifications')?.addListener('localNotificationActionPerformed', e => {
    const tab = e?.notification?.extra?.tab; if (tab && S.ob?.step === 'done') go(tab);
  });
  notiSoon();
}
