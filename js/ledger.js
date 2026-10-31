// 달력 가계부 · 예산 · 통계 · 거래·반복·분류 입력
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 달력 가계부 (거래 내역 · 세부분류 · 반복 거래) ─────────
   시트 'N월'의 같은 머리글 행에 [구분·항목·금액·메모·세부분류·월 예산] + [거래 내역: 일·구분·항목·세부분류·금액·결제수단·메모·ID]
   + [반복 거래: 일·구분·항목·세부분류·금액·결제수단·메모]가 나란히 있어요. 항목 금액 = 그 달 거래 합계. */
const TX_COLS = 8, REP_COLS = 7, EXP_KINDS = ['고정비', '변동비'];
const splitSubs = v => str(v).split(/[,，、/]/).map(s => s.trim()).filter(Boolean);
const daysIn = (y, m) => new Date(y, m, 0).getDate();
function dayOf(v){
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 31 ? new Date(Math.round((v - 25569) * 864e5)).getUTCDate() : Math.round(v);
  const mm = /(\d{1,2})\D*$/.exec(String(v).trim()); return mm ? +mm[1] : null;
}
// 시트 배치 찾기: 구분별 표 머리글(h) → 세부분류·월 예산 열, 거래 내역·반복 거래는 각자 머리글 행을 찾아요.
// 옛 양식은 세 표가 한 머리글 행에 나란히, 새 양식은 오른쪽에 반복 거래(위) · 거래 내역(아래)이 세로로 있어요.
function ledgerCols(V, h){
  const r = {sub: -1, bud: -1, tx: -1, txH: -1, rep: -1, repH: -1, repEnd: undefined};
  const H0 = (V[h] || []).map(str);
  H0.forEach((x, j) => { if (j < 8 && x === '세부분류' && r.sub < 0) r.sub = j; if (j < 8 && x === '월 예산') r.bud = j; });
  for (let i = 0; i < V.length && (r.tx < 0 || r.rep < 0); i++){
    const H = (V[i] || []).map(str);
    H.forEach((x, j) => { if (x !== '일' || j < 6 || H[j + 1] !== '구분' || H[j + 2] !== '항목') return;
      if (H[j + 7] === 'ID'){ if (r.tx < 0){ r.tx = j; r.txH = i; } } else if (r.rep < 0){ r.rep = j; r.repH = i; } });
  }
  if (r.tx >= 0 && r.rep === r.tx && r.txH > r.repH) r.repEnd = r.txH - 1;   // 세로 배치: 반복 거래는 거래 내역 제목 행 전까지
  if (r.tx >= 0) for (let i = r.txH + 1; i < V.length; i++) if (str((V[i] || [])[r.tx]).startsWith('▲')){ r.txEnd = i; break; }   // 거래 내역 끝 '▲' 행 (없으면 끝없이)
  return r;
}
const leftW = C => Math.min(Math.max(6, C.sub + 1, C.bud + 1), C.tx);   // 왼쪽 표 너비 (숨긴 세부분류 열 포함, 거래 내역 앞까지)
const txCap = C => C.txEnd == null ? Infinity : C.txEnd - C.txH - 1;   // 거래 내역 칸 수
const repCap = C => C.repEnd == null ? Infinity : C.repEnd - C.repH - 2;   // 반복 거래 칸 수 (거래 내역 위 빈 줄 하나는 남김)
function readTx(V, h, c, m){
  const out = [];
  for (let i = h + 1; i < V.length; i++){ const r = V[i] || [], g = k => r[c + k];
    if (str(g(0)).startsWith('▲')) break;   // 거래 내역 끝 표시 행
    const kind = str(g(1)), name = str(g(2)), amt = toNum(g(4)), id = str(g(7));
    if (!kind && !name && amt == null && !id) continue;
    if (!KINDS.includes(kind) || !name) continue;
    out.push({id: id || `S${m}-${i}`, d: Math.min(Math.max(dayOf(g(0)) || 1, 1), 31), kind, name, sub: str(g(3)), amt: amt ?? 0, pay: str(g(5)), memo: str(g(6)), skip: amt == null, row: i + 1});
  }
  return out;
}
function readReps(V, h, c, end = V.length){
  const out = [];
  for (let i = h + 1; i < Math.min(end, V.length); i++){ const r = V[i] || [], g = k => r[c + k];
    const kind = str(g(1)), name = str(g(2)); if (!KINDS.includes(kind) || !name) continue;
    out.push({day: Math.min(Math.max(dayOf(g(0)) || 1, 1), 31), kind, name, sub: str(g(3)), amt: toNum(g(4)), pay: str(g(5)), memo: str(g(6)), row: i + 1});
  }
  return out;
}
const txRow = t => [t.d, t.kind, t.name, t.sub || '', t.skip ? '' : t.amt, t.pay || '', t.memo || '', t.id];
const repRow = r => [r.day, r.kind, r.name, r.sub || '', r.amt ?? '', r.pay || '', r.memo || ''];
function recalcMonth(Y, m){
  if (!Y?.txMode) return;
  const T = (Y.tx?.[m] || []).filter(t => !t.skip), seen = new Set();
  for (const it of Y.budget[m] || []){
    const k = bKey(it); if (seen.has(k)){ it.amt = 0; it.filled = false; continue; } seen.add(k);
    const L = T.filter(t => t.kind === it.kind && t.name === it.name);
    it.amt = L.reduce((a, t) => a + t.amt, 0); it.filled = L.length > 0;
  }
}
function hash36(s){ let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); }
const repId = r => 'R' + hash36([r.kind, r.name, r.sub || '', r.memo || ''].join('|'));
const newTxId = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const txOf = (m, y = S.year) => { [m, y] = wrapYM(m, y); return S.years?.[y]?.txMode ? (S.years[y].tx?.[m] || []).filter(t => !t.skip) : null; };
const shortAmt = n => { const a = Math.abs(n); return a >= 1e5 ? Math.round(a / 1e4) + '만' : a >= 1e4 ? (+(a / 1e4).toFixed(1)) + '만' : a.toLocaleString('ko-KR'); };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const PAY_OPTS = ['신용카드', '체크카드', '현금'];
S.payOff = LS.get('payOff', []);   // 설정에서 끈 결제수단 (거래 입력 화면에서 숨김)
const payChips = (id, cur) => `<div class="elbl">결제수단</div><div class="echips" id="${id}">${[...PAY_OPTS.filter(p => !S.payOff.includes(p) || p === cur), ...(cur && !PAY_OPTS.includes(cur) ? [cur] : [])].map(p => `<button data-p="${esc(p)}"${p === cur ? ' class="on"' : ''}>${esc(p)}</button>`).join('')}</div>`;
const bindPay = (id, st) => document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => { st.pay = st.pay === b.dataset.p ? '' : b.dataset.p;
  document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x.dataset.p === st.pay)); });
const groupKey = t => t.sub || t.name;
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b; };

// 반복 거래: 날짜가 된 것부터 그 달 거래 내역에 넣어요 (같은 반복은 ID로 한 번만)
function applyReps(){
  const now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1, cd = now.getDate(), ops = [];
  for (const y of yearsList()){
    const Y = S.years[y]; if (!Y?.txMode || y > cy || !canEdit(y)) continue;
    for (let m = 1; m <= 12; m++){
      if (y === cy && m > cm) break;
      for (const r of Y.reps?.[m] || []){
        if (r.amt == null || (y === cy && m === cm && r.day > cd)) continue;
        const id = repId(r); if ((Y.tx?.[m] || []).some(t => t.id === id)) continue;
        if (!(Y.budget[m] || []).some(i => i.kind === r.kind && i.name === r.name)) continue;
        ops.push({t: 'tx', y, m, act: 'set', tx: {id, d: Math.min(r.day, daysIn(y, m)), kind: r.kind, name: r.name, sub: r.sub, amt: r.amt, pay: r.pay, memo: r.memo || '반복', skip: false}});
      }
    }
  }
  if (ops.length){ commit(ops, true); toast(`반복 거래 ${ops.length}건을 넣었어요`); }
}

