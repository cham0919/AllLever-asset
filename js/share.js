/* ───────── 공유 (가계부를 다른 사람과 함께 쓰기) ─────────
   - 초대: 연결된 구글 시트를 상대 구글 계정에 편집자로 공유해요 (Drive permissions, drive.file 권한).
     구글이 상대에게 알림 메일을 보내고, 앱은 초대 링크(https://alllever.app/join#f=시트id…)를 보내요.
     링크가 새도 구글이 공유한 계정이 아니면 시트를 열 수 없어요.
   - 공유받기: 링크를 열면 구글 '앱용 선택 창'(trigger_onepick, file_ids)에서 그 시트만 보여 주고,
     한 번 고르면 이 앱(drive.file)이 그 시트를 볼 수 있어요. 아이폰도 PC 없이 돼요.
   - 누가 넣었는지: 새 거래 ID 끝에 사람 표시(.xxxxxx, 메일의 해시)를 붙여요(화면 표시는 아직 끔). 시트 모양(열·탭)은 바꾸지 않아요.
     표시 ↔ 이름은 드라이브 파일의 앱 전용 속성(appProperties, 시트 화면에 안 보임)에 'n.<표시>'로 저장해요.
     상대가 연결하면 'j.<표시>'를 남겨 "연결됨"을 알 수 있어요. 메일 주소는 시트·ID에 남기지 않아요. */
