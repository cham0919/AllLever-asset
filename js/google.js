// 구글 계정 연결 · 시트 읽기
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 구글 계정 연결 (drive.file: 사용자가 고르거나 앱이 만든 파일만) ───────── */
// 공개해도 되는 값이에요(클라이언트 ID·브라우저 API 키는 앱에 들어가는 공개 값). 설정 방법: GOOGLE_SETUP.md
const GOOGLE = {
  clientId: '919106003112-de97gm5uit7f9imrgrusrugj6t4g9v0s.apps.googleusercontent.com',        // OAuth 클라이언트 ID (웹 애플리케이션) … .apps.googleusercontent.com
  apiKey:   'AIzaSyA737jtGTgXBmwvRO-DuAgPvxDMVWN3CZQ',        // Picker용 브라우저 API 키 (HTTP 리퍼러 제한)
  appId:    '919106003112',        // Google Cloud 프로젝트 번호 (숫자)
  authServer: 'https://alllever-asset-auth.alllever.workers.dev',      // 로그인 유지 서버 주소 (server/ 폴더, 예: https://alllever-asset-auth.xxx.workers.dev). 비우면 1시간 로그인 방식
};
const G_SCOPE = 'https://www.googleapis.com/auth/drive.file email';
const MIME_SHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const gReady = () => !!(GOOGLE.clientId && GOOGLE.apiKey && GOOGLE.appId);
let gTok = null, gClient = null;   // 토큰은 메모리에만 (약 1시간)
const loadJs = src => new Promise((ok, bad) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const el = document.createElement('script'); el.src = src; el.async = true; el.onload = ok; el.onerror = () => bad(new Error('구글 스크립트를 불러오지 못했어요')); document.head.append(el);
});
async function gInit(){
  if (gClient) return;
  await loadJs('https://accounts.google.com/gsi/client');
  gClient = google.accounts.oauth2.initTokenClient({client_id: GOOGLE.clientId, scope: G_SCOPE, callback: () => {}});
}
// 토큰 받기. 사용자가 누른 버튼에서만 팝업이 뜰 수 있어서, 자동 동기화에서는 남은 토큰만 써요.
// 로그인 유지 서버가 있으면: 기기에 저장된 세션으로 서버에서 새 토큰을 조용히 받아요 (다시 로그인할 필요 없음).
// 세션이 없거나 서버가 다시 로그인하라고 하면, 사용자가 누른 동작일 때만 구글 로그인 화면으로 이동해요.
const gServer = () => (GOOGLE.authServer || '').replace(/\/+$/, '');
async function gToken(interactive, pending){
  if (gTok && Date.now() < gTok.exp - 60e3) return gTok.v;
  if (gServer()){
    const sid = LS.get('gsid', null);
    if (sid){
      let r;
      try { r = await fetch(gServer() + '/token', {method: 'POST', headers: {Authorization: 'Bearer ' + sid}, cache: 'no-store'}); }
      catch(e){ throw new Error('로그인 서버에 연결하지 못했어요'); }
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.access_token){
        gTok = {v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000};
        if (j.email && j.email !== S.guser){ S.guser = j.email; LS.set('guser', j.email); }
        return gTok.v;
      }
      if (r.status === 401) LS.del('gsid');   // 권한 취소·만료 → 다시 로그인
      else throw new Error('로그인 서버 응답 오류');
    }
    if (!interactive) return null;
    gLogin(pending || 'sync');
    return new Promise(() => {});   // 구글 로그인 화면으로 이동 중
  }
  if (!interactive) return null;
  await gInit();
  return new Promise((ok, bad) => {
    gClient.callback = r => {
      if (r.error) return bad(new Error(r.error === 'access_denied' ? '구글 권한을 허용하지 않았어요' : r.error));
      gTok = {v: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000}; ok(gTok.v);
    };
    gClient.error_callback = e => bad(new Error(e?.type === 'popup_closed' ? '로그인 창을 닫았어요' : '로그인 창을 열지 못했어요'));
    gClient.requestAccessToken({prompt: S.guser ? '' : 'consent', login_hint: S.guser || undefined});
  });
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
  if (!/^[\w-]{40,64}$/.test(sid)){ toast('로그인 정보가 올바르지 않아요. 다시 시도해 주세요'); return null; }
  LS.set('gsid', sid);
  if (h.get('alv_email')){ S.guser = h.get('alv_email'); LS.set('guser', S.guser); }
  return pending || 'sync';
}
async function gWhoAmI(tok){
  try { const j = await (await gFetch('https://www.googleapis.com/oauth2/v3/userinfo', {}, tok)).json();
    if (j.email){ S.guser = j.email; LS.set('guser', j.email); } } catch(e){}
}
async function gDownload(f, tok){
  try {   // 편집 권한 (보기 전용 공유 시트는 앱에서 입력을 막아요) · 휴지통
    const c = await (await gFetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id) + '?fields=capabilities(canEdit),trashed', {cache: 'no-store'}, tok)).json();
    if (c.trashed) throw Object.assign(new Error('시트가 휴지통에 있어요'), {gone: true, status: 404});
    f.ro = c.capabilities?.canEdit === false;
  } catch(e){ if (e.gone || e.auth) throw e; }
  const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id);
  const url = f.mime === MIME_SHEET || !f.mime ? `${base}/export?mimeType=${encodeURIComponent(MIME_XLSX)}` : `${base}?alt=media`;
  const buf = await (await gFetch(url, {cache: 'no-store'}, tok)).arrayBuffer(), h = new Uint8Array(buf.slice(0, 2));
  if (h[0] !== 0x50 || h[1] !== 0x4B) throw new Error('스프레드시트 파일이 아니에요');
  return parseWorkbook(buf);
}
function gSave(){ LS.set('gfiles', S.gfiles); }
function gAdd(list){
  let n = 0;
  for (const d of list) if (!S.gfiles.some(f => f.id === d.id)){ S.gfiles.push({id: d.id, name: d.name, mime: d.mime, year: null}); n++; }
  gSave(); renderG(); return n;
}
// 시트 고르기: 먼저 이 앱이 접근할 수 있는 시트(전에 고른 시트·앱이 만든 시트)를 드라이브에서 직접 목록으로 보여주고,
// 목록에 없는 시트는 구글 선택 창(Picker)으로 추가해요. 홈 화면 앱에서는 Picker가 막힐 수 있어서 이 순서로 해요.
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const leaveLocalOk = () => S.meta.source !== 'local' || !yearsList().length ||
  confirm('구글 시트를 연결하면 이 기기에만 저장된 데이터 대신 시트 데이터를 보여줘요. 먼저 설정 → 엑셀로 내보내기로 백업하세요. 계속할까요?');