/* 가계부 탭 위쪽: 달력 / 통계 / 요약 */
S.bview = LS.get('bview', 'cal'); S.rview = LS.get('rview', 'm');
if (['stat', 'sum', 'year'].includes(S.bview)){ S.rview = S.bview === 'year' ? 'y' : 'm'; S.bview = 'rep'; LS.set('bview', 'rep'); LS.set('rview', S.rview); }   // 예전 보기 이름 정리
const effView = () => S.model?.txMode && ['cal', 'bud', 'rep'].includes(S.bview) ? S.bview : 'rep';
const rsegHtml = () => `<div class="rseg"><button data-rv="m"${S.rview !== 'y' ? ' class="on"' : ''}>월간</button><button data-rv="y"${S.rview === 'y' ? ' class="on"' : ''}>연간</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-rv]'); if (!b) return; S.rview = b.dataset.rv; LS.set('rview', S.rview); render(); });
const bsegHtml = () => S.model?.txMode ? `<div class="bseg">${[['cal', '달력'], ['bud', '예산'], ['rep', '레포트']].map(([v, l]) => `<button data-bv="${v}"${effView() === v ? ' class="on"' : ''}>${l}</button>`).join('')}</div>` : '';
document.addEventListener('click', e => { const b = e.target.closest('[data-bv]'); if (!b) return; S.bview = b.dataset.bv; LS.set('bview', S.bview); render(); });

function selDay(y, m){
  const s = S.sel; if (s && s.y === y && s.m === m) return s.d;
  const now = new Date(); if (now.getFullYear() === y && now.getMonth() + 1 === m) return now.getDate();
  const T = txOf(m, y) || []; return T.length ? Math.max(...T.map(t => t.d)) : 1;
}
function txRowHtml(t, ed){
  const inc = t.kind === '수입', sav = t.kind === '저축';
  return `<div class="row${ed ? ' tap' : ''}" ${ed ? `data-tx="${esc(t.id)}" role="button" tabindex="0"` : ''}><div class="tico ${inc ? 'inc' : sav ? 'sav' : ''}">${esc((t.sub || t.name).slice(0, 1))}</div>
    <div class="n">${esc(t.memo && t.memo !== '반복' ? t.memo : (t.sub || t.name))}${t.id.startsWith('R') ? '<span class="rep">반복</span>' : ''}<small>${esc(t.name)}${t.sub ? ' › ' + esc(t.sub) : ''}${t.pay ? ' · ' + esc(t.pay) : ''}</small></div>
    <div class="a num ${inc ? 'inc' : sav ? 'sav' : 'exp'}">${inc ? '+' : sav ? '' : '-'}${fmtWon(t.amt)}</div></div>`;
}
function viewCal(){
  const y = S.year, m = S.month.budget, Y = S.model, T = (Y.tx[m] || []).filter(t => !t.skip), b = bMonth(m), ed = canEdit();
  const n = daysIn(y, m), first = new Date(y, m - 1, 1).getDay(), d0 = selDay(y, m), now = new Date();
  const isToday = d => now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d;
  const fut = d => new Date(y, m - 1, d) > now;
  const per = {}; for (const t of T){ const p = per[t.d] = per[t.d] || {i: 0, e: 0, v: 0}; if (t.kind === '수입') p.i += t.amt; else if (t.kind === '저축') p.s = (p.s || 0) + t.amt; else { p.e += t.amt; if (t.kind === '변동비') p.v += t.amt; } }
  const bs = budState(y, m);
  let cells = WD.map((w, i) => `<div class="w${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('') + '<div></div>'.repeat(first);
  for (let d = 1; d <= n; d++){ const p = per[d];
    cells += `<button class="d${d === d0 ? ' sel' : ''}${isToday(d) ? ' today' : ''}${fut(d) ? ' fut' : ''}" data-day="${d}"><span>${d}</span>${p && p.i ? `<small class="inc">+${shortAmt(p.i)}</small>` : ''}${p && p.e ? `<small class="exp">-${shortAmt(p.e)}</small>` : ''}${p && p.s ? `<small class="sav">${shortAmt(p.s)}</small>` : ''}</button>`; }
  const dayT = T.filter(t => t.d === d0).sort((a, z) => (a.kind === '수입') - (z.kind === '수입') || z.amt - a.amt);
  const dSum = dayT.reduce((a, t) => a + (t.kind === '수입' ? t.amt : t.kind === '저축' ? 0 : -t.amt), 0);
  const reps = (Y.reps[m] || []).length;
  $('#view').innerHTML = bsegHtml() + `
  <section class="card"><div class="sum3 num"><div>수입<b class="inc">${money(b.income)}</b></div><div>지출<b class="exp">${money(b.expense)}</b></div><div>저축<b class="sav">${money(b.save)}</b></div></div>${bs.total ? budStrip(bs) : ''}</section>
  <section class="card calcard"><div class="cal num">${cells}</div></section>
  <section class="card">
    <div class="dayhead"><b>${m}월 ${d0}일 ${WD[new Date(y, m - 1, d0).getDay()]}요일</b><span class="num">${dayT.length ? (dSum > 0 ? '+' : '') + fmtWon(dSum) + '원' : ''}</span></div>
    ${dayT.map(t => txRowHtml(t, ed)).join('') || `<p class="note" style="margin:6px 0">${ed ? '거래가 없어요. + 버튼으로 입력하세요.' : '거래가 없어요.'}</p>`}
  </section>
  ${ed ? `<div class="ltools"><button data-act="addRep">+ 반복 거래 추가</button><button data-act="cats">분류 관리</button></div>
  <button class="fab" data-act="addTx" aria-label="거래 추가">+</button><div style="height:64px"></div>` : `<p class="note" style="text-align:center">${esc(editNote(y))}</p>`}`;
  $('#view').querySelectorAll('[data-day]').forEach(el => el.onclick = () => { S.sel = {y, m, d: +el.dataset.day}; render(); });
}

/* ───────── 예산 ─────────
   예산 = 그 달 지출 항목(고정비·변동비)의 '월 예산' 합계. 오늘까지 적정선: 변동비는 날짜 비율, 고정비는 이미 낸 만큼. */
