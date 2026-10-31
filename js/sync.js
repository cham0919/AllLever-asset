// 입력 값을 구글 시트에 저장 (대기열 · 충돌 처리)
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 입력: 앱에서 고친 값을 구글 시트에 저장 ─────────
   - 고친 값은 먼저 화면(기기 데이터)에 반영하고 저장 대기열(queue)에 넣은 뒤 시트에 써요.
   - 시트에 쓰기 직전, 해당 시트를 다시 읽어 행 위치를 이름으로 찾고(구분+항목 / 대분류+중분류+소분류),
     그 칸의 현재 값이 앱이 알던 값과 다르면 덮어쓰기 전에 물어봐요.
   - 인터넷이 끊기면 대기열에 남겨 두고, 연결되면 다시 저장해요.
   - 합계·저축·그래프 수식은 건드리지 않아요. 금액·메모·잔액 칸과 새 항목 행만 써요. */
S.queue = LS.get('queue', []);
const saveQueue = () => LS.set('queue', S.queue);
const gfileOf = y => S.gfiles.find(f => f.year === y);
const canEdit = (y = S.year) => S.meta.source === 'local' ? !!S.years?.[y]
  : S.meta.source === 'google' && !!gfileOf(y) && (gfileOf(y).mime || MIME_SHEET) === MIME_SHEET;
const editNote = y => S.meta.source === 'demo' ? '예시 데이터는 고칠 수 없어요' : S.meta.source !== 'google' ? '구글 시트를 연결하거나 "앱만 사용하기"로 시작하면 입력할 수 있어요'
  : !gfileOf(y) ? `${y}년 시트가 연결돼 있지 않아요` : '엑셀(.xlsx) 파일은 구글 시트로 변환해야 앱에서 입력할 수 있어요';
