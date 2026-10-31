// 처음 시작 · 앱만 사용하기 · 엑셀 내보내기
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 처음 시작 (온보딩) ─────────
   앱 소개 → 시작 방법(구글로 시작 / 앱만 사용 / 예시로 둘러보기) → 목표 금액 → (구글) 새 시트 만들기 또는 기존 시트 고르기 */
S.ob = LS.get('ob', {step: 'intro', path: null});
const saveOb = () => LS.set('ob', S.ob);
function viewOnboard(){
  document.body.classList.add('onboarding');
  const st = S.ob.step, el = $('#view');
  if (st === 'goal'){
    const cur = S.goal.target, opts = [5e8, 1e9, 2e9, 3e9];
    el.innerHTML = `<section class="ob">
      <div class="ob-step">2 / ${S.ob.path === 'google' ? 3 : 2}</div>
      <h2>목표 순자산을 정해 주세요</h2>
      <p class="ob-sub">목표 탭에서 달성 예상 시점과 계획 대비 진행을 보여줘요. 나중에 설정에서 바꿀 수 있어요.</p>
      <div class="ob-chips">${opts.map(v => `<button data-v="${v}"${v === cur ? ' class="on"' : ''}>${money(v)}</button>`).join('')}</div>
      <label class="field"><span>직접 입력 (억원)</span><input id="obGoal" type="number" inputmode="decimal" step="0.5" value="${cur / 1e8}"></label>
      <button class="btn" id="obNext">${S.ob.path === 'google' ? '다음' : '시작하기'}</button>
      <button class="btn ghost" id="obBack">뒤로</button></section>`;
    el.querySelectorAll('.ob-chips button').forEach(b => b.onclick = () => { $('#obGoal').value = +b.dataset.v / 1e8;
      el.querySelectorAll('.ob-chips button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#obBack').onclick = () => { S.ob = {step: 'intro', path: null}; saveOb(); render(); };
    $('#obNext').onclick = () => {
      const v = parseFloat($('#obGoal').value); if (!(v > 0)) return toast('목표 금액을 넣어 주세요');
      S.goal = {...S.goal, target: Math.round(v * 1e8), planYear: new Date().getFullYear()}; LS.set('goal', S.goal);
      if (S.ob.path === 'google'){ S.ob.step = 'google'; saveOb(); return render(); }
      startLocal();
    };
    return;
  }
  if (st === 'google'){
    el.innerHTML = `<section class="ob">
      <div class="ob-step">3 / 3</div>
      <h2>구글 시트를 연결해요</h2>
      <p class="ob-sub">가계부와 자산은 <b>내 구글 드라이브의 시트</b>에 저장돼요. 앱은 내가 고르거나 앱에서 만든 시트만 볼 수 있어요.</p>
      <button class="ob-card" id="obNew"><b>새 시트 만들기</b><span>처음이라면 추천해요. ${new Date().getFullYear()}년 빈 가계부·자산 시트를 드라이브에 만들어요.</span></button>
      <button class="ob-card" id="obPick"><b>이미 쓰던 시트 고르기</b><span>이 앱 양식으로 만든 시트가 있다면 골라 주세요.</span></button>
      <button class="btn ghost" id="obBack">뒤로</button></section>`;
    $('#obNew').onclick = () => gCreate(new Date().getFullYear());
    $('#obPick').onclick = () => gPick();
    $('#obBack').onclick = () => { S.ob.step = 'goal'; saveOb(); render(); };
    return;
  }
  el.innerHTML = `<section class="ob">
    <div class="ob-hero"><div class="ob-logo">₩</div><h2>자산관리</h2>
      <p class="ob-sub">가계부와 자산을 한곳에서 보고, 목표까지 얼마나 왔는지 확인해요.</p></div>
    <ul class="ob-list">
      <li><b>가계부</b><span>수입·지출과 저축률을 달마다 정리해요. 대출 원금 상환도 저축으로 계산해요.</span></li>
      <li><b>자산</b><span>계좌별 잔액으로 순자산과 변화를 그래프로 보여줘요.</span></li>
      <li><b>목표</b><span>지금 속도라면 목표에 언제 닿는지, 계획보다 빠른지 알려줘요.</span></li>
    </ul>
    <button class="btn" id="obGoogle"><span class="gmark" aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>구글로 시작하기</button>
    <button class="btn alt" id="obLocal">앱만 사용하기</button>
    <button class="btn alt" id="obDemo">예시로 둘러보기</button></section>`;
  $('#obGoogle').onclick = () => { if (!gReady()) return toast('구글 연결 설정이 아직 없어요'); S.ob = {step: 'goal', path: 'google'}; saveOb(); render(); };
  $('#obLocal').onclick = () => { S.ob = {step: 'goal', path: 'local'}; saveOb(); render(); };
  $('#obDemo').onclick = () => loadDemo();
}
function finishOb(){ S.ob = {step: 'done', path: S.ob.path}; saveOb(); document.body.classList.remove('onboarding'); }
function restartOb(){
  if (S.meta.source === 'local' && yearsList().length && !confirm('이 기기에만 저장된 가계부·자산 데이터가 지워져요. 먼저 엑셀로 내보내기를 권해요. 계속할까요?')) return;
  S.years = {}; S.meta = {}; LS.set('years', {}); LS.set('meta', {}); setYear(null);
  S.ob = {step: 'intro', path: null}; saveOb(); closeSheet(); go('home');
}

/* ───────── 앱만 사용하기 (이 기기에 저장) ───────── */
// 새 연도 데이터: 전년도가 있으면 그 항목 구성을 그대로 쓰고(금액은 비움), 없으면 템플릿 항목으로 시작해요.
async function blankYear(y){
  const prev = S.years?.[y - 1] || S.years?.[Math.max(...yearsList().filter(v => v < y))];
  let M;
  if (prev){
    M = {year: y, budget: {}, assets: prev.assets.map(a => ({big: a.big, mid: a.mid, small: a.small, v: Array(12).fill(null)}))};
    const last = prev.budget[12]?.length ? prev.budget[12] : Object.values(prev.budget).filter(L => L.length).pop() || [];
    for (let m = 1; m <= 12; m++) M.budget[m] = last.map(i => ({kind: i.kind, name: i.name, amt: 0, memo: '', filled: false, subs: [...(i.subs || [])], bud: i.bud ?? null}));
    if (prev.txMode){ const lr = prev.reps?.[12] || []; Object.assign(M, {txMode: true, tx: {}, reps: {}});
      for (let m = 1; m <= 12; m++){ M.tx[m] = []; M.reps[m] = lr.map(r => ({...r})); } }
  } else {
    const r = await fetch('template.xlsx'); if (!r.ok) throw new Error('템플릿을 불러오지 못했어요');
    M = parseWorkbook(await r.arrayBuffer()); M.year = y;
  }
  return M;
}
async function startLocal(){
  try {
    const y = new Date().getFullYear(), M = await blankYear(y);
    finishOb(); setYears({[y]: M}, {source: 'local'}); S.bview = 'cal'; go('budget');
    toast('준비됐어요. 이번 달 가계부부터 입력해 보세요');
  } catch(e){ toast(e.message); }
}
async function addLocalYear(){
  const ys = yearsList(), next = ys.length ? Math.max(...ys) + 1 : new Date().getFullYear();
  const ans = prompt('추가할 연도', String(next)); if (ans == null) return;
  const y = parseInt(ans, 10); if (!(y >= 2000 && y <= 2100)) return toast('연도를 숫자로 넣어 주세요');
  if (S.years[y]) return toast(`${y}년은 이미 있어요`);
  const M = await blankYear(y); S.years[y] = M; LS.set('years', S.years); setYear(y); closeSheet(); render();
  toast(`${y}년을 추가했어요${y - 1 in S.years ? ' (전년도 항목 구성을 가져왔어요)' : ''}`);
}

/* ───────── 엑셀로 내보내기 (백업·다른 기기로 옮기기) ─────────
   앱이 다시 읽을 수 있는 형식(설정·1~12월·자산관리)으로 연도별 파일을 만들어요. 서식·수식·그래프는 없어요. */
function exportYear(y){
  const M = S.years[y]; if (!M) return;
  const wb = XLSX.utils.book_new();
  const st = [['기준 연도', y], [], ['이 파일은 자산관리 앱에서 내보낸 백업이에요. 앱 설정 탭 → "엑셀 파일 가져오기"로 다시 불러올 수 있어요.']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(st), '설정');
  for (let m = 1; m <= 12; m++){
    const rows = [[`${m}월 가계부`], [], ['구분(1차)', '항목(2차)', '금액', '메모']];
    if (!M.txMode){
      for (const i of M.budget[m] || []) rows.push([i.kind, i.name, i.filled ? i.amt : null, i.memo || null]);
      rows.push(['▲ 항목 추가 시 이 행 위에 행 삽입']);
    } else {   // 새 양식: 왼쪽 요약·달력·구분별 표, 오른쪽 반복 거래(위)·거래 내역(아래) — 값만 (수식 없음)
      const its = M.budget[m] || [], T = (M.tx[m] || []).slice().sort((a, z) => a.d - z.d), P = M.reps[m] || [];
      const put = (r, c, v) => { while (rows.length <= r) rows.push([]); const R = rows[r]; while (R.length < c) R.push(null); R[c] = v; };
      rows.length = 0; put(0, 0, `${y}년 ${m}월 가계부`);
      const b = bMonth(m, y), live = T.filter(t => !t.skip), bud = its.filter(i => EXP_KINDS.includes(i.kind)).reduce((a, i) => a + (i.bud || 0), 0);
      put(3, 0, '요약');
      [['총 수입', b.income], ['고정비', b.fixed], ['변동비', b.variable], ['총 지출', b.expense], ['저축', b.save], ['남은 돈', b.left], ['저축률', b.rate]]
        .forEach(([k, v], j) => { put(4, j, k); put(5, j, v); });
      [['지출 예산', bud || null], ['예산 남은 금액', bud ? bud - b.expense : null]].forEach(([k, v], j) => { put(6, j, k); put(7, j, v); });
      put(9, 0, '달력 · 날짜별 지출'); WD.forEach((w, k) => put(10, k, w));
      const off = new Date(y, m - 1, 1).getDay(), nd = daysIn(y, m);
      for (let d = 1; d <= nd; d++){ const i = off + d - 1, w = Math.floor(i / 7), k = i % 7;
        const v = live.filter(t => t.d === d && EXP_KINDS.includes(t.kind)).reduce((a, t) => a + t.amt, 0);
        put(11 + w * 2, k, d); put(12 + w * 2, k, v || null); }
      const T0 = 42; put(T0 - 2, 0, '항목별 합계');
      ['구분(1차)', '항목(2차)', '금액', '메모', '월 예산'].forEach((h, j) => put(T0 - 1, j, h)); put(T0 - 1, 7, '세부분류');
      its.forEach((it, i) => { [it.kind, it.name, it.amt, it.memo || null, it.bud ?? null].forEach((v, j) => put(T0 + i, j, v)); put(T0 + i, 7, (it.subs || []).join(', ') || null); });
      put(T0 + its.length, 0, '▲ 항목 추가 시 이 행 위에 행 삽입');
      const RC = 8, RH = 3, cap = Math.max(20, P.length), TH = RH + cap + 3;
      put(RH - 1, RC, '반복 거래 · 매달 이 날짜에 거래 내역으로 자동 입력');
      ['일', '구분', '항목', '세부분류', '금액', '결제수단', '메모'].forEach((h, j) => put(RH, RC + j, h));
      P.forEach((r, i) => repRow(r).forEach((v, j) => put(RH + 1 + i, RC + j, v === '' ? null : v)));
      put(TH - 1, RC, '거래 내역 · 앱에서 입력하면 아래로 쌓여요 (ID는 앱이 써요)');
      ['일', '구분', '항목', '세부분류', '금액', '결제수단', '메모', 'ID'].forEach((h, j) => put(TH, RC + j, h));
      T.forEach((t, i) => txRow(t).forEach((v, j) => put(TH + 1 + i, RC + j, v === '' ? null : v)));
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `${m}월`);
  }
  const ar = [['자산관리'], [], ['대분류', '중분류', '소분류', ...Array.from({length: 12}, (_, i) => `${i + 1}월`)]];
  for (const a of M.assets) ar.push([a.big, a.mid, a.small, ...a.v.map(v => v ?? null)]);
  ar.push(['▲ 항목 추가 시 이 행 위에 행 삽입']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ar), '자산관리');
  XLSX.writeFile(wb, `자산관리_${y}_백업.xlsx`);
}
function exportAll(){
  const ys = yearsList(); if (!ys.length) return toast('내보낼 데이터가 없어요');
  ys.forEach((y, i) => setTimeout(() => exportYear(y), i * 400));
  toast(`${ys.length}개 연도를 엑셀 파일로 내보냈어요`);
}