function withNote(base){ const f = S.saveNote; S.saveNote = null; const n = f ? f() : ''; return n ? `${base} · ${n}` : base; }
function budNote(y, m, kind, name){
  const it = findBudget(S.years[y], m, kind, name, 0); if (!it || !(it.bud > 0)) return '';
  const r = it.amt / it.bud;
  return r > 1 ? `${it.name} 예산을 ${money(it.amt - it.bud)} 넘었어요` : `${it.name} 예산 ${Math.round(r * 100)}% 썼어요 (남은 ${money(it.bud - it.amt)})`;
}
function budState(y, m){
  const items = (S.years[y]?.budget?.[m] || []).filter(i => EXP_KINDS.includes(i.kind));
  const nd = daysIn(y, m), now = new Date(), cur = now.getFullYear() === y && now.getMonth() + 1 === m, ended = new Date(y, m, 1) <= now;
  const day = cur ? now.getDate() : ended ? nd : 0, frac = day / nd, canProj = cur && day >= 3;
  const rows = items.filter(i => i.bud > 0).map(i => {
    const fixed = i.kind === '고정비', exp = fixed ? Math.min(i.amt, i.bud) : i.bud * frac;
    const proj = fixed ? Math.max(i.amt, i.bud) : canProj ? i.amt / frac : ended ? i.amt : Math.max(i.amt, i.bud);
    const st = i.amt > i.bud ? 'over' : fixed ? (i.amt >= i.bud ? 'done' : 'plan') : (cur && i.amt > exp * 1.1 && i.amt - exp >= 1e4) || i.amt / i.bud >= .85 ? 'warn' : cur && i.amt > exp ? 'fit' : 'ok';
    return {it: i, fixed, exp, proj, st};
  });
  const unb = items.filter(i => !(i.bud > 0) && i.amt > 0), unbAmt = unb.reduce((a, i) => a + i.amt, 0);
  const total = rows.reduce((a, r) => a + r.it.bud, 0), spent = rows.reduce((a, r) => a + r.it.amt, 0);   // 예산을 정한 항목만 비교
  const okLine = rows.reduce((a, r) => a + r.exp, 0);
  const proj = rows.reduce((a, r) => a + r.proj, 0);
  const fixedLeft = rows.filter(r => r.fixed).reduce((a, r) => a + Math.max(0, r.it.bud - r.it.amt), 0);
  const left = cur ? nd - day + 1 : 0, daily = left ? Math.max(0, total - spent - fixedLeft) / left : 0;
  const varBud = rows.filter(r => !r.fixed).reduce((a, r) => a + r.it.bud, 0);
  return {y, m, nd, day, frac, cur, ended, canProj, rows, unb, unbAmt, total, spent, okLine, proj, left, daily, dayBase: varBud / nd};
}
const bClass = r => r > 1 ? 'bf-over' : r >= .85 ? 'bf-warn' : '';   // 막대 색 (전역 .warn 과 겹치지 않게 bf- 접두어)
function budStrip(bs){
  const rem = bs.total - bs.spent, r = bs.spent / bs.total;
  return `<button class="bstrip" data-act="goBud"><div class="l"><span>${rem >= 0 ? `예산 <b>${money(rem)}</b> 남음` : `예산 <b class="up">${money(-rem)}</b> 넘음`}${bs.cur && bs.daily ? ` · 하루 ${money(bs.daily)}` : ''}</span><span class="num">${Math.round(r * 100)}% ›</span></div>
    <div class="btrack sm"><i class="${bClass(r)}" style="width:${Math.min(r, 1) * 100}%"></i>${bs.cur ? `<b class="bpace" style="left:${Math.min(bs.okLine / bs.total, 1) * 100}%"></b>` : ''}</div></button>`;
}
function viewBud(){
  const y = S.year, m = S.month.budget, bs = budState(y, m), ed = canEdit();
  let html = bsegHtml();
  if (!bs.total){
    $('#view').innerHTML = html + `<section class="card bempty"><b>${m}월 예산을 정해 보세요</b><p>항목마다 한 달에 쓸 금액을 정하면, 남은 돈과 하루에 쓸 수 있는 금액, 월말 예상 지출을 알려줘요.</p>
      ${ed ? `<button class="btn" data-act="budEdit">예산 정하기</button>` : `<p class="note">${esc(editNote(y))}</p>`}</section>`; return; }
  const rem = bs.total - bs.spent, r = bs.spent / bs.total;
  const tops = bs.rows.filter(x => !x.fixed && x.it.amt > x.exp).sort((a, z) => (z.it.amt - z.exp) - (a.it.amt - a.exp)).slice(0, 2).map(x => x.it.name);
  let alert = '';
  if (bs.canProj && bs.proj > bs.total) alert = `<div class="balert bad">이 속도면 월말에 <b>${money(bs.proj - bs.total)} 초과</b>해요.${tops.length ? ` ${tops.map(esc).join('·')}${josa(tops.at(-1), '을', '를')} 줄이면 맞출 수 있어요.` : ''}</div>`;
  else if (bs.cur && bs.spent <= bs.okLine + 1e4) alert = `<div class="balert good">${bs.okLine - bs.spent >= 1e4 ? `적정선보다 <b>${money(bs.okLine - bs.spent)}</b> 덜 썼어요` : '적정선에 맞게 쓰고 있어요'}. 이대로면 예산 안에서 끝나요.</div>`;
  else if (bs.ended) alert = rem >= 0 ? `<div class="balert good">예산보다 <b>${money(rem)}</b> 아꼈어요.</div>` : `<div class="balert bad">예산을 <b>${money(-rem)}</b> 넘었어요.</div>`;
  const g3 = bs.cur ? [['하루 권장', money(bs.daily)], ['오늘까지 적정', money(bs.okLine)], ['월말 예상', bs.canProj ? money(bs.proj) : '-', bs.canProj && bs.proj > bs.total ? 'up' : '']]
    : [['예산', money(bs.total)], ['쓴 돈', money(bs.spent)], [rem >= 0 ? '남은 돈' : '초과', money(Math.abs(rem)), rem < 0 ? 'up' : '']];
  html += `<section class="card bhero"><div class="lab">${bs.cur ? '이번 달' : `${m}월`} 예산 ${money(bs.total)} 중</div>
    <div class="big num">${rem >= 0 ? `${money(rem)} 남았어요` : `${money(-rem)} 넘었어요`}<em>${Math.round(r * 100)}% 사용</em></div>
    <div class="btrack"><i class="${bClass(r)}" style="width:${Math.min(r, 1) * 100}%"></i>${bs.cur ? `<b class="bpace" style="left:${Math.min(bs.okLine / bs.total, 1) * 100}%" data-l="적정선"></b>` : ''}</div>
    <div class="bmeta2"><span>${bs.unbAmt ? '예산 항목에서 ' : ''}쓴 돈 ${money(bs.spent)}</span><span>${bs.cur ? `남은 날 ${bs.left}일 (오늘 포함)` : bs.ended ? '지난 달' : '아직 시작 전'}</span></div>
    <div class="bg3 num">${g3.map(([k, v, c]) => `<div>${k}<b${c ? ` class="${c}"` : ''}>${v}</b></div>`).join('')}</div>${alert}</section>`;
  const TAG = {ok: '여유', fit: '적정', warn: '주의', over: '초과', done: '완료', plan: '예정'};
  const rowHtml = x => { const i = x.it, rr = i.amt / i.bud, idx = (S.model.budget[m] || []).indexOf(i);
    let l = '', rt = '';
    if (x.st === 'over'){ const subs = {}; for (const t of (S.model.tx[m] || []).filter(t => !t.skip && t.kind === i.kind && t.name === i.name)) subs[t.sub || '기타'] = (subs[t.sub || '기타'] || 0) + t.amt;
      l = `<span class="up">${money(i.amt - i.bud)} 초과</span>`; rt = Object.entries(subs).sort((a, z) => z[1] - a[1]).slice(0, 2).map(([k, v]) => `${esc(k)} ${shortAmt(v)}`).join(' · '); }
    else if (x.fixed) l = x.st === 'done' ? '이번 달 냈어요' : `남은 ${money(i.bud - i.amt)}`;
    else { const d = i.amt - x.exp; l = bs.cur ? (Math.abs(d) < 1e4 ? '적정선에 맞게 쓰는 중' : d > 0 ? `적정선보다 ${money(d)} 더 씀` : `적정선보다 ${money(-d)} 덜 씀`) : `${Math.round(rr * 100)}% 사용`;
      rt = `남은 ${money(i.bud - i.amt)}${bs.cur && bs.left ? ` · 하루 ${money((i.bud - i.amt) / bs.left)}` : ''}`; }
    return `<div class="swrap"><button class="sdel" aria-label="${esc(i.name)} 예산 삭제">삭제</button><button class="bit" data-bi="${idx}"><div class="r1"><span class="nm">${esc(i.name)} <span class="btag t-${x.st}">${TAG[x.st]}</span></span><span class="am num"><b>${money(i.amt)}</b> / ${money(i.bud)}</span></div>
      <div class="btrack sm"><i class="${x.st === 'done' ? 'bf-done' : bClass(rr)}" style="width:${Math.min(rr, 1) * 100}%"></i>${bs.cur && !x.fixed ? `<b class="bpace" style="left:${bs.frac * 100}%"></b>` : ''}</div>
      <div class="bsub"><span>${l}</span><span>${rt}</span></div></button></div>`; };
  const grp = k => { const R = bs.rows.filter(x => x.it.kind === k); return R.length ? `<div class="bkind">${k}</div>` + R.sort((a, z) => z.it.bud - a.it.bud).map(rowHtml).join('') : ''; };
  const nAdd = budAddable(y, m).length;
  html += `<section class="card"><h3>항목별 예산 ${ed ? '<button class="bedit" data-act="budEdit">편집 ›</button>' : ''}</h3>${grp('변동비')}${grp('고정비')}
    ${ed && nAdd ? '<button class="badd" data-act="budAdd">+ 예산 항목 추가</button>' : ''}</section>`;
  $('#view').innerHTML = html;
  $('#view').querySelectorAll('.swrap').forEach(w => { const el = w.querySelector('[data-bi]'), it = (S.model.budget[m] || [])[+el.dataset.bi];
    el.onclick = () => openItemTx(m, +el.dataset.bi);
    if (ed) swipeDel(w, () => budDrop(y, m, it)); else w.querySelector('.sdel').remove(); });
}
// 예산 참고값: 지난달 지출 · 최근 3개월 평균 · 지난달 예산 · 반복 거래
function budRef(y, m, i){
  const prevIt = k => { const [pm, py] = wrapYM(m - k, y), P = S.years[py]; if (!P?.txMode) return null; const f = findBudget(P, pm, i.kind, i.name, 0); return f && bMonth(pm, py).has ? f : null; };
  const lm = prevIt(1), av = [1, 2, 3].map(prevIt).filter(Boolean);
  const reps = (S.years[y]?.reps?.[m] || []).filter(r => r.kind === i.kind && r.name === i.name && r.amt > 0), repAmt = reps.reduce((a, r) => a + r.amt, 0);
  return {last: lm ? lm.amt : null, avg: av.length ? av.reduce((a, f) => a + f.amt, 0) / av.length : null, avgN: av.length, pbud: lm?.bud ?? null, repAmt, repDays: reps.map(r => r.day)};
}
const budUp = v => v > 0 ? Math.ceil(v / 1e4) * 1e4 : null;
const budSuggest = (i, R) => i.kind === '고정비' && R.repAmt ? R.repAmt : budUp(R.avgN >= 2 ? R.avg : R.last) || R.pbud || null;
const budHint = (i, R) => [R.repAmt && i.kind === '고정비' ? `반복 · 매달 ${R.repDays.join('·')}일 ${shortAmt(R.repAmt)}` : '', R.last != null ? `지난달 ${shortAmt(R.last)}` : '', R.avgN >= 2 ? `${R.avgN}개월 평균 ${shortAmt(R.avg)}` : ''].filter(Boolean).join(' · ') || '지난 기록 없음';
const budAddable = (y, m) => (S.years[y]?.budget?.[m] || []).filter(i => EXP_KINDS.includes(i.kind) && !(i.bud > 0));
function budOps(y, m, i, v){   // 이번 달~12월에 같은 예산
  const ops = [];
  for (let mm = m; mm <= 12; mm++){ const f = findBudget(S.years[y], mm, i.kind, i.name, 0); if (f && (f.bud ?? null) !== v) ops.push({t: 'cat', y, m: mm, kind: i.kind, name: i.name, subs: [...(f.subs || [])], bud: v}); }
  return ops;
}
function budDrop(y, m, i){ const ops = budOps(y, m, i, null); if (!ops.length) return render(); commit(ops, true); toast(`${i.name} 예산을 지웠어요 · '+ 예산 항목 추가'로 다시 넣을 수 있어요`); }