const colL = i => { let s = ''; i++; while (i){ const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const qs = s => `'${String(s).replace(/'/g, "''")}'`;   // 시트 이름 따옴표
const parseWon = s => { s = String(s ?? '').replace(/[,\s원]/g, ''); if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)(억|만)?$/.exec(s); if (!m) return NaN; return Math.round(+m[1] * (m[2] === '억' ? 1e8 : m[2] === '만' ? 1e4 : 1)); };
const fmtWon = n => n == null || isNaN(n) ? '' : Math.round(n).toLocaleString('ko-KR');
const sameVal = (a, b, memo) => memo ? str(a) === str(b) : (toNum(a) ?? null) === (toNum(b) ?? null);

// 화면 데이터에서 항목 찾기 (같은 이름이 여러 번이면 순서로 구분)
function findBudget(Y, m, kind, name, idx){ return (Y?.budget?.[m] || []).filter(i => i.kind === kind && i.name === name)[idx || 0]; }
function findAsset(Y, big, mid, small, idx){ return (Y?.assets || []).filter(a => a.big === big && a.mid === mid && a.small === small)[idx || 0]; }
function occ(list, it, keyFn){ const k = keyFn(it); return list.filter(x => keyFn(x) === k).indexOf(it); }
const bKey = i => i.kind + '|' + i.name, aKey = a => a.big + '|' + a.mid + '|' + a.small;

// 대기열 작업을 화면 데이터에 반영
function applyOp(years, op){
  const Y = years?.[op.y]; if (!Y) return;
  if (op.t === 'b'){ const it = findBudget(Y, op.m, op.kind, op.name, op.idx); if (!it) return;
    if (op.f === 'memo') it.memo = op.v || ''; else { it.amt = op.v ?? 0; it.filled = op.v != null; } }
  else if (op.t === 'a'){ const a = findAsset(Y, op.big, op.mid, op.small, op.idx); if (a) a.v[op.m - 1] = op.v; }
  else if (op.t === 'addB'){ for (const m of op.months){ const L = Y.budget[m] = Y.budget[m] || [];
      if (!L.some(i => i.kind === op.kind && i.name === op.name)) L.push({kind: op.kind, name: op.name, amt: 0, memo: '', filled: false, subs: [], bud: null}); } }
  else if (op.t === 'addA'){ if (!findAsset(Y, op.big, op.mid, op.small)) Y.assets.push({big: op.big, mid: op.mid, small: op.small, v: Array(12).fill(null)}); }
  else if (op.t === 'tx'){ const L = (Y.tx = Y.tx || {})[op.m] = Y.tx[op.m] || [], i = L.findIndex(t => t.id === op.tx.id);
    if (op.act === 'del'){ if (i >= 0) L.splice(i, 1); } else if (i >= 0) L[i] = {...op.tx}; else L.push({...op.tx}); }
  else if (op.t === 'cat'){ const it = findBudget(Y, op.m, op.kind, op.name, 0); if (it){ it.subs = [...op.subs]; it.bud = op.bud ?? null; } }
  else if (op.t === 'reps'){ (Y.reps = Y.reps || {})[op.m] = op.reps.map(r => ({...r})); }
  else if (op.t === 'renB') for (const m of op.months){ const it = findBudget(Y, m, op.kind, op.name, 0); if (it) it.name = op.to;
    for (const t of Y.tx?.[m] || []) if (t.kind === op.kind && t.name === op.name) t.name = op.to;
    for (const r of Y.reps?.[m] || []) if (r.kind === op.kind && r.name === op.name) r.name = op.to; }
  else if (op.t === 'delB') for (const m of op.months){ const L = Y.budget[m] || [], i = L.findIndex(x => x.kind === op.kind && x.name === op.name); if (i >= 0) L.splice(i, 1);
    if (Y.reps?.[m]) Y.reps[m] = Y.reps[m].filter(r => !(r.kind === op.kind && r.name === op.name)); }
  if (op.m) recalcMonth(Y, op.m); else if (op.months) op.months.forEach(m => recalcMonth(Y, m));
}
function reapplyQueue(years){ for (const op of S.queue) applyOp(years, op); }

// 화면에 바로 반영하고 대기열에 넣은 뒤 저장 시도
function commit(ops, quiet){
  if (!ops.length) return;
  if (S.meta.source === 'local'){   // 이 기기에만 저장
    for (const op of ops) applyOp(S.years, op);
    LS.set('years', S.years); S.meta.savedAt = Date.now(); LS.set('meta', S.meta); render(); if (!quiet) toast(withNote('저장했어요')); return;
  }
  for (const op of ops){ op.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); op.fileId = gfileOf(op.y)?.id; applyOp(S.years, op); S.queue.push(op); }
  saveQueue(); LS.set('years', S.years); render();
  flushQueue(!quiet);
}

