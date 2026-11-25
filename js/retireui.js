// 은퇴 설계 화면 (목표 탭 › 은퇴 설계). 계산은 js/retire.js(Retire), 세법 수치는 js/rules.js.
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
// 입력값은 이 기기에만 저장해요(LS 'retire'). 시트나 서버로 보내지 않아요.
/* ───────── 설정값 ───────── */
S.gview = LS.get('gview', 'goal');   // 목표 탭 위 전환: goal 목표 순자산 / retire 은퇴 설계
const RT_KINDS = ['해외주식', '국내주식', '국내상장 해외ETF', '연금저축', 'IRP', 'ISA', '현금', '집', '빼기'];
const RT_STOCK = ['해외주식', '국내주식', '국내상장 해외ETF'];
const RT_DIV0 = {'해외주식': 0.6, '국내주식': 2, '국내상장 해외ETF': 1};   // 배당률 기본값(%)
const rtNowYear = () => new Date().getFullYear();
const rtNpsDef = () => ({mode: 'direct', monthly: null, startAge: null, years: 20, income: 300});   // 금액은 만원
function rtDefaults(){
  const pts = assetPoints(), inp = pts.length > 1 ? analysisInputs(pts) : {save: 0, expense: 0};
  return {v: 1, done: false, couple: false, planAge: 95, region: '대도시',
    me: {birthYear: null, retireAge: 55, nps: rtNpsDef()}, sp: {birthYear: null, nps: rtNpsDef()},
    spend: Math.round((inp.expense || 3e6) / 1e4), saving: Math.round(inp.save * 12 / 1e4), housePublic: null,
    acc: {}, opt: null,
    assume: {inflation: 2, returnRate: +((S.goal.planRate ?? 0.06) * 100).toFixed(1), perAccount: false, rates: {}, savingMode: 'infl', savingGrowth: 2, houseMode: 'infl', houseGrowth: 2}};
}
let RT = LS.get('retire', null);
const rtSave = () => { LS.set('retire', RT); rtCache.clear(); };
const rtNum = v => { const n = Number(String(v ?? '').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };

/* ───────── 자산 탭 → 계좌 목록 ───────── */
const rtKey = a => a.big + '|' + a.mid + '|' + a.small;
function rtGuess(a){
  const n = (a.mid + ' ' + a.small).replace(/\s/g, '').toUpperCase();
  if (homeGroupOf(a) === 'estate' || /부동산|아파트|주택|빌라|오피스텔/.test(n)) return '집';
  if (/IRP|퇴직/.test(n)) return 'IRP';
  if (/연금/.test(n)) return '연금저축';
  if (/ISA/.test(n)) return 'ISA';
  if (/청약|예금|적금|파킹|통장|CMA|현금|MMF|저축/.test(n) || homeGroupOf(a) === 'cash') return '현금';
  if (/해외|미국|나스닥|S&P|QQQ|SCHD|TQQQ|QLD|VOO|SPY|JEPI/.test(n)) return '해외주식';
  if (/국내|코스피|코스닥|삼성전자/.test(n)) return '국내주식';
  return null;   // 확인 필요
}
function rtItems(){
  const pts = assetPoints(), cur = pts.at(-1);
  if (!cur) return {items: [], debt: 0, repay: 0, cur: null};
  const items = S.years[cur.y].assets.filter(a => a.big !== '부채').map(a => ({a, key: rtKey(a), val: cur.val(a)})).filter(x => x.val > 0)
    .map(x => { const s = RT?.acc?.[x.key] || {}; const g = rtGuess(x.a); return Object.assign(x, {kind: s.kind || g || '현금', guessed: !s.kind && !g, s}); });
  // 빚이 줄어드는 속도: 1년 전(없으면 가장 오래된 기록)과 비교한 한 해 감소액
  const ci = ymIdx(cur.y, cur.m), old = [...pts].reverse().find(p => ci - ymIdx(p.y, p.m) >= 12) || pts[0];
  const months = ci - ymIdx(old.y, old.m);
  const repay = months > 0 ? Math.max(0, (old.debt - cur.debt) / months * 12) : 0;
  return {items, debt: cur.debt || 0, repay, cur};
}

/* ───────── 엔진 입력 만들기 ───────── */
function rtNpsParam(n){
  const start = n.startAge || undefined;
  if (n.mode === 'auto') return {mode: 'auto', years: n.years || 0, monthlyIncome: (n.income || 0) * 1e4, startAge: start};
  return {mode: 'direct', monthly: (n.monthly || 0) * 1e4, startAge: start};
}
function rtParams(retireAge){
  const c = RT, A = c.assume, {items, debt, repay} = rtItems();
  const houses = items.filter(x => x.kind === '집'), houseSum = houses.reduce((s, x) => s + x.val, 0);
  const accounts = items.filter(x => x.kind !== '빼기').map(x => {
    const o = {kind: x.kind, balance: x.val, owner: c.couple ? (x.s.owner || '나') : '나'};
    if (A.perAccount && A.rates[x.kind] != null && x.kind !== '집') o.rate = A.rates[x.kind] / 100;
    if (RT_STOCK.includes(x.kind)) o.dividendYield = (x.s.div ?? RT_DIV0[x.kind]) / 100;
    if (x.s.principal != null && x.kind !== '국내주식') o.principal = x.s.principal * 1e4;
    if (x.kind === '집') o.publicPrice = c.housePublic != null && houseSum ? c.housePublic * 1e4 * x.val / houseSum : x.val * 0.7;
    return o;
  });
  const p = {baseYear: rtNowYear(), birthYear: c.me.birthYear, retireAge: retireAge ?? c.me.retireAge, planAge: c.planAge, region: c.region,
    spendMonthly: c.spend * 1e4, salary: c.me.salary != null ? c.me.salary * 1e4 : undefined, annualSaving: Math.max(0, c.saving || 0) * 1e4, debt, annualRepay: repay,
    inflation: A.inflation / 100, returnRate: A.returnRate / 100, accounts, nps: rtNpsParam(c.me.nps)};
  if (A.perAccount && A.rates['현금'] != null) p.cashRate = A.rates['현금'] / 100;
  if (A.savingMode === 'direct') p.savingGrowth = A.savingGrowth / 100;
  if (A.houseMode === 'direct') p.houseGrowth = A.houseGrowth / 100;
  if (c.couple && c.sp.birthYear) p.spouse = {birthYear: c.sp.birthYear, nps: rtNpsParam(c.sp.nps)};
  return p;
}
// 같은 입력이면 다시 계산하지 않아요
const rtCache = new Map();
function rtCalc(kind, retireAge, fn){
  const k = kind + '|' + JSON.stringify(rtParams(retireAge)) + '|' + JSON.stringify(RT.opt || {});
  if (!rtCache.has(k)){ if (rtCache.size > 60) rtCache.clear(); rtCache.set(k, fn(rtParams(retireAge), RT.opt || {})); }
  return rtCache.get(k);
}
const rtSim = R => rtCalc('sim', R, (p, o) => Retire.simulate(p, null, o));
const rtMonthly = R => rtCalc('mon', R, (p, o) => Retire.sustainableMonthly(p, o));
const rtImprove = R => rtCalc('imp', R, p => Retire.improvements(p));
const rtReady = () => RT && RT.done && RT.me.birthYear;

/* ───────── 목표 탭 위 전환 ───────── */
function goalSegHtml(){
  return `<div class="seg rt-top" id="segGview"><button data-v="goal">목표 순자산</button><button data-v="retire">은퇴 설계</button></div>`;
}
function goalSegBind(){
  seg('#segGview', S.gview, v => { S.gview = v; LS.set('gview', v); window.scrollTo(0, 0); render(); });
}

/* ───────── 결과 화면 ───────── */
const RT_C = {nps: 'var(--accent)', pen: 'var(--saving)', save: 'var(--fixed)', short: '#FFD3D6'};
const rtAgeText = a => a > 100 ? '100세 이상' : a + '세';
function viewRetire(){
  const pts = assetPoints();
  if (!pts.length){ $('#view').innerHTML = goalSegHtml() + `<section class="card hero"><div class="label">은퇴 설계 <span class="rt-beta">베타</span></div>
    <p class="rt-p">자산 탭에 잔액을 먼저 입력하면, 지금 자산으로 언제 은퇴할 수 있는지 계산해 드려요.</p>
    <button class="btn" data-act="homeAsset">잔액 입력하기</button></section>`; goalSegBind(); return; }
  if (!rtReady()){
    $('#view').innerHTML = goalSegHtml() + `<section class="card hero"><div class="label">은퇴 설계 <span class="rt-beta">베타</span></div>
      <div class="big2" style="margin:6px 0 4px">몇 살에 은퇴할 수 있을까요</div>
      <p class="rt-p">자산 탭의 잔액과 가계부 지출로 은퇴 후 매달 쓸 수 있는 돈, 돈이 버티는 나이, 세금·건강보험료까지 계산해요.</p>
      <button class="btn" id="rtStart">시작하기</button></section>
      <p class="note" style="margin:2px 6px 0">베타 기능이에요. 계산 방식이 바뀔 수 있어요. 입력한 값은 이 기기에만 저장돼요.</p>`;
    goalSegBind();
    $('#rtStart').onclick = () => { if (!RT) RT = rtDefaults(); rtSetup(1); };
    return;
  }
  const R = S.rtAge ?? RT.me.retireAge, nowAge = rtNowYear() - RT.me.birthYear;
  const r = rtSim(R), M = rtMonthly(R), D = r.lastAge, plan = RT.planAge, ok = D >= plan, T = RT.spend * 1e4;
  // 은퇴 나이 바꿔 보기: 입력 나이 앞뒤
  const ages = [...new Set([-10, -5, -3, -1, 0, 3, 5].map(d => RT.me.retireAge + d))].filter(a => a >= nowAge && a <= 75).slice(0, 7);
  const ageOk = a => rtSim(a).lastAge >= plan;
  let guide;
  if (R === RT.me.retireAge && ok) guide = `지금 계획대로면 ${rtAgeText(D)}까지 생활비 걱정 없이 지낼 수 있어요.`;
  else if (!ok) guide = `${R}세에 은퇴하면 ${D + 1}세부터 생활비가 모자라요.`;
  else if (M > T * 1.07) guide = `${R}세에 은퇴해도 매달 ${money(M - T)}씩 더 쓸 수 있어요.`;
  else guide = `${R}세에 은퇴해도 ${rtAgeText(D)}까지 생활비를 쓸 수 있어요.`;
  if (RT.opt) guide += ' 개선 방법을 적용한 결과예요.';
  $('#view').innerHTML = goalSegHtml() + `
  <button class="rt-report rt-top-rep" id="rtPlanRep"><span><b>은퇴 계산 레포트 보기</b><small>얼마씩 모아서, 언제부터 어디서 꺼내 쓰는지 차근차근</small></span><i>›</i></button>
  <section class="card rt-hero">
    <div class="rt-hrow"><span class="rt-age num">${R}세 은퇴</span><span class="rt-badge ${ok ? 'ok' : 'no'}">${ok ? '가능' : '부족'}</span><button class="rt-link" id="rtEdit">설정</button></div>
    <p class="rt-guide">${guide}</p>
    <div class="rt-sublab">은퇴 나이 바꿔 보기</div>
    <div class="rt-chips">${ages.map(a => `<button data-a="${a}" class="${a === R ? 'on' : ''} ${ageOk(a) ? '' : 'bad'}">${a}세</button>`).join('')}</div>
  </section>
  <div class="rt-tiles">
    <section class="card"><div class="rt-tl">은퇴 후 매달</div><div class="rt-tv num">${money(M)}</div>
      <div class="rt-tn ${M >= T ? 'good' : 'bad'}">생활비보다 ${money(Math.abs(M - T))} ${M >= T ? '여유' : '적음'}</div></section>
    <section class="card"><div class="rt-tl">돈이 버티는 나이</div><div class="rt-tv num">${rtAgeText(D)}</div>
      <div class="rt-tn">은퇴 후 ${Math.max(0, Math.min(D, 100) - R)}년</div></section>
  </div>
  <section class="card"><h3>자산 흐름 <small>막대를 눌러 보세요</small></h3><div id="rtBal"></div></section>
  <section class="card"><h3>매달 꺼내 쓰는 곳 <small>시기를 눌러 보세요</small></h3><div id="rtMix"></div></section>
  <section class="card rt-links">
    <button class="rt-row" id="rtDetail"><span>계산 내역</span><i>›</i></button>
    <button class="rt-row" id="rtImprove"><span>계획 개선하기</span><em id="rtImpNote">계산 중…</em><i>›</i></button>
  </section>
  ${RT.opt ? '<button class="btn ghost" id="rtUndo" style="margin-bottom:12px">개선 방법 빼고 다시 계산하기</button>' : ''}
  <p class="note" style="margin:2px 6px 0">${Retire.BASE_YEAR}년 세법 기준 추정이에요. 세무·투자 상담이 아니에요. 베타 기능이라 계산 방식이 바뀔 수 있어요.</p>`;
  goalSegBind();
  $('#rtEdit').onclick = () => rtSetup('all');
  $('#rtPlanRep').onclick = () => rtPlanReport(R);
  document.querySelectorAll('.rt-chips button').forEach(b => b.onclick = () => { S.rtAge = +b.dataset.a; S.rtBar = null; S.rtStage = 0; const y = window.scrollY; render(); window.scrollTo(0, y); });
  $('#rtDetail').onclick = () => rtDetail(R);
  $('#rtImprove').onclick = () => rtImprovePage(R);
  if ($('#rtUndo')) $('#rtUndo').onclick = () => { RT.opt = null; rtSave(); render(); };
  rtBalDraw(r, R);
  rtMixDraw(r, R);
  // 개선 비교는 무거워서 화면을 먼저 그린 뒤 계산해요
  setTimeout(() => { const el = $('#rtImpNote'); if (!el) return;
    const im = rtImprove(R), s = im.combined.saving;
    el.textContent = im.list.length && s > 0 ? `최대 ${money(s)} ${im.measure === 'monthly' ? '더 쓸 수 있어요' : '더 남아요'}` : '지금 계획이 좋아요'; el.classList.toggle('good', s > 0); }, 30);
}

/* ───────── 해마다 꺼내 쓰는 곳과 시기 나누기 (결과 화면·레포트가 함께 써요) ───────── */
const rtLiq = b => b.cash + b.isa + b.foreign + b.domestic + b.kretf + b.pension;
const rtGroups = (b, infl) => [(b.foreign + b.domestic + b.kretf) / infl, b.pension / infl, (b.isa + b.cash) / infl];   // 주식·연금계좌·ISA와 현금
const RT_SRC = {nps: ['국민연금', 'var(--accent)'], pen: ['연금저축·IRP', 'var(--saving)'], div: ['주식 배당', '#F5B27A'], sell: ['주식 판 돈', 'var(--fixed)'], cash: ['ISA·현금', '#8E9196']};
const RT_TAXN = {pensionAcct: '연금계좌 세금', income: '국민연금·금융소득 세금', foreignDivTax: '해외 배당 세금', stock: '해외주식 양도세', isa: 'ISA 세금', health: '건강보험료', house: '집 보유세'};
function rtYearOf(x){
  const m = v => v / 12 / x.infl;
  return {a: x.age,
    src: {nps: m(x.publicPension + x.basicPension), pen: m(x.take.pensionIn + x.take.pensionOut), div: m(x.dividend), sell: m(x.take.foreign + x.take.kretf + x.take.domestic), cash: m(x.take.cash + x.take.isa + x.interest)},
    tax: Object.fromEntries(Object.keys(RT_TAXN).map(k => [k, m(x.tax[k] - (k === 'health' || k === 'house' ? 0 : 0))])),
    unpaid: m(x.unpaidTax || 0), short: m(Math.max(0, x.short - (x.debtRepay || 0))), debt: m(x.debtRepay || 0),
    net: m(Math.max(0, x.need - x.short - (x.debtRepay || 0)))};
}
// 시기: 꺼내는 곳 묶음이 바뀌는 나이에서 끊고, 한 해짜리 시기는 다음 시기에 합쳐요
function rtStages(r, R){
  const rows = r.rows.filter(x => x.phase === 'retire' && x.age <= 100);
  if (!rows.length) return [];
  const ys = rows.map(rtYearOf), sig = y => Object.entries(y.src).filter(([, v]) => v >= 1e4).map(([k]) => k).join(',') + (y.short >= 1e4 ? ',short' : '');
  let st = [];
  ys.forEach((y, i) => { if (!st.length || sig(y) !== sig(ys[i - 1])) st.push({a0: y.a, ys: []}); st.at(-1).ys.push(y); });
  const merged = [];
  st.forEach((s, i) => { if (s.ys.length < 2 && st[i + 1]) { st[i + 1].a0 = s.a0; st[i + 1].ys = s.ys.concat(st[i + 1].ys); } else merged.push(s); });
  st = merged;
  const balAt = a => { if (a === R && r.atRetire) return rtGroups(r.atRetire.bal, r.atRetire.infl); const x = rows.find(z => z.age === a - 1); return x ? rtGroups(x.bal, x.infl) : [0, 0, 0]; };
  return st.map((s, i) => {
    const n = s.ys.length, avg = f => s.ys.reduce((t, y) => t + f(y), 0) / n, a1 = s.ys.at(-1).a;
    const src = Object.fromEntries(Object.keys(RT_SRC).map(k => [k, avg(y => y.src[k])]));
    const tax = Object.fromEntries(Object.keys(RT_TAXN).map(k => [k, avg(y => y.tax[k])]));
    return {a0: s.a0, a1, n, src, tax, unpaid: avg(y => y.unpaid), short: avg(y => y.short), debt: avg(y => y.debt), net: avg(y => y.net), b0: balAt(s.a0), b1: balAt(a1 + 1)};
  });
}
const rtStageLabel = s => s.a1 >= 100 ? s.a0 + '세~' : s.a0 === s.a1 ? s.a0 + '세' : s.a0 + '~' + s.a1;

// 자산 흐름: 지금 → 은퇴 → 100세. 모으는 동안 초록, 꺼내 쓰는 동안 파랑. 누르면 그 나이 구성
function rtBalDraw(r, R){
  const el = $('#rtBal'); if (!el) return;
  const p = r.params, nowAge = p.baseYear - p.birthYear, rows = r.rows;
  const start = p.accounts.filter(a => a.kind !== '집').reduce((s, a) => s + a.balance, 0);
  const startG = (() => { const g = [0, 0, 0]; p.accounts.forEach(a => { const k = Retire.KIND[a.kind]; if (k === 'house' || !k) return; g[k === 'pension' ? 1 : k === 'isa' || k === 'cash' ? 2 : 0] += a.balance; }); return g; })();
  const tk = new Set([nowAge, R]); for (let a = Math.ceil((nowAge + 1) / 5) * 5; a <= 100; a += 5) tk.add(a);
  const ticks = [...tk].filter(a => a >= nowAge && a <= 100).sort((a, b) => a - b);
  const at = a => a === nowAge ? null : a === R && r.atRetire ? r.atRetire : rows.find(x => x.age === a - 1);
  const grp = a => { if (a === nowAge) return startG; const x = at(a); return x ? rtGroups(x.bal, x.infl) : [0, 0, 0]; };
  const val = a => grp(a).reduce((s, v) => s + v, 0);
  const max = Math.max(...ticks.map(val), 1);
  const sel = S.rtBar != null && ticks.includes(S.rtBar) ? S.rtBar : (ticks.includes(R) ? R : ticks[0]);
  const v = val(sel), F = r.atRetire ? val(R) : start;
  const head = sel === nowAge ? `지금 ${money(v)} 있어요` : sel < R ? `${sel}세에 ${money(v)} 모여요` : sel === R ? `은퇴할 때 ${money(v)} 모여요` : v > 0 ? `${sel}세에 ${money(v)} 남아요` : `${sel}세에는 남은 돈이 없어요`;
  const sub = sel <= R ? `지금 ${money(start)} → 은퇴할 때 ${money(F)}${p.annualSaving ? ` · 한 해 저축 ${money(p.annualSaving)}` : ''}` : `은퇴할 때 ${money(F)} · ${rtAgeText(r.lastAge)}까지 버텨요`;
  const g = grp(sel), tot = g.reduce((s, x) => s + x, 0);
  const parts = [['주식', g[0], 'var(--fixed)'], ['연금저축·IRP', g[1], 'var(--saving)'], ['ISA·현금', g[2], '#8E9196']];
  const ri = ticks.indexOf(R);
  el.innerHTML = `<div class="rt-bhead num ${v > 0 ? '' : 'bad'}">${head}</div><div class="rt-bsub">${sub}</div>
    <div class="rt-flowc">
      <div class="rt-bars">${ticks.map(a => { const w = val(a); return `<button data-a="${a}" aria-label="${a}세 ${money(w)}" class="${a === sel ? 'on' : ''} ${w > 0 ? '' : 'zero'} ${a < R ? 'pre' : ''}"><i style="height:${w > 0 ? Math.max(4, w / max * 118) : 3}px"></i></button>`; }).join('')}</div>
      ${ri >= 0 && R > nowAge ? `<span class="rt-rmark" style="left:${(ri + 0.5) / ticks.length * 100}%"><em>은퇴</em></span>` : ''}
    </div>
    <div class="rt-blab">${ticks.map(a => `<span class="${a === sel ? 'on' : ''}">${a === nowAge || a === R || a % 10 === 0 || ticks.length < 9 ? a : ''}</span>`).join('')}</div>
    <div class="rt-lgd2"><span><i style="background:var(--saving)"></i>모으는 동안</span><span><i style="background:var(--accent)"></i>꺼내 쓰는 동안</span></div>
    ${tot > 0 ? `<div class="rt-comp"><div class="rt-sublab">${sel === nowAge ? '지금' : sel + '세'} 자산 구성</div><div class="rt-stack">${parts.map(q => `<i style="width:${q[1] / tot * 100}%;background:${q[2]}"></i>`).join('')}</div>
      ${parts.filter(q => q[1] > 0).map(q => `<div class="rt-li"><span><i class="dot" style="background:${q[2]}"></i>${q[0]}</span><span><b class="num">${money(q[1])}</b> <em class="num">${Math.round(q[1] / tot * 100)}%</em></span></div>`).join('')}</div>` : ''}
    <p class="note">현재 물가 기준 · 부동산 자산 제외</p>`;
  el.querySelectorAll('.rt-bars button').forEach(b => b.onclick = () => { S.rtBar = +b.dataset.a; rtBalDraw(r, R); });
}
// 매달 꺼내 쓰는 곳: 시기마다 어디서 얼마씩 → 세금·건보료 빠짐 → 생활비로 쓰는 돈
const rtShort = v => v >= 1e8 ? (Math.round(v / 1e7) / 10) + '억' : Math.round(v / 1e4).toLocaleString() + '만';   // 좁은 칸용
const rtStageSay = (s, prev) => {
  if (!prev) { const main = Object.keys(RT_SRC).filter(k => s.src[k] >= 1e4).sort((a, b) => s.src[b] - s.src[a]).map(k => RT_SRC[k][0]);
    return (s.src.nps >= 1e4 ? '' : '국민연금 받기 전이에요. ') + '생활비는 ' + main.join(', ') + '에서 나와요(많은 순서).'; }
  const has = (x, k) => x.src[k] >= 1e4, ev = [];
  if (s.short >= 1e4 && !(prev.short >= 1e4)) ev.push('모아 둔 돈이 바닥나 생활비가 모자라요.');
  if (has(s, 'nps') && !has(prev, 'nps')) ev.push('국민연금이 더해져 다른 돈을 덜 꺼내요.');
  if (has(s, 'pen') && !has(prev, 'pen')) ev.push('연금저축·IRP를 꺼내기 시작해요.');
  if (!has(s, 'pen') && has(prev, 'pen')) ev.push('연금저축·IRP를 다 썼어요.');
  if (!has(s, 'cash') && has(prev, 'cash')) ev.push('현금·ISA를 다 써서 주식을 팔아 채워요.');
  if (!has(s, 'sell') && has(prev, 'sell')) ev.push('주식을 다 팔았어요.');
  return ev.join(' ') || '꺼내는 곳의 비중이 바뀌어요.';
};
function rtDivSummaryText(){
  const xs = rtItems().items.filter(x => RT_STOCK.includes(x.kind)); if (!xs.length) return '';
  const tot = xs.reduce((s, x) => s + x.val, 0), avg = xs.reduce((s, x) => s + x.val * (x.s.div ?? RT_DIV0[x.kind]), 0) / tot;
  return `주식은 배당 ${Math.round(avg * 10) / 10}% · 모자라면 팔아서`;
}
function rtMixDraw(r, R){
  const el = $('#rtMix'); if (!el) return;
  const st = rtStages(r, R); if (!st.length){ el.innerHTML = ''; return; }
  const si = Math.min(S.rtStage || 0, st.length - 1), s = st[si];
  const ks = Object.keys(RT_SRC).filter(k => s.src[k] >= 5000), gross = ks.reduce((a, k) => a + s.src[k], 0) || 1;
  const taxes = Object.entries(s.tax).filter(([, v]) => v >= 1000), tsum = taxes.reduce((a, t) => a + t[1], 0) - s.unpaid;
  let acc = 0; const grad = ks.map(k => { const a0 = acc / gross * 360; acc += s.src[k]; return `${RT_SRC[k][1]} ${a0}deg ${acc / gross * 360}deg`; }).join(',');
  const div = rtDivSummaryText();
  el.innerHTML = `<div class="rt-stages">${st.slice(0, 5).map((x, i) => `<button data-i="${i}" class="${i === si ? 'on' : ''}">${rtStageLabel(x)}</button>`).join('')}</div>
    <div class="rt-donut"><span class="ring" style="background:conic-gradient(${grad || 'var(--chip) 0deg 360deg'})"></span><span class="mid"><b class="num">${money(gross)}</b><small>한 달 꺼내는 돈</small></span>
      <div class="rt-dl rt-say">${rtStageSay(s, st[si - 1])}</div></div>
    <div style="margin-top:10px">${ks.map(k => `<div class="rt-li tall"><span><i class="dot" style="background:${RT_SRC[k][1]}"></i>${RT_SRC[k][0]}</span><b class="num">${money(s.src[k])}</b></div>`).join('')}
      <div class="rt-li tall"><span style="color:var(--sub)">세금·건보료 빠짐</span><b class="num bad">−${money(tsum)}</b></div>
      ${s.debt >= 1e4 ? `<div class="rt-li tall"><span style="color:var(--sub)">남은 빚 갚기</span><b class="num">−${money(s.debt)}</b></div>` : ''}
      <div class="rt-li sum"><span>생활비로 쓰는 돈</span><b class="num" style="color:var(--accent)">${money(s.net)}</b></div>
      ${s.short >= 1e4 ? `<div class="rt-li"><span>모자라는 돈</span><b class="num bad">${money(s.short)}</b></div>` : ''}</div>
    ${div ? `<button class="rt-divlink" id="rtDivEdit"><span>${div}</span><b>바꾸기 ›</b></button>` : ''}`;
  el.querySelectorAll('.rt-stages button').forEach(b => b.onclick = () => { S.rtStage = +b.dataset.i; rtMixDraw(r, R); });
  if ($('#rtDivEdit')) $('#rtDivEdit').onclick = () => rtSetup('div');
}

/* ───────── 첫 설정 (1/3 기본 정보, 2/3 계좌, 3/3 계산 가정) · 설정(한 화면) ───────── */
const rtIn = (id, val, unit, opt = {}) => `<label class="rt-in"><span>${opt.label}</span><span class="rt-iv"><input id="${id}" inputmode="${opt.dec ? 'decimal' : 'numeric'}" value="${val ?? ''}" placeholder="${opt.ph ?? ''}">${unit ? `<em>${unit}</em>` : ''}</span></label>`;
function rtPersonHtml(who){
  const P = RT[who], n = P.nps, me = who === 'me', id = s => `rt_${who}_${s}`;
  const open = S.rtOpen === who;
  return `<section class="card rt-form">
    ${RT.couple ? `<h3>${me ? '나' : '배우자'}</h3>` : ''}
    ${rtIn(id('by'), P.birthYear, '년', {label: '태어난 해', ph: '1985'})}
    ${me ? rtIn(id('ra'), P.retireAge, '세', {label: RT.couple ? '은퇴 나이 (함께 은퇴)' : '은퇴 나이'}) + rtIn(id('sal'), P.salary, '만원', {label: '세전 연봉', ph: '은퇴 전 소득'}) : ''}
    <button class="rt-exp ${open ? 'open' : ''}" data-who="${who}"><span>국민연금</span><em>${n.mode === 'auto' ? '자동 계산 <b class="rt-tag">추정</b>' : n.monthly != null ? `월 ${n.monthly}만원` : '입력하기'}</em><i>⌄</i></button>
    ${open ? `<div class="rt-sub">
      <div class="seg" id="${id('npsm')}"><button data-v="direct">직접 입력</button><button data-v="auto">자동 계산</button></div>
      ${n.mode === 'auto' ? rtIn(id('ny'), n.years, '년', {label: '낸 기간 (은퇴까지)'}) + rtIn(id('ni'), n.income, '만원', {label: '월 소득 (세전)'})
        : rtIn(id('nm'), n.monthly, '만원', {label: '한 달 예상액', ph: '국민연금공단 예상액'})}
      ${rtIn(id('ns'), n.startAge, '세', {label: '받기 시작하는 나이', ph: P.birthYear ? String(Retire.npsClaimAge(P.birthYear)) : '65'})}
      <p class="note">${n.mode === 'auto' ? '공단 공식으로 추정해요. 정확한 금액은 국민연금공단 「내 연금 알아보기」에서 볼 수 있어요.' : '현재 물가 기준 금액이에요. 국민연금공단 「내 연금 알아보기」에서 볼 수 있어요.'}</p></div>` : ''}
  </section>`;
}
function rtBasicHtml(){
  return `<div class="seg rt-gap" id="rtCouple"><button data-v="1">혼자</button><button data-v="2">부부</button></div>
    ${rtPersonHtml('me')}${RT.couple ? rtPersonHtml('sp') : ''}
    <section class="card rt-form">
      ${rtIn('rt_spend', RT.spend, '만원', {label: '은퇴 후 한 달 생활비'})}
      ${rtIn('rt_plan', RT.planAge, '세', {label: '몇 살까지 계획할까요'})}
      ${rtIn('rt_house', RT.housePublic, '만원', {label: '집 가격 (공시가격)', ph: '없으면 비워 두세요'})}
      <div class="rt-in"><span>사는 곳</span></div>
      <div class="seg" id="rtRegion"><button data-v="대도시">대도시</button><button data-v="중소도시">중소도시</button><button data-v="농어촌">농어촌</button></div>
      <p class="note">생활비는 현재 물가 기준이에요. 가계부 지출 평균으로 채워 두었어요. 집 가격은 건강보험료와 기초연금, 연봉은 연금저축·IRP 세액공제 계산에 써요.</p>
    </section>`;
}
function rtBasicBind(redraw){
  seg('#rtCouple', RT.couple ? '2' : '1', v => { RT.couple = v === '2'; rtSave(); redraw(); });
  seg('#rtRegion', RT.region, v => { RT.region = v; rtSave(); redraw(); });
  const num = (sel, set) => { const el = $(sel); if (el) el.onchange = () => { set(rtNum(el.value)); rtSave(); }; };
  for (const who of ['me', 'sp']){
    const P = RT[who], id = s => `#rt_${who}_${s}`;
    num(id('by'), v => P.birthYear = v && v >= 1930 && v <= rtNowYear() - 15 ? Math.round(v) : null);
    num(id('ra'), v => P.retireAge = v ? Math.min(80, Math.max(30, Math.round(v))) : 55);
    num(id('sal'), v => P.salary = v != null ? Math.max(0, v) : null);
    { const el = $(id('nm')); if (el) el.onchange = () => { const v = rtNum(el.value); P.nps.monthly = v != null ? Math.max(0, v) : null; rtSave(); redraw(); }; }   // 위 줄 금액 표시도 바꿔요
    num(id('ny'), v => P.nps.years = v != null ? Math.min(45, Math.max(0, Math.round(v))) : 0);
    num(id('ni'), v => P.nps.income = v != null ? Math.max(0, v) : 0);
    num(id('ns'), v => P.nps.startAge = v ? Math.min(70, Math.max(60, Math.round(v))) : null);
    if ($(id('npsm'))) seg(id('npsm'), P.nps.mode, v => { P.nps.mode = v; rtSave(); redraw(); });
  }
  document.querySelectorAll('.rt-exp').forEach(b => b.onclick = () => { S.rtOpen = S.rtOpen === b.dataset.who ? null : b.dataset.who; redraw(); });
  num('#rt_spend', v => RT.spend = v != null ? Math.max(0, v) : RT.spend);
  num('#rt_plan', v => RT.planAge = v ? Math.min(100, Math.max(70, Math.round(v))) : 95);
  num('#rt_house', v => RT.housePublic = v != null ? Math.max(0, v) : null);
}
function rtAccHtml(){
  const {items, debt, repay} = rtItems();
  const chip = (on, t, d) => `<button class="rt-chip ${on ? 'on' : ''}" ${d}>${t}</button>`;
  return `<section class="card rt-form rt-acc">
    ${items.map((x, i) => { const open = S.rtAcc === x.key, k = x.kind;
      return `<button class="rt-arow" data-i="${i}"><span class="n">${esc(x.a.small)}<small>${esc(x.a.mid)} · ${money(x.val)}</small></span>
        <span class="k ${x.guessed ? 'rt-need' : ''}">${x.guessed ? '확인 필요' : esc(k)}</span>${RT.couple ? `<span class="o">${esc(x.s.owner || '나')}</span>` : ''}<i class="${open ? 'open' : ''}">⌄</i></button>
      ${open ? `<div class="rt-sub">
        <div class="rt-sublab">종류</div><div class="rt-chipw">${RT_KINDS.map(t => chip(t === k && !x.guessed, t, `data-kind="${t}"`)).join('')}</div>
        ${RT.couple ? `<div class="rt-sublab">명의</div><div class="rt-chipw">${['나', '배우자', '공동'].map(t => chip(t === (x.s.owner || '나'), t, `data-owner="${t}"`)).join('')}</div>` : ''}
        ${k === '해외주식' || k === '국내상장 해외ETF' || k === 'ISA' ? rtIn('rt_prin', x.s.principal, '만원', {label: '넣은 원금', ph: '모르면 비워 두세요'}) + '<p class="note">팔 때 이익이 얼마인지 계산하는 데 써요</p>' : ''}
      </div>` : ''}`; }).join('')}
    ${debt > 0 ? `<div class="rt-li rt-debt"><span>부채</span><span class="num">${money(debt)}${repay > 0 ? ` · 한 해 ${money(repay)}씩 줄어요` : ''}</span></div>` : ''}
  </section>
  <p class="note" style="margin:0 6px 12px">자산 탭 ${items.length ? '가장 최근 달' : ''} 잔액이에요. 줄을 누르면 종류를 바꿀 수 있어요. 차·물건처럼 꺼내 쓰지 않는 것은 '빼기'를 고르세요.</p>`;
}
function rtAccBind(redraw){
  const {items} = rtItems();
  const st = x => (RT.acc[x.key] = RT.acc[x.key] || {});
  document.querySelectorAll('.rt-arow').forEach(b => b.onclick = () => { const x = items[+b.dataset.i]; S.rtAcc = S.rtAcc === x.key ? null : x.key; redraw(); });
  const x = items.find(y => y.key === S.rtAcc); if (!x) return;
  document.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { st(x).kind = b.dataset.kind; rtSave(); redraw(); });
  document.querySelectorAll('[data-owner]').forEach(b => b.onclick = () => { st(x).owner = b.dataset.owner; rtSave(); redraw(); });
  const p = $('#rt_prin'); if (p) p.onchange = () => { const v = rtNum(p.value); st(x).principal = v != null ? Math.max(0, v) : undefined; rtSave(); };
}
function rtAssumeHtml(){
  const A = RT.assume, kinds = ['해외주식', '국내주식', '국내상장 해외ETF', '연금저축', 'IRP', 'ISA', '현금'];
  const used = new Set(rtItems().items.map(x => x.kind));
  return rtDivHtml() + `<section class="card rt-form">
    ${rtIn('rt_infl', A.inflation, '%', {label: '물가 (한 해)', dec: true})}
    ${rtIn('rt_ret', A.returnRate, '%', {label: '수익률 (한 해)', dec: true})}
    ${rtIn('rt_sav', RT.saving, '만원', {label: '은퇴 전 한 해 저축'})}
    <p class="note">수익률은 목표 탭 계획 수익률, 저축은 가계부 저축 평균으로 채워 두었어요.</p>
  </section>
  <section class="card rt-form">
    <div class="rt-in"><span>계좌별 수익률</span></div>
    <div class="seg" id="rtPer"><button data-v="one">하나로</button><button data-v="per">계좌별</button></div>
    ${A.perAccount ? kinds.filter(k => used.has(k)).map(k => rtIn('rt_r_' + k, A.rates[k] ?? (k === '현금' ? 2 : A.returnRate), '%', {label: k, dec: true})).join('') : ''}
    <div class="rt-in" style="margin-top:10px"><span>저축 늘어남</span></div>
    <div class="seg" id="rtSavM"><button data-v="infl">물가만큼</button><button data-v="direct">직접</button></div>
    ${A.savingMode === 'direct' ? rtIn('rt_sg', A.savingGrowth, '%', {label: '한 해', dec: true}) : ''}
    <div class="rt-in" style="margin-top:10px"><span>집값 오름</span></div>
    <div class="seg" id="rtHouM"><button data-v="infl">물가만큼</button><button data-v="direct">직접</button></div>
    ${A.houseMode === 'direct' ? rtIn('rt_hg', A.houseGrowth, '%', {label: '한 해', dec: true}) : ''}
  </section>`;
}
function rtAssumeBind(redraw){
  rtDivBind(redraw);
  const A = RT.assume, num = (sel, set) => { const el = $(sel); if (el) el.onchange = () => { set(rtNum(el.value)); rtSave(); }; };
  const pct = (v, lo, hi, d) => v == null ? d : Math.min(hi, Math.max(lo, v));
  num('#rt_infl', v => A.inflation = pct(v, 0, 10, 2));
  num('#rt_ret', v => A.returnRate = pct(v, -5, 20, 6));
  num('#rt_sav', v => RT.saving = v != null ? Math.max(0, v) : 0);
  num('#rt_sg', v => A.savingGrowth = pct(v, -10, 20, 2));
  num('#rt_hg', v => A.houseGrowth = pct(v, -10, 20, 2));
  document.querySelectorAll('[id^="rt_r_"]').forEach(el => el.onchange = () => { const v = rtNum(el.value); A.rates[el.id.slice(5)] = v == null ? undefined : Math.min(20, Math.max(-5, v)); rtSave(); });
  seg('#rtPer', A.perAccount ? 'per' : 'one', v => { A.perAccount = v === 'per'; rtSave(); redraw(); });
  seg('#rtSavM', A.savingMode, v => { A.savingMode = v; rtSave(); redraw(); });
  seg('#rtHouM', A.houseMode, v => { A.houseMode = v; rtSave(); redraw(); });
}
// 은퇴 후 주식에서 생활비 꺼내기: 주식 계좌마다 배당 위주 / 팔아서 쓰기 / 직접
const RT_DIVOPT = [{t: '팔아서 쓰기 위주', d: '배당이 적은 주식 · 배당률 0.6% (예: QQQ)', v: 0.6}, {t: '배당 받으며 쓰기', d: '배당이 많은 주식 · 배당률 3.5% (예: SCHD)', v: 3.5}, {t: '직접 입력', d: '갖고 있는 주식의 배당률을 넣어요', v: null}];
function rtDivHtml(){
  const xs = rtItems().items.filter(x => RT_STOCK.includes(x.kind));
  if (!xs.length) return '';
  const pick = x => { const d = x.s.div ?? RT_DIV0[x.kind]; return x.s.divMode ?? (d === 0.6 ? 0 : d === 3.5 ? 1 : 2); };
  let est = '';
  try {
    const r = rtSim(RT.me.retireAge), ar = r.atRetire;
    if (ar) { const tot = xs.reduce((s, x) => s + x.val, 0), avg = xs.reduce((s, x) => s + x.val * (x.s.div ?? RT_DIV0[x.kind]), 0) / tot / 100;
      const stock = (ar.bal.foreign + ar.bal.domestic + ar.bal.kretf) / ar.infl, div = stock * avg, need = RT.spend * 1e4 * 12;
      est = `<div class="rt-divsum"><b>은퇴할 때 기준</b><br>한 해 배당 약 <b style="color:var(--accent)">${money(div)}</b><br>생활비 ${money(need)} 중 나머지는 연금·현금과 주식을 팔아서 써요
        <div class="${div > 1e7 ? 'warn' : 'sub'}">${div > 1e7 ? '배당이 한 해 1,000만원을 넘어요. 넘으면 배당 전부가 건강보험료 계산에 들어가요. 팔아서 남긴 이익은 들어가지 않아요.' : '배당이 한 해 1,000만원 아래라 건강보험료에는 들어가지 않아요.'}</div></div>`; }
  } catch (e) {}
  return `<section class="card rt-form"><h3>은퇴 후 주식에서 생활비 꺼내기</h3>
    <p class="note" style="margin:2px 0 6px">배당을 먼저 쓰고, 모자라는 만큼 주식을 팔아서 써요. 계좌마다 어떤 주식인지 골라 주세요.</p>
    ${xs.map(x => { const open = S.rtDivOpen === x.key, k = pick(x), d = x.s.div ?? RT_DIV0[x.kind];
      return `<button class="rt-arow" data-dk="${esc(x.key)}"><span class="n">${esc(x.a.small)}<small>${esc(x.kind)} · ${money(x.val)}</small></span><span class="k">${d}%</span><i class="${open ? 'open' : ''}">⌄</i></button>
      ${open ? `<div class="rt-sub">${RT_DIVOPT.map((o, i) => `<button class="rt-opt ${i === k ? 'on' : ''}" data-dopt="${i}"><b>${o.t}</b><small>${o.d}</small></button>`).join('')}
        ${k === 2 ? rtIn('rt_div', d, '%', {label: '배당률', dec: true}) : ''}</div>` : ''}`; }).join('')}
    ${est}
  </section>`;
}
function rtDivBind(redraw){
  const xs = rtItems().items.filter(x => RT_STOCK.includes(x.kind));
  document.querySelectorAll('[data-dk]').forEach(b => b.onclick = () => { const k = b.dataset.dk; S.rtDivOpen = S.rtDivOpen === k ? null : k; redraw(); });
  const x = xs.find(y => y.key === S.rtDivOpen); if (!x) return;
  const st = (RT.acc[x.key] = RT.acc[x.key] || {});
  document.querySelectorAll('[data-dopt]').forEach(b => b.onclick = () => { const i = +b.dataset.dopt; st.divMode = i; if (RT_DIVOPT[i].v != null) st.div = RT_DIVOPT[i].v; rtSave(); redraw(); });
  const d = $('#rt_div'); if (d) d.onchange = () => { const v = rtNum(d.value); st.div = v != null ? Math.min(15, Math.max(0, v)) : undefined; rtSave(); redraw(); };
}
// step: 1·2·3 = 첫 설정 단계, 'all' = 결과 화면의 '설정'(한 화면), 'div' = 주식에서 꺼내는 방법만
function rtSetup(step){
  const all = step === 'all', only = step === 'div';
  const titles = {1: '기본 정보', 2: '계좌', 3: '계산 가정'};
  const body = all ? `<h4 class="rt-h">기본 정보</h4>${rtBasicHtml()}<h4 class="rt-h">계좌</h4>${rtAccHtml()}<h4 class="rt-h">계산 가정</h4>${rtAssumeHtml()}`
    : only ? rtDivHtml() : step === 1 ? rtBasicHtml() : step === 2 ? rtAccHtml() : rtAssumeHtml();
  const y = $('#ed').classList.contains('on') ? $('#ed').scrollTop : 0;
  openEd(`<h4>${only ? '주식에서 생활비 꺼내기' : `은퇴 설계${all ? ' 설정' : ` <span class="rt-step">${step}/3 ${titles[step]}</span>`}`}</h4>
    ${step === 1 && !all ? '<p class="rt-p" style="margin:0 6px 12px">은퇴할 때 필요한 정보를 세 단계로 받아요. 이 기기에만 저장돼요.</p>' : ''}
    ${body}
    <button class="btn" id="rtNext">${all || only ? '저장하고 다시 계산하기' : step < 3 ? '다음' : '완료'}</button>
    ${!all && !only && step > 1 ? '<button class="btn ghost" id="rtPrev">이전</button>' : ''}`, {tall: true});
  $('#ed').scrollTop = y;
  const redraw = () => rtSetup(step);
  if (all || step === 1) rtBasicBind(redraw);
  if (all || step === 2) rtAccBind(redraw);
  if (all || step === 3) rtAssumeBind(redraw);
  if (only) rtDivBind(redraw);
  if ($('#rtPrev')) $('#rtPrev').onclick = () => { edDir = 'back'; rtSetup(step - 1); };
  $('#rtNext').onclick = () => {
    document.activeElement?.blur?.();   // 입력 중이던 칸의 값을 먼저 저장
    if ((all || step === 1) && !RT.me.birthYear) return toast('태어난 해를 입력해 주세요');
    if ((all || step === 1) && RT.couple && !RT.sp.birthYear) return toast('배우자 태어난 해를 입력해 주세요');
    if (!all && !only && step < 3) return rtSetup(step + 1);
    if (only) { rtSave(); closeEd(); render(); return; }
    RT.done = true; RT.opt = null; S.rtAge = null; S.rtBar = null; S.rtStage = 0; rtSave(); closeEd(); S.gview = 'retire'; LS.set('gview', 'retire'); render();
  };
}

