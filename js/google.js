// 구글 계정 연결 · 시트 읽기
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 구글 계정 연결 (drive.file: 사용자가 고르거나 앱이 만든 파일만) ───────── */
// 공개해도 되는 값이에요(클라이언트 ID·브라우저 API 키는 앱에 들어가는 공개 값). 설정 방법: GOOGLE_SETUP.md
const GOOGLE = {
  clientId: '919106003112-de97gm5uit7f9imrgrusrugj6t4g9v0s.apps.googleusercontent.com',        // OAuth 클라이언트 ID (웹 애플리케이션) … .apps.googleusercontent.com
  apiKey:   'AIzaSyA737jtGTgXBmwvRO-DuAgPvxDMVWN3CZQ',        // Picker용 브라우저 API 키 (HTTP 리퍼러 제한)
  appId:    '919106003112',        // Google Cloud 프로젝트 번호 (숫자)
  authServer: 'https://auth.alllever.app',   // 로그인 유지 서버 (server/ 폴더)
  pickerPage: 'https://cham0919.github.io/AllLever-asset/picker.html',   // 앱에서 시트 선택 창을 여는 웹 페이지 (alllever.app에서는 사파리가 구글 쿠키를 막아 실패해서 이 주소 유지)
};
const MIME_SHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const gReady = () => !!(GOOGLE.clientId && GOOGLE.apiKey && GOOGLE.appId);
let gTok = null;   // 접근 토큰은 메모리에만 (약 1시간)
const loadJs = src => new Promise((ok, bad) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const el = document.createElement('script'); el.src = src; el.async = true; el.onload = ok; el.onerror = () => bad(new Error('구글 스크립트를 불러오지 못했어요')); document.head.append(el);
});
/* ───────── 로그인 세션 값 보관 ─────────
   앱(아이폰·안드로이드): 키체인·키스토어(SecureStore 플러그인). 다른 앱이나 백업으로 꺼낼 수 없어요.
   웹: 이 브라우저의 저장 공간. 플러그인이 없는 예전 앱에서도 웹 방식으로 동작해요. */