// 시트 읽기 (계산되지 않은 원래 값)
async function readRanges(fileId, ranges, tok){
  const q = new URLSearchParams({valueRenderOption: 'UNFORMATTED_VALUE'}); ranges.forEach(r => q.append('ranges', r));
  const j = await (await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchGet?${q}`, {cache: 'no-store'}, tok)).json();
  return (j.valueRanges || []).map(v => v.values || []);
}
// 가계부 'N월' 시트에서 행 위치 찾기 → {rows: [{row, kind, name, amt, memo}], marker}
function locateBudget(V){
  const h = V.findIndex(r => str(r[0]).startsWith('구분')); if (h < 0) return null;
  const rows = []; let marker = null;
  for (let i = h + 1; i < V.length; i++){ const r = V[i] || [], k = str(r[0]);
    if (k.startsWith('▲')){ marker = i + 1; break; }
    if (KINDS.includes(k)) rows.push({row: i + 1, kind: k, name: str(r[1]) || '(이름 없음)', amt: r[2], memo: r[3]}); }
  return {rows, marker};
}
function locateAsset(V){
  const h = V.findIndex(r => str((r || [])[0]) === '대분류'); if (h < 0) return null;
  const col = {}; (V[h] || []).forEach((c, i) => { const mm = /^(\d{1,2})월$/.exec(str(c)); if (mm) col[+mm[1]] = i; });
  const rows = []; let marker = null;
  for (let i = h + 1; i < V.length; i++){ const r = V[i] || [], b = str(r[0]);
    if (b.startsWith('▲') || b === '요약'){ marker = b.startsWith('▲') ? i + 1 : null; break; }
    if (BIGS.includes(b)) rows.push({row: i + 1, big: b, mid: str(r[1]) || '기타', small: str(r[2]) || str(r[1]) || '항목', r}); }
  return {rows, col, marker};
}
let sheetIds = {};   // fileId → {시트이름: sheetId}
async function sheetIdOf(fileId, title, tok){
  if (!sheetIds[fileId]){
    const j = await (await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets.properties(sheetId,title)`, {}, tok)).json();
    sheetIds[fileId] = Object.fromEntries((j.sheets || []).map(s => [s.properties.title, s.properties.sheetId]));
  }
  return sheetIds[fileId][title];
}
async function insertRow(fileId, title, rowNum, tok){   // rowNum(1부터) 위치에 빈 행 넣기 (위 행 서식·드롭다운 이어받음)
  const sid = await sheetIdOf(fileId, title, tok); if (sid == null) throw new Error(`'${title}' 시트를 찾지 못했어요`);
  await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({requests: [{insertDimension: {range: {sheetId: sid, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum}, inheritFromBefore: true}}]})}, tok);
}
// rowNum(1부터) 위치의 c0~c1 열(0부터, c1 미포함)에만 n칸을 넣고 아래를 밀어요. fmtRow(1부터) 행의 서식·드롭다운을 새 칸에 복사.
async function insertCells(fileId, title, rowNum, c0, c1, n, tok, fmtRow = rowNum - 1){
  const sid = await sheetIdOf(fileId, title, tok); if (sid == null) throw new Error(`'${title}' 시트를 찾지 못했어요`);
  const g = (r0, r1) => ({sheetId: sid, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1});
  const dst = g(rowNum - 1, rowNum - 1 + n), src = g(fmtRow - 1, fmtRow), requests = [{insertRange: {range: dst, shiftDimension: 'ROWS'}}];
  if (fmtRow >= 1 && fmtRow < rowNum) for (const pasteType of ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION']) requests.push({copyPaste: {source: src, destination: dst, pasteType}});
  await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requests})}, tok);
}
async function writeCells(fileId, data, tok, input = 'RAW'){
  if (!data.length) return;
  await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({valueInputOption: input, data})}, tok);
}