/* ───────── 계산 내역 ───────── */
function rtDetail(R){
  const r = rtSim(R), ar = r.atRetire, p = r.params;
  const rows = r.rows.filter(x => x.phase === 'retire');
  const ages = [...new Set([R, 60, 65, 70, 80, 90].filter(a => a >= R && a <= 100))].slice(0, 6);
  const sel = ages.includes(S.rtDage) ? S.rtDage : ages.find(a => a >= p.npsStart) ?? ages[0];
  const x = rows.find(y => y.age === sel), m = v => v / 12 / x.infl;
  const liq = ar ? Object.values(ar.bal).reduce((s, v) => s + v, 0) / ar.infl : 0;
  const b = ar ? ar.bal : {}, f = v => (v || 0) / ar.infl;
  const line = (n, sub, v, cls = '') => v > 0.5 ? `<div class="rt-li tall"><span>${n}${sub ? `<small>${sub}</small>` : ''}</span><b class="num ${cls}">${money(v)}</b></div>` : '';
  const t = x.tax, inSum = m(x.publicPension + x.basicPension + x.take.pensionIn + x.take.pensionOut + x.take.foreign + x.take.kretf + x.take.domestic + x.take.isa + x.take.cash + x.dividend + x.interest);
  const outSum = m(x.taxTotal);
  openEd(`<h4>계산 내역</h4>
    <section class="card"><div class="rt-tl">은퇴할 때 자산 · ${ar?.age ?? R}세 · 현재 물가 기준</div><div class="rt-tv big num" style="color:var(--accent)">${money(liq + (ar ? ar.housePrice / ar.infl : 0))}</div>
      ${line('해외주식·국내주식', '', f(b.foreign + b.domestic + b.kretf))}${line('연금저축·IRP', '', f(b.pension))}${line('ISA·현금', '', f(b.isa + b.cash))}
      ${line('집', '꺼내 쓰지 않음', ar ? ar.housePrice / ar.infl : 0)}${ar?.debtLeft > 0 ? line('남은 빚', '은퇴할 때 갚지 못한 빚', ar.debtLeft / ar.infl, 'bad') : ''}</section>
    <div class="rt-sublab" style="margin:4px 6px 8px">나이별 한 달 · 현재 물가 기준</div>
    <div class="rt-chips" id="rtDages" style="margin-bottom:12px">${ages.map(a => `<button data-a="${a}" class="${a === sel ? 'on' : ''}">${a}세</button>`).join('')}</div>
    <section class="card"><h3>들어오는 돈 <small>한 달</small></h3>
      ${line('국민연금', `${p.npsStart}세부터 · 물가만큼 올라요`, m(x.publicPension))}${line('기초연금', '추정', m(x.basicPension))}
      ${line('연금저축·IRP', x.take.pensionOut > 0 ? '한도를 넘은 돈은 16.5%' : '연금으로 받음', m(x.take.pensionIn + x.take.pensionOut))}
      ${line('주식·ETF 판 돈', '', m(x.take.foreign + x.take.kretf + x.take.domestic))}${line('배당·이자', '', m(x.dividend + x.interest))}${line('ISA·현금에서', '', m(x.take.isa + x.take.cash))}
      <div class="rt-li sum"><span>합계</span><b class="num">${money(inSum)}</b></div></section>
    <section class="card"><h3>나가는 돈 <small>한 달</small></h3>
      ${line('연금계좌 세금', x.pensionMethod.includes('분리과세') ? '1,500만원 넘어 16.5% 분리과세' : x.pensionMethod.includes('종합과세') ? '1,500만원 넘어 종합과세가 유리' : '나이에 따라 3.3~5.5%', m(t.pensionAcct))}
      ${line('소득세 (국민연금·금융소득)', '', m(t.income))}${line('해외 배당 세금', '미국에서 15%', m(t.foreignDivTax))}
      ${line('해외주식 양도세', '이익에서 250만원 빼고 22%', m(t.stock))}${line('ISA 세금', '', m(t.isa))}
      ${line('건강보험료', x.finOver ? '금융소득 1,000만원 넘어 소득에 포함 · 장기요양 포함' : '국민연금 절반 + 집 공시가격 · 장기요양 포함', m(t.health))}${line('집 보유세', '재산세·종부세', m(t.house))}
      <div class="rt-li sum"><span>합계</span><b class="num bad">${money(outSum)}</b></div></section>
    <section class="card"><div class="rt-li"><b>생활비로 쓰는 돈</b><b class="num" style="color:var(--accent);font-size:20px">${money(m(Math.max(0, x.need - x.short - (x.debtRepay || 0))))}</b></div>
      ${x.debtRepay > 0 ? `<div class="rt-li"><span>남은 빚 갚기</span><b class="num">${money(m(x.debtRepay))}</b></div>` : ''}
      ${x.short > 0 ? `<div class="rt-li"><span>모자라는 돈</span><b class="num bad">${money(m(x.short))}</b></div>` : ''}</section>
    <section class="card"><h3>계산 가정 <button class="rt-link" id="rtDset">설정</button></h3>
      <div class="rt-li"><span>수익률</span><b>연 ${RT.assume.returnRate}%${RT.assume.perAccount ? ' (계좌별)' : ''}</b></div><div class="rt-li"><span>물가</span><b>연 ${RT.assume.inflation}%</b></div>
      <div class="rt-li"><span>세법</span><b>${Retire.BASE_YEAR}년 기준</b></div><div class="rt-li"><span>계획 나이</span><b>${RT.planAge}세</b></div>
      <ul class="slines">${Retire.ASSUMPTIONS.map(s => `<li>· ${s}</li>`).join('')}</ul></section>
    <p class="note" style="margin:0 6px">추정치예요. 세무·투자 상담이 아니에요.</p>`, {tall: true});
  document.querySelectorAll('#rtDages button').forEach(bt => bt.onclick = () => { S.rtDage = +bt.dataset.a; const y = $('#ed').scrollTop; rtDetail(R); $('#ed').scrollTop = y; });
  $('#rtDset').onclick = () => rtSetup('all');
}