const SID_RE = /^[\w-]{40,64}$/;
let sidMem, sidSecure = null;   // sidMem: 앱에서 한 번 읽은 값 (undefined = 아직 안 읽음)
// 플러그인 객체는 async 함수에서 돌려주면 안 돼요 (Capacitor 플러그인은 then이 있는 것처럼 보여서 기다리다 멈춰요). 그래서 쓸 수 있는지만 돌려줘요.
const SS = () => nativePlugin('SecureStore');
async function secureOk(){
  if (!NATIVE) return false;
  if (sidSecure === null){ try { await SS().get({key: 'gsid'}); sidSecure = true; } catch(e){ sidSecure = false; } }   // 구현이 없으면 웹 방식
  return sidSecure;
}
async function sidGet(){
  if (!(await secureOk())) return LS.get('gsid', null);
  if (sidMem !== undefined) return sidMem;
  let v = null;
  try { v = (await SS().get({key: 'gsid'})).value || null; } catch(e){}
  const old = LS.get('gsid', null);   // 예전 버전이 브라우저 저장 공간에 둔 값은 키체인으로 옮기고 지워요
  if (!v && old && SID_RE.test(old)){ try { await SS().set({key: 'gsid', value: old}); v = old; } catch(e){ return old; } }
  if (old) LS.del('gsid');
  return sidMem = v;
}
async function sidSet(v){
  if (await secureOk()){ try { await SS().set({key: 'gsid', value: v}); sidMem = v; LS.del('gsid'); return; } catch(e){} }
  LS.set('gsid', v); sidMem = undefined;
}
async function sidDel(){
  sidMem = undefined; LS.del('gsid');
  if (await secureOk()) try { await SS().remove({key: 'gsid'}); sidMem = null; } catch(e){}
}
// 토큰 받기: 기기에 저장된 세션으로 로그인 유지 서버에서 새 토큰을 조용히 받아요 (다시 로그인할 필요 없음).
// 서버가 하루에 한 번 새 세션 값을 주면 바로 바꿔 저장해요. 옛 값은 곧 쓸 수 없게 돼서, 빼돌린 값이 있어도 오래 못 써요.
// 세션이 없거나 서버가 다시 로그인하라고 하면, 사용자가 누른 동작일 때만 구글 로그인 화면으로 이동해요.
const gServer = () => GOOGLE.authServer.replace(/\/+$/, '');
let tokReq = null;
function serverToken(){   // 동시에 여러 번 불려도 서버 요청은 하나만 (세션 값 교체가 엇갈리지 않게). 웹은 여러 탭 사이에도 한 번에 하나
  if (tokReq) return tokReq;
  const run = async () => {
    if (gTok && Date.now() < gTok.exp - 60e3) return gTok.v;
    const sid = await sidGet(); if (!sid) return null;
    let r;
    try { r = await fetch(gServer() + '/token', {method: 'POST', headers: {Authorization: 'Bearer ' + sid, 'X-Alv-Rotate': '1'}, cache: 'no-store'}); }
    catch(e){ throw new Error('로그인 서버에 연결하지 못했어요'); }
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.access_token){
      if (j.sid && SID_RE.test(j.sid)) await sidSet(j.sid);
      gTok = {v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000};
      if (j.email && j.email !== S.guser){ S.guser = j.email; LS.set('guser', j.email); }
      return gTok.v;
    }
    if (r.status === 401){   // 권한 취소·만료·보안상 로그아웃 → 다시 로그인
      await sidDel();
      if (j.error === 'reused') toast('보안을 위해 구글 로그인이 해제됐어요. 다시 로그인해 주세요');
      return null;
    }
    throw new Error('로그인 서버 응답 오류');
  };
  const locked = !NATIVE && navigator.locks?.request ? () => navigator.locks.request(LSP + 'token', run) : run;
  return tokReq = locked().finally(() => { tokReq = null; });
}
async function gToken(interactive, pending){
  if (gTok && Date.now() < gTok.exp - 60e3) return gTok.v;
  const t = await serverToken(); if (t) return t;
  if (!interactive) return null;
  if (NATIVE){ await nativeLogin(); return gToken(false); }   // 앱: 로그인 창을 띄웠다가 돌아오면 바로 이어서
  gLogin(pending || 'sync');
  return new Promise(() => {});   // 구글 로그인 화면으로 이동 중
}
async function gFetch(url, opt = {}, tok){
  const r = await fetch(url, {...opt, headers: {...(opt.headers || {}), Authorization: 'Bearer ' + tok}});
  if (r.status === 401){ gTok = null; throw Object.assign(new Error('구글 로그인이 만료됐어요'), {auth: true}); }
  if (r.status === 404) throw Object.assign(new Error('파일이 삭제됐거나 접근 권한이 없어요'), {gone: true, status: 404});
  if (r.status === 403) throw Object.assign(new Error('이 시트를 고칠 권한이 없어요'), {status: 403});
  if (!r.ok) throw Object.assign(new Error('구글 응답 오류 ' + r.status), {status: r.status});
  return r;
}
function gLogin(pending){
  // 일회용 확인값: 이 기기에서 시작한 로그인만 돌아올 때 받아들여요 (남이 보낸 로그인 링크로 다른 계정이 심어지는 것 방지)
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
  try { sessionStorage.setItem(LSP + 'pending', pending); localStorage.setItem(LSP + 'nonce', nonce); } catch(e){}
  const back = location.origin + location.pathname;
  location.href = gServer() + '/auth/start?return=' + encodeURIComponent(back) + '&nonce=' + nonce + (S.guser ? '&hint=' + encodeURIComponent(S.guser) : '');
}
/* ───────── 아이폰·안드로이드 앱: 시스템 로그인 창 ─────────
   구글은 앱 내부 화면(WebView)에서의 로그인을 막아요. 그래서 앱에서는
   아이폰: ASWebAuthenticationSession(앱에 넣은 WebAuth 플러그인), 안드로이드: Chrome Custom Tabs(@capacitor/browser)로
   로그인 서버 주소를 열고, com.alllever.asset:// 주소로 돌아오면 그 주소를 받아요. */