let flushing = false;
async function flushQueue(interactive){
  if (flushing || !S.queue.length) return;
  if (!navigator.onLine){ updateStatus(); if (interactive) toast('오프라인이에요. 입력은 보관해 두고 연결되면 저장할게요'); return; }
  flushing = true; updateStatus();
  let saved = 0;
  try {
    let tok; try { tok = await gToken(interactive, 'sync'); } catch(e){ if (interactive) toast(e.message); return; }
    if (!tok){ if (interactive) toast('로그인이 필요해요. 새로고침 버튼을 눌러 주세요'); return; }
    // 1) 새 항목 행부터 (행이 밀리니 하나씩)
    for (const op of S.queue.filter(o => ['addB', 'addA', 'renB', 'delB'].includes(o.t))){
      if (op.t === 'renB' || op.t === 'delB'){
        for (const m of op.months){
          const title = m + '월', [V] = await readRanges(op.fileId, [`${qs(title)}!A1:Z2200`], tok), L = locateBudget(V);
          const hit = L && L.rows.find(r => r.kind === op.kind && r.name === op.name); if (!hit) continue;
          const h = V.findIndex(r => str((r || [])[0]).startsWith('구분')), C = ledgerCols(V, h);
          if (op.t === 'renB'){
            const data = [{range: `${qs(title)}!B${hit.row}`, values: [[op.to]]}];
            if (C.tx >= 0){ const T = readTx(V, C.txH, C.tx, m); for (const t of T) if (t.kind === op.kind && t.name === op.name) data.push({range: `${qs(title)}!${colL(C.tx + 2)}${t.row}`, values: [[op.to]]}); }
            if (C.rep >= 0){ const P = readReps(V, C.repH, C.rep, C.repEnd); for (const r of P) if (r.kind === op.kind && r.name === op.name) data.push({range: `${qs(title)}!${colL(C.rep + 2)}${r.row}`, values: [[op.to]]}); }
            await writeCells(op.fileId, data, tok);
          } else {
            if (C.tx >= 0 && readTx(V, C.txH, C.tx, m).some(t => !t.skip && t.kind === op.kind && t.name === op.name)) continue;   // 그새 거래가 생겼으면 남겨요
            if (C.rep >= 0){ const P = readReps(V, C.repH, C.rep, C.repEnd), keep = P.filter(r => !(r.kind === op.kind && r.name === op.name));
              if (keep.length !== P.length){ const n = Math.max(0, ...P.map(r => r.row - C.repH - 1));
                await writeCells(op.fileId, [{range: `${qs(title)}!${colL(C.rep)}${C.repH + 2}:${colL(C.rep + REP_COLS - 1)}${C.repH + 1 + n}`, values: Array.from({length: n}, (_, i) => keep[i] ? repRow(keep[i]) : Array(REP_COLS).fill(''))}], tok); } }
            const sid = await sheetIdOf(op.fileId, title, tok);   // 왼쪽 표(A~F)만 한 칸 위로 (오른쪽 거래 내역은 그대로)
            await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${op.fileId}:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({requests: [{deleteRange: {range: {sheetId: sid, startRowIndex: hit.row - 1, endRowIndex: hit.row, startColumnIndex: 0, endColumnIndex: C.tx >= 0 ? leftW(C) : 6}, shiftDimension: 'ROWS'}}]})}, tok);
          }
        }
      } else if (op.t === 'addB'){
        for (const m of op.months){
          const title = m + '월', [V] = await readRanges(op.fileId, [`${qs(title)}!A1:X400`], tok), L = locateBudget(V);
          if (!L || !L.marker) throw new Error(`${title} 시트에서 '▲' 행을 찾지 못했어요`);
          if (L.rows.some(r => r.kind === op.kind && r.name === op.name)) continue;
          const h = V.findIndex(r => str((r || [])[0]).startsWith('구분')), C = ledgerCols(V, h);
          if (C.tx >= 0) await insertCells(op.fileId, title, L.marker, 0, leftW(C), 1, tok);   // 새 양식: 왼쪽 표에만 칸 넣기
          else await insertRow(op.fileId, title, L.marker, tok);
          await writeCells(op.fileId, [{range: `${qs(title)}!A${L.marker}:B${L.marker}`, values: [[op.kind, op.name]]}], tok);
          if (C.tx >= 0){ const c = k => colL(C.tx + k), r0 = C.txH + 2, r = L.marker;   // 거래 합계 수식
            await writeCells(op.fileId, [{range: `${qs(title)}!C${r}`, values: [[`=SUMIFS($${c(4)}$${r0}:$${c(4)}$2100,$${c(1)}$${r0}:$${c(1)}$2100,A${r},$${c(2)}$${r0}:$${c(2)}$2100,B${r})`]]}], tok, 'USER_ENTERED'); }
        }
      } else {
        const [V] = await readRanges(op.fileId, [`'자산관리'!A1:Z300`], tok), L = locateAsset(V);
        if (!L || !L.marker) throw new Error("'자산관리' 시트에서 '▲' 행을 찾지 못했어요");
        if (!L.rows.some(r => r.big === op.big && r.mid === op.mid && r.small === op.small)){
          await insertRow(op.fileId, '자산관리', L.marker, tok);
          await writeCells(op.fileId, [{range: `'자산관리'!A${L.marker}:C${L.marker}`, values: [[op.big, op.mid, op.small]]}], tok);
        }
      }
      S.queue = S.queue.filter(o => o !== op); saveQueue(); saved++;
    }
    // 2) 거래 내역·반복 거래·세부분류: 그 달 시트를 읽어 ID로 합친 뒤 블록을 통째로 다시 써요
    const LT = ['tx', 'reps', 'cat'], byMon = {};
    for (const op of S.queue.filter(o => LT.includes(o.t))) (byMon[op.fileId + '|' + op.m] = byMon[op.fileId + '|' + op.m] || []).push(op);
    for (const ops of Object.values(byMon)){
      const fileId = ops[0].fileId, title = ops[0].m + '월';
      const [V] = await readRanges(fileId, [`${qs(title)}!A1:Z2200`], tok);
      const h = V.findIndex(r => str((r || [])[0]).startsWith('구분')), C = h >= 0 ? ledgerCols(V, h) : null;
      if (!C || C.tx < 0 || C.rep < 0 || C.sub < 0){ ops.forEach(o => o.err = `${title} 시트에 거래 내역 칸이 없어요 (새 양식 시트가 필요해요)`); continue; }
      const curTx = readTx(V, C.txH, C.tx, ops[0].m), curRep = readReps(V, C.repH, C.rep, C.repEnd), L = locateBudget(V);
      let tx = curTx.map(({row, ...t}) => t), reps = null; const data = [];
      for (const op of ops){
        if (op.t === 'tx'){ const i = tx.findIndex(t => t.id === op.tx.id);
          if (op.act === 'del'){ if (i >= 0) tx.splice(i, 1); } else if (i >= 0) tx[i] = {...op.tx}; else tx.push({...op.tx}); }
        else if (op.t === 'reps') reps = op.reps;
        else { const hit = L.rows.filter(r => r.kind === op.kind && r.name === op.name)[0];
          if (!hit){ op.err = '시트에서 항목을 찾지 못했어요'; continue; }
          data.push({range: `${qs(title)}!${colL(C.sub)}${hit.row}`, values: [[op.subs.join(', ')]]});
          if (C.bud >= 0) data.push({range: `${qs(title)}!${colL(C.bud)}${hit.row}`, values: [[op.bud ?? '']]}); }
      }
      const block = (c, hh, w, rows, used) => { const n = Math.max(rows.length, used); if (!n) return null;
        return {range: `${qs(title)}!${colL(c)}${hh + 2}:${colL(c + w - 1)}${hh + 1 + n}`, values: Array.from({length: n}, (_, i) => rows[i] || Array(w).fill(''))}; };
      const usedTx = Math.max(0, ...curTx.map(t => t.row - C.txH - 1)), usedRep = Math.max(0, ...curRep.map(r => r.row - C.repH - 1));
      if (reps && reps.length > repCap(C)){   // 반복 거래 칸이 모자라면 오른쪽 블록에만 줄을 넣어 거래 내역을 아래로 밀어요
        const k = reps.length - repCap(C);
        await insertCells(fileId, title, C.repH + 2 + repCap(C), C.rep, C.rep + TX_COLS, k, tok, C.repH + 2);
        C.txH += k; C.repEnd += k;
      }
      tx.sort((a, z) => a.d - z.d);
      if (ops.some(o => o.t === 'tx')){ const b = block(C.tx, C.txH, TX_COLS, tx.map(txRow), usedTx); if (b) data.push(b); }
      if (reps){ const b = block(C.rep, C.repH, REP_COLS, reps.map(repRow), Math.min(usedRep, repCap(C))); if (b) data.push(b); }
      await writeCells(fileId, data, tok);
      const Yl = S.years?.[ops[0].y];   // 다른 기기·시트에서 넣은 거래도 화면에 바로 반영
      if (Yl?.txMode && ops.some(o => o.t === 'tx')){ Yl.tx[ops[0].m] = tx.map(t => ({...t})); if (reps) Yl.reps[ops[0].m] = reps.map(r => ({...r})); recalcMonth(Yl, ops[0].m); LS.set('years', S.years); }
      const done = ops.filter(o => !o.err);
      S.queue = S.queue.filter(o => !done.includes(o)); saveQueue(); saved += done.length;
    }
    // 3) 값 쓰기: 파일·시트별로 한 번 읽고, 이름으로 칸을 찾아 비교 후 쓰기
    const byFile = {}; for (const op of S.queue.filter(o => o.t === 'b' || o.t === 'a')) (byFile[op.fileId] = byFile[op.fileId] || []).push(op);
    for (const [fileId, ops] of Object.entries(byFile)){
      const titles = [...new Set(ops.map(o => o.t === 'b' ? o.m + '월' : '자산관리'))];
      const Vs = await readRanges(fileId, titles.map(t => t === '자산관리' ? `'자산관리'!A1:Z300` : `${qs(t)}!A1:D400`), tok);
      const loc = Object.fromEntries(titles.map((t, i) => [t, t === '자산관리' ? locateAsset(Vs[i]) : locateBudget(Vs[i])]));
      const data = [], done = [], conflicts = [];
      for (const op of ops){
        let range, cur;
        if (op.t === 'b'){
          const L = loc[op.m + '월'], hit = L && L.rows.filter(r => r.kind === op.kind && r.name === op.name)[op.idx || 0];
          if (!hit){ op.err = '시트에서 항목을 찾지 못했어요'; continue; }
          range = `${qs(op.m + '월')}!${op.f === 'memo' ? 'D' : 'C'}${hit.row}`; cur = op.f === 'memo' ? hit.memo : hit.amt;
        } else {
          const L = loc['자산관리'], hit = L && L.rows.filter(r => r.big === op.big && r.mid === op.mid && r.small === op.small)[op.idx || 0];
          if (!hit || L.col[op.m] == null){ op.err = '시트에서 항목이나 월 열을 찾지 못했어요'; continue; }
          range = `'자산관리'!${colL(L.col[op.m])}${hit.row}`; cur = hit.r[L.col[op.m]];
        }
        if (!op.force && !sameVal(cur, op.o, op.f === 'memo') && !sameVal(cur, op.v, op.f === 'memo')){ conflicts.push({op, cur}); continue; }
        data.push({range, values: [[op.v == null ? '' : op.v]]}); done.push(op);
      }
      await writeCells(fileId, data, tok);
      S.queue = S.queue.filter(o => !done.includes(o)); saveQueue(); saved += done.length;
      if (conflicts.length && interactive) await resolveConflicts(conflicts);
      else for (const c of conflicts) c.op.conflict = true;
    }
    const stuck = S.queue.filter(o => o.err);
    if (stuck.length) toast(`${stuck.length}건을 저장하지 못했어요: ${stuck[0].err}`);
    else if (saved && interactive) toast(withNote(`구글 시트에 저장했어요${saved > 1 ? ` (${saved}건)` : ''}`));
    S.meta.savedAt = Date.now(); LS.set('meta', S.meta);
  } catch(e){
    if (interactive) toast(e instanceof TypeError ? '연결이 불안정해 저장을 미뤘어요. 연결되면 다시 저장할게요' : '저장하지 못했어요: ' + e.message);
  } finally { flushing = false; saveQueue(); render(); }
}
window.addEventListener('online', () => flushQueue(false));