/* ───────── 은퇴 계산 레포트 (결과 화면 맨 위 버튼) ───────── */
// 시기가 바뀌는 이유(무엇이 바뀌었는지 보고 골라요)
function rtWhy(s, prev, p){
  const has = (x, k) => x.src[k] >= 1e4;
  if (!prev) return has(s, 'pen')
    ? '연금저축·IRP는 55세부터 한 해 1,500만원 안에서 꺼내면 세금이 3.3~5.5%로 낮아서 먼저 함께 써요. 모자라는 돈은 거의 불어나지 않는 현금·ISA부터 쓰고, 그다음 주식을 팔아요. 주식은 판 돈 전체가 아니라 이익에만, 한 해 250만원을 넘는 부분에 세금이 붙어요.'
    : s.a0 < 55 ? '55세 전에는 연금저축·IRP를 연금으로 받을 수 없어요(해지하면 16.5%). 그래서 거의 불어나지 않는 현금·ISA부터 쓰고, 모자라면 주식을 팔아요.'
    : '거의 불어나지 않는 현금·ISA부터 쓰고, 모자라면 주식을 팔아요. 주식은 판 돈 전체가 아니라 이익에만 세금이 붙어요.';
  if (s.short >= 1e4 && !(prev.short >= 1e4)) return '꺼내 쓸 돈을 다 써서 생활비가 모자라요. 계획 개선하기에서 이 나이를 늦추는 방법을 볼 수 있어요.';
  if (has(s, 'nps') && !has(prev, 'nps')) return `국민연금은 태어난 해에 따라 받는 나이가 정해져 있어요. ${p.npsStart}세부터 들어오는 만큼 다른 돈을 덜 꺼내고, 남은 돈은 그만큼 더 오래 불어나요. 대신 국민연금의 절반이 건강보험료 계산에 들어가 건보료가 올라가요.`;
  if (has(s, 'pen') && !has(prev, 'pen')) return s.a0 <= 56 ? '55세가 되어 연금저축·IRP를 연금으로 받을 수 있게 됐어요. 한 해 1,500만원 안에서 꺼내면 세금이 5.5%로 낮아요.' : '다른 돈을 다 써서 연금저축·IRP를 꺼내기 시작해요.';
  if (!has(s, 'pen') && has(prev, 'pen')) return '연금저축·IRP를 다 꺼내 썼어요. 그 자리를 주식을 더 팔아 채우니 세금이 늘 수 있어요.';
  if (!has(s, 'cash') && has(prev, 'cash')) return '현금과 ISA를 다 써서 이제 주식을 팔아 채워요. 판 돈 전체가 아니라 이익에만 세금이 붙어요. 오래 갖고 있던 주식일수록 이익 비중이 커서 세금도 늘어요.';
  if (!has(s, 'sell') && has(prev, 'sell')) return '주식을 다 팔았어요. 남은 연금계좌와 국민연금으로 지내요. 연금계좌에서 한 해 1,500만원을 넘게 꺼내면 그해에는 꺼낸 돈 전체에 세금이 붙어요.';
  return '꺼내는 곳의 비중이 바뀌어요.';
}
function rtStageTag(s, prev, p){
  const has = (x, k) => x.src[k] >= 1e4;
  if (!prev) return s.a0 < p.npsStart ? '국민연금 받기 전' : '';
  if (s.short >= 1e4 && !(prev.short >= 1e4)) return '모아 둔 돈 다 씀';
  if (has(s, 'nps') && !has(prev, 'nps')) return '국민연금 시작';
  if (has(s, 'pen') && !has(prev, 'pen')) return '연금계좌 시작';
  if (!has(s, 'pen') && has(prev, 'pen')) return '연금계좌 다 씀';
  if (!has(s, 'cash') && has(prev, 'cash')) return '현금·ISA 다 씀';
  if (!has(s, 'sell') && has(prev, 'sell')) return '주식 다 팖';
  return '';
}
function rtPlanReport(R){
  const r = rtSim(R), p = r.params, st = rtStages(r, R), M = rtMonthly(R), nowAge = p.baseYear - p.birthYear;
  const start = p.accounts.filter(a => a.kind !== '집').reduce((x, a) => x + a.balance, 0);
  const ar = r.atRetire, atL = ar ? rtLiq(ar.bal) / ar.infl : 0, house = ar ? ar.housePrice / ar.infl : 0;
  const realRet = Math.round((p.returnRate - p.inflation) * 1000) / 10;
  // 1. 모으기
  const work = r.rows.filter(x => x.phase === 'work');
  let put = start; const grow = [{put, bal: start}];
  work.forEach(x => { put += (x.saved + x.refund) / x.infl; grow.push({put, bal: rtLiq(x.bal) / x.infl}); });
  const savedReal = work.reduce((x, y) => x + y.saved / y.infl, 0), gmax = Math.max(...grow.map(g => g.bal), 1);
  // 2. 시기별 돈의 흐름(스크롤로 움직임): 막대 높이 비율은 레포트 전체에서 같게
  const gr = k => k === 2 ? 0 : (p.returnRate - p.inflation);   // ISA·현금은 거의 안 불어나게 그림
  const flows = st.map(s => { const take = [(s.src.sell + s.src.div) * 12, s.src.pen * 12, s.src.cash * 12];
    return {g: s.b0.map((b, k) => Math.max(0, b * gr(k))), take, nps: s.src.nps * 12, tax: (Object.values(s.tax).reduce((a, b) => a + b, 0) - s.unpaid) * 12, net: s.net * 12, b0: s.b0}; });
  const maxGross = Math.max(...flows.map(f => f.take.reduce((a, b) => a + b, 0) + f.nps), 1);
  const K = 150 / maxGross;
  const flowHtml = (f, i) => {
    const X = [0, 58, 116], W = 48, LX = 204, LW = 64, FLOOR = 232, BASE = 80;
    let stack = f.nps * K; const chunks = [];
    const cols = [0, 1, 2].map(k => { const g = f.g[k] * K, h = f.take[k] * K, has = f.b0[k] > 0;
      const top = FLOOR - BASE - g;
      if (h >= 1) { const endTop = FLOOR - stack - h; chunks.push(`<i class="rt-fchunk c${k}" data-h="${h}" data-x0="${X[k]}" data-y0="${top}" data-x1="${LX + (LW - W) / 2}" data-y1="${endTop}" style="left:${X[k]}px;top:${top}px;width:${W}px;height:${h}px"></i>`); stack += h; }
      return `<div class="rt-fcol" style="left:${X[k]}px;width:${W}px;height:${FLOOR}px"><i class="rt-fbar c${k} ${has ? '' : 'none'}" data-base="${has ? BASE : 4}" data-g="${g}" data-cut="${Math.min(h, BASE + g - 4)}" style="height:${has ? BASE : 4}px"><em>≈</em></i></div>
        <div class="rt-flab" style="left:${X[k] - 8}px;width:${W + 16}px;top:${FLOOR + 6}px"><b>${['주식', '연금계좌', 'ISA·현금'][k]}</b><span>${has ? rtShort(f.b0[k]) : '없음'}</span><em class="${has && f.g[k] > 0 ? 'up' : ''}">${has ? (f.g[k] >= 1e4 ? '+' + rtShort(f.g[k]) : '그대로') : ''}</em></div>`; }).join('');
    const gross = stack, taxH = Math.min(gross, f.tax * K);
    if (chunks.length) chunks[chunks.length - 1] = chunks[chunks.length - 1].replace('class="rt-fchunk', `data-cut="${Math.min(taxH, +chunks[chunks.length - 1].match(/data-h="([\d.]+)"/)[1])}" class="rt-fchunk`);
    return `<div class="rt-flw" data-i="${i}">
      <div class="rt-fcap"><span data-ph="0">한 해 동안 수익률 ${realRet}%(물가 뺀 값)로<br><b class="up">계좌마다 조금씩 불어나요</b></span><span data-ph="1">생활비로 쓸 만큼<br><b class="cut">떼어서 생활비로 모아요</b></span><span data-ph="2">모은 돈에서<br><b class="bad">세금·건강보험료가 빠져요</b></span><span data-ph="3">남은 돈이 생활비예요<br><b class="net">한 해 ${money(f.net)} · 매달 ${money(f.net / 12)}</b></span></div>
      <div class="rt-fstage">${cols}${chunks.join('')}
        ${f.nps * K >= 1 ? `<i class="rt-fnps" style="left:${LX + (LW - W) / 2}px;top:${FLOOR - f.nps * K}px;width:${W}px;height:${f.nps * K}px"></i>` : ''}
        <i class="rt-fliv" data-floor="${FLOOR}" data-gross="${gross}" data-tax="${taxH}" style="left:${LX}px;top:${FLOOR - gross - 4}px;width:${LW}px;height:${gross + 4}px"></i>
        <i class="rt-ftax" data-dy="${gross + 76 - taxH}" style="left:${LX + (LW - W) / 2}px;top:${FLOOR - gross}px;width:${W}px;height:${taxH}px"></i>
        <div class="rt-flab" style="left:${LX - 8}px;width:${LW + 16}px;top:${FLOOR + 6}px"><b>생활비</b><span>한 해</span></div>
        <div class="rt-ftray" style="left:${LX - 8}px;width:${LW + 16}px;top:${FLOOR + 80}px">세금·건보료<br><b>${rtShort(f.tax)}</b></div>
        <span class="rt-farrow" style="left:${LX - 34}px">→</span>
      </div></div>`;
  };
  const stageHtml = st.map((s, i) => {
    const pv = st[i - 1], f = flows[i], tag = rtStageTag(s, pv, p);
    const ks = Object.keys(RT_SRC).filter(k => s.src[k] >= 5000), gross = ks.reduce((a, k) => a + s.src[k], 0) || 1;
    const taxes = Object.entries(s.tax).filter(([, v]) => v >= 5000);
    const t0 = s.b0.reduce((a, b) => a + b, 0), t1 = s.b1.reduce((a, b) => a + b, 0), d = t1 - t0, yrs = s.a1 - s.a0 + 1;
    const penUp = s.b1[1] > s.b0[1] + 1e5, hasPen = s.src.pen >= 1e4;
    const asay = (t0 <= 0 ? '꺼내 쓸 자산이 남아 있지 않아요.' : d < 0 ? `${yrs}년 동안 ${money(-d)} 줄어요. 한 해 평균 ${money(-d / yrs)}씩이에요.` : `${yrs}년 동안 ${money(d)} 늘어요. 불어나는 몫이 꺼내 쓰는 돈보다 많아서예요.`)
      + (t1 <= 0 && t0 > 0 ? ' 이 시기 끝에 바닥나요.' : '') + (penUp && !hasPen ? ' 연금저축·IRP는 꺼내지 않아 계속 불어나요.' : penUp && d < 0 ? ' 연금저축·IRP는 꺼내는 돈보다 불어나는 몫이 커서 늘어요.' : '');
    return `${pv ? `<div class="rt-rchg">${s.a0}세부터 바뀌어요${tag ? ' · ' + tag : ''}</div>` : ''}
      <section class="rt-rc"><div class="rt-mt"><b style="font-size:20px">${s.a1 >= 100 ? s.a0 + '세부터' : s.a0 + '~' + s.a1 + '세'}</b><span style="color:var(--sub);font-weight:600">${tag}</span></div>
        <div class="rt-body"><p>${rtStageSay(s, pv)}</p></div>
        <div class="rt-why"><b>${pv ? '이렇게 바뀌는 이유' : '이렇게 쓰는 이유'}</b><br>${rtWhy(s, pv, p)}</div>
        ${flowHtml(f, i)}
        <div class="rt-stack big">${ks.map(k => `<i style="width:${s.src[k] / gross * 100}%;background:${RT_SRC[k][1]}"></i>`).join('')}</div>
        ${ks.map(k => `<div class="rt-li tall"><span><i class="dot" style="background:${RT_SRC[k][1]}"></i>${RT_SRC[k][0]}</span><b class="num">${money(s.src[k])}</b></div>`).join('')}
        <div class="rt-li sum"><span>꺼내는 돈 합계 <small>한 달</small></span><b class="num">${money(gross)}</b></div>
        ${taxes.map(([k, v]) => `<div class="rt-li rt-tx"><span>− ${RT_TAXN[k]}</span><b class="num bad">−${money(v)}</b></div>`).join('')}
        ${s.debt >= 1e4 ? `<div class="rt-li rt-tx"><span>− 남은 빚 갚기</span><b class="num">−${money(s.debt)}</b></div>` : ''}
        <div class="rt-netbox ${s.short >= 1e4 ? 'short' : ''}"><b>손에 남는 돈</b><b class="num">${money(s.net)}</b></div>
        ${s.short >= 1e4 ? `<div class="rt-pill red"><span><b>모자라는 돈</b></span><span class="num">한 달 ${money(s.short)}</span></div>` : ''}
        <div class="rt-assets"><div class="rt-sublab">남은 자산</div>
          <div class="rt-amove"><span>${money(t0)}</span><i>→</i><b class="${t1 <= 0 ? 'bad' : d >= 0 ? 'good' : ''}">${money(t1)}</b></div>
          <p>${asay}</p>
          ${['주식', '연금저축·IRP', 'ISA·현금'].map((n, k) => s.b0[k] > 0 || s.b1[k] > 0 ? `<div class="rt-li"><span><i class="dot" style="background:${['var(--fixed)', 'var(--saving)', '#8E9196'][k]}"></i>${n}</span><span class="num ${s.b1[k] > s.b0[k] ? 'good' : ''}">${money(s.b0[k])} → ${money(s.b1[k])}</span></div>` : '').join('')}
        </div>
      </section>`; }).join('');
  const tl = [[`${nowAge}세`, '지금', `${money(start)}으로 시작해요.`]];
  if (R > nowAge) tl.push([`${R}세`, '은퇴', `${money(atL)}으로 매달 ${money(RT.spend * 1e4)}씩 쓰기 시작해요.`]);
  st.slice(1).forEach((s, i) => tl.push([`${s.a0}세`, rtStageTag(s, st[i], p) || '꺼내는 곳이 바뀌어요', rtStageSay(s, st[i])]));
  tl.push([r.lastAge > 100 ? '100세' : `${r.lastAge}세`, r.lastAge > 100 ? `100세까지 매달 ${money(RT.spend * 1e4)}` : `여기까지 매달 ${money(RT.spend * 1e4)}`, r.lastAge > 100 ? '계획대로 쓰면 100세가 넘어도 돈이 남아요.' : `${r.lastAge + 1}세부터 생활비가 모자라요.`]);
  openEd(`<h4>은퇴 계산 레포트</h4>
    <div class="rt-rep">
    <div class="rt-rhead"><small>지금 ${nowAge}세 · ${R}세 은퇴 · ${Retire.BASE_YEAR}년 세법 기준</small><b>내 은퇴 계획,<br>차근차근 정리했어요</b></div>
    <section class="rt-rc center"><div class="rt-rt">${R}세에 은퇴하면<br>매달 <b class="acc">${money(RT.spend * 1e4)}</b>씩<br><b class="acc">${r.lastAge > 100 ? '100세 넘어서' : r.lastAge + '세'}</b>까지 쓸 수 있어요</div>
      <p class="sub">세금·건강보험료를 내고 손에 남는 돈이에요</p>
      <div class="rt-pill"><span>지금 자산</span><b class="num">${money(start)}</b></div>
      <div class="rt-pill"><span>은퇴할 때 자산</span><b class="num good">${money(atL)}</b></div>
      <div class="rt-pill"><span>목표 생활비</span><b class="num">한 달 ${money(RT.spend * 1e4)}</b></div>
      <div class="rt-pill acc"><span>최대로 쓰면</span><b class="num">한 달 ${money(M)}</b></div>
      <p class="sub" style="margin:12px 0 0;font-size:13px">모든 금액은 현재 물가 기준이에요${house > 0 ? ` · 집 ${money(house)}은 빼고 계산했어요` : ''}</p></section>
    ${R > nowAge ? `<div class="rt-rsec"><small>1</small><b>은퇴할 때까지 모으기</b></div>
    <section class="rt-rc"><div class="rt-rt">${p.annualSaving ? `해마다 <b class="good">${money(p.annualSaving)}</b>씩 모으고<br>` : ''}물가를 빼고 한 해 ${realRet}%씩 불어나서<br>${R}세에 <b class="good">${money(atL)}</b>이 돼요</div>
      <div class="rt-gbars">${grow.map(g => `<div><i class="top" style="height:${Math.max(0, g.bal - Math.min(g.put, g.bal)) / gmax * 140}px"></i><i class="base" style="height:${Math.min(g.put, g.bal) / gmax * 140}px"></i></div>`).join('')}</div>
      <div class="rt-axis"><span>${nowAge}세</span><span>${R}세</span></div>
      <div class="rt-lgd"><span><i style="background:var(--saving)"></i>넣은 돈</span><span><i style="background:#A9DCC6"></i>불어난 몫</span></div>
      <div class="rt-pill"><span>지금 자산</span><b class="num">${money(start)}</b></div>
      <div class="rt-pill"><span>+ ${R - nowAge}년 동안 저축</span><b class="num">${money(savedReal)}</b></div>
      <div class="rt-pill"><span>+ 불어난 몫·돌려받은 세금</span><b class="num">${money(atL - start - savedReal)}</b></div>
      <div class="rt-pill acc2"><b>= 은퇴할 때</b><b class="num good">${money(atL)}</b></div>
      <div class="rt-body"><p style="margin-top:12px">수익률 ${Math.round(p.returnRate * 1000) / 10}%에서 물가 ${Math.round(p.inflation * 1000) / 10}%를 빼고 계산해서, 금액이 모두 지금 돈의 가치로 보여요. 연금저축·IRP에 들어간 저축은 해마다 세금을 돌려받아 다시 넣었어요.</p></div></section>` : ''}
    <div class="rt-rsec"><small>${R > nowAge ? 2 : 1}</small><b>은퇴 후, 시기마다 꺼내 쓰는 돈</b><span>한 달 평균이에요. 화면을 내리면 돈이 어떻게 움직이는지 보여요.</span></div>
    ${stageHtml}
    <div class="rt-rsec"><small>${R > nowAge ? 3 : 2}</small><b>정리하면</b></div>
    <section class="rt-rc">${tl.map(t => `<div class="rt-todo"><b>${t[0]}</b><div><span>${esc(t[1])}</span><small>${esc(t[2])}</small></div></div>`).join('')}</section>
    <button class="rt-rc rt-golink" id="rtRepImp"><span><b>계획 개선하기</b><small id="rtRepImpNote">바꾸면 더 남는 방법을 볼 수 있어요</small></span><i>›</i></button>
    <div class="rt-rnote"><b>알아 두세요</b><br>· 수익률 ${Math.round(p.returnRate * 1000) / 10}%, 물가 ${Math.round(p.inflation * 1000) / 10}%로 계산했어요. 실제 수익률은 해마다 달라요.<br>· ${Retire.BASE_YEAR}년 세법으로 계산했어요. 세법이 바뀌면 금액도 달라져요.<br>· 계산 결과일 뿐 추천이 아니에요.</div>
    </div>`, {tall: true});
  $('#rtRepImp').onclick = () => rtImprovePage(R);
  rtFlowBind();
}
// 스크롤에 따라 움직이는 돈의 흐름: 카드가 화면 아래(85%)에서 위(30%)로 올라오는 동안 0 → 1
const rtEase = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const rtClamp = t => Math.max(0, Math.min(1, t));
function rtFlowUpdate(){
  const ed = $('#ed'); if (!ed || !ed.classList.contains('on')) return;
  const vh = window.innerHeight, still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  ed.querySelectorAll('.rt-flw').forEach(el => {
    const top = el.getBoundingClientRect().top;
    const p = still ? 1 : rtClamp((vh * 0.85 - top) / (vh * 0.55));
    const t1 = rtEase(rtClamp(p / 0.3)), t2 = rtEase(rtClamp((p - 0.3) / 0.35)), t3 = rtEase(rtClamp((p - 0.65) / 0.2));
    const ph = p < 0.3 ? 0 : p < 0.65 ? 1 : p < 0.88 ? 2 : 3;
    el.querySelectorAll('.rt-fcap span').forEach(c => c.classList.toggle('on', +c.dataset.ph === ph));
    el.querySelectorAll('.rt-fbar').forEach(b => { const base = +b.dataset.base, g = +b.dataset.g, cut = +b.dataset.cut;
      b.style.height = Math.max(base > 4 ? 4 : base, base + g * t1 - cut * t2) + 'px'; b.style.setProperty('--gh', Math.max(0, g * t1 - cut * t2) + 'px'); });
    el.querySelectorAll('.rt-fchunk').forEach(c => { const x0 = +c.dataset.x0, y0 = +c.dataset.y0, x1 = +c.dataset.x1, y1 = +c.dataset.y1;
      const cut = (+c.dataset.cut || 0) * t3;   // 맨 위 조각은 세금이 빠지는 만큼 줄어요
      c.style.opacity = t2 > 0 ? Math.min(1, t2 * 6) : 0; c.style.height = (+c.dataset.h - cut) + 'px'; c.style.transform = `translate(${(x1 - x0) * t2}px,${(y1 - y0) * t2 + cut}px)`; });
    const n = el.querySelector('.rt-fnps'); if (n) { n.style.opacity = t2; n.style.transform = `translateY(${-50 * (1 - t2)}px)`; }
    const lv = el.querySelector('.rt-fliv'); if (lv) { const fl = +lv.dataset.floor, g = +lv.dataset.gross, th = +lv.dataset.tax * t3; lv.style.top = (fl - g + th - 4) + 'px'; lv.style.height = (g - th + 4) + 'px'; }
    const tx = el.querySelector('.rt-ftax'); if (tx) { tx.style.opacity = t3 > 0 ? Math.min(1, t3 * 5) : 0; tx.style.transform = `translateY(${(+tx.dataset.dy) * t3}px)`; }
    el.classList.toggle('done', ph === 3);
  });
}
let rtFlowRaf = 0;
function rtFlowBind(){
  const ed = $('#ed');
  if (!ed.dataset.rtflow){ ed.dataset.rtflow = '1'; ed.addEventListener('scroll', () => { if (!rtFlowRaf) rtFlowRaf = requestAnimationFrame(() => { rtFlowRaf = 0; rtFlowUpdate(); }); }, {passive: true}); window.addEventListener('resize', rtFlowUpdate); }
  rtFlowUpdate();
}