const JOIN_URL = 'https://alllever.app/join';
const FILE_ID = /^[\w-]{10,200}$/;
const shareIds = s => { const m = /[#?&]f=([\w,-]+)/.exec(String(s || '')) || /^([\w-]{10,200}(?:,[\w-]{10,200})*)$/.exec(String(s || '').trim());
  return m ? m[1].split(',').filter(x => FILE_ID.test(x)).slice(0, 10) : []; };
const joinFrom = s => { const m = /[#&]n=([^&]*)/.exec(String(s || '')); try { return m ? decodeURIComponent(m[1]).replace(/[\u0000-\u001f<>]/g, '').slice(0, 20) : ''; } catch(e){ return ''; } };
const shareSheets = () => S.gfiles.filter(f => f.mime === MIME_SHEET && !f.gone);
const NAME_MAX = 20;
const cleanName = v => String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX);

// 사람 표시: 메일을 소문자로 바꿔 해시한 앞 6글자 (메일을 되돌릴 수 없게)
let MY_TAG = LS.get('mytag', null)?.e === S.guser ? LS.get('mytag').t : '';
async function tagOf(email){ return (await sha256b64u('alv-share:' + String(email).trim().toLowerCase())).replace(/[^A-Za-z0-9]/g, '').slice(0, 6); }
async function shareInitTag(){
  if (!S.guser){ MY_TAG = ''; return ''; }
  if (LS.get('mytag', null)?.e !== S.guser){ MY_TAG = await tagOf(S.guser); LS.set('mytag', {e: S.guser, t: MY_TAG}); }
  else MY_TAG = LS.get('mytag').t;
  return MY_TAG;
}
const txTag = id => { const m = /\.([A-Za-z0-9]{6})$/.exec(String(id || '')); return m ? m[1] : ''; };
const shareNames = () => LS.get('snames', {}) || {};
// 거래 목록에 넣은 사람 이름은 아직 보여 주지 않아요 (결정 기록 11/24). 켤 때는 txTag(t.id)로 shareNames()에서 찾으면 돼요.

const drive = (path, opt, tok) => gFetch('https://www.googleapis.com/drive/v3/files/' + path, opt, tok);
async function setProps(files, props, tok){
  for (const f of files){ try { await drive(`${encodeURIComponent(f.id)}?fields=id`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({appProperties: props})}, tok); }
    catch(e){ console.warn('appProperties', f.id, e?.message); } }
}
// 연결된 시트들의 이름표를 모아요 (동기화 뒤 뒤에서). 바뀌었으면 화면을 다시 그려요.
async function shareLoadNames(tok){
  const files = shareSheets(); if (!files.length || !tok) return;
  await shareInitTag();
  const names = {}, joined = {};
  await Promise.all(files.map(async f => {
    try { const j = await (await drive(`${encodeURIComponent(f.id)}?fields=appProperties`, {cache: 'no-store'}, tok)).json();
      for (const [k, v] of Object.entries(j.appProperties || {})){
        if (k.startsWith('n.')) names[k.slice(2)] = cleanName(v);
        if (k.startsWith('j.')) joined[k.slice(2)] = true; } }
    catch(e){}
  }));
  const before = JSON.stringify(shareNames());
  LS.set('snames', names); LS.set('sjoined', joined);
  if (JSON.stringify(names) !== before) render();
}

/* ───── 설정 › 공유 ───── */
const sh = {step: 'list', email: '', pick: {}, mates: [], busy: false};
async function shareOpen(){
  sh.step = 'list'; shPaint();
  if (!S.guser || !shareSheets().length) return;
  try {
    const tok = await gToken(false); if (!tok) return;
    await shareInitTag();
    const f = shareSheets()[0];
    const j = await (await drive(`${encodeURIComponent(f.id)}/permissions?fields=permissions(id,type,role,emailAddress)`, {cache: 'no-store'}, tok)).json();
    const me = S.guser.toLowerCase();
    sh.mates = [];
    for (const p of j.permissions || []) if (p.type === 'user' && p.emailAddress && p.emailAddress.toLowerCase() !== me && ['writer', 'owner'].includes(p.role)){
      const tag = await tagOf(p.emailAddress); sh.mates.push({email: p.emailAddress, tag}); }
    if (!isJoinedFile(f.id)) LS.set('smates', sh.mates.map(m => m.email.toLowerCase()));   // 내가 공유한 상대 (나갔는지 알아채려고)
    shPaint();
    await shareLoadNames(tok);   // 상대가 연결했는지(j.표시)·이름표를 새로 받아 다시 그려요
    shPaint();
  } catch(e){ console.warn('share open', e?.message); }
}
function shPaint(){
  const files = shareSheets(), names = shareNames(), joined = LS.get('sjoined', {}) || {}, myName = names[MY_TAG] || (S.guser || '').split('@')[0];
  for (const k of ['list', 'form', 'confirm']) $('#sh-' + k).hidden = sh.step !== k;
  $('#svShare').textContent = sh.mates.length ? (names[sh.mates[0].tag] || sh.mates[0].email.split('@')[0]) : '';
  if (sh.step === 'list'){
    $('#shMe').innerHTML = S.guser ? `${esc(myName)} <small>${esc(S.guser)}</small>` : '<small>구글 계정 연결 안 됨</small>';
    $('#shMates').innerHTML = sh.mates.length ? sh.mates.map(m => `<div>${esc(names[m.tag] || m.email.split('@')[0])} <small>${esc(m.email)}</small><small class="st">${joined[m.tag] ? '연결됨' : '초대함'}</small></div>`).join('') : '<small>없음</small>';
    $('#shSheets').textContent = files.length ? files.map(f => f.name).join(' · ') : '없음';
    const joinedSide = files.some(f => isJoinedFile(f.id));
    $('#shInvite').hidden = !!sh.mates.length; $('#shStop').hidden = !sh.mates.length; $('#shResend').hidden = !sh.mates.length || joinedSide;
  }
  if (sh.step === 'form'){
    $('#shPick').innerHTML = files.filter(f => sh.pick[f.id] !== false).map(f => `<div class="shs"><span>${esc(f.name)}</span><button data-id="${esc(f.id)}" aria-label="${esc(f.name)} 빼기">×</button></div>`).join('');
  }
  if (sh.step === 'confirm'){
    $('#shCEmail').textContent = sh.email;
    $('#shCSheets').textContent = files.filter(f => sh.pick[f.id] !== false).map(f => f.name).join(' · ');
  }
}
$('#shMeRow').onclick = async () => {
  if (!S.guser || !shareSheets().length) return;
  const v = cleanName(await askText('내 이름', {value: shareNames()[MY_TAG] || S.guser.split('@')[0], ok: '저장', max: NAME_MAX}));
  if (!v) return;
  try { const tok = await gToken(true); await shareInitTag(); busy('저장하는 중이에요');
    await setProps(shareSheets(), {['n.' + MY_TAG]: v}, tok); LS.set('snames', {...shareNames(), [MY_TAG]: v}); }
  catch(e){ toast(e.message); } finally { busy(); shPaint(); }
};
$('#shInvite').onclick = () => {
  if (!S.guser || !shareSheets().length) return toast('먼저 구글 시트를 연결해 주세요');
  sh.step = 'form'; sh.pick = {}; $('#shEmail').value = sh.email; shPaint();
};
$('#shPick').onclick = e => { const b = e.target.closest('button'); if (!b) return;
  if (shareSheets().filter(f => sh.pick[f.id] !== false).length <= 1) return toast('시트를 하나 이상 남겨 주세요');
  sh.pick[b.dataset.id] = false; haptic('light'); shPaint(); };
$('#shNext').onclick = () => {
  const email = $('#shEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('#shEmail').focus(); return toast('구글 계정 메일 주소를 확인해 주세요'); }
  if (email === String(S.guser).toLowerCase()) return toast('내 계정은 초대할 수 없어요');
  if (!shareSheets().some(f => sh.pick[f.id] !== false)) return toast('공유할 시트를 골라 주세요');
  sh.email = email; sh.step = 'confirm'; shPaint();
};
$('#shBack').onclick = () => { sh.step = 'form'; shPaint(); };
function inviteLink(files){
  const me = shareNames()[MY_TAG] || (S.guser || '').split('@')[0];
  return JOIN_URL + '#f=' + files.map(f => f.id).join(',') + '&n=' + encodeURIComponent(me);
}
async function sendInvite(link){
  const text = `머니머슬 가계부를 공유했어요. 이 링크를 눌러 연결해 주세요.\n${link}`;
  const Share = nativePlugin('Share');
  try { if (Share){ await holdLock(() => Share.share({title: '머니머슬 공유', text})); return; } if (navigator.share){ await navigator.share({text}); return; } } catch(e){ if (/cancel/i.test(e?.message || '')) return; }
  try { await navigator.clipboard.writeText(link); toast('초대 링크를 복사했어요'); } catch(e){ toast('초대 링크: ' + link); }
}
$('#shGo').onclick = async () => {
  if (sh.busy) return; sh.busy = true;
  const files = shareSheets().filter(f => sh.pick[f.id] !== false), failed = [];
  busy('공유하는 중이에요');
  try {
    const tok = await gToken(true); await shareInitTag();
    const link = inviteLink(files);
    for (const f of files){
      const q = new URLSearchParams({sendNotificationEmail: 'true', fields: 'id', emailMessage: `머니머슬 가계부를 공유했어요. 이 링크를 눌러 연결해 주세요: ${link}`});
      try { await drive(`${encodeURIComponent(f.id)}/permissions?` + q, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: 'user', role: 'writer', emailAddress: sh.email})}, tok); }
      catch(e){ failed.push(f.name); console.warn('share', f.id, e?.message); }
    }
    if (failed.length === files.length) throw new Error('공유하지 못했어요. 시트 주인 계정인지 확인해 주세요');
    if (!shareNames()[MY_TAG]){ const props = {['n.' + MY_TAG]: S.guser.split('@')[0]};   // 내 이름표 (초대 링크의 '보낸 사람')
      await setProps(files, props, tok); LS.set('snames', {...shareNames(), [MY_TAG]: props['n.' + MY_TAG]}); }
    busy(); haptic('success');
    if (failed.length) toast(`공유하지 못한 시트: ${failed.join(', ')}`);
    sh.email = ''; await shareOpen();
    await sendInvite(link);
  } catch(e){ toast(e.message || '공유하지 못했어요'); }
  finally { busy(); sh.busy = false; }
};
$('#shResend').onclick = () => sendInvite(inviteLink(shareSheets()));
$('#shStop').onclick = async () => {
  const m = sh.mates[0]; if (!m) return;
  const mine = shareSheets().filter(f => isJoinedFile(f.id));
  if (mine.length) return shareLeave(mine);   // 공유받은 쪽: 내 권한을 지우고 나가요
  const ok = await ask(`${m.email} 계정과 시트 공유를 그만둘까요?\n그 계정은 이 시트를 더 볼 수 없어요.`, {title: '공유 그만두기', ok: '그만두기', danger: true});
  if (!ok) return;
  LS.set('smates', (LS.get('smates', []) || []).filter(e => e !== m.email.toLowerCase()));   // 내가 끊은 건 알림 안 띄우게
  busy('공유를 그만두는 중이에요');
  try {
    const tok = await gToken(true);
    for (const f of shareSheets()){
      try { const j = await (await drive(`${encodeURIComponent(f.id)}/permissions?fields=permissions(id,emailAddress)`, {cache: 'no-store'}, tok)).json();
        for (const p of j.permissions || []) if ((p.emailAddress || '').toLowerCase() === m.email.toLowerCase())
          await drive(`${encodeURIComponent(f.id)}/permissions/${encodeURIComponent(p.id)}`, {method: 'DELETE'}, tok); }
      catch(e){ console.warn('unshare', f.id, e?.message); }
    }
    toast('공유를 그만뒀어요');
  } catch(e){ toast(e.message); }
  finally { busy(); shareOpen(); }
};