const APP_SCHEME = 'com.alllever.asset';
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sha256b64u(text){
  if (!crypto.subtle) throw new Error('이 기기에서는 안전한 로그인을 쓸 수 없어요');
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}
let nativeOpen = null;   // 진행 중인 창 (두 번 열리지 않게)
async function nativeAuthSession(url, host){
  if (nativeOpen) throw new Error('이미 창이 열려 있어요');
  const ios = window.Capacitor.getPlatform() === 'ios';
  nativeOpen = holdLock(async () => {
    if (ios) return (await nativePlugin('WebAuth').start({url, scheme: APP_SCHEME})).url;
    const App = nativePlugin('App'), Browser = nativePlugin('Browser');   // 안드로이드: 앱 주소로 돌아오거나 창을 닫을 때까지 기다려요
    let subs = [];
    try {
      return await new Promise(async (ok, bad) => {
        subs.push(await App.addListener('appUrlOpen', e => { if (String(e.url || '').startsWith(`${APP_SCHEME}://${host}`)) ok(e.url); }));
        subs.push(await Browser.addListener('browserFinished', () => setTimeout(() => bad(Object.assign(new Error('로그인 창을 닫았어요'), {canceled: true})), 800)));
        await Browser.open({url, presentationStyle: 'popover'});
      });
    } finally { subs.forEach(s => s.remove()); Browser.close().catch(() => {}); }
  });
  try { return await nativeOpen; }
  catch(e){ if (e.code === 'canceled' || e.canceled) throw Object.assign(new Error(host === 'auth' ? '로그인 창을 닫았어요' : '시트 선택 창을 닫았어요'), {canceled: true}); throw e; }
  finally { nativeOpen = null; }
}
// 로그인: 앱만 아는 값(verifier)을 만들고 그 해시만 서버에 보내요. 돌아온 일회용 코드는 verifier가 있어야 세션으로 바꿀 수 있어서,
// 다른 앱이 com.alllever.asset:// 주소를 가로채도 쓸 수 없어요 (PKCE).
async function nativeLogin(){
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32))), cc = await sha256b64u(verifier);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const q = new URLSearchParams({return: `${APP_SCHEME}://auth`, nonce, cc}); if (S.guser) q.set('hint', S.guser);
  const back = await nativeAuthSession(gServer() + '/auth/start?' + q, 'auth');
  const h = new URLSearchParams(String(back).split('#')[1] || '');
  if (h.get('alv_nonce') !== nonce) throw new Error('이 기기에서 시작한 로그인이 아니에요. 다시 시도해 주세요');
  if (h.has('alv_err')){ const e = h.get('alv_err');
    throw new Error(e === 'access_denied' || e === 'denied' ? '구글 권한을 허용하지 않았어요' : e === 'scope' ? '구글 드라이브 권한에 체크해야 시트를 볼 수 있어요' : '구글 로그인을 마치지 못했어요 (' + e + ')'); }
  busy('구글 계정을 연결하는 중이에요');
  try {
  let r, j;
  try { r = await fetch(gServer() + '/auth/exchange', {method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store', body: JSON.stringify({code: h.get('alv_code'), verifier})}); j = await r.json(); }
  catch(e){ throw new Error('로그인 서버에 연결하지 못했어요'); }
  if (!r.ok || !SID_RE.test(j.sid || '')) throw new Error('구글 로그인을 마치지 못했어요. 다시 시도해 주세요');
  await sidSet(j.sid);
  if (j.email){ S.guser = j.email; LS.set('guser', j.email); }
  } finally { busy(); }
}

// 구글 로그인에서 돌아왔을 때: 주소의 #alv_sid=… 를 저장하고 주소창에서 지운 뒤, 하려던 동작을 이어서 해요.
function gReturn(){
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('alv_sid') && !h.has('alv_err')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let pending = null, nonce = null;
  try { pending = sessionStorage.getItem(LSP + 'pending'); sessionStorage.removeItem(LSP + 'pending'); nonce = localStorage.getItem(LSP + 'nonce'); localStorage.removeItem(LSP + 'nonce'); } catch(e){}
  if (!nonce || h.get('alv_nonce') !== nonce){ if (h.has('alv_sid')) toast('이 기기에서 시작한 로그인이 아니라서 무시했어요. 다시 로그인해 주세요'); return null; }
  if (h.has('alv_err')){
    const e = h.get('alv_err');
    toast(e === 'access_denied' || e === 'denied' ? '구글 권한을 허용하지 않았어요' : e === 'scope' ? "구글 드라이브 권한에 체크해야 시트를 볼 수 있어요" : '구글 로그인을 마치지 못했어요 (' + e + ')');
    return null;
  }
  const sid = h.get('alv_sid');
  if (!SID_RE.test(sid)){ toast('로그인 정보가 올바르지 않아요. 다시 시도해 주세요'); return null; }
  LS.set('gsid', sid);   // 웹에서만 오는 경로예요 (앱은 nativeLogin)
  if (h.get('alv_email')){ S.guser = h.get('alv_email'); LS.set('guser', S.guser); }
  return pending || 'sync';
}
async function gWhoAmI(tok){
  try { const j = await (await gFetch('https://www.googleapis.com/oauth2/v3/userinfo', {}, tok)).json();
    if (j.email){ S.guser = j.email; LS.set('guser', j.email); } } catch(e){}
}
async function gDownload(f, tok){
  try {   // 편집 권한 (보기 전용 공유 시트는 앱에서 입력을 막아요) · 휴지통
    const c = await (await gFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id) + '?fields=capabilities(canEdit),trashed,modifiedTime', {cache: 'no-store'}, tok)).json();
    if (c.trashed) throw Object.assign(new Error('시트가 휴지통에 있어요'), {gone: true, status: 404});
    f.ro = c.capabilities?.canEdit === false;
    // 마지막으로 받은 뒤 시트가 바뀌지 않았고 저장 대기 중인 입력도 없으면, 기기에 있는 데이터를 그대로 써요 (엑셀 변환·내려받기 생략)
    const have = S.meta.source === 'google' && f.year && S.years?.[f.year];
    if (c.modifiedTime && f.mod === c.modifiedTime && have && !S.queue.some(o => o.fileId === f.id)) return Object.assign(S.years[f.year], {__cached: true});
    f.modNext = c.modifiedTime || null;
  } catch(e){ if (e.gone || e.auth) throw e; }
  const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id);
  const url = f.mime === MIME_SHEET || !f.mime ? `${base}/export?mimeType=${encodeURIComponent(MIME_XLSX)}` : `${base}?alt=media`;
  const buf = await (await gFetch(url, {cache: 'no-store'}, tok)).arrayBuffer(), h = new Uint8Array(buf.slice(0, 2));
  if (h[0] !== 0x50 || h[1] !== 0x4B) throw new Error('스프레드시트 파일이 아니에요');
  await xlsxReady(); const M = parseWorkbook(buf); f.mod = f.modNext; delete f.modNext; return M;
}
function gSave(){ LS.set('gfiles', S.gfiles); }
function gAdd(list){
  let n = 0;
  for (const d of list) if (!S.gfiles.some(f => f.id === d.id)){ S.gfiles.push({id: d.id, name: d.name, mime: d.mime, year: null, ...(d.path != null ? {path: d.path} : {})}); n++; }
  gSave(); renderG(); return n;
}
// 시트 고르기: 먼저 이 앱이 접근할 수 있는 시트(전에 고른 시트·앱이 만든 시트)를 드라이브에서 직접 목록으로 보여주고,
// 목록에 없는 시트는 구글 선택 창(Picker)으로 추가해요. 홈 화면 앱에서는 Picker가 막힐 수 있어서 이 순서로 해요.
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const leaveLocalOk = async () => S.meta.source !== 'local' || !yearsList().length ||
  ask('구글 시트를 연결하면 이 기기에만 저장된 데이터 대신 시트 데이터를 보여줘요.\n먼저 설정 → 백업 파일 만들기로 백업하세요.', {title: '구글 시트로 바꿀까요?', ok: '계속'});
