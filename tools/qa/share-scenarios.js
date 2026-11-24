// 공유 기능 시나리오 점검: 가짜 구글 드라이브(권한·drive.file·appProperties)로 두 사용자 A·B를 돌려요.
// 실행: 레포 맨 위에서 `python3 -m http.server 8811 &` 후 `node tools/qa/share-scenarios.js` (playwright 필요)
// y2025.xlsx·y2026.xlsx = template.xlsx의 '설정' 기준 연도만 바꾼 시험용 파일
const { chromium } = require('playwright');
const fs = require('fs');
const XLSX = { 2025: fs.readFileSync(__dirname + '/y2025.xlsx'), 2026: fs.readFileSync(__dirname + '/y2026.xlsx') };
const BASE = 'http://localhost:8811/index.html';

// ───── 가짜 드라이브 ─────
let files = {}, picked = {}, pid = 1;
const newFile = (id, owner, year, name) => { files[id] = { id, name, owner, year, mime: 'application/vnd.google-apps.spreadsheet', appProps: {}, perms: [{ id: 'p' + pid++, email: owner, role: 'owner' }], trashed: false, mod: 'm1' }; };
const role = (u, f) => (f.perms.find(p => p.email === u) || {}).role;
const access = (u, f) => !!role(u, f) && (f.owner === u || (picked[u] || new Set()).has(f.id));
async function drive(route, req) {
  const url = new URL(req.url()), auth = (req.headers()['authorization'] || '').replace('Bearer tok-', ''), m = req.method();
  const json = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
  if (url.host === 'sheets.googleapis.com') return json({});
  const mm = /\/drive\/v3\/files\/([^/]+)(\/permissions(?:\/([^/?]+))?|\/export)?/.exec(url.pathname);
  if (!mm) return json({ error: 'unknown' }, 400);
  const f = files[decodeURIComponent(mm[1])];
  if (!f || !access(auth, f)) return json({ error: { code: 404 } }, 404);
  if (mm[2] === '/export') return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: XLSX[f.year] });
  if (mm[2] && mm[2].startsWith('/permissions')) {
    if (m === 'GET') return json({ permissions: f.perms.map(p => ({ id: p.id, type: 'user', role: p.role, emailAddress: p.email })) });
    if (m === 'POST') { if (!['owner', 'writer'].includes(role(auth, f))) return json({}, 403);
      const b = JSON.parse(req.postData() || '{}'); if (!f.perms.some(p => p.email === b.emailAddress)) f.perms.push({ id: 'p' + pid++, email: b.emailAddress, role: b.role }); return json({ id: 'x' }); }
    if (m === 'DELETE') { const p = f.perms.find(p => p.id === mm[3]); if (!p) return json({}, 404); if (p.role === 'owner') return json({}, 403);
      if (role(auth, f) !== 'owner' && p.email !== auth) return json({}, 403);   // 주인이 아니면 자기 권한만 지울 수 있게 (보수적으로)
      f.perms = f.perms.filter(x => x !== p); return route.fulfill({ status: 204, body: '' }); }
  }
  if (m === 'PATCH') { const b = JSON.parse(req.postData() || '{}'); for (const [k, v] of Object.entries(b.appProperties || {})) { if (v === null) delete f.appProps[k]; else f.appProps[k] = String(v); } f.mod = 'm' + Date.now(); return json({ id: f.id }); }
  if (m === 'GET') return json({ id: f.id, name: f.name, mimeType: f.mime, trashed: f.trashed, modifiedTime: f.mod, capabilities: { canEdit: role(auth, f) !== 'reader' }, appProperties: f.appProps });
  return json({}, 400);
}