// 손가락으로 왼쪽으로 밀면 삭제: 조금 밀면 '삭제' 버튼, 절반 넘게 밀면 바로 삭제
function swipeDel(wrap, onDel){
  const row = wrap.querySelector('.sdel').nextElementSibling, BTN = 84;
  let x0 = null, y0 = 0, dx = 0, mode = null, open = false, moved = false;
  const set = (x, anim) => { row.style.transition = anim ? '' : 'none'; row.style.transform = x ? `translateX(${x}px)` : ''; if (x) wrap.classList.add('sw'); else if (anim) setTimeout(() => { if (!open && x0 == null) wrap.classList.remove('sw'); }, 220); else wrap.classList.remove('sw'); };
  const close = () => { open = false; set(0, true); };
  row.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button) return; x0 = e.clientX; y0 = e.clientY; dx = open ? -BTN : 0; mode = null; moved = false; });
  row.addEventListener('pointermove', e => { if (x0 == null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!mode){ if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; mode = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'; if (mode === 'h'){ moved = true; try { row.setPointerCapture(e.pointerId); } catch(_){} } }
    if (mode !== 'h') return;
    dx = Math.min(0, (open ? -BTN : 0) + mx); set(dx); });
  const end = () => { if (x0 == null) return; x0 = null;
    if (mode === 'h'){ const W = wrap.clientWidth;
      if (dx < -W * 0.5){ set(-W, true); wrap.classList.add('gone'); setTimeout(onDel, 200); }
      else if (dx < -40){ open = true; set(-BTN, true); } else close(); }
    mode = null; };
  row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
  row.addEventListener('click', e => { if (moved || open){ e.stopImmediatePropagation(); e.preventDefault(); if (!moved) close(); moved = false; } }, true);
  wrap.querySelector('.sdel').onclick = () => { wrap.classList.add('gone'); set(-wrap.clientWidth, true); setTimeout(onDel, 200); };
}

// 예산 항목 하나 추가 (예산 탭 '+ 예산 항목 추가')
function openBudAdd(){
  const y = S.year, m = S.month.budget; if (!canEdit(y)) return toast(editNote(y));
  const L = budAddable(y, m); if (!L.length) return toast('모든 지출 항목에 예산이 있어요');
  let sel = null;
  const draw = () => {
    const R = sel ? budRef(y, m, sel) : null, sug = sel ? budSuggest(sel, R) : null;
    openEd(`<h4>예산 항목 추가 <button class="ex" id="edX">취소</button></h4><div style="height:6px"></div>
      ${['고정비', '변동비'].map(k => { const I = L.filter(i => i.kind === k); return I.length ? `<div class="elbl">${k}</div><div class="echips">${I.map(i => `<button data-n="${esc(i.name)}" data-k="${k}"${i === sel ? ' class="on"' : ''}>${esc(i.name)}</button>`).join('')}</div>` : ''; }).join('')}
      ${sel ? `<div class="elbl">${esc(sel.name)} 한 달 예산</div><div class="ewon"><input id="baAmt" inputmode="numeric" autocomplete="off" placeholder="금액" value="${sug ? fmtWon(sug) : ''}" autofocus><span>원</span></div>
        <div class="ehint">${esc(budHint(sel, R))}</div><button class="btn" id="edSave">추가</button>` : ''}`);
    $('#edX').onclick = closeEd;
    $('#ed').querySelectorAll('[data-n]').forEach(b => b.onclick = () => { sel = L.find(i => i.kind === b.dataset.k && i.name === b.dataset.n); draw(); });
    if (sel){ bindWon($('#baAmt'));
      $('#edSave').onclick = () => { const v = parseWon($('#baAmt').value); if (!(v > 0)) return toast('금액을 넣어 주세요');
        closeEd(); commit(budOps(y, m, sel, v), true); toast(`${sel.name} 예산 ${money(v)}을 추가했어요`); }; }
  };
  draw();
}