// 다른 곳에서 먼저 고친 칸: 하나씩 물어보기
function resolveConflicts(list){
  return new Promise(done => {
    const next = () => {
      const c = list.shift(); if (!c){ closeEd(); return done(); }
      const op = c.op, label = op.t === 'b' ? `${op.m}월 ${op.name}${op.f === 'memo' ? ' 메모' : ''}` : `${op.m}월 ${op.small}`;
      const show = v => op.f === 'memo' ? esc(str(v) || '(비어 있음)') : (toNum(v) == null ? '비어 있음' : fmtWon(toNum(v)) + '원');
      openEd(`<h4>시트 값이 바뀌었어요</h4><div class="esub">앱을 연 뒤 다른 곳에서 '${esc(label)}'이(가) 고쳐졌어요.</div>
        <div class="ecard"><div class="kv"><span>시트의 현재 값</span><b class="num">${show(c.cur)}</b></div><div class="kv"><span>지금 입력한 값</span><b class="num">${show(op.v)}</b></div></div>
        <button class="btn" id="cfMine">내 값으로 저장</button><button class="btn ghost" id="cfTheirs">시트 값 유지</button>`, {noClose: true});
      $('#cfMine').onclick = () => { op.force = true; delete op.conflict; saveQueue(); next(); setTimeout(() => flushQueue(true), 0); };
      $('#cfTheirs').onclick = () => { S.queue = S.queue.filter(o => o !== op); saveQueue();
        applyOp(S.years, {...op, v: op.f === 'memo' ? str(c.cur) : toNum(c.cur)}); LS.set('years', S.years); next(); };
    };
    next();
  });
}