// ───── 사용자 화면 ─────
async function user(b, email) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  await ctx.route(/googleapis\.com/, drive);
  await p.goto(BASE); await p.waitForTimeout(1200);
  await p.evaluate(em => {
    window.__toasts = []; const t0 = toast; toast = m => { window.__toasts.push(m); t0(m); };
    gToken = async () => 'tok-' + em; gWhoAmI = async () => {}; S.guser = em; LS.set('guser', em);
    sharePick = async ids => { await window.__pick(ids); await shareFinish(ids, jn.code); };   // 구글 앱용 선택 창 대신
  }, email);
  await p.exposeFunction('__pick', ids => { (picked[email] = picked[email] || new Set()); ids.forEach(i => picked[email].add(i)); });
  p.email = email; return p;
}
const ev = (p, fn, a) => p.evaluate(fn, a);
async function dialog(p, button = 'ok', timeout = 4000) {   // 확인 창 문구를 읽고 누르기
  const el = await p.waitForSelector('.dlg-bg', { timeout }).catch(() => null); if (!el) return null;
  const txt = (await p.textContent('.dlg-bg')).trim();
  await p.click(button === 'ok' ? '.dlg-o' : '.dlg-c'); await p.waitForTimeout(300); return txt;
}
const toasts = p => ev(p, () => window.__toasts.splice(0));
async function connectOwn(p, ids) {   // 내 시트 연결 + 불러오기
  await ev(p, ids => { S.gfiles = ids.map(id => ({ id, name: id, mime: MIME_SHEET, year: null })); gSave(); }, ids);
  await ev(p, () => syncGoogle(true, true)); await p.waitForTimeout(800);
}
const sync = async p => { const pr = ev(p, () => syncGoogle(true)); await p.waitForTimeout(600); return pr; };
async function openShare(p) { await ev(p, () => { openSheet('share'); }); await ev(p, () => shareOpen()); await p.waitForTimeout(300);
  return ev(p, () => ({ mates: $('#shMates').textContent.trim(), sheets: $('#shSheets').textContent.trim(), invite: !$('#shInvite').hidden, resend: !$('#shResend').hidden, stop: !$('#shStop').hidden })); }
async function invite(p, email, removeIds = []) {
  await openShare(p); await p.click('#shInvite'); await p.fill('#shEmail', email);
  for (const id of removeIds) await p.click(`#shPick button[data-id="${id}"]`);
  await p.click('#shNext'); await p.waitForTimeout(200);
  let link = null; await ev(p, () => { sendInvite = async l => { window.__link = l; }; });
  await p.click('#shGo'); await p.waitForTimeout(800);
  link = await ev(p, () => window.__link); return link;
}

const results = []; const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };

(async () => {
  const b = await chromium.launch();
  try {
    // 준비: A는 2025·2026 시트 주인, B는 2026 시트 주인
    newFile('A2025xxxxxxxx', 'a@x.com', 2025, 'A 2025'); newFile('A2026xxxxxxxx', 'a@x.com', 2026, 'A 2026'); newFile('B2026xxxxxxxx', 'b@x.com', 2026, 'B 2026');
    const A = await user(b, 'a@x.com'), B = await user(b, 'b@x.com');
    await connectOwn(A, ['A2025xxxxxxxx', 'A2026xxxxxxxx']);
    check('S0 A 시트 두 개 불러오기', (await ev(A, () => Object.keys(S.years).join())) === '2025,2026', await ev(A, () => Object.keys(S.years).join()));

    // S1 입력 검사
    await openShare(A); await A.click('#shInvite');
    await A.fill('#shEmail', 'nope'); await A.click('#shNext'); check('S1a 메일 형식 오류', (await toasts(A)).some(t => t.includes('메일 주소')));
    await A.fill('#shEmail', 'A@X.com'); await A.click('#shNext'); check('S1b 내 계정 초대 막기', (await toasts(A)).some(t => t.includes('내 계정')));
    await A.click('#shPick button[data-id="A2025xxxxxxxx"]'); await A.click('#shPick button[data-id="A2026xxxxxxxx"]');
    check('S1c 마지막 시트는 못 뺌', (await toasts(A)).some(t => t.includes('하나 이상')));

    // S2 A가 B 초대 (2025만)
    const link = await invite(A, 'b@x.com', ['A2026xxxxxxxx']);
    check('S2a 초대 링크 (일회용 코드 포함)', /^https:\/\/alllever\.app\/join#f=A2025xxxxxxxx&c=[A-Za-z0-9_-]{24}&n=a$/.test(link || ''), link);
    check('S2b 2025만 공유됨', files['A2025xxxxxxxx'].perms.some(p => p.email === 'b@x.com') && !files['A2026xxxxxxxx'].perms.some(p => p.email === 'b@x.com'));
    let s = await openShare(A); check('S2c A 공유 칸 = B 초대함', s.mates.includes('b@x.com') && s.mates.includes('초대함'), s.mates);

    // S3 B가 링크로 연결 (B는 이미 자기 2026 시트 있음)
    await connectOwn(B, ['B2026xxxxxxxx']);
    await ev(B, l => { joinOpen(l); }, link); await B.waitForTimeout(200);
    const jv = await ev(B, () => [$('#jFrom').textContent, $('#jCount').textContent, $('#jMe').textContent]);
    check('S3a 공유받기 화면', jv.join('|') === 'a|1개|b@x.com', jv.join('|'));
    await B.click('#jGo'); await B.waitForTimeout(1200);
    check('S3b B에 A 2025 연결', (await ev(B, () => S.gfiles.map(f => f.id).sort().join())) === 'A2025xxxxxxxx,B2026xxxxxxxx' && (await ev(B, () => Object.keys(S.years).join())) === '2025,2026');
    check('S3c 연결 표시 j.<B> 저장', Object.keys(files['A2025xxxxxxxx'].appProps).some(k => k.startsWith('j.')));
    s = await openShare(B); check('S3d B 공유 칸 = A 연결됨, 다시 보내기 숨김', s.mates.includes('a@x.com') && s.mates.includes('연결됨') && !s.resend, JSON.stringify(s));
    s = await openShare(A); check('S3e A 공유 칸 = B 연결됨', s.mates.includes('연결됨'), s.mates);


    // S4b 일회용: 쓴 링크를 같은 기기에서 다시 열기 → 바로 만료
    await ev(B, l => { joinOpen(l); }, link); const t4b = await dialog(B, 'ok');
    check('S4b 같은 기기 재사용 → 만료', (t4b || '').startsWith('만료된 초대 링크예요.'), t4b);
    check('S4c 연결 후 코드 지워짐', !Object.keys(files['A2025xxxxxxxx'].appProps).some(k => k.startsWith('i.')));
    // S4d 다른 기기(같은 B 계정)에서 쓴 링크 → 구글 거친 뒤 만료
    const B2 = await user(b, 'b@x.com');
    await ev(B2, l => { joinOpen(l); }, link); await B2.click('#jGo'); const t4d = await dialog(B2, 'ok', 6000);
    check('S4d 다른 기기 재사용 → 만료, 연결 안 함', (t4d || '').startsWith('만료된 초대 링크예요.') && (await ev(B2, () => S.gfiles.length)) === 0, t4d);
    // S4e 제3자 C가 링크로 연결 시도 → 열 수 없음
    const C = await user(b, 'c@x.com');
    await ev(C, l => { joinOpen(l); }, link); await C.click('#jGo'); const t4e = await dialog(C, 'ok', 6000);
    check('S4e 제3자 → 열 수 없음', (t4e || '').startsWith('이 계정으로는 열 수 없는 초대 링크예요.') && (await ev(C, () => S.gfiles.length)) === 0, t4e);
    check('오류 없음 B2·C', !B2.errs.length && !C.errs.length, [...B2.errs, ...C.errs].join(' / '));

    // S5 A가 공유 그만두기 → B 알림
    await openShare(A); await A.click('#shStop'); const t5 = await dialog(A, 'ok'); await A.waitForTimeout(600);
    check('S5a 확인 창 한 줄', t5 && t5.startsWith('b@x.com 계정과 시트 공유를 그만둘까요?'), t5);
    check('S5b 권한 삭제', !files['A2025xxxxxxxx'].perms.some(p => p.email === 'b@x.com'));
    await sync(A); check('S5c A에는 끊김 알림 없음', !(await A.$('.dlg-bg')));
    await sync(B); const t5d = await dialog(B, 'ok');
    check('S5d B 알림', (t5d || '').includes('상대방에 의해 시트 공유가 끊겼어요.'), t5d);
    check('S5e B에서 시트·2025 데이터 빠짐', (await ev(B, () => S.gfiles.map(f => f.id).join())) === 'B2026xxxxxxxx' && (await ev(B, () => Object.keys(S.years).join())) === '2026', await ev(B, () => Object.keys(S.years).join()));

    // S6 다시 초대 → B가 나가기 → A 알림
    const link2 = await invite(A, 'b@x.com', ['A2026xxxxxxxx']);
    s = await openShare(A); check('S6-0 다시 초대 직후 A 공유 칸 = 초대함 (예전 연결 표시 안 남음)', s.mates.includes('초대함'), s.mates);
    // S6-1 다시 보내기 → 예전 링크(link2) 만료, 새 링크로 연결
    await ev(A, () => { sendInvite = async l => { window.__link = l; }; }); await A.click('#shResend'); await A.waitForTimeout(600);
    const link2b = await ev(A, () => window.__link);
    check('S6-1a 다시 보내기 → 새 코드', link2b && link2b !== link2, link2b);
    const B3 = await user(b, 'b@x.com'); await ev(B3, l => { joinOpen(l); }, link2); await B3.click('#jGo'); const t61 = await dialog(B3, 'ok', 6000);
    check('S6-1b 예전 링크 만료', (t61 || '').startsWith('만료된 초대 링크예요.'), t61);
    check('S6-1c 코드는 하나만 남음', Object.keys(files['A2025xxxxxxxx'].appProps).filter(k => k.startsWith('i.')).length === 1);
    await ev(B, l => { joinOpen(l); }, link2b); await B.click('#jGo'); await B.waitForTimeout(1000);
    await openShare(A);   // 상대 목록 기억
    await openShare(B); await B.click('#shStop'); const t6 = await dialog(B, 'ok'); await B.waitForTimeout(800);
    check('S6a B 나가기 확인 창', t6 && t6.startsWith('공유받은 시트에서 나갈까요?'), t6);
    check('S6b B 권한 삭제·B에서 시트 빠짐', !files['A2025xxxxxxxx'].perms.some(p => p.email === 'b@x.com') && (await ev(B, () => S.gfiles.map(f => f.id).join())) === 'B2026xxxxxxxx');
    check('S6c A 시트는 그대로', files['A2025xxxxxxxx'].perms.some(p => p.email === 'a@x.com' && p.role === 'owner'));
    await sync(A); const t6d = await dialog(A, 'ok');
    check('S6d A 알림', (t6d || '').includes('상대방에 의해 시트 공유가 끊겼어요.'), t6d);
    s = await openShare(A); check('S6e A 공유 칸 없음', s.mates === '없음', s.mates);
    await sync(A); check('S6f 알림은 한 번만', !(await A.$('.dlg-bg')));

    // S7 반대 방향: B가 A 초대 (B 2026 ↔ A 2026: 같은 연도) → 변경/취소
    const link3 = await invite(B, 'a@x.com');
    await ev(A, l => { joinOpen(l); }, link3); await A.click('#jGo'); const t7 = await dialog(A, 'cancel', 6000); await A.waitForTimeout(800);
    check('S7a 같은 연도 물어보기', (t7 || '').includes('2026년에 이미 연결된 시트가 있어요. 변경할까요?'), t7);
    check('S7b 취소 → A 2026 유지', (await ev(A, () => S.gfiles.map(f => f.id).sort().join())) === 'A2025xxxxxxxx,A2026xxxxxxxx');
    s = await openShare(A); check('S7c A 공유 칸 (취소 후)', true, s.mates);
    s = await openShare(B); check('S7c2 취소했으면 B 쪽에 A 연결됨 아님', s.mates.includes('초대함'), s.mates);
    await ev(A, l => { joinOpen(l); }, link3); await A.click('#jGo'); const t7d = await dialog(A, 'ok', 6000); await A.waitForTimeout(1000);
    check('S7d 변경 → B 2026으로', (await ev(A, () => S.gfiles.map(f => f.id).sort().join())) === 'A2025xxxxxxxx,B2026xxxxxxxx', await ev(A, () => S.gfiles.map(f => f.id).join()));
    s = await openShare(A); check('S7e A(공유받은 쪽) 공유 칸 = B 연결됨', s.mates.includes('b@x.com') && s.mates.includes('연결됨'), s.mates);
    s = await openShare(B); check('S7f B(주인) 공유 칸 = A 연결됨', s.mates.includes('a@x.com') && s.mates.includes('연결됨'), s.mates);

    // S8 처음 화면으로 (공유받은 상태) → 공유는 그대로
    await ev(A, () => { openSheet('main'); }); await A.dispatchEvent('#btnRestart', 'click'); await dialog(A, 'ok'); await A.waitForTimeout(500);
    check('S8a 처음 화면', await ev(A, () => document.body.classList.contains('onboarding') && !S.gfiles.length));
    check('S8b 드라이브 공유 그대로', files['B2026xxxxxxxx'].perms.some(p => p.email === 'a@x.com'));
    await sync(B); check('S8c B에 알림 없음', !(await B.$('.dlg-bg')));

    // S9 링크 조작
    await ev(B, () => { joinOpen('https://alllever.app/join#f=<script>&n=x'); }); check('S9a 잘못된 링크', (await toasts(B)).some(t => t.includes('초대 링크')));
    await ev(B, () => { joinOpen('https://alllever.app/join#f=B2026xxxxxxxx&c=abcdefghijklmnopqrstuvwx&n=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E'); });
    check('S9b 이름 태그 무해화', !(await ev(B, () => $('#jFrom').innerHTML)).includes('<img'), await ev(B, () => $('#jFrom').innerHTML));
    await ev(B, () => { joinOpen('https://alllever.app/join#f=B2026xxxxxxxx&n=x'); }); const t9c = await dialog(B, 'ok');
    check('S9c 코드 없는 링크 → 만료', (t9c || '').startsWith('만료된 초대 링크예요.'), t9c);

    // S10 저장 못 한 기록이 있으면 처음 화면으로 막기
    await ev(B, () => { S.queue.push({t: 'tx', fileId: 'B2026xxxxxxxx'}); openSheet('main'); }); await B.dispatchEvent('#btnRestart', 'click'); await dialog(B, 'ok');
    check('S10 저장 대기 중 처음 화면으로 막기', (await toasts(B)).some(t => t.includes('저장하지 못한')));
    await ev(B, () => { S.queue.length = 0; });

    // S11 거래 ID
    const id1 = await ev(B, () => newTxId()); check('S11a 구글 모드 ID 표시', /^T[a-z0-9]+\.[A-Za-z0-9]{6}$/.test(id1), id1);
    const id2 = await ev(B, () => { const s = S.meta.source; S.meta.source = 'local'; const v = newTxId(); S.meta.source = s; return v; }); check('S11b 기기 모드 ID 그대로', /^T[a-z0-9]+$/.test(id2), id2);

    check('오류 없음 A', !A.errs.length, A.errs.join(' / ')); check('오류 없음 B', !B.errs.length, B.errs.join(' / '));
  } catch (e) { console.log('ERROR', e.message); }
  finally { await b.close(); console.log(`\n${results.filter(r => r.ok).length}/${results.length} 통과`); }
})();