// 예산 편집: 예산이 있는 항목만 보여주고, 밀어서 빼고, 아래에서 다시 추가
function openBudEdit(){
  const y = S.year, m = S.month.budget, Y = S.years[y]; if (!canEdit(y)) return toast(editNote(y));
  const items = (Y.budget[m] || []).filter(i => EXP_KINDS.includes(i.kind));
  const ref = items.map(i => budRef(y, m, i));
  const ed = items.map((i, x) => { const rep = !(i.bud > 0) && i.kind === '고정비' && !!ref[x].repAmt, v = i.bud > 0 ? i.bud : rep ? ref[x].repAmt : null; return {v, rep, on: v > 0}; });
  const prevSpent = (() => { const [pm, py] = wrapYM(m - 1, y); return S.years[py]?.txMode && bMonth(pm, py).has ? bMonth(pm, py).expense : null; })();
  const fill = how => { items.forEach((i, x) => { const R = ref[x];
      if (i.kind === '고정비' && R.repAmt && how !== 'pbud'){ ed[x] = {v: R.repAmt, rep: true, on: true}; return; }
      const v = how === 'last' ? budUp(R.last) : how === 'avg' ? budUp(R.avg) : R.pbud;
      if (v > 0) ed[x] = {v, rep: false, on: true}; else if (how === 'pbud') ed[x] = {v: null, rep: false, on: false}; }); draw(); };
  const total = () => ed.reduce((a, e) => a + (e.on && e.v > 0 ? e.v : 0), 0);
  let focusX = null;
  const draw = () => {
    const sc = $('#ed').scrollTop, tot = total(), off = items.filter((_, x) => !ed[x].on);
    const has = k => ref.some(R => (k === 'pbud' ? R.pbud : R[k]) != null);
    openEd(`<h4>${m}월 예산 <button class="ex" id="edX">닫기</button></h4>
      <div class="btot"><div class="lab">지출 예산 합계 (항목 합계로 자동)</div><div class="v num" id="bdTot">${tot ? money(tot) : '0원'}</div>${prevSpent != null ? `<small>지난달 실제 지출 ${money(prevSpent)}</small>` : ''}</div>
      ${has('last') || has('pbud') ? `<div class="bqf"><span>빠르게 채우기</span>${has('last') ? '<button data-f="last">지난달 지출</button>' : ''}${ref.some(R => R.avgN >= 2) ? '<button data-f="avg">최근 3개월 평균</button>' : ''}${has('pbud') ? '<button data-f="pbud">지난달 예산 그대로</button>' : ''}</div>` : ''}
      ${['고정비', '변동비'].map(k => { const L = items.filter(i => i.kind === k && ed[items.indexOf(i)].on); return L.length ? `<div class="etitle" style="margin:12px 2px 6px">${k}${k === '고정비' ? ' <span class="muted" style="font-weight:500">· 반복 거래 금액이 기본값</span>' : ''}</div>` + L.map(i => { const x = items.indexOf(i), e = ed[x];
        return `<div class="swrap ber-w"><button class="sdel" aria-label="${esc(i.name)} 빼기">빼기</button><div class="ber"><div class="n"><b>${esc(i.name)}</b><small>${esc(budHint(i, ref[x]))}</small></div><input class="bin${e.rep ? ' rep' : ''}" data-x="${x}" inputmode="numeric" placeholder="금액" value="${e.v ? fmtWon(e.v) : ''}"></div></div>`; }).join('') : ''; }).join('')
        || '<p class="note" style="text-align:center;margin:18px 0">아직 예산을 정한 항목이 없어요. 위 버튼으로 채우거나 아래에서 항목을 추가하세요.</p>'}
      ${off.length ? `<div class="elbl" style="margin-top:14px">+ 예산 항목 추가</div><div class="echips">${off.map(i => `<button class="badd-c" data-x="${items.indexOf(i)}">+ ${esc(i.name)}</button>`).join('')}</div>` : ''}
      <p class="note">왼쪽으로 밀면 예산에서 빠져요. 저장하면 ${m < 12 ? `${m}월부터 12월까지` : '12월에'} 같은 예산이 적용돼요.</p>
      <div class="ebar"><div class="t">시트의 '월 예산' 칸에 저장돼요</div><button class="btn" id="edSave">저장</button></div>`, {tall: true});
    $('#ed').scrollTop = sc;
    const upd = () => { const t = total(); $('#bdTot').textContent = t ? money(t) : '0원'; };
    $('#ed').querySelectorAll('.bin').forEach(inp => bindWon(inp, v => { const x = +inp.dataset.x; ed[x] = {v: Number.isNaN(v) ? NaN : v, rep: false, on: true}; inp.classList.remove('rep'); upd(); }));
    $('#ed').querySelectorAll('.ber-w').forEach(w => { const x = +w.querySelector('.bin').dataset.x; swipeDel(w, () => { ed[x] = {v: null, rep: false, on: false}; draw(); }); });
    $('#ed').querySelectorAll('.badd-c').forEach(b => b.onclick = () => { const x = +b.dataset.x; ed[x] = {v: budSuggest(items[x], ref[x]), rep: false, on: true}; focusX = x; draw(); });
    if (focusX != null){ const f = $('#ed').querySelector(`.bin[data-x="${focusX}"]`); focusX = null; if (f){ f.scrollIntoView({block: 'center'}); f.focus(); } }
    $('#ed').querySelectorAll('[data-f]').forEach(b => b.onclick = () => fill(b.dataset.f));
    $('#edX').onclick = closeEd;
    $('#edSave').onclick = () => {
      if (ed.some(e => e.on && Number.isNaN(e.v))) return toast('예산은 숫자로 넣어 주세요');
      const ops = items.flatMap((i, x) => budOps(y, m, i, ed[x].on && ed[x].v > 0 ? ed[x].v : null));
      closeEd(); if (!ops.length) return toast('바뀐 내용이 없어요');
      S.bview = 'bud'; LS.set('bview', 'bud'); commit(ops);
    };
  };
  draw();
}

/* 통계 */
function statInto(host){
  const y = S.year, m = S.month.budget, Y = S.model, T = (Y.tx[m] || []).filter(t => !t.skip), now = new Date();
  const cur = now.getFullYear() === y && now.getMonth() + 1 === m, cutDay = cur ? now.getDate() : 31;
  const E = T.filter(t => EXP_KINDS.includes(t.kind)), PT = txOf(m - 1), PE = PT && PT.some(t => EXP_KINDS.includes(t.kind)) ? PT.filter(t => EXP_KINDS.includes(t.kind)) : null;
  let html = '';
  if (!E.length || !host) return;
  const tot = E.reduce((a, t) => a + t.amt, 0), by = {};
  for (const t of E){ const k = groupKey(t); (by[k] = by[k] || {n: k, item: t.name, a: 0, c: 0}).a += t.amt; by[k].c++; }
  const G = Object.values(by).sort((a, z) => z.a - a.a), top = G.slice(0, 7), rest = G.slice(7).reduce((a, g) => a + g.a, 0);
  if (rest) top.push({n: '그 외', a: rest});
  // 지난달 같은 날까지와 비교
  const pIn = PE ? PE.filter(t => t.d <= cutDay) : null, pTot = pIn ? pIn.reduce((a, t) => a + t.amt, 0) : null;
  const diff = pTot != null ? tot - pTot : null;
  html += `<section class="card"><h3>어디에 썼나 <small>지출 ${money(tot)} · ${E.length}건</small></h3>
    <div class="donut"><canvas id="cSub"></canvas><div class="center"><div><b class="num" style="font-size:18px">${money(tot)}</b><span>${m}월 지출</span></div></div></div>
    <div class="legend">${top.map((g, k) => `<div class="lg"><i class="dot" style="background:${PALETTE[k % PALETTE.length]}"></i><span class="n">${esc(g.n)}${g.item && g.item !== g.n ? ` <span class="muted" style="font-size:12px">${esc(g.item)}</span>` : ''}</span><span class="p num">${pctPlain(g.a / tot, 0)}</span><span class="a num">${money(g.a)}</span></div>`).join('')}</div></section>`;
  html += `<section class="card"><h3>누적 지출 ${diff != null ? `<small>지난달 ${cur ? '같은 날보다' : '보다'} <b class="${dir(diff)}">${signed(diff)}</b></small>` : ''}</h3><div class="chart" style="height:180px"><canvas id="cCum"></canvas></div></section>`;
  // 달라진 점
  const ins = [];
  if (diff != null && pTot > 0) ins.push(`${cur ? `오늘(${cutDay}일)까지` : '이번 달'} 지출이 지난달${cur ? ' 같은 날' : ''}보다 <b>${money(Math.abs(diff))} ${diff > 0 ? '많아요' : '적어요'}</b> (${pct(diff / pTot, 0)}).`);
  if (pIn && pIn.length){ const pb = {}; for (const t of pIn) pb[groupKey(t)] = (pb[groupKey(t)] || 0) + t.amt;
    const ch = [...new Set([...Object.keys(by), ...Object.keys(pb)])].map(k => ({k, d: (by[k]?.a || 0) - (pb[k] || 0), p: pb[k] || 0})).sort((a, z) => z.d - a.d);
    const up = ch[0], dn = ch.at(-1);
    if (up && up.d > 0) ins.push(`<b>${esc(up.k)}</b> 지출이 ${money(up.d)} 늘었어요${up.p ? ` (${pct(up.d / up.p, 0)})` : ' (지난달엔 없었어요)'}.`);
    if (dn && dn.d < 0) ins.push(`<b>${esc(dn.k)}</b>${josa(dn.k, '은', '는')} ${money(-dn.d)} 줄었어요.`); }
  const wd = Array(7).fill(0); for (const t of E) wd[new Date(y, m - 1, t.d).getDay()] += t.amt;
  const wmax = wd.indexOf(Math.max(...wd)); ins.push(`가장 많이 쓴 요일은 <b>${WD[wmax]}요일</b>이에요 (${money(wd[wmax])}).`);
  const big = [...E].sort((a, z) => z.amt - a.amt)[0]; ins.push(`가장 큰 지출은 ${big.d}일 <b>${esc(big.memo && big.memo !== '반복' ? big.memo : groupKey(big))}</b> ${money(big.amt)}이에요.`);
  html += `<section class="card"><h3>달라진 점</h3><ul class="ins">${ins.map(s => `<li>${s}</li>`).join('')}</ul></section>`;
  html += `<section class="card"><h3>큰 지출 TOP 5</h3>${[...E].sort((a, z) => z.amt - a.amt).slice(0, 5).map(t => txRowHtml(t, canEdit())).join('')}</section>`;
  host.innerHTML = html;
  donut('cSub', top.map(g => g.n), top.map(g => g.a), top.map((_, k) => PALETTE[k % PALETTE.length]));
  const n = daysIn(y, m), cum = arr => { const o = Array(32).fill(0); for (const t of arr) o[t.d] += t.amt; let s = 0; return Array.from({length: n}, (_, i) => (s += o[i + 1])); };
  const a = cum(E).map((v, i) => i + 1 <= cutDay ? v : null), ds = [{label: `${m}월`, data: a, borderColor: css('--up'), backgroundColor: css('--up'), borderWidth: 2.5, pointRadius: 0, tension: .25, spanGaps: false}];
  if (PE) ds.push({label: `${wrapYM(m - 1, y)[0]}월`, data: cum(PE), borderColor: css('--faint'), borderDash: [4, 3], borderWidth: 2, pointRadius: 0, tension: .25});
  mk('cCum', {type: 'line', data: {labels: Array.from({length: n}, (_, i) => i + 1), datasets: ds},
    options: {interaction: {mode: 'index', intersect: false}, plugins: {legend: {display: !!PE, position: 'bottom', labels: {boxWidth: 12, boxHeight: 2}}, tooltip: {...baseTip, ...tipWon, callbacks: {title: c => c[0].label + '일', label: tipWon.callbacks.label}}},
      scales: {x: {grid: {display: false}, border: {display: false}, ticks: {maxTicksLimit: 7, maxRotation: 0}}, y: scaleWon()}}});
}

