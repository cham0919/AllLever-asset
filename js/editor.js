// 편집 화면 · 뒤로 가기 · 월 단위 입력
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* 입력·편집 화면 */
// 입력·편집 화면: 오른쪽에서 밀려 들어오는 전체 화면 (위 '‹ 뒤로', 왼쪽 끝에서 오른쪽으로 밀어도 뒤로)
let edNoClose = false;
function openEd(html, opt = {}){
  edNoClose = !!opt.noClose;
  const el = $('#ed'), was = el.classList.contains('on');
  el.className = 'sheet ed page on' + (opt.tall ? ' tall' : '') + (was ? ' swap' : '');
  el.innerHTML = `<div class="phead"><button class="pback" id="edBack"${edNoClose ? ' hidden' : ''}>‹ 뒤로</button><b id="edTitle"></b><span></span></div>` + html;
  const h = el.querySelector('h4'); if (h) $('#edTitle').textContent = (h.childNodes[0]?.textContent || '').trim();
  $('#edBack').onclick = goBack;
  if (!was){ el.scrollTop = 0; hPush(); }
  const f = el.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 280);
}
function closeEd(){
  $('#ed').classList.remove('on', 'swap');
  if (S.tab === 'settings') syncSheet();
  if (!(S.tab === 'settings' && S.spage && S.spage !== 'main')) hPop();
}
const edBackAction = () => { const x = $('#edX'); x ? x.click() : closeEd(); };
/* 뒤로 가기: 화면을 열 때 브라우저 기록을 하나 쌓아서, 안드로이드 뒤로 버튼·사파리 뒤로 밀기·나중에 앱으로 감쌀 때도 같은 동작을 해요 */
const H = {open: !!(history.state && history.state.alv), skip: false};   // 새로고침 전에 쌓인 기록이 남아 있으면 다음에 여는 화면이 그대로 써요
function hPush(){ if (H.open) return; try { history.pushState({alv: 1}, ''); H.open = true; } catch(e){} }
function hPop(){ if (!H.open) return; H.open = false; H.skip = true; history.back(); }
function backAction(){
  if ($('#ed').classList.contains('on')){ if (edNoClose) return; edBackAction(); if ($('#ed').classList.contains('on')) hPush(); return; }
  if (S.tab === 'settings' && S.spage && S.spage !== 'main'){ syncSheet(); sPage('main', true); }
}
function goBack(){ if (H.open) history.back(); else backAction(); }
window.addEventListener('popstate', () => { if (H.skip){ H.skip = false; return; } H.open = false; backAction(); });
(() => {   // 화면 왼쪽 끝에서 오른쪽으로 밀면 뒤로 (편집 화면, 설정 상세 화면)
  let x0 = null, y0 = 0, dx = 0, drag = false, tgt = null;
  const target = () => $('#ed').classList.contains('on') ? (edNoClose ? null : $('#ed')) : S.tab === 'settings' && S.spage && S.spage !== 'main' ? $('#sheet .spage.on') : null;
  document.addEventListener('touchstart', e => { x0 = null; if (e.touches.length > 1 || e.touches[0].clientX > 40) return; tgt = target(); if (!tgt) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; drag = false; }, {passive: true});
  document.addEventListener('touchmove', e => { if (x0 == null) return; dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
    if (!drag){ if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8){ x0 = null; return; } if (dx < 10) return; drag = true; tgt.style.transition = 'none'; }
    tgt.style.transform = `translateX(${Math.max(0, dx)}px)`; if (e.cancelable) e.preventDefault(); }, {passive: false});
  const end = () => { if (x0 == null) return; x0 = null; const t = tgt;
    if (drag && dx > 80){ t.style.transition = 'transform .18s ease-out'; t.style.transform = 'translateX(100%)'; setTimeout(() => { t.style.transition = ''; t.style.transform = ''; goBack(); }, 170); }
    else { t.style.transition = ''; t.style.transform = ''; } drag = false; };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();
function bindWon(inp, onChange){
  inp.addEventListener('input', () => {
    const raw = inp.value, n = parseWon(raw);
    if (/^[\d,]*$/.test(raw.replace(/\s/g, ''))){ const pos = raw.length - inp.selectionStart; inp.value = fmtWon(n); try { inp.setSelectionRange(inp.value.length - pos, inp.value.length - pos); } catch(e){} }
    onChange && onChange(parseWon(inp.value));
  });
}

// ② 가계부 항목 하나 고치기
function editBudgetItem(m, kind, name, idx){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  if (S.years[y].txMode) return openItemTx(m, (S.years[y].budget[m] || []).indexOf(findBudget(S.years[y], m, kind, name, idx)));
  const it = findBudget(S.years[y], m, kind, name, idx); if (!it) return;
  const prev = bMonth(m - 1).items.filter(i => i.kind === kind && i.name === name)[0];
  const hist = []; for (let k = 1; k <= 6; k++){ const x = bMonth(m - k); if (x.has){ const p = x.items.find(i => i.kind === kind && i.name === name); if (p && p.filled) hist.push(p.amt); } }
  const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
  openEd(`<h4>${esc(name)} <button class="ex" id="edX">취소</button></h4>
    <div class="esub">${y}년 ${m}월 · ${kind}${prev ? ` · 지난달 ${prev.filled ? money(prev.amt) : '입력 안 함'}` : ''}${avg != null ? ` · 최근 평균 ${money(avg)}` : ''}</div>
    <div class="ewon"><input id="edAmt" inputmode="numeric" autocomplete="off" placeholder="금액 (예: 1200000 또는 120만)" value="${it.filled ? fmtWon(it.amt) : ''}" autofocus><span>원</span></div>
    <div class="ehint" id="edHint"></div>
    <div class="echips">${prev && prev.filled ? '<button data-v="prev">지난달과 같게</button>' : ''}<button data-v="1e4">+1만</button><button data-v="1e5">+10만</button><button data-v="1e6">+100만</button><button data-v="clear">지우기</button></div>
    <input id="edMemo" class="ememo" maxlength="80" placeholder="메모 (선택) · 예: 여행, 가전 구입" value="${esc(it.memo)}">
    <button class="btn" id="edSave">저장</button>`);
  const inp = $('#edAmt'), hint = v => $('#edHint').textContent = v == null ? '비워 두면 "입력 안 함"으로 저장돼요' : isNaN(v) ? '숫자만 넣어 주세요 (예: 120만)' : '= ' + money(v);
  bindWon(inp, hint); hint(parseWon(inp.value));
  $('#ed').querySelectorAll('.echips button').forEach(b => b.onclick = () => {
    const cur = parseWon(inp.value) || 0, v = b.dataset.v;
    inp.value = v === 'clear' ? '' : fmtWon(v === 'prev' ? prev.amt : cur + +v); hint(parseWon(inp.value)); inp.focus(); });
  $('#edX').onclick = closeEd;
  $('#edSave').onclick = () => {
    const v = parseWon(inp.value), memo = $('#edMemo').value.trim();
    if (Number.isNaN(v)) return toast('금액은 숫자로 넣어 주세요');
    const base = {t: 'b', y, m, kind, name, idx}, ops = [];
    const oldAmt = it.filled ? it.amt : null;
    if (v !== oldAmt) ops.push({...base, f: 'amt', v, o: oldAmt});
    if (memo !== str(it.memo)) ops.push({...base, f: 'memo', v: memo, o: str(it.memo)});
    closeEd(); commit(ops);
  };
}

// ③ 이번 달 한꺼번에 입력
function editBudgetMonth(m){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  const items = S.years[y].budget[m] || [], prevB = bMonth(m - 1);
  const prevOf = it => prevB.items.filter(i => i.kind === it.kind && i.name === it.name)[0];
  const val = new Map(items.map(it => [it, it.filled ? it.amt : null]));
  const rowH = (it, k) => { const p = prevOf(it);
    return `<div class="frow" data-k="${k}"><div class="n">${esc(it.name)}${p && p.filled ? `<small>지난달 ${money(p.amt)}</small>` : ''}</div>
      <input inputmode="numeric" autocomplete="off" placeholder="금액 입력" value="${it.filled ? fmtWon(it.amt) : ''}">
      ${p && p.filled ? '<button class="same">같게</button>' : '<span class="same"></span>'}</div>`; };
  openEd(`<h4>${m}월 가계부 입력 <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${y}년 · 비워 둔 칸은 "입력 안 함"으로 저장돼요</div>
    <div class="echips"><button id="fillFixed">고정비 지난달 값으로 채우기</button><button id="onlyEmpty">빈 칸만 보기</button></div>
    ${KINDS.map(k => { const its = items.filter(i => i.kind === k);
      return `<div class="ecard"><div class="etitle">${k}</div>${its.map(it => rowH(it, items.indexOf(it))).join('') || '<p class="note" style="margin:0">항목이 없어요</p>'}
        <button class="eadd" data-kind="${k}">+ ${k} 항목 추가</button></div>`; }).join('')}
    <div class="ebar"><div class="t" id="fSum"></div><button class="btn" id="edSave">시트에 저장</button></div>`, {tall: true});
  const rows = [...$('#ed').querySelectorAll('.frow')];
  const sumUp = () => {
    let changed = 0, inc = 0, exp = 0, sav = 0;
    for (const it of items){ const v = val.get(it); if ((it.filled ? it.amt : null) !== v) changed++; if (v) (it.kind === '수입' ? inc += v : it.kind === '저축' ? sav += v : exp += v); }
    $('#fSum').innerHTML = `${changed}개 항목 변경<b class="num">저축 ${money(sav)} · 남은 돈 ${money(inc - exp - sav)}</b>`;
  };
  rows.forEach(r => {
    const it = items[+r.dataset.k], inp = r.querySelector('input');
    bindWon(inp, v => { val.set(it, Number.isNaN(v) ? null : v); r.classList.toggle('edited', (it.filled ? it.amt : null) !== val.get(it)); sumUp(); });
    const b = r.querySelector('button.same'); if (b) b.onclick = () => { inp.value = fmtWon(prevOf(it).amt); inp.dispatchEvent(new Event('input')); };
  });
  $('#fillFixed').onclick = () => rows.forEach(r => { const it = items[+r.dataset.k], p = prevOf(it);
    if (it.kind === '고정비' && p && p.filled && !r.querySelector('input').value){ r.querySelector('input').value = fmtWon(p.amt); r.querySelector('input').dispatchEvent(new Event('input')); } });
  $('#onlyEmpty').onclick = e => { const on = e.target.classList.toggle('on'); rows.forEach(r => r.hidden = on && !!r.querySelector('input').value); };
  $('#ed').querySelectorAll('.eadd').forEach(b => b.onclick = async () => {
    const n = items.filter(it => (it.filled ? it.amt : null) !== val.get(it)).length;
    if (n && !(await ask(`입력 중인 ${n}개 값은 저장되지 않아요.\n먼저 저장하려면 취소를 누르세요.`, {ok: '저장 안 하고 추가'}))) return;
    addBudgetItem(m, b.dataset.kind); });
  $('#edX').onclick = closeEd;
  $('#edSave').onclick = () => {
    if ([...rows].some(r => Number.isNaN(parseWon(r.querySelector('input').value)))) return toast('숫자가 아닌 칸이 있어요');
    const ops = [];
    for (const it of items){ const v = val.get(it), o = it.filled ? it.amt : null;
      if (v !== o) ops.push({t: 'b', y, m, kind: it.kind, name: it.name, idx: occ(items, it, bKey), f: 'amt', v, o}); }
    closeEd(); commit(ops); if (!ops.length) toast('바뀐 값이 없어요');
  };
  sumUp();
}

// 가계부 항목 추가
function addBudgetItem(m, kind, fromCats){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  openEd(`<h4>${kind} 항목 추가 <button class="ex" id="edX">취소</button></h4>
    <div class="esub">${y}년 1~12월 시트의 ${kind} 맨 아래에 추가돼요 · 쓰지 않은 달에는 화면에 보이지 않아요</div>
    <input id="adName" class="ememo" maxlength="30" placeholder="항목 이름 (예: 넷플릭스, 보험료)" autofocus>
    <button class="btn" id="edSave">추가</button>`);
  $('#edX').onclick = fromCats ? openCats : closeEd;
  $('#edSave').onclick = () => {
    const name = $('#adName').value.trim(); if (!name) return toast('항목 이름을 넣어 주세요');
    const name2 = name.replace(/\|/g, ' ');
    if (Object.values(S.years[y].budget || {}).some(L => (L || []).some(i => i.kind === kind && i.name === name2))) return toast('같은 이름의 항목이 이미 있어요');
    const months = Array.from({length: 12}, (_, i) => i + 1);   // 항목은 1~12월 모든 달에 추가 (0원인 달은 화면에서 숨겨요)
    closeEd(); commit([{t: 'addB', y, kind, name: name2, months}]);
    if (fromCats) return openCats(null);
    if (!S.years[y].txMode) setTimeout(() => editBudgetItem(m, kind, name, 0), 50);
  };
}

// ④ 자산 월말 잔액 입력
function editAssetMonth(m, bigSel){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  const big = bigSel || '유동자산', list = S.years[y].assets, pv = aMonth(m - 1), cur = aMonth(m);
  const its = list.filter(a => a.big === big), mids = [...new Set(its.map(a => a.mid))];
  const st = editAssetMonth.state && editAssetMonth.state.m === m && editAssetMonth.state.y === y ? editAssetMonth.state : (editAssetMonth.state = {y, m, val: new Map()});
  const V = {get: a => st.val.has(a) ? st.val.get(a) : a.v[m - 1], set: (a, v) => st.val.set(a, v)};   // 탭을 바꿔도 입력값 유지
  const rowH = a => { const p = pv.has ? pv.val(a) : null, v = V.get(a);
    return `<div class="frow${v !== a.v[m - 1] ? ' edited' : ''}" data-k="${list.indexOf(a)}"><button class="n an" aria-label="${esc(a.small)} 항목 고치기">${esc(a.small)} <span class="an-i" aria-hidden="true">›</span>${p != null && pv.has ? `<small>${pv.m}월 ${money(p)}</small>` : ''}</button>
      <input inputmode="numeric" autocomplete="off" placeholder="잔액 입력" value="${v != null ? fmtWon(v) : ''}">
      ${pv.has ? '<button class="same">그대로</button>' : '<span class="same"></span>'}</div>`; };
  const net = () => { let t = 0; for (const a of list){ const v = V.get(a) ?? 0; t += a.big === '부채' ? -v : v; } return t; };
  const changed = () => list.filter(a => V.get(a) !== a.v[m - 1]).length;
  openEd(`<h4>${m}월 말 잔액 <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${y}년 · 매월 말 기준 잔액${big === '부채' ? ' (부채는 남은 금액을 양수로)' : ''}</div>
    <div class="eseg">${BIGS.map(b => `<button data-b="${b}"${b === big ? ' class="on"' : ''}>${b}</button>`).join('')}</div>
    ${pv.has ? '<div class="echips"><button id="fillSame">빈 칸 모두 지난달 값으로</button></div>' : ''}
    <div class="ecard">${mids.map(md => `<span class="tag">${esc(md)}</span>${its.filter(a => a.mid === md).map(rowH).join('')}`).join('') || '<p class="note" style="margin:0">항목이 없어요</p>'}
      <button class="eadd" id="adA">+ ${big} 항목 추가</button></div>
    <div class="ecard"><div class="kv"><span>순자산 (입력 반영)</span><b class="num" id="aNet"></b></div><div class="kv"><span>전월 대비</span><b class="num" id="aDiff"></b></div></div>
    <div class="ebar"><div class="t" id="fSum"></div><button class="btn" id="edSave">시트에 저장</button></div>`, {tall: true});
  const upd = () => { const n = net(), d = pv.has ? n - pv.net : null;
    $('#aNet').textContent = money(n); $('#aDiff').innerHTML = d == null ? '-' : `<span class="${dir(d)}">${signed(d)}</span>`;
    const c = changed(), left = list.filter(a => V.get(a) == null && (pv.has ? pv.val(a) : 0)).length;
    $('#fSum').innerHTML = `${c}개 항목 변경${left ? ` · ${left}개 비어 있음` : ''}<b>${cur.has || c ? '저장하면 시트에 반영돼요' : '처음 입력하는 달이에요'}</b>`; };
  $('#ed').querySelectorAll('.frow').forEach(r => {
    const a = list[+r.dataset.k], inp = r.querySelector('input');
    bindWon(inp, v => { V.set(a, Number.isNaN(v) ? null : v); r.classList.toggle('edited', V.get(a) !== a.v[m - 1]); upd(); });
    const b = r.querySelector('button.same'); if (b) b.onclick = () => { const p = pv.val(a); inp.value = fmtWon(p); inp.dispatchEvent(new Event('input')); };
    r.querySelector('.an').onclick = () => assetItemMenu(m, big, a);
  });
  $('#ed').querySelectorAll('.eseg button').forEach(b => b.onclick = () => editAssetMonth(m, b.dataset.b));
  if (pv.has) $('#fillSame').onclick = () => { for (const a of list) if (V.get(a) == null && pv.val(a)) V.set(a, pv.val(a)); editAssetMonth(m, big); toast('빈 칸을 지난달 값으로 채웠어요 (모든 분류)'); };
  $('#adA').onclick = () => addAssetItem(m, big);
  $('#edX').onclick = () => { editAssetMonth.state = null; closeEd(); };
  $('#edSave').onclick = () => {
    if ([...$('#ed').querySelectorAll('.frow input')].some(i => Number.isNaN(parseWon(i.value)))) return toast('숫자가 아닌 칸이 있어요');
    const ops = list.filter(a => V.get(a) !== a.v[m - 1]).map(a => ({t: 'a', y, m, big: a.big, mid: a.mid, small: a.small, idx: occ(list, a, aKey), v: V.get(a), o: a.v[m - 1]}));
    editAssetMonth.state = null; closeEd(); commit(ops); if (!ops.length) toast('바뀐 값이 없어요');
  };
  upd();
}
const assetMids = (y, big) => [...new Set([...(big === '부채' ? ['대출'] : big === '유동자산' ? ['저축', '투자', '코인'] : ['부동산', '퇴직금', '청약']),
  ...S.years[y].assets.filter(a => a.big === big).map(a => a.mid)])];
// 중분류 고르기 (+ 직접 입력). 고른 값은 get()으로
function midPicker(el, mids, cur){
  let mid = cur ?? mids[0];
  const draw = () => {
    const all = mids.includes(mid) ? mids : [...mids, mid];
    el.innerHTML = all.map(md => `<button data-v="${esc(md)}"${md === mid ? ' class="on"' : ''}>${esc(md)}</button>`).join('') + '<button class="add" data-new="1">+ 직접 입력</button>';
    el.querySelectorAll('button').forEach(b => b.onclick = async () => {
      if (b.dataset.new){ const v = ((await askText('새 중분류', {placeholder: '예: 연금, 금, 자동차', ok: '추가', max: 20})) || '').trim(); if (!v) return; mid = v; }
      else mid = b.dataset.v;
      draw(); });
  };
  draw(); return {get: () => mid};
}
function addAssetItem(m, big){
  const y = S.year, mids = assetMids(y, big);
  openEd(`<h4>${big} 항목 추가 <button class="ex" id="edX">취소</button></h4>
    <div class="esub">'자산관리' 시트의 ${big} 맨 아래(합계에 포함되는 위치)에 추가돼요</div>
    <div class="etitle">중분류</div><div class="echips" id="adMid"></div>
    <input id="adName" class="ememo" maxlength="30" placeholder="항목 이름 (예: 토스증권, ISA)" autofocus>
    <p class="note">중분류에 따라 홈의 묶음이 정해져요: 투자·퇴직금·코인 = 금융투자, 저축·청약 = 현금, 부동산 = 부동산</p>
    <button class="btn" id="edSave">추가</button>`);
  const mp = midPicker($('#adMid'), mids);
  $('#edX').onclick = () => editAssetMonth(m, big);
  $('#edSave').onclick = () => {
    const small = $('#adName').value.trim(), mid = mp.get(); if (!small) return toast('항목 이름을 넣어 주세요');
    if (findAsset(S.years[y], big, mid, small)) return toast('같은 항목이 이미 있어요');
    commit([{t: 'addA', y, big, mid, small}]);
    editAssetMonth.state = null; editAssetMonth(m, big);
  };
}
// 자산 항목 고치기: 이름(소분류)·중분류 바꾸기, 삭제. 시트의 '자산관리' 줄을 그대로 고쳐요 (월별 잔액은 유지)
function assetItemMenu(m, big, a){
  const y = S.year, Y = S.years[y], idx = occ(Y.assets, a, aKey), filled = a.v.filter(v => v != null).length;
  openEd(`<h4>${esc(a.small)} <button class="ex" id="edX">뒤로</button></h4>
    <div class="esub">${big} · ${y}년${filled ? ` · 잔액 ${filled}개월 입력됨` : ''}</div>
    <div class="etitle">이름</div>
    <input id="aiName" class="ememo" maxlength="30" value="${esc(a.small)}" placeholder="항목 이름">
    <div class="etitle">중분류</div><div class="echips" id="aiMid"></div>
    <button class="btn" id="aiSave">저장</button>
    <button class="btn ghost danger" id="aiDel">항목 삭제</button>`);
  const mp = midPicker($('#aiMid'), assetMids(y, big), a.mid);
  $('#edX').onclick = () => editAssetMonth(m, big);
  $('#aiSave').onclick = () => {
    const small = $('#aiName').value.trim(), mid = mp.get(); if (!small) return toast('항목 이름을 넣어 주세요');
    if (small === a.small && mid === a.mid) return editAssetMonth(m, big);
    if (findAsset(Y, big, mid, small)) return toast('같은 항목이 이미 있어요');
    commit([{t: 'renA', y, big, mid: a.mid, small: a.small, idx, to: {mid, small}}]);
    editAssetMonth(m, big);
  };
  $('#aiDel').onclick = async () => {
    if (!(await ask(filled ? `입력된 잔액 ${filled}개월도 함께 지워져요.` : '', {title: `'${a.small}' 항목을 지울까요?`, ok: '지우기', danger: true}))) return;
    editAssetMonth.state?.val?.delete(a);
    commit([{t: 'delA', y, big, mid: a.mid, small: a.small, idx}]);
    editAssetMonth(m, big);
  };
}