async function gPick(){
  if (!gReady()) return toast('개발자 설정이 필요해요');
  if (!(await leaveLocalOk())) return;
  try {
    const tok = await gToken(true, 'pick');
    busy('구글 드라이브를 확인하는 중이에요', '연결할 수 있는 시트를 찾고 있어요');
    if (!S.guser) await gWhoAmI(tok);
    if (S.tab !== 'settings' || S.spage !== 'google') openSheet('google');
    const q = `(mimeType='${MIME_SHEET}' or mimeType='${MIME_XLSX}') and trashed=false`;
    const j = await (await gFetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({q, orderBy: 'modifiedTime desc', pageSize: '100',
      fields: 'files(id,name,mimeType,modifiedTime)'}), {cache: 'no-store'}, tok)).json();
    const files = (j.files || []).filter(f => !S.gfiles.some(g => g.id === f.id));
    busy(); gChooser(files);
  } catch(e){ busy(); toast(e.message); }
}
function gChooser(files){
  const el = $('#gChooser'), sa = isStandalone() && !NATIVE;
  // 아이폰 앱: 사파리의 '크로스 사이트 추적 방지'(기본 켜짐) 때문에 구글 선택 창이 열리지 않아요 → 버튼을 숨기고,
  // 갖고 있던 시트는 PC 웹에서 한 번 고르면 같은 계정의 이 목록에 나타나요 (고객 지원 페이지 안내)
  const noPicker = NATIVE && window.Capacitor?.getPlatform?.() === 'ios';
  const day = t => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} 수정`; };
  el.innerHTML = `<h5>연결할 시트 고르기</h5>
    ${files.length ? files.map(f => `<label><input type="checkbox" value="${esc(f.id)}"><span>${esc(f.name)}<small>${day(f.modifiedTime)}<i data-p="${esc(f.id)}"></i></small></span></label>`).join('')
      : S.gfiles.length ? `<p class="note" style="margin:0 0 4px">이 앱이 볼 수 있는 시트는 모두 연결돼 있어요.${noPicker ? '' : ' 다른 시트는 아래 <b>구글 선택 창</b>에서 찾아 주세요.'}</p>`
      : `<p class="note" style="margin:0 0 4px">이 앱이 볼 수 있는 시트가 아직 없어요. ${noPicker ? '' : '아래 <b>구글 선택 창</b>에서 시트를 고르거나, '}<b>템플릿으로 새 시트 만들기</b>를 눌러 주세요.</p>`}
    <div class="row2">${files.length ? '<button class="btn" id="gcOk">연결하기</button>' : ''}<button class="btn ghost" id="gcCancel">닫기</button></div>
    ${noPicker ? '' : '<button class="btn ghost" id="gcPicker" style="margin-top:8px">목록에 없는 시트 찾기 (구글 선택 창)</button>'}
    ${sa ? `<p class="note">홈 화면 앱에서는 구글 선택 창이 열리지 않을 수 있어요. 그럴 땐 <b>사파리</b>에서 이 주소를 열고 같은 계정으로 시트를 한 번 고르면, 이 목록에 나타나요.</p>` : ''}`;
  el.hidden = false;
  el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  $('#gcCancel').onclick = () => { el.hidden = true; };
  gFillPaths(files, () => files.forEach(f => { const i = el.querySelector(`[data-p="${CSS.escape(f.id)}"]`); if (i && f.path) i.textContent = ' · ' + f.path; }));
  if (!noPicker) $('#gcPicker').onclick = () => gPicker();
  if (files.length) $('#gcOk').onclick = () => {
    const ids = [...el.querySelectorAll('input:checked')].map(i => i.value);
    if (!ids.length) return toast('연결할 시트를 골라 주세요');
    el.hidden = true;
    const n = gAdd(files.filter(f => ids.includes(f.id)).map(f => ({id: f.id, name: f.name, mime: f.mimeType, ...(f.path != null ? {path: f.path} : {})})));
    if (n) syncGoogle(true, true);
  };
}
async function gPicker(){
  if (NATIVE) return nativePicker();
  try {
    const tok = await gToken(true, 'pick');
    await loadJs('https://apis.google.com/js/api.js');
    await new Promise(ok => gapi.load('picker', ok));
    const P = google.picker;
    const view = new P.DocsView(P.ViewId.SPREADSHEETS).setMode(P.DocsViewMode.LIST).setIncludeFolders(false);
    const picker = new P.PickerBuilder().setOAuthToken(tok).setDeveloperKey(GOOGLE.apiKey).setAppId(GOOGLE.appId)
      .addView(view).enableFeature(P.Feature.MULTISELECT_ENABLED).setLocale('ko').setTitle('머니머슬에서 쓸 연도별 시트를 고르세요')
      .setCallback(async d => {
        if (d[P.Response.ACTION] !== P.Action.PICKED) return;
        const docs = d[P.Response.DOCUMENTS].map(x => ({id: x[P.Document.ID], name: x[P.Document.NAME], mime: x[P.Document.MIME_TYPE]}));
        $('#gChooser').hidden = true;
        const n = gAdd(docs); if (n) syncGoogle(true, true); else toast('이미 연결된 시트예요');
      }).build();
    picker.setVisible(true);
  } catch(e){ toast(e.message); }
}
// 앱: 구글 선택 창을 시스템 브라우저 창에서 열고(picker.html), 고른 시트의 id·이름만 돌려받아요.
async function nativePicker(){
  try {
    const tok = await gToken(true, 'pick');
    const back = await nativeAuthSession(GOOGLE.pickerPage + '#t=' + encodeURIComponent(tok), 'picked');
    const h = new URLSearchParams(String(back).split('#')[1] || '');
    if (!h.has('docs')) return;
    let docs = []; try { docs = JSON.parse(h.get('docs')); } catch(e){}
    docs = (Array.isArray(docs) ? docs : []).filter(d => d && /^[\w-]{10,200}$/.test(d.id) && [MIME_SHEET, MIME_XLSX].includes(d.mime))
      .map(d => ({id: d.id, name: String(d.name || '').slice(0, 200), mime: d.mime}));
    if (!docs.length) return toast('구글 시트를 골라 주세요');
    $('#gChooser').hidden = true;
    const n = gAdd(docs); if (n) syncGoogle(true, true); else toast('이미 연결된 시트예요');
  } catch(e){ if (!e.canceled) toast(e.message); }
}
// 앱에 들어 있는 빈 템플릿(template.xlsx)을 구글 시트로 변환해서 업로드하고, 기준 연도·전년 말 부채를 채워요.
function busy(t, sub = ''){   // 전체 화면 로딩창 (t 없으면 닫기)
  const el = $('#busy'); if (!el) return;
  if (!t){ el.classList.remove('on'); return; }
  $('#busyT').textContent = t; $('#busyS').textContent = sub; el.classList.add('on');
}
// 새 시트를 넣을 드라이브 폴더 '머니머슬': 앱이 전에 만든 폴더가 있으면 그대로 쓰고, 없으면 내 드라이브 맨 위에 만들어요.
// 예전 이름('자산관리')으로 만든 폴더는 찾아서 '머니머슬'로 이름만 바꿔요 (안의 시트는 그대로).
// (drive.file 권한이라 앱이 만든 폴더만 보여요. 직접 만든 같은 이름 폴더와는 따로 생길 수 있어요)
const FOLDER = '머니머슬', FOLDER_OLD = '자산관리', MIME_FOLDER = 'application/vnd.google-apps.folder';
async function gFolder(tok){
  const info = async id => { try { const j = await (await gFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,trashed`, {cache: 'no-store'}, tok)).json(); return j.id && !j.trashed ? j : null; } catch(e){ return null; } };
  const find = async name => (await (await gFetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({q: `mimeType='${MIME_FOLDER}' and name='${name}' and trashed=false`, fields: 'files(id,name)', orderBy: 'createdTime', pageSize: '1'}), {cache: 'no-store'}, tok)).json()).files?.[0] || null;
  const saved = LS.get('gfolder', null);
  let f = (saved && await info(saved)) || await find(FOLDER) || await find(FOLDER_OLD);
  if (f && f.name === FOLDER_OLD){   // 예전 이름이면 새 이름으로
    try { await gFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}?fields=id`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: FOLDER})}, tok); } catch(e){}
  }
  let id = f?.id;
  if (!id) id = (await (await gFetch('https://www.googleapis.com/drive/v3/files?fields=id', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: FOLDER, mimeType: MIME_FOLDER})}, tok)).json()).id;
  if (!id) throw new Error('드라이브에 폴더를 만들지 못했어요');
  LS.set('gfolder', id); return id;
}
// 같은 폴더에 같은 이름의 시트가 있으면 뒤에 (2), (3)… 을 붙여요 (앱이 볼 수 있는 파일 기준)
async function gFreeName(base, parent, tok){
  try {
    const q = `'${parent}' in parents and trashed=false and name contains '${base.replace(/'/g, "\\'")}'`;
    const j = await (await gFetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({q, fields: 'files(name)', pageSize: '200'}), {cache: 'no-store'}, tok)).json();
    const names = new Set((j.files || []).map(f => f.name));
    if (!names.has(base)) return base;
    let n = 2; while (names.has(`${base} (${n})`)) n++;
    return `${base} (${n})`;
  } catch(e){ return base; }
}
// 시트 경로 (내 드라이브 › 머니머슬): 폴더 이름은 기기에 기억해 두고, 볼 수 없는 폴더는 '…'으로
const gDirs = LS.get('gdirs', {});
let gRootId = LS.get('groot', null);
async function gPathOf(id, tok){
  const get = async (fid, fields) => { const r = await gFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?fields=${fields}&supportsAllDrives=true`, {cache: 'no-store'}, tok); return r.json(); };
  if (!gRootId){   // 내 드라이브(맨 위) 폴더 id: 바로 묻고, 안 되면 앱이 맨 위에 만든 '머니머슬' 폴더의 상위 폴더로 알아내요
    try { gRootId = (await get('root', 'id')).id || null; } catch(e){}
    if (!gRootId && LS.get('gfolder', null)){ try { gRootId = (await get(LS.get('gfolder'), 'parents')).parents?.[0] || null; } catch(e){} }
    if (gRootId) LS.set('groot', gRootId);
  }
  let p; try { p = (await get(id, 'parents')).parents?.[0]; } catch(e){ return ''; }
  if (!p) return '공유 문서함';
  const parts = [];
  for (let i = 0; p && i < 6; i++){
    if (p === gRootId){ parts.unshift('내 드라이브'); break; }
    let d = gDirs[p];
    if (!d){ try { const j = await get(p, 'name,parents'); d = gDirs[p] = {n: j.name, p: j.parents?.[0] || null}; } catch(e){ parts.unshift('…'); break; } }
    parts.unshift(d.n); p = d.p;
  }
  LS.set('gdirs', gDirs);
  return parts.join(' › ');
}
let gPathsBusy = false;
async function gFillPaths(list, after){   // list: 경로를 채울 파일들 ({id, path?})
  if (gPathsBusy) return; const need = list.filter(f => f.path == null); if (!need.length) return;
  gPathsBusy = true;
  try { const tok = await gToken(false); if (!tok) return;
    for (const f of need){ f.path = await gPathOf(f.id, tok); after(); } }
  catch(e){} finally { gPathsBusy = false; }
}
async function gCreate(year){
  if (!gReady()) return toast('개발자 설정이 필요해요');
  if (!(await leaveLocalOk())) return;
  if (S.gfiles.some(f => !f.year)) await syncGoogle(false);   // 연도를 아직 모르는 시트가 있으면 먼저 확인
  const used = new Set(S.gfiles.map(f => f.year).filter(Boolean)), cy = new Date().getFullYear();
  let y = year;
  if (!y){
    y = cy; while (used.has(y)) y++;
    const ans = await askText('몇 년도 시트를 만들까요?', {value: String(y), mode: 'numeric', max: 4, ok: '만들기'}); if (ans == null) return;
    y = parseInt(ans, 10);
  }
  if (!(y >= 2000 && y <= 2100)) return toast('연도를 숫자로 넣어 주세요');
  if (used.has(y)) return toast(`${y}년 시트는 이미 연결돼 있어요`);
  try {
    const tok = await gToken(true, 'create:' + y); if (!S.guser) await gWhoAmI(tok);
    busy('생성 중입니다', `구글 드라이브 '${FOLDER}' 폴더에 ${y}년 시트를 만들고 있어요`);
    const tpl = await fetch('template.xlsx'); if (!tpl.ok) throw new Error('템플릿 파일을 찾지 못했어요');
    let folder = null; try { folder = await gFolder(tok); } catch(e){}   // 폴더를 못 만들면 내 드라이브 맨 위에라도 만들어요
    const name = await gFreeName(`가계부_${y}`, folder || 'root', tok);   // 같은 폴더에 같은 이름이 있으면 '가계부_2026 (2)'처럼
    const meta = {name, mimeType: MIME_SHEET, ...(folder ? {parents: [folder]} : {})};
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], {type: 'application/json'}));
    form.append('file', new Blob([await tpl.arrayBuffer()], {type: MIME_XLSX}));
    const f = await (await gFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {method: 'POST', body: form}, tok)).json();
    // 기준 연도
    await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${f.id}/values/${encodeURIComponent('설정!B4')}?valueInputOption=USER_ENTERED`,
      {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({values: [[y]]})}, tok);
    gAdd([{id: f.id, name: f.name, mime: f.mimeType}]);
    busy('거의 다 됐어요', '만든 시트를 불러오고 있어요');
    await syncGoogle(true);
    busy(); toast(folder ? `'${FOLDER}' 폴더에 '${f.name}' 시트를 만들었어요` : `'${f.name}' 시트를 만들었어요 (내 드라이브 맨 위)`);
  } catch(e){ busy(); toast('시트를 만들지 못했어요: ' + e.message); }
}
async function gRemove(i){
  const f = S.gfiles[i]; if (!(await ask('구글 드라이브의 파일은 지워지지 않아요.', {title: `${f.year ? f.year + '년 ' : ''}'${f.name}' 연결을 해제할까요?`, ok: '해제', danger: true}))) return;
  S.gfiles.splice(i, 1); gSave();
  if (S.meta.source === 'google' && f.year && !S.gfiles.some(g => g.year === f.year)){ delete S.years[f.year]; LS.set('years', S.years); setYear(S.year); render(); }
  syncSheet();
}
async function gSignOut(){
  if (!(await ask('· 이 앱에 준 구글 권한을 취소해요\n· 로그인 서버에 저장된 로그인 정보를 모든 기기에서 삭제해요\n· 이 기기의 시트 목록을 지워요\n\n구글 드라이브의 시트 파일은 내 파일이라 그대로 남아요.', {title: '계정을 삭제할까요?', ok: '계정 삭제', danger: true}))) return;
  busy('계정을 삭제하는 중이에요');
  try {
    const sid = await sidGet();
    if (sid) await fetch(gServer() + '/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + sid}, signal: AbortSignal.timeout?.(8000)}).catch(() => {});   // 서버 세션 삭제 + 구글 권한 취소
    await sidDel();
    gTok = null; S.gfiles = []; S.guser = null; gSave(); LS.del('guser'); LS.del('gfolder');
    if (S.meta.source === 'google'){ S.years = {}; LS.set('years', {}); S.meta = {}; LS.set('meta', {}); setYear(null); render(); }
  } finally { busy(); }
  syncSheet(); toast('계정을 삭제했어요');
}
function renderG(){
  const ok = gReady();
  $('#gCfg').hidden = ok; $('#gPick').disabled = $('#gCreate').disabled = !ok;
  $('#gUser').textContent = S.guser || (S.gfiles.length ? '로그인 필요' : '연결 안 됨');
  $('#gOut').hidden = !(S.guser || S.gfiles.length);
  const list = S.gfiles.slice().sort((a, b) => (a.year || 9999) - (b.year || 9999));
  $('#gList').innerHTML = list.length ? list.map(f => `<div class="src"><span class="y">${f.year ? f.year + '년' : '확인 전'}${f.gone ? ' · <b class="up">찾을 수 없음</b>' : f.ro ? ' · 보기 전용' : ''}</span>
      <span class="u">${esc(f.name)}${f.path ? `<small>${esc(f.path)}</small>` : ''}</span><a href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(f.id)}/edit" target="_blank" rel="noopener">열기</a><button data-i="${S.gfiles.indexOf(f)}">해제</button></div>`).join('')
    : '<p class="note" style="margin:0">연결된 시트가 없어요</p>';
  $('#gList').querySelectorAll('button').forEach(b => b.onclick = () => gRemove(+b.dataset.i));
  if (S.tab === 'settings' && S.spage === 'google') gFillPaths(S.gfiles, () => { gSave(); renderG(); });
}
let gSyncing = false;
async function syncGoogle(interactive, show = false){   // show: 시트를 새로 연결했을 때처럼 기다리는 화면을 띄워요
  if (gSyncing || !S.gfiles.length) return;
  gSyncing = true; $('#syncBtn').classList.add('spin');
  if (show) busy('시트를 불러오는 중이에요', S.gfiles.length > 1 ? `연결한 시트 ${S.gfiles.length}개를 받고 있어요` : '');
  try {
    let tok;
    try { tok = await gToken(interactive); } catch(e){ if (interactive) toast(e.message); return; }
    if (!tok){ if (!S.model || gServer()) toast('새로고침 버튼을 눌러 구글 로그인을 이어가 주세요'); return; }   // 자동 동기화: 로그인 만료
    if (!S.guser) await gWhoAmI(tok);
    const res = await Promise.all(S.gfiles.map(f => gDownload(f, tok).then(m => ({f, m}), e => ({f, e}))));
    const old = S.meta.source === 'google' ? (S.years || {}) : {}, next = {}, dup = [], fail = [];
    // 같은 연도 시트는 하나만: 먼저 연결한 시트를 남기고, 나중에 연결한 시트는 연결을 풀어요 (드라이브 파일은 그대로)
    const owner = {};
    for (const r of res) if (r.m && r.f.year === r.m.year && !(r.m.year in owner)) owner[r.m.year] = r.f;   // 이미 그 연도로 쓰던 시트 우선
    for (const r of res){
      r.f.gone = !r.m && !!r.e?.gone;
      if (!r.m){ fail.push(r); continue; }
      const y = r.m.year;
      if (owner[y] && owner[y] !== r.f || next[y]){ dup.push(r.f); continue; }
      next[y] = r.m; r.f.year = y; owner[y] = r.f;
    }
    if (dup.length) S.gfiles = S.gfiles.filter(f => !dup.includes(f));
    for (const r of fail){ const y = r.f.year; if (y && old[y] && !next[y]) next[y] = old[y]; }   // 실패한 연도는 이전 데이터 유지
    gSave(); renderG();
    if (!res.some(r => r.m)){   // 하나도 못 받았으면 기존 데이터·동기화 시각을 그대로 둬요
      toast(fail.some(r => r.e.auth) ? '구글 로그인이 만료됐어요. 새로고침 버튼을 눌러 다시 로그인해 주세요' : '불러오기 실패: ' + fail[0].e.message); return; }
    const same = res.every(r => r.m?.__cached) && !dup.length;
    for (const r of res) if (r.m) delete r.m.__cached;
    if (same){ S.meta.syncedAt = Date.now(); LS.set('meta', S.meta); applyReps(); if (interactive) toast('최신 데이터예요'); return; }   // 바뀐 게 없으면 화면을 다시 그리지 않아요
    finishOb(); setYears(next, {source: 'google'}, S.meta.source === 'google'); applyReps();
    if (dup.length){ const d = dup[0], y = res.find(r => r.f === d).m.year;
      toast(`${y}년 시트는 이미 연결돼 있어서 '${d.name}'${dup.length > 1 ? ` 외 ${dup.length - 1}개` : ''}는 연결하지 않았어요`); }
    else if (fail.length) toast(`${fail.length}개 시트를 불러오지 못했어요: ${fail[0].e.message}`);
    else if (interactive) toast('최신 데이터로 업데이트했어요');
  } finally { gSyncing = false; $('#syncBtn').classList.remove('spin'); if (show) busy(); }
}
function syncNow(interactive){ if (S.gfiles.length) return syncGoogle(interactive); if (interactive){ toast('설정에서 구글 시트를 연결하세요'); openSheet('google'); } }
$('#gPick').onclick = gPick; $('#gCreate').onclick = () => gCreate(); $('#gOut').onclick = gSignOut;

// 화면 안 버튼 동작 (CSP 때문에 onclick 속성 대신 위임)
document.addEventListener('click', e => { const t = e.target.closest('#view [data-tx]'); if (t) return editTx(t.dataset.tx); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'pending') return openPending();
  if (a === 'openSheet') openSheet('google'); else if (a === 'loadDemo') loadDemo(); else if (a === 'obRestart') restartOb(); else if (a === 'sync') syncNow(true);
  else if (a === 'editBudget') editBudgetMonth(S.month.budget); else if (a === 'editAsset') editAssetMonth(S.month.asset); else if (a === 'prevAsset') loadPrevAsset(S.month.asset);
  else if (a === 'eb'){ const [m, k] = b.dataset.k.split('|').map(Number), L = S.years[S.year].budget[m], it = L[k];
    if (S.years[S.year].txMode) openItemTx(m, k); else editBudgetItem(m, it.kind, it.name, occ(L, it, bKey)); }
  else if (a === 'addTx') editTx(null); else if (a === 'reps') openReps(); else if (a === 'addRep') editRep(null, true); else if (a === 'cats') openCats(); else if (a === 'budEdit') openBudEdit();
  else if (a === 'homeLedger' || a === 'homeBud' || a === 'homeAddTx'){ const P = homeLedgerPos(); if (!P) return; setYear(P.y); S.month.budget = P.m;
    if (a === 'homeAddTx') return editTx(null);
    S.bview = a === 'homeBud' ? 'bud' : 'cal'; LS.set('bview', S.bview); go('budget'); if (a === 'homeBud') openBudEdit(); }
  else if (a === 'homeGoal') go('analysis');
  else if (a === 'homeAsset'){ const c = assetPoints().at(-1); if (c){ setYear(c.y); S.month.asset = c.m; } go('asset'); } else if (a === 'budAdd') openBudAdd(); else if (a === 'goBud'){ S.bview = 'bud'; LS.set('bview', 'bud'); render(); }
  else if (a === 'addB') addBudgetItem(S.month.budget, b.dataset.kind);
  else if (a === 'zeroItems'){ S.showZero = !S.showZero; render(); } });