/* 거래 입력 / 고치기 */
// 입력 구분(mode): 0 지출(고정비·변동비) · 1 수입 · 2 저축
const kindMode = k => k === '수입' ? 1 : k === '저축' ? 2 : 0;
function itemsFor(y, m, mode){ return (S.years[y]?.budget?.[m] || []).filter(i => mode === 1 || mode === true ? i.kind === '수입' : mode === 2 ? i.kind === '저축' : EXP_KINDS.includes(i.kind)); }
const modeSeg = (id, mode) => `<div class="eseg" id="${id}">${['지출', '수입', '저축'].map((l, v) => `<button data-v="${v}"${mode === v ? ' class="on"' : ''}>${l}</button>`).join('')}</div>`;
function usage(y){ const c = {}; for (const L of Object.values(S.years[y]?.tx || {})) for (const t of L) if (!t.skip){ c[t.kind + '|' + t.name] = (c[t.kind + '|' + t.name] || 0) + 1; c['s|' + t.name + '|' + t.sub] = (c['s|' + t.name + '|' + t.sub] || 0) + 1; c['p|' + t.pay] = (c['p|' + t.pay] || 0) + 1; } return c; }
function editTx(id, presetDay){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  const m0 = S.month.budget, Y = S.years[y], old = id ? (Y.tx[m0] || []).find(t => t.id === id) : null;
  if (id && !old) return;
  const U = usage(y);
  const st = old ? {mode: kindMode(old.kind), amt: old.amt, kind: old.kind, name: old.name, sub: old.sub, m: m0, d: old.d, pay: old.pay, memo: old.memo === '반복' ? '' : old.memo}
    : {mode: 0, amt: null, kind: null, name: null, sub: '', m: m0, d: presetDay || selDay(y, m0), pay: '', memo: '', rep: false};
  const favPay = PAY_OPTS.filter(p => !S.payOff.includes(p)).sort((a, z) => (U['p|' + z] || 0) - (U['p|' + a] || 0)).find(p => U['p|' + p]) || '';
  if (!old) st.pay = favPay;
  const pad = n => String(n).padStart(2, '0');
  const draw = () => {
    const its = itemsFor(y, st.m, st.mode).slice().sort((a, z) => (U[z.kind + '|' + z.name] || 0) - (U[a.kind + '|' + a.name] || 0));
    if (!st.name || !its.some(i => i.kind === st.kind && i.name === st.name)){ const f = its[0]; st.kind = f?.kind; st.name = f?.name; st.sub = ''; }
    const it = its.find(i => i.kind === st.kind && i.name === st.name), subs = (it?.subs || []).slice().sort((a, z) => (U['s|' + st.name + '|' + z] || 0) - (U['s|' + st.name + '|' + a] || 0));
    if (st.sub && !subs.includes(st.sub)) subs.unshift(st.sub);
    const amtV = st.amtTxt ?? (st.amt ? fmtWon(st.amt) : '');
    openEd(`<h4>${old ? '거래 고치기' : '거래 추가'} <button class="ex" id="edX">취소</button></h4><div style="height:10px"></div>
      ${modeSeg('txKind', st.mode)}
      <div class="ewon"><input id="txAmt" inputmode="numeric" autocomplete="off" placeholder="금액 (예: 12000 또는 1.2만)" value="${esc(amtV)}"${old ? '' : ' autofocus'}><span>원</span></div>
      <div class="ehint" id="txHint"></div>
      <div class="elbl">항목</div><div class="echips" id="txItem">${its.map(i => `<button data-k="${esc(i.kind + '|' + i.name)}"${i === it ? ' class="on"' : ''}>${esc(i.name)}</button>`).join('') || '<span class="note">항목이 없어요</span>'}</div>
      ${it && it.kind !== '수입' || subs.length ? `<div class="elbl">세부분류${it ? ' · ' + esc(it.name) : ''}</div><div class="echips" id="txSub">${subs.map(s => `<button data-s="${esc(s)}"${s === st.sub ? ' class="on"' : ''}>${esc(s)}</button>`).join('')}<button data-s="+" class="add">+ 추가</button></div>` : ''}
      ${st.mode ? '' : payChips('txPayC', st.pay)}
      <div class="erow2"><label>날짜<input type="date" id="txDate" min="${y}-01-01" max="${y}-12-31" value="${y}-${pad(st.m)}-${pad(st.d)}"></label></div>
      <input id="txMemo" class="ememo" maxlength="60" placeholder="메모 (예: 회사 근처 국밥)" value="${esc(st.memo)}">
      ${old ? '' : `<label class="echeck"><input type="checkbox" id="txRep"${st.rep ? ' checked' : ''}> 매달 반복 <span class="muted" id="txRepNote">(매달 ${st.d}일, ${st.m < 12 ? `${st.m}~12월` : '12월'})</span></label>`}
      <button class="btn" id="edSave">저장</button>${old ? '<button class="btn ghost danger" id="txDel">삭제</button>' : ''}`);
    const inp = $('#txAmt'), hint = v => $('#txHint').textContent = v == null ? '' : isNaN(v) ? '숫자만 넣어 주세요 (예: 1.2만)' : '= ' + fmtWon(v) + '원';
    bindWon(inp, hint); hint(parseWon(inp.value));
    const keep = () => { st.amtTxt = inp.value; st.amt = parseWon(inp.value); st.memo = $('#txMemo').value.trim(); if ($('#txRep')) st.rep = $('#txRep').checked;
      const dv = $('#txDate').value.split('-'); if (dv.length === 3 && +dv[0] === y){ st.m = +dv[1]; st.d = +dv[2]; } };
    bindPay('txPayC', st);
    $('#txKind').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); st.mode = +b.dataset.v; st.name = null; st.pay = st.mode ? '' : (st.pay || favPay); draw(); });
    $('#txItem').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); const [k, ...n] = b.dataset.k.split('|'); st.kind = k; st.name = n.join('|'); st.sub = ''; draw(); });
    $('#txSub')?.querySelectorAll('button').forEach(b => b.onclick = () => { keep();
      if (b.dataset.s === '+'){ const s = (prompt(`${st.name}의 세부분류 이름`) || '').trim().replace(/,/g, ' '); if (!s) return; st.sub = s; st.newSub = s; }
      else st.sub = st.sub === b.dataset.s ? '' : b.dataset.s; draw(); });
    $('#txDate').onchange = () => { const pm = st.m; keep(); if (st.m !== pm) draw(); else if ($('#txRepNote')) $('#txRepNote').textContent = `(매달 ${st.d}일, ${st.m < 12 ? `${st.m}~12월` : '12월'})`; };
    $('#edX').onclick = closeEd;
    $('#edSave').onclick = () => { keep(); saveTx(); };
    if (old) $('#txDel').onclick = () => { if (!confirm('이 거래를 지울까요?')) return; closeEd();
      commit([old.id.startsWith('R') ? {t: 'tx', y, m: m0, act: 'set', tx: {...old, amt: 0, skip: true, memo: '건너뜀'}} : {t: 'tx', y, m: m0, act: 'del', tx: {id: old.id}}]); };
  };
  const saveTx = () => {
    if (st.amt == null || Number.isNaN(st.amt) || st.amt <= 0) return toast('금액을 넣어 주세요');
    if (!st.name) return toast('항목을 골라 주세요');
    if (!st.m || !st.d || st.d > daysIn(y, st.m)) return toast('날짜를 확인해 주세요');
    const ops = [], tx = {id: old ? old.id : newTxId(), d: st.d, kind: st.kind, name: st.name, sub: st.sub, amt: st.amt, pay: st.mode ? '' : st.pay, memo: st.memo, skip: false};
    if (st.newSub && st.sub === st.newSub) for (let mm = st.m; mm <= 12; mm++){ const it = findBudget(Y, mm, st.kind, st.name, 0);
      if (it && !(it.subs || []).includes(st.sub)) ops.push({t: 'cat', y, m: mm, kind: st.kind, name: st.name, subs: [...(it.subs || []), st.sub], bud: it.bud ?? null}); }
    if (st.rep){ const rep = {day: st.d, kind: st.kind, name: st.name, sub: st.sub, amt: st.amt, pay: st.mode ? '' : st.pay, memo: st.memo};
      tx.id = repId(rep); if (!tx.memo) tx.memo = '반복';
      for (let mm = st.m; mm <= 12; mm++){ const L = (Y.reps[mm] || []).filter(r => repId(r) !== tx.id); ops.push({t: 'reps', y, m: mm, reps: [...L, rep]}); } }
    if (old && st.m !== m0) ops.push({t: 'tx', y, m: m0, act: 'del', tx: {id: old.id}});
    ops.push({t: 'tx', y, m: st.m, act: 'set', tx});
    closeEd(); S.sel = {y, m: st.m, d: st.d}; if (st.m !== m0) S.month.budget = st.m;
    if (!st.mode) S.saveNote = () => budNote(y, st.m, st.kind, st.name);
    commit(ops);
  };
  draw();
}