async function gPick(){
  if (!gReady()) return toast('개발자 설정이 필요해요');
  if (!leaveLocalOk()) return;
  try {
    const tok = await gToken(true, 'pick'); if (!S.guser) await gWhoAmI(tok);
    if (S.tab !== 'settings' || S.spage !== 'google') openSheet('google');
    const q = `(mimeType='${MIME_SHEET}' or mimeType='${MIME_XLSX}') and trashed=false`;
    const j = await (await gFetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({q, orderBy: 'modifiedTime desc', pageSize: '100',
      fields: 'files(id,name,mimeType,modifiedTime)'}), {cache: 'no-store'}, tok)).json();
    const files = (j.files || []).filter(f => !S.gfiles.some(g => g.id === f.id));
    gChooser(files);
  } catch(e){ toast(e.message); }
}
function gChooser(files){
  const el = $('#gChooser'), sa = isStandalone();
  const day = t => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} 수정`; };
  el.innerHTML = `<h5>연결할 시트 고르기</h5>
    ${files.length ? files.map(f => `<label><input type="checkbox" value="${esc(f.id)}"><span>${esc(f.name)}<small>${day(f.modifiedTime)}</small></span></label>`).join('')
      : S.gfiles.length ? `<p class="note" style="margin:0 0 4px">이 앱이 볼 수 있는 시트는 모두 연결돼 있어요. 다른 시트는 아래 <b>구글 선택 창</b>에서 찾아 주세요.</p>`
      : `<p class="note" style="margin:0 0 4px">이 앱이 볼 수 있는 시트가 아직 없어요. 처음엔 아래 <b>구글 선택 창</b>에서 시트를 고르거나, <b>템플릿으로 새 시트 만들기</b>를 눌러 주세요.</p>`}
    <div class="row2">${files.length ? '<button class="btn" id="gcOk">연결하기</button>' : ''}<button class="btn ghost" id="gcCancel">닫기</button></div>
    <button class="btn ghost" id="gcPicker" style="margin-top:8px">목록에 없는 시트 찾기 (구글 선택 창)</button>
    ${sa ? `<p class="note">홈 화면 앱에서는 구글 선택 창이 열리지 않을 수 있어요. 그럴 땐 <b>사파리</b>에서 이 주소를 열고 같은 계정으로 시트를 한 번 고르면, 이 목록에 나타나요.</p>` : ''}`;
  el.hidden = false;
  el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  $('#gcCancel').onclick = () => { el.hidden = true; };
  $('#gcPicker').onclick = () => gPicker();
  if (files.length) $('#gcOk').onclick = () => {
    const ids = [...el.querySelectorAll('input:checked')].map(i => i.value);
    if (!ids.length) return toast('연결할 시트를 골라 주세요');
    el.hidden = true;
    const n = gAdd(files.filter(f => ids.includes(f.id)).map(f => ({id: f.id, name: f.name, mime: f.mimeType})));
    if (n) syncGoogle(true);
  };
}
async function gPicker(){
  try {
    const tok = await gToken(true, 'pick');
    await loadJs('https://apis.google.com/js/api.js');
    await new Promise(ok => gapi.load('picker', ok));
    const P = google.picker;
    const view = new P.DocsView(P.ViewId.SPREADSHEETS).setMode(P.DocsViewMode.LIST).setIncludeFolders(false);
    const picker = new P.PickerBuilder().setOAuthToken(tok).setDeveloperKey(GOOGLE.apiKey).setAppId(GOOGLE.appId)
      .addView(view).enableFeature(P.Feature.MULTISELECT_ENABLED).setLocale('ko').setTitle('연도별 자산관리 시트를 고르세요')
      .setCallback(async d => {
        if (d[P.Response.ACTION] !== P.Action.PICKED) return;
        const docs = d[P.Response.DOCUMENTS].map(x => ({id: x[P.Document.ID], name: x[P.Document.NAME], mime: x[P.Document.MIME_TYPE]}));
        $('#gChooser').hidden = true;
        const n = gAdd(docs); if (n) syncGoogle(true); else toast('이미 연결된 시트예요');
      }).build();
    picker.setVisible(true);
  } catch(e){ toast(e.message); }
}
// 앱에 들어 있는 빈 템플릿(template.xlsx)을 구글 시트로 변환해서 업로드하고, 기준 연도·전년 말 부채를 채워요.
function busy(t, sub = ''){   // 전체 화면 로딩창 (t 없으면 닫기)
  const el = $('#busy'); if (!el) return;
  if (!t){ el.classList.remove('on'); return; }
  $('#busyT').textContent = t; $('#busyS').textContent = sub; el.classList.add('on');
}
// 새 시트를 넣을 드라이브 폴더 '자산관리': 앱이 전에 만든 폴더가 있으면 그대로 쓰고, 없으면 내 드라이브 맨 위에 만들어요.
// (drive.file 권한이라 앱이 만든 폴더만 보여요. 직접 만든 같은 이름 폴더와는 따로 생길 수 있어요)
const FOLDER = '자산관리', MIME_FOLDER = 'application/vnd.google-apps.folder';
async function gFolder(tok){
  const ok = async id => { try { const j = await (await gFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed`, {cache: 'no-store'}, tok)).json(); return j.id && !j.trashed; } catch(e){ return false; } };
  const saved = LS.get('gfolder', null); if (saved && await ok(saved)) return saved;
  const q = `mimeType='${MIME_FOLDER}' and name='${FOLDER}' and trashed=false`;
  const j = await (await gFetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({q, fields: 'files(id)', orderBy: 'createdTime', pageSize: '1'}), {cache: 'no-store'}, tok)).json();
  let id = j.files?.[0]?.id;
  if (!id) id = (await (await gFetch('https://www.googleapis.com/drive/v3/files?fields=id', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name: FOLDER, mimeType: MIME_FOLDER})}, tok)).json()).id;
  if (!id) throw new Error('드라이브에 폴더를 만들지 못했어요');
  LS.set('gfolder', id); return id;
}
async function gCreate(year){
  if (!gReady()) return toast('개발자 설정이 필요해요');
  if (!leaveLocalOk()) return;
  if (S.gfiles.some(f => !f.year)) await syncGoogle(false);   // 연도를 아직 모르는 시트가 있으면 먼저 확인
  const used = new Set(S.gfiles.map(f => f.year).filter(Boolean)), cy = new Date().getFullYear();
  let y = year;
  if (!y){
    y = cy; while (used.has(y)) y++;
    const ans = prompt('몇 년도 시트를 만들까요?', String(y)); if (ans == null) return;
    y = parseInt(ans, 10);
  }
  if (!(y >= 2000 && y <= 2100)) return toast('연도를 숫자로 넣어 주세요');
  if (used.has(y)) return toast(`${y}년 시트는 이미 연결돼 있어요`);
  try {
    const tok = await gToken(true, 'create:' + y); if (!S.guser) await gWhoAmI(tok);
    busy('생성 중입니다', `구글 드라이브 '자산관리' 폴더에 ${y}년 시트를 만들고 있어요`);
    const tpl = await fetch('template.xlsx'); if (!tpl.ok) throw new Error('템플릿 파일을 찾지 못했어요');
    let folder = null; try { folder = await gFolder(tok); } catch(e){}   // 폴더를 못 만들면 내 드라이브 맨 위에라도 만들어요
    const meta = {name: `가계부_${y}`, mimeType: MIME_SHEET, ...(folder ? {parents: [folder]} : {})};
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
function gRemove(i){
  const f = S.gfiles[i]; if (!confirm(`${f.year ? f.year + '년 ' : ''}'${f.name}' 연결을 해제할까요? (구글 드라이브의 파일은 지워지지 않아요)`)) return;
  S.gfiles.splice(i, 1); gSave();
  if (S.meta.source === 'google' && f.year && !S.gfiles.some(g => g.year === f.year)){ delete S.years[f.year]; LS.set('years', S.years); setYear(S.year); render(); }
  syncSheet();
}
function gSignOut(){
  if (!confirm('구글 계정 연결을 해제할까요? 연결한 시트 목록도 지워져요. (구글 드라이브의 파일은 그대로예요)')) return;
  const sid = LS.get('gsid', null);
  if (sid && gServer()) fetch(gServer() + '/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + sid}}).catch(() => {});   // 서버 세션 삭제 + 구글 권한 취소
  else try { if (gTok && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(gTok.v, () => {}); } catch(e){}
  gTok = null; S.gfiles = []; S.guser = null; gSave(); LS.del('guser'); LS.del('gsid'); LS.del('gfolder');
  if (S.meta.source === 'google'){ S.years = {}; LS.set('years', {}); S.meta = {}; LS.set('meta', {}); setYear(null); render(); }
  syncSheet();
}
function renderG(){
  const ok = gReady();
  $('#gCfg').hidden = ok; $('#gPick').disabled = $('#gCreate').disabled = !ok;
  $('#gUser').textContent = S.guser || (S.gfiles.length ? '로그인 필요' : '연결 안 됨');
  $('#gOut').hidden = !(S.guser || S.gfiles.length);
  const list = S.gfiles.slice().sort((a, b) => (a.year || 9999) - (b.year || 9999));
  $('#gList').innerHTML = list.length ? list.map(f => `<div class="src"><span class="y">${f.year ? f.year + '년' : '확인 전'}${f.gone ? ' · <b class="up">찾을 수 없음</b>' : f.ro ? ' · 보기 전용' : ''}</span>
      <span class="u">${esc(f.name)}</span><a href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(f.id)}/edit" target="_blank" rel="noopener">열기</a><button data-i="${S.gfiles.indexOf(f)}">해제</button></div>`).join('')
    : '<p class="note" style="margin:0">연결된 시트가 없어요</p>';
  $('#gList').querySelectorAll('button').forEach(b => b.onclick = () => gRemove(+b.dataset.i));
}
let gSyncing = false;
async function syncGoogle(interactive){
  if (gSyncing || !S.gfiles.length) return;
  gSyncing = true; $('#syncBtn').classList.add('spin');
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
    finishOb(); setYears(next, {source: 'google'}, S.meta.source === 'google'); applyReps();
    if (dup.length){ const d = dup[0], y = res.find(r => r.f === d).m.year;
      toast(`${y}년 시트는 이미 연결돼 있어서 '${d.name}'${dup.length > 1 ? ` 외 ${dup.length - 1}개` : ''}는 연결하지 않았어요`); }
    else if (fail.length) toast(`${fail.length}개 시트를 불러오지 못했어요: ${fail[0].e.message}`);
    else if (interactive) toast('최신 데이터로 업데이트했어요');
  } finally { gSyncing = false; $('#syncBtn').classList.remove('spin'); }
}
function syncNow(interactive){ if (S.gfiles.length) return syncGoogle(interactive); if (interactive){ toast('설정에서 구글 시트를 연결하세요'); openSheet('google'); } }
$('#gPick').onclick = gPick; $('#gCreate').onclick = () => gCreate(); $('#gOut').onclick = gSignOut;

// 화면 안 버튼 동작 (CSP 때문에 onclick 속성 대신 위임)
document.addEventListener('click', e => { const t = e.target.closest('#view [data-tx]'); if (t) return editTx(t.dataset.tx); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'pending') return openPending();
  if (a === 'openSheet') openSheet('google'); else if (a === 'loadDemo') loadDemo(); else if (a === 'obRestart') restartOb(); else if (a === 'sync') syncNow(true);
  else if (a === 'editBudget') editBudgetMonth(S.month.budget); else if (a === 'editAsset') editAssetMonth(S.month.asset);
  else if (a === 'eb'){ const [m, k] = b.dataset.k.split('|').map(Number), L = S.years[S.year].budget[m], it = L[k];
    if (S.years[S.year].txMode) openItemTx(m, k); else editBudgetItem(m, it.kind, it.name, occ(L, it, bKey)); }
  else if (a === 'addTx') editTx(null); else if (a === 'reps') openReps(); else if (a === 'addRep') editRep(null, true); else if (a === 'cats') openCats(); else if (a === 'budEdit') openBudEdit();
  else if (a === 'homeLedger' || a === 'homeBud' || a === 'homeAddTx'){ const P = homeLedgerPos(); if (!P) return; setYear(P.y); S.month.budget = P.m;
    if (a === 'homeAddTx') return editTx(null);
    S.bview = a === 'homeBud' ? 'bud' : 'cal'; LS.set('bview', S.bview); go('budget'); if (a === 'homeBud') openBudEdit(); }
  else if (a === 'homeGoal') go('analysis'); else if (a === 'budAdd') openBudAdd(); else if (a === 'goBud'){ S.bview = 'bud'; LS.set('bview', 'bud'); render(); }
  else if (a === 'addB') addBudgetItem(S.month.budget, b.dataset.kind); });