/* ───── 공유가 끊겼을 때 ───── */
const isJoinedFile = id => (LS.get('sjoinedf', []) || []).includes(id);
// 시트와 그 연도 데이터를 앱에서 빼요 (드라이브 파일은 그대로)
function shareDrop(files){
  const ids = files.map(f => f.id);
  S.gfiles = S.gfiles.filter(f => !ids.includes(f.id)); gSave();
  LS.set('sjoinedf', (LS.get('sjoinedf', []) || []).filter(id => !ids.includes(id)));
  if (!(LS.get('sjoinedf', []) || []).length){ LS.del('snames'); LS.del('sjoined'); }
  let changed = false;
  for (const f of files) if (S.meta.source === 'google' && f.year && !S.gfiles.some(g => g.year === f.year)){ delete S.years[f.year]; changed = true; }
  if (changed){ LS.set('years', S.years); setYear(S.year); render(); }
  renderG(); syncSheet();
}
// 공유받은 쪽: 동기화 때 시트를 열 수 없게 됐으면(주인이 공유를 그만둠) 알리고 정리해요
function shareGone(res){
  const gone = res.filter(r => !r.m && r.e && (r.e.gone || r.e.status === 403) && isJoinedFile(r.f.id)).map(r => r.f);
  if (!gone.length) return [];
  shareDrop(gone);
  ask(`상대방에 의해 공유가 끊겼어요.\n${gone.map(f => f.name).join(', ')} 시트를 앱에서 뺐어요.`, {title: '공유가 끊겼어요', ok: '확인', cancel: ''});
  return gone;
}
// 공유한 쪽: 상대가 나갔으면(내 시트 권한 목록에서 사라짐) 알리고 정리해요
let watching = false;
async function shareWatch(tok){
  const before = LS.get('smates', []) || [];
  const f = shareSheets().find(g => !isJoinedFile(g.id));
  if (watching || !before.length || !f || !tok) return;
  watching = true;
  try {
    const j = await (await drive(`${encodeURIComponent(f.id)}/permissions?fields=permissions(type,role,emailAddress)`, {cache: 'no-store'}, tok)).json();
    const now = (j.permissions || []).filter(p => p.type === 'user' && p.emailAddress).map(p => p.emailAddress.toLowerCase());
    const left = before.filter(e => !now.includes(e));
    if (!left.length) return;
    LS.set('smates', before.filter(e => now.includes(e)));
    const props = {};
    for (const e of left){ const tag = await tagOf(e); props['n.' + tag] = null; props['j.' + tag] = null; }
    await setProps(shareSheets().filter(g => !isJoinedFile(g.id)), props, tok);   // 상대 이름표·연결 표시 지우기
    const names = shareNames(); for (const k of Object.keys(props)) delete names[k.slice(2)]; LS.set('snames', names);
    sh.mates = sh.mates.filter(m => !left.includes(m.email.toLowerCase())); if (S.spage === 'share') shPaint();
    await ask(`상대방에 의해 공유가 끊겼어요.\n${left.join(', ')} 계정은 이제 시트를 볼 수 없어요.`, {title: '공유가 끊겼어요', ok: '확인', cancel: ''});
  } catch(e){ console.warn('share watch', e?.message); }
  finally { watching = false; }
}
// 공유받은 쪽이 나가기: 내 권한을 지우고(주인 쪽에 알림이 가요) 앱에서 시트를 빼요
async function shareLeave(files){
  const ok = await ask('공유받은 시트에서 나갈까요?\n이 시트를 더 볼 수 없고, 앱에서도 빠져요.', {title: '공유 그만두기', ok: '그만두기', danger: true});
  if (!ok) return;
  busy('공유를 그만두는 중이에요');
  try {
    const tok = await gToken(true); await shareInitTag();
    await setProps(files, {['j.' + MY_TAG]: null}, tok);
    for (const f of files){
      try { const j = await (await drive(`${encodeURIComponent(f.id)}/permissions?fields=permissions(id,emailAddress)`, {cache: 'no-store'}, tok)).json();
        const me = (j.permissions || []).find(p => (p.emailAddress || '').toLowerCase() === S.guser.toLowerCase());
        if (me) await drive(`${encodeURIComponent(f.id)}/permissions/${encodeURIComponent(me.id)}`, {method: 'DELETE'}, tok); }
      catch(e){ console.warn('leave', f.id, e?.message); }
    }
    shareDrop(files); sh.mates = []; sPage('main'); toast('공유를 그만뒀어요');
  } catch(e){ toast(e.message); }
  finally { busy(); }
}