/* 반복 거래 관리 */
function openReps(){
  const y = S.year, m = S.month.budget, Y = S.years[y]; if (!canEdit(y)) return toast(editNote(y));
  const L = Y.reps[m] || [];
  openEd(`<h4>반복 거래 <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${m}월 시트 기준 · 날짜가 되면 거래 내역에 자동으로 들어가요</div>
    ${KINDS.map(k => { const R = L.filter(r => r.kind === k); return R.length ? `<div class="ecard"><div class="etitle">${k}</div>${R.map(r => `<div class="row tap" data-ri="${L.indexOf(r)}"><div class="n">${esc(r.memo || r.sub || r.name)}<small>${esc(r.name)}${r.sub ? ' › ' + esc(r.sub) : ''} · 매달 ${r.day}일${r.pay ? ' · ' + esc(r.pay) : ''}</small></div><div class="a num">${r.amt == null ? '금액 없음' : fmtWon(r.amt)}</div></div>`).join('')}</div>` : ''; }).join('') || '<p class="note">아직 반복 거래가 없어요. 월급·관리비·통신비·적금처럼 매달 있는 거래를 등록해 두세요.</p>'}
    <button class="btn" id="rpAdd">+ 반복 거래 추가</button>`, {tall: L.length > 4});
  $('#edX').onclick = closeEd; $('#rpAdd').onclick = () => editRep(null);
  $('#ed').querySelectorAll('[data-ri]').forEach(el => el.onclick = () => editRep(+el.dataset.ri));
}
function editRep(ri, direct){
  const y = S.year, m = S.month.budget, Y = S.years[y], old = ri != null ? (Y.reps[m] || [])[ri] : null;
  const st = old ? {...old, mode: kindMode(old.kind)} : {mode: 0, day: 1, kind: null, name: null, sub: '', amt: null, pay: '', memo: ''};
  const draw = () => {
    const its = itemsFor(y, m, st.mode);
    if (!its.some(i => i.kind === st.kind && i.name === st.name)){ st.kind = its[0]?.kind; st.name = its[0]?.name; st.sub = ''; }
    const it = its.find(i => i.kind === st.kind && i.name === st.name), subs = [...(it?.subs || [])]; if (st.sub && !subs.includes(st.sub)) subs.unshift(st.sub);
    const amtV = st.amtTxt ?? (st.amt != null ? fmtWon(st.amt) : '');
    const nRep = (Y.reps[m] || []).length;
    openEd(`<h4>${old ? '반복 거래 고치기' : '반복 거래 추가'} <button class="ex" id="edX">취소</button></h4>
      ${!old && nRep ? `<button class="elink" id="rpList">등록된 반복 거래 ${nRep}개 보기 ›</button>` : '<div style="height:10px"></div>'}
      ${modeSeg('rpKind', st.mode)}
      <div class="ewon"><input id="rpAmt" inputmode="numeric" autocomplete="off" placeholder="금액" value="${esc(amtV)}"><span>원</span></div><div class="ehint"></div>
      <div class="elbl">항목</div><div class="echips" id="rpItem">${its.map(i => `<button data-k="${esc(i.kind + '|' + i.name)}"${i === it ? ' class="on"' : ''}>${esc(i.name)}</button>`).join('')}</div>
      ${subs.length ? `<div class="elbl">세부분류</div><div class="echips" id="rpSub">${subs.map(s => `<button data-s="${esc(s)}"${s === st.sub ? ' class="on"' : ''}>${esc(s)}</button>`).join('')}</div>` : ''}
      ${st.mode ? '' : payChips('rpPayC', st.pay || '')}
      <div class="erow2"><label>매달 (일)<input id="rpDay" type="number" inputmode="numeric" min="1" max="31" value="${st.day}"></label></div>
      <input id="rpMemo" class="ememo" maxlength="60" placeholder="이름 (예: 넷플릭스, 적금)" value="${esc(st.memo || '')}">
      <button class="btn" id="edSave">저장</button>${old ? '<button class="btn ghost danger" id="rpDel">반복 그만하기</button>' : ''}`);
    bindWon($('#rpAmt'));
    const keep = () => { st.amtTxt = $('#rpAmt').value; st.amt = parseWon($('#rpAmt').value); st.day = Math.min(Math.max(+$('#rpDay').value || 1, 1), 31); st.memo = $('#rpMemo').value.trim(); };
    bindPay('rpPayC', st);
    $('#rpKind').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); st.mode = +b.dataset.v; st.name = null; if (st.mode) st.pay = ''; draw(); });
    $('#rpItem').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); const [k, ...n] = b.dataset.k.split('|'); st.kind = k; st.name = n.join('|'); st.sub = ''; draw(); });
    $('#rpSub')?.querySelectorAll('button').forEach(b => b.onclick = () => { keep(); st.sub = st.sub === b.dataset.s ? '' : b.dataset.s; draw(); });
    $('#edX').onclick = direct ? closeEd : openReps;
    if ($('#rpList')) $('#rpList').onclick = openReps;
    const months = () => Array.from({length: 13 - m}, (_, i) => m + i);
    const save = rep => { const oid = old ? repId(old) : null, ops = [];
      for (const mm of months()){ const L = (Y.reps[mm] || []).filter(r => repId(r) !== oid && (!rep || repId(r) !== repId(rep)));
        ops.push({t: 'reps', y, m: mm, reps: rep ? [...L, rep] : L}); }
      closeEd(); commit(ops); applyReps(); };
    $('#edSave').onclick = () => { keep(); if (st.amt == null || Number.isNaN(st.amt) || st.amt <= 0) return toast('금액을 넣어 주세요'); if (!st.name) return toast('항목을 골라 주세요');
      save({day: st.day, kind: st.kind, name: st.name, sub: st.sub, amt: st.amt, pay: st.mode ? '' : (st.pay || ''), memo: st.memo}); };
    if (old) $('#rpDel').onclick = () => { if (confirm('이 반복 거래를 그만할까요? 이미 들어간 거래는 그대로 있어요.')) save(null); };
  };
  draw();
}