/* ───────── 계획 개선하기 ───────── */
// 꺼내 쓰는 시기(막대): 모아 둔 돈 · 연금계좌 · 국민연금
function rtLanes(r, R){
  const rows = r.rows.filter(x => x.phase === 'retire' && x.age <= RT.planAge);
  const span = f => { const on = rows.filter(f); return on.length ? [on[0].age, on.at(-1).age] : null; };
  const maxPen = Math.max(0, ...rows.map(x => (x.take.pensionIn + x.take.pensionOut) / x.infl));
  const L = [
    ['모아 둔 돈', span(x => x.take.foreign + x.take.kretf + x.take.domestic + x.take.isa + x.take.cash > 0), 'var(--fixed)', ''],
    ['연금저축·IRP', span(x => x.take.pensionIn + x.take.pensionOut > 0), 'var(--saving)', maxPen > 0 ? `한 해 최대 ${money(maxPen)}` : ''],
    ['국민연금', span(x => x.publicPension > 0), 'var(--accent)', '']
  ];
  const lo = R, hi = Math.max(RT.planAge, lo + 1), X = a => (a - lo) / (hi + 1 - lo) * 100;
  return `${L.map(([n, s, c, note]) => `<div class="rt-lane"><div class="rt-li"><b>${n}</b><span>${s ? `${s[0]}~${s[1]}세` : '쓰지 않음'}${note ? ' · ' + note : ''}</span></div>
    <div class="rt-ltrack">${s ? `<i style="left:${X(s[0])}%;width:${X(s[1] + 1) - X(s[0])}%;background:${c}"></i>` : ''}</div></div>`).join('')}
    <div class="rt-axis"><span>${lo}세</span><span>${Math.round((lo + hi) / 2)}</span><span>${hi}세</span></div>`;
}
function rtTaxTypes(r){
  const rows = r.rows.filter(x => x.phase === 'retire' && x.age <= RT.planAge), sum = k => rows.reduce((s, x) => s + x.tax[k] / x.infl, 0);
  return [['연금저축·IRP 세금', sum('pensionAcct')], ['해외주식 양도세', sum('stock')], ['건강보험료', sum('health')],
    ['소득세·배당 세금', sum('income') + sum('foreignDivTax')], ['집 보유세', sum('house')], ['ISA 세금', sum('isa')]].filter(x => x[1] > 1e4).sort((a, b) => b[1] - a[1]);
}
function rtImprovePage(R){
  const im = rtImprove(R), base = Retire.simulate(rtParams(R)), better = Retire.simulate(rtParams(R), null, im.combined.opt);
  const plan = RT.planAge, s = im.combined.saving, has = im.list.length > 0 && s > 0, mon = im.measure === 'monthly';
  const tab = S.rtItab === 'better' && has ? 'better' : 'now';
  const nw = r => Retire.netWealthAt(r, plan), row3 = (n, a, b) => `<div class="rt-cmp"><span>${n}</span><span class="num">${a}</span><b class="num">${b}</b></div>`;
  openEd(`<h4>계획 개선하기</h4>
    <section class="card"><div class="rt-tl">${mon ? `바꾸면 더 쓸 수 있는 돈 (${plan}세까지)` : `바꾸면 더 남는 돈 (${plan}세, 세금 낸 뒤)`}</div>
      <div class="rt-tv big num" style="color:var(--saving)">${has ? money(s) : '0원'}</div>
      ${has ? `<div class="rt-cmp head"><span></span><span>현재</span><b>개선</b></div>
        ${base.lastAge >= plan && better.lastAge >= plan ? row3(`${plan}세에 남는 돈`, money(nw(base)), money(nw(better))) : ''}
        ${row3('세금·건보료', money(im.base.tax), money(im.combined.tax))}${row3('은퇴 후 매달', money(im.base.monthly), money(im.combined.monthly))}
        ${row3('돈이 버티는 나이', rtAgeText(im.base.lastAge), rtAgeText(im.combined.lastAge))}`
        : '<p class="rt-p">지금 계획에서는 바꿔서 더 남는 방법을 찾지 못했어요.</p>'}
    </section>
    ${has ? `<div class="seg rt-gap" id="rtItab"><button data-v="now">현재</button><button data-v="better">개선</button></div>` : ''}
    <section class="card"><h3>${tab === 'now' ? '지금은 이렇게 꺼내요' : '개선하면 이렇게 꺼내요'}</h3>${rtLanes(tab === 'now' ? base : better, R)}</section>
    ${tab === 'now' ? `<section class="card"><h3>세금이 많이 나오는 곳 <small>${plan}세까지</small></h3>${rtTaxTypes(base).slice(0, 4).map(x => `<div class="rt-li tall"><span>${x[0]}</span><b class="num">${money(x[1])}</b></div>`).join('')}</section>`
      : `<section class="card"><h3>바꾸는 것 <small>${mon ? '더 쓸 수 있는 돈' : '더 남는 돈'}</small></h3>${im.list.map(x => `<div class="rt-li tall ${x.inCombined === false ? 'rt-off' : ''}"><span>${esc(x.title)}${x.notes.length ? `<small>${esc(x.notes.join(' · '))}</small>` : ''}</span><b class="num good">+${money(x.saving)}</b></div>`).join('')}
        <div class="rt-li sum"><span>함께 바꾸면</span><b class="num good">+${money(s)}</b></div></section>`}
    ${has ? '<button class="rt-report" id="rtRep"><span><b>개선 레포트 보기</b><small>무엇을, 언제, 어떻게 바꾸는지 차근차근 설명해요</small></span><i>›</i></button>' : ''}
    <p class="note" style="margin:0 6px 12px">${Retire.BASE_YEAR}년 세법 기준 · 계산 결과일 뿐 추천이 아니에요. 효과는 계좌 수익률을 같게 맞추고 세금 차이만 비교했어요.${mon ? ` 지금 계획으로는 ${plan}세 전에 돈이 바닥나서, 매달 더 쓸 수 있는 돈 × ${plan - R + 1}년으로 비교했어요.` : ''}</p>
    ${has ? '<button class="btn" id="rtApply">개선 방법으로 계산하기</button>' : ''}`, {tall: true});
  if (has) seg('#rtItab', tab, v => { S.rtItab = v; const y = $('#ed').scrollTop; rtImprovePage(R); $('#ed').scrollTop = y; });
  if ($('#rtRep')) $('#rtRep').onclick = () => rtReport(R);
  if ($('#rtApply')) $('#rtApply').onclick = () => { RT.opt = im.combined.opt; rtSave(); closeEd(); render(); toast('개선 방법을 적용해 다시 계산했어요'); };
}