/* ───── 공유받기 ───── */
const jn = {ids: [], from: ''};
function joinOpen(url){
  const ids = shareIds(url); if (!ids.length) return toast('초대 링크를 확인해 주세요');
  jn.ids = ids; jn.from = joinFrom(url);
  openSheet('join'); jPaint();
}
function jPaint(){
  $('#jFrom').textContent = jn.from || '알 수 없음';
  $('#jCount').textContent = `${jn.ids.length}개`;
  $('#jMe').textContent = S.guser || '로그인 전';
  $('#jGo').textContent = S.guser ? '연결하기' : '구글로 로그인하고 연결하기';
}
$('#jGo').onclick = async () => {
  if (!jn.ids.length) return;
  if (!(await leaveLocalOk())) return;
  if (!S.guser){
    if (!NATIVE){ LS.set('pjoin', jn); return gLogin('join'); }
    try { await nativeLogin(); } catch(e){ if (!e.canceled) toast(e.message); return; }
    jPaint();
  }
  await sharePick(jn.ids);
};
async function sharePick(ids){
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const q = new URLSearchParams({file: ids.join(','), nonce, hint: S.guser});
  if (!NATIVE){ LS.set('pnonce', nonce); q.set('return', location.origin + location.pathname); location.href = gServer() + '/auth/pick-start?' + q; return; }
  q.set('return', `${APP_SCHEME}://picked`);
  try {
    const back = await nativeAuthSession(gServer() + '/auth/pick-start?' + q, 'picked');
    const h = new URLSearchParams(String(back).split('#')[1] || '');
    if (h.get('alv_nonce') !== nonce) throw new Error('이 기기에서 시작한 요청이 아니에요. 다시 시도해 주세요');
    if (h.has('alv_err')) throw new Error(['access_denied', 'denied', 'none'].includes(h.get('alv_err')) ? '시트를 고르지 않았어요' : '시트를 연결하지 못했어요 (' + h.get('alv_err') + ')');
    await shareFinish(shareIds(h.get('alv_picked')));
  } catch(e){ if (!e.canceled) toast(e.message); }
}
function shareReturn(h){   // 웹: 구글에서 돌아왔을 때 (gReturn에서 불러요)
  history.replaceState(null, '', location.pathname + location.search);
  const nonce = LS.get('pnonce', null); LS.del('pnonce');
  if (h.get('alv_nonce') !== nonce){ toast('이 기기에서 시작한 요청이 아니라서 무시했어요'); return null; }
  if (h.has('alv_err')){ toast('시트를 연결하지 못했어요 (' + h.get('alv_err') + ')'); return null; }
  return 'joined:' + shareIds(h.get('alv_picked')).join(',');
}
async function shareFinish(ids){
  if (!ids.length) return toast('고른 시트가 없어요');
  busy('시트를 연결하는 중이에요');
  try {
    const tok = await gToken(true), docs = [];
    for (const id of ids){
      try { const j = await (await drive(`${encodeURIComponent(id)}?fields=id,name,mimeType,trashed`, {cache: 'no-store'}, tok)).json();
        if (j.id && !j.trashed && j.mimeType === MIME_SHEET) docs.push({id: j.id, name: String(j.name || '').slice(0, 200), mime: j.mimeType}); }
      catch(e){ console.warn('join read', id, e?.message); }
    }
    if (!docs.length){ busy(); return toast('시트를 열 수 없어요. 초대받은 구글 계정으로 로그인했는지 확인해 주세요'); }
    await shareInitTag();
    const props = {['j.' + MY_TAG]: '1'};   // 연결됨 표시 (이름은 초대한 사람이 정한 이름을 그대로 두고, 없을 때만 넣어요)
    if (!shareNames()[MY_TAG]) props['n.' + MY_TAG] = S.guser.split('@')[0];
    await setProps(docs, props, tok);
    busy();
    LS.set('sjoinedf', [...new Set([...(LS.get('sjoinedf', []) || []), ...docs.map(d => d.id)])]);   // 내가 공유받은 시트
    const n = gAdd(docs); jn.ids = [];
    if (S.spage === 'join') sPage('main');
    if (n) await syncGoogle(true, true); else toast('이미 연결된 시트예요');
    shareLoadNames(tok);
  } catch(e){ busy(); toast(e.message || '시트를 연결하지 못했어요'); }
}

// 앱: https://alllever.app/join#… (유니버설 링크·앱 링크) 또는 com.alllever.asset://join#… 으로 열렸을 때
if (NATIVE){
  const isJoin = u => /^https:\/\/alllever\.app\/join\b/.test(u) || u.startsWith(`${APP_SCHEME}://join`);
  const App = nativePlugin('App');
  App?.addListener('appUrlOpen', e => { const u = String(e.url || ''); if (isJoin(u)) joinOpen(u); });
  App?.getLaunchUrl?.().then(r => { const u = String(r?.url || ''); if (isJoin(u)) setTimeout(() => joinOpen(u), 300); }).catch(() => {});
}
shareInitTag();