/* 분류 · 예산 (그 달 시트의 세부분류·월 예산 칸) */
let catKinds = KINDS;   // 분류 관리에 보일 구분 (설정의 수입 항목 / 지출 항목)
function openCats(kinds){
  if (Array.isArray(kinds)) catKinds = kinds; else if (kinds === undefined) catKinds = KINDS;
  const y = S.year, m = S.month.budget, Y = S.years[y]; if (!canEdit(y)) return toast(editNote(y));
  const items = Y.budget[m] || [];
  const ed = items.map(i => ({subs: [...(i.subs || [])], bud: i.bud ?? null}));   // 저장 전 고친 내용
  const months = Array.from({length: 13 - m}, (_, i) => m + i);
  const draw = () => {
    const sc = $('#ed').scrollTop;
    openEd(`<h4>${catKinds.length === 2 ? '지출 항목' : catKinds.length === 1 ? catKinds[0] + ' 항목' : '분류 관리'} <button class="ex" id="edX">닫기</button></h4>
      <div class="esub">${m < 12 ? `${m}~12월` : '12월'}에 적용돼요 · 항목 이름을 누르면 바꾸거나 지울 수 있어요</div>
      ${catKinds.map(k => { const its = items.filter(i => i.kind === k); return `<div class="ecard"><div class="etitle">${k}</div>${its.map(i => { const x = items.indexOf(i), e = ed[x];
        return `<div class="crow" data-k="${x}"><div class="n"><button class="cname">${esc(i.name)} <span aria-hidden="true">›</span></button></div>
          <div class="echips sm">${e.subs.map((s, j) => `<button class="csub" data-j="${j}">${esc(s)} <b aria-label="삭제">×</b></button>`).join('')}<button class="add cadd">+ 세부분류</button></div></div>`; }).join('')}
        <button class="eadd" data-kind="${k}">+ ${k} 항목 추가</button></div>`; }).join('')}
      <div class="ebar"><div class="t">세부분류는 시트에 저장돼요 · 예산은 예산 탭에서</div><button class="btn" id="edSave">저장</button></div>`, {tall: true});
    $('#ed').scrollTop = sc;
    $('#ed').querySelectorAll('.crow').forEach(r => { const x = +r.dataset.k, e = ed[x], it = items[x];
      r.querySelectorAll('.csub').forEach(b => b.onclick = () => { e.subs.splice(+b.dataset.j, 1); draw(); });
      r.querySelector('.cadd').onclick = () => { const v = (prompt(`${it.name}에 추가할 세부분류`) || '').trim().replace(/,/g, ' ');
        if (!v) return; if (e.subs.includes(v)) return toast('이미 있는 세부분류예요'); e.subs.push(v); draw(); };
      r.querySelector('.cname').onclick = () => itemMenu(it); });
    $('#edX').onclick = closeEd;
    $('#ed').querySelectorAll('.eadd').forEach(b => b.onclick = () => addBudgetItem(m, b.dataset.kind, true));
    $('#edSave').onclick = () => {
      const ops = [];
      items.forEach((it, x) => { const e = ed[x];
        if (e.subs.join(',') === (it.subs || []).join(',')) return;
        for (const mm of months){ const f = findBudget(Y, mm, it.kind, it.name, 0); if (f) ops.push({t: 'cat', y, m: mm, kind: it.kind, name: it.name, subs: [...e.subs], bud: f.bud ?? null}); } });
      closeEd(); if (ops.length) commit(ops); else toast('바뀐 내용이 없어요');
    };
  };
  draw();
}
// 항목 이름 바꾸기 · 지우기 (그 해 모든 달 시트에 적용, 거래가 있는 달은 지우지 않아요)
function itemMenu(it){
  const y = S.year, Y = S.years[y], m = S.month.budget;
  const hasTx = mm => (Y.tx?.[mm] || []).some(t => !t.skip && t.kind === it.kind && t.name === it.name);
  const txMonths = Array.from({length: 12}, (_, i) => i + 1).filter(hasTx);
  openEd(`<h4>${esc(it.name)} <button class="ex" id="edX">뒤로</button></h4>
    <div class="esub">${it.kind} · ${y}년 모든 달에 적용돼요${txMonths.length ? ` · 거래 있는 달: ${txMonths.join(', ')}월` : ''}</div>
    <input id="imName" class="ememo" maxlength="30" value="${esc(it.name)}" placeholder="항목 이름">
    <button class="btn" id="imRen">이름 바꾸기</button>
    <button class="btn ghost danger" id="imDel">항목 삭제</button>`);
  $('#edX').onclick = () => openCats(null);
  $('#imRen').onclick = () => { const to = $('#imName').value.trim().replace(/\|/g, ' ');
    if (!to || to === it.name) return toast('새 이름을 넣어 주세요');
    if (Object.values(Y.budget).some(L => L.some(i => i.kind === it.kind && i.name === to))) return toast(`'${to}' 항목이 이미 있어요`);
    const months = Array.from({length: 12}, (_, i) => i + 1).filter(mm => findBudget(Y, mm, it.kind, it.name, 0));
    commit([{t: 'renB', y, kind: it.kind, name: it.name, to, months}]); openCats(null); };
  $('#imDel').onclick = () => {
    const months = Array.from({length: 12}, (_, i) => i + 1).filter(mm => findBudget(Y, mm, it.kind, it.name, 0) && !hasTx(mm));
    if (!months.length) return toast('모든 달에 거래가 있어 지울 수 없어요. 거래를 다른 항목으로 옮겨 주세요');
    if (!confirm(`'${it.name}' 항목을 지울까요?${txMonths.length ? `\n거래가 있는 ${txMonths.join(', ')}월은 남겨 둬요.` : ''}`)) return;
    commit([{t: 'delB', y, kind: it.kind, name: it.name, months}]); openCats(null); };
}

/* 항목 하나: 이 달 거래 목록 */
function openItemTx(m, idx){
  const y = S.year, Y = S.years[y], it = (Y.budget[m] || [])[idx]; if (!it) return;
  const T = (Y.tx[m] || []).filter(t => !t.skip && t.kind === it.kind && t.name === it.name).sort((a, z) => a.d - z.d), ed = canEdit(y);
  const by = {}; for (const t of T) by[t.sub || '(세부분류 없음)'] = (by[t.sub || '(세부분류 없음)'] || 0) + t.amt;
  openEd(`<h4>${esc(it.name)} <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${y}년 ${m}월 · ${it.kind} · ${T.length}건 · ${money(it.amt)}${it.bud ? ` · 예산 ${money(it.bud)}` : ''}</div>
    ${Object.keys(by).length > 1 ? `<div class="ecard">${Object.entries(by).sort((a, z) => z[1] - a[1]).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b class="num">${money(v)}</b></div>`).join('')}</div>` : ''}
    <div class="ecard">${T.map(t => `<div class="row${ed ? ' tap' : ''}" data-tx="${esc(t.id)}"><div class="n">${t.d}일 · ${esc(t.memo && t.memo !== '반복' ? t.memo : (t.sub || t.name))}<small>${esc(t.sub || '')}${t.pay ? ' · ' + esc(t.pay) : ''}</small></div><div class="a num">${fmtWon(t.amt)}</div></div>`).join('') || '<p class="note" style="margin:0">이 달 거래가 없어요</p>'}</div>
    ${ed ? `<input id="itMemo" class="ememo" maxlength="80" placeholder="이 달 메모 (선택)" value="${esc(it.memo)}"><button class="btn" id="itSave">메모 저장</button><button class="btn ghost" id="itCat">세부분류 관리</button>` : ''}`, {tall: T.length > 6});
  $('#edX').onclick = closeEd;
  $('#ed').querySelectorAll('[data-tx]').forEach(el => el.onclick = () => { closeEd(); editTx(el.dataset.tx); });
  if (ed){ $('#itCat').onclick = () => openCats([it.kind]);
    $('#itSave').onclick = () => { const v = $('#itMemo').value.trim(); closeEd(); if (v !== str(it.memo)) commit([{t: 'b', y, m, kind: it.kind, name: it.name, idx: occ(Y.budget[m], it, bKey), f: 'memo', v, o: str(it.memo)}]); }; }
}