/* ───────── 개선 레포트 ───────── */
const RT_METHOD = {
  pensionEarly: (R, x) => ({color: 'var(--saving)', tag: '연금저축 · IRP', head: `쓸 돈이 적어도<br>해마다 <b class="good">1,500만원</b>까지<br>꺼내 두세요`,
    body: `<p>연금저축·IRP는 한 해에 꺼내는 돈이 1,500만원 이하면 나이에 따라 <b>3.3~5.5%</b>만 내요. 넘으면 꺼낸 돈 전체에 16.5%를 내거나, 다른 소득과 합쳐 세금을 계산해야 해요.</p>
      <div class="rt-two"><div><small>1,500만원 이하</small><b class="good">3.3~5.5%</b></div><div><small>넘으면 전체에</small><b class="bad">16.5%</b></div></div>
      <p>기본 계산도 55세부터 필요한 만큼 1,500만원 안에서 꺼내요. 여기에 더해, 생활비로 다 쓰지 않아도 해마다 1,500만원(한 달 125만원)까지 꺼내 두면 낮은 세율 구간을 해마다 채워요. 쓰고 남은 돈은 다시 투자해요.</p>`}),
  harvest: () => ({color: 'var(--fixed)', tag: '해외주식', head: '해마다 이익<br><b class="good">250만원</b>만큼<br>팔고 다시 사세요',
    body: `<p>해외주식으로 번 이익은 <b>한 해 250만원까지 세금이 없어요.</b> 이 혜택은 그해에 쓰지 않으면 사라져요.</p>
      <p>해마다 이익이 250만원쯤 되도록 팔고 바로 다시 사면, 산 가격이 올라가서 나중에 팔 때 낼 세금이 줄어요. 넘는 이익에는 22%가 붙어요.</p>`}),
  giftToSpouse: () => ({color: 'var(--accent)', tag: '부부일 때', head: '해외주식 절반을<br>배우자 이름으로<br>옮기세요',
    body: `<p>250만원까지 세금이 없는 혜택은 <b>사람마다 따로</b> 받아요. 옮길 때의 가격이 배우자가 산 가격이 되어, 그때까지 오른 이익에는 세금이 붙지 않아요.</p>
      <div class="rt-two"><div><small>지금 · 나만</small><b>250만원</b></div><div><small>바꾸면 · 둘이</small><b class="good">500만원</b></div></div>
      <div class="rt-warn"><b>옮기기 전에 꼭 확인하세요</b><br>· 배우자에게는 10년 동안 6억원까지 증여세 없이 줄 수 있어요.<br>· 받은 뒤 <b>1년 안에 팔면</b> 처음 산 가격으로 세금을 계산해서 효과가 없어요. 팔기 1년 전에 옮기세요.</div>`}),
  openIsa: (R, x, rate) => ({color: 'var(--accent)', tag: 'ISA', head: `${x.fresh ? 'ISA를 만들어<br>' : 'ISA에<br>'}해마다 <b class="good">2,000만원</b>까지<br>넣으세요`,
    body: `<p>ISA에서 번 이익은 <b>200만원까지 세금이 없고</b>(연봉 5,000만원 이하면 400만원), 넘는 이익도 9.9%만 내요. 일반 계좌에서는 15.4%예요.</p>
      <div class="rt-two"><div><small>일반 계좌</small><b class="bad">15.4%</b></div><div><small>ISA</small><b class="good">0~9.9%</b></div></div>
      <p>3년이 지나면 ISA 돈을 연금계좌로 옮기세요. 옮긴 돈의 10%(300만원까지)를 더 세액공제받아요. 저축은 ISA를 먼저 채우고, 남는 돈을 연금계좌에 넣어요.</p>
      <div class="rt-warn"><b>알아 두세요</b><br>· ISA에는 해외주식을 직접 담을 수 없어요. 국내에 상장된 해외지수 ETF(예: 미국 나스닥100 ETF)로 담아요.<br>· 3년 동안 넣어 두어야 해요.<br>· 최근 3년 안에 금융소득 종합과세를 받았다면 가입할 수 없어요.</div>`}),
  fillPension: (R, x, rate) => ({color: 'var(--saving)', tag: '연금저축 · IRP', head: `${x.fresh ? '연금저축·IRP를 만들어<br>' : '연금저축·IRP에<br>'}해마다 <b class="good">900만원</b>까지<br>넣으세요`,
    body: `<p>연금저축·IRP에 넣은 돈은 연말정산 때 <b>${rate}%</b>를 돌려받아요${rate === '13.2' ? '(연봉 5,500만원 이하면 16.5%)' : ''}. 연금저축은 600만원까지, IRP를 더해 900만원까지예요.</p>
      <div class="rt-two"><div><small>한 해 900만원 넣으면</small><b>돌려받는 돈</b></div><div><small>${rate}%</small><b class="good">${money(9e6 * rate / 100)}</b></div></div>
      <p>돌려받은 돈도 다시 투자하고, 은퇴하면 연금으로 낮은 세율(3.3~5.5%)에 꺼내 써요.</p>
      <div class="rt-warn"><b>알아 두세요</b><br>· 55세 전에 꺼내면 돌려받은 세금을 16.5%로 다시 내요.<br>· 세액공제는 일해서 버는 소득이 있을 때 받아요.</div>`}),
  noDividend: () => ({color: 'var(--fixed)', tag: '배당', head: '배당 대신<br>팔아서 쓰세요',
    body: `<p>이자와 배당이 한 해 <b>1,000만원</b>을 넘으면 전부 건강보험료 계산에 들어가요. 2,000만원을 넘으면 다른 소득과 합쳐 세금을 계산해요.</p>
      <p>주식을 팔아서 남긴 이익은 건강보험료에 들어가지 않아요. 배당이 적은 상품으로 갖고 있다가 필요한 만큼 팔아서 쓰는 방법이에요.</p>
      <div class="rt-warn">상품을 바꿀 때 판 이익에는 세금이 붙을 수 있어요. 바꾸는 시기를 나눠서 정하세요.</div>`})
};
function rtReport(R){
  const im = rtImprove(R), p = rtParams(R), base = Retire.simulate(p), better = Retire.simulate(p, null, im.combined.opt), plan = RT.planAge;
  const used = im.list.filter(x => x.inCombined !== false), mon = im.measure === 'monthly';
  const crRate = RT.me.salary != null && RT.me.salary <= 5500 ? '16.5' : '13.2';
  const bands = []; for (let a = R; a <= plan; a += 5) bands.push(a);
  const band = (r, a) => r.rows.filter(x => x.phase === 'retire' && x.age >= a && x.age < a + 5).reduce((s, x) => s + x.taxTotal / x.infl, 0) / 5;
  const bNow = bands.map(a => band(base, a)), bBet = bands.map(a => band(better, a)), mx = Math.max(...bNow, ...bBet, 1);
  const hot = bNow.map(v => v >= Math.max(...bNow) * 0.85);
  const ids = used.map(x => x.id), npsStart = base.params.npsStart;
  const todo = [];
  if (ids.includes('harvest')) todo.push([`지금부터`, '해마다 연말에 해외주식 이익 250만원만큼 팔고 다시 사기', '증권사 앱에서 팔고 바로 다시 사면 돼요.']);
  if (ids.includes('giftToSpouse')) todo.push([`${R - 1}세까지`, '해외주식 절반을 배우자 이름으로 옮기기', '팔기 시작하기 1년 전까지 옮겨야 효과가 있어요.']);
  if (ids.includes('noDividend')) todo.push([`${R}세 전에`, '배당이 많은 상품을 배당이 적은 상품으로 바꾸기', '판 이익에 세금이 붙을 수 있으니 몇 해에 나눠 바꾸세요.']);
  if (ids.includes('openIsa')) todo.push(['지금', im.list.find(x => x.id === 'openIsa').fresh ? '증권사 앱에서 ISA(중개형) 만들기' : 'ISA에 해마다 2,000만원까지 넣기', '저축은 ISA를 먼저 채우세요. 3년마다 만기 때 연금계좌로 옮기면 세액공제를 더 받아요.']);
  if (ids.includes('fillPension')) todo.push(['지금', im.list.find(x => x.id === 'fillPension').fresh ? '연금저축·IRP 만들고 해마다 900만원 넣기' : '연금저축·IRP에 해마다 900만원까지 넣기', '연말정산 때 세액공제를 받아요. ISA를 채우고 남는 저축을 넣으세요.']);
  if (ids.includes('pensionEarly')) todo.push([`${Math.max(55, R)}세`, '연금저축·IRP 연금 받기 신청, 한 해 1,500만원으로', '생활비로 다 쓰지 않아도 1,500만원(한 달 125만원)까지 받아 두고, 남는 돈은 다시 투자하세요.']);
  todo.push([`${npsStart}세`, '국민연금 받기 시작', '지금 계획과 같아요.']);
  todo.sort((a, b) => (parseInt(a[0]) || 0) - (parseInt(b[0]) || 0));
  const taxT = rtTaxTypes(base);
  openEd(`<h4>개선 레포트</h4><button id="edX" hidden>뒤로</button>
    <div class="rt-rep">
    <div class="rt-rhead"><small>${R}세 은퇴 · ${Retire.BASE_YEAR}년 세법 기준</small><b>은퇴 계획,<br>이렇게 개선할 수 있어요</b></div>
    <section class="rt-rc center"><div class="rt-rt">${used.length}가지를 바꾸면<br><b class="good">${money(im.combined.saving)}</b>${mon ? '을<br>더 쓸 수 있어요' : '이<br>더 남아요'}</div>
      <p class="sub">${mon ? `${plan}세까지 매달 더 쓸 수 있는 돈을 합친 금액이에요` : `${plan}세에 세금을 다 내고 남는 돈 기준이에요`}</p>
      <div class="rt-pill"><span>세금·건보료</span><span><s>${money(im.base.tax)}</s> → <b class="good">${money(im.combined.tax)}</b></span></div>
      <div class="rt-pill"><span>매달 쓸 수 있는 돈</span><span><s>${money(im.base.monthly)}</s> → <b class="good">${money(im.combined.monthly)}</b></span></div>
      <div class="rt-pill"><span>돈이 버티는 나이</span><span><s>${rtAgeText(im.base.lastAge)}</s> → <b class="good">${rtAgeText(im.combined.lastAge)}</b></span></div></section>
    <div class="rt-rsec"><small>1</small><b>지금 꺼내 쓰는 방법</b></div>
    <section class="rt-rc"><div class="rt-rt">지금은 이런 순서로<br>꺼내 써요</div>${rtLanes(base, R)}</section>
    <section class="rt-rc"><div class="rt-rt">그래서 ${plan}세까지<br>세금·건보료로 <b class="bad">${money(im.base.tax)}</b>이<br>나가요</div>
      <div class="rt-vbars">${bands.map((a, i) => `<div><span class="${hot[i] ? 'bad' : ''}">${Math.round(bNow[i] / 1e4).toLocaleString()}</span><i class="${hot[i] ? 'hot' : ''}" style="height:${bNow[i] / mx * 120}px"></i><em>${a}~</em></div>`).join('')}</div>
      <p class="sub" style="text-align:right;margin:10px 0 14px;font-size:13px">한 해 세금·건보료 (만원, 현재 물가)</p>
      ${taxT.slice(0, 2).map(t => `<div class="rt-pill red"><span><b>${t[0]}</b></span><span class="num">${money(t[1])}</span></div>`).join('')}</section>
    <div class="rt-rsec"><small>2</small><b>이렇게 바꾸면 ${mon ? '더 쓸 수 있어요' : '더 남아요'}</b></div>
    ${used.map((x, i) => { const M = RT_METHOD[x.id](R, x, crRate); return `<section class="rt-rc"><div class="rt-mt"><span style="color:${M.color}">방법 ${i + 1} · ${M.tag}</span><b class="good">+${money(x.saving)}</b></div>
      <div class="rt-rt">${M.head}</div><div class="rt-body">${M.body}</div></section>`; }).join('')}
    ${!ids.includes('noDividend') ? `<section class="rt-rc"><div class="rt-mt"><span>줄이기 어려운 것</span></div><div class="rt-rt">건강보험료는<br>그대로예요</div>
      <div class="rt-body"><p>건강보험료는 국민연금과 집 가격으로 정해져요. 위 방법으로는 거의 바뀌지 않아요.</p></div></section>` : ''}
    <section class="rt-rc"><div class="rt-rt">바꾸면 세금이<br>한 시기에 몰리지 않아요</div>
      <div class="rt-lgd"><span><i style="background:var(--line)"></i>지금</span><span><i style="background:var(--saving)"></i>바꾸면</span></div>
      <div class="rt-vbars pair">${bands.map((a, i) => `<div><i style="height:${bNow[i] / mx * 120}px;background:var(--line)"></i><i style="height:${bBet[i] / mx * 120}px;background:var(--saving)"></i><em>${a}~</em></div>`).join('')}</div></section>
    <div class="rt-rsec"><small>3</small><b>나이별로 할 일</b></div>
    <section class="rt-rc">${todo.map(t => `<div class="rt-todo"><b>${t[0]}</b><div><span>${t[1]}</span><small>${t[2]}</small></div></div>`).join('')}</section>
    <div class="rt-rnote"><b>알아 두세요</b><br>· ${Retire.BASE_YEAR}년 세법으로 계산했어요. 세법이 바뀌면 금액도 달라져요.<br>· 계산 결과일 뿐 추천이 아니에요. 실제로 바꾸기 전에 금융회사나 세무사에게 확인하세요.</div>
    <button class="btn rt-wbtn" id="rtApply2">개선 방법으로 계산하기</button>
    </div>`, {tall: true});
  $('#edX').onclick = () => rtImprovePage(R);
  $('#rtApply2').onclick = () => { RT.opt = im.combined.opt; rtSave(); closeEd(); render(); toast('개선 방법을 적용해 다시 계산했어요'); };
}
