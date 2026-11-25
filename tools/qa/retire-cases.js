// 은퇴 설계 엔진: 경우별 시나리오 점검
// 실행: node tools/qa/retire-cases.js [--quick]
//
// 1) 경우 조합: 가구 × 은퇴 시점 × 자산 구성 × 국민연금 × 생활비 (+ 집·빚·배당·저축·연봉·계획 나이는 자산 구성 안에)
// 2) 장부 맞추기: 수익률·물가 0%로 바꾼 세계에서 해마다
//      일하는 해  끝 자산 = 시작 자산 + 저축 + 돌려받은 세금 − ISA 세금
//      은퇴한 해  끝 자산 = 시작 자산 + (국민연금 + 기초연금 + 이자 + 배당) − (쓴 생활비) − (세금·건보료)
//    가 1원 단위로 맞는지. 안 맞으면 돈이 새로 생기거나 사라지는 구멍이다.
// 3) 방향 규칙(실제 수익률 세계): 생활비↑ → 버티는 나이 ↓ 또는 같음, 수익률↑·저축↑·자산↑·국민연금↑ → 쓸 수 있는 돈 ↑ 또는 같음,
//    계획 나이↑ → 쓸 수 있는 돈 ↓ 또는 같음, 개선 방법 적용 → 쓸 수 있는 돈 ↑ 또는 같음, 세금은 0 이상 등
const E = require('../../js/retire.js');
const QUICK = process.argv.includes('--quick');
const Y = 2026;

// ───── 경우 목록 ─────
const HOUSEHOLD = {
  '혼자': p => p,
  '부부·내 명의': p => Object.assign(p, { spouse: { birthYear: p.birthYear + 2, nps: { mode: 'direct', monthly: 600000 } } }),
  '부부·배우자 명의': p => { p.accounts.forEach(a => { if (a.kind !== '집') a.owner = '배우자'; }); return Object.assign(p, { spouse: { birthYear: p.birthYear - 3, nps: { mode: 'direct', monthly: 0 } } }); },
  '부부·공동': p => { p.accounts.forEach(a => { a.owner = '공동'; }); return Object.assign(p, { spouse: { birthYear: p.birthYear, nps: { mode: 'auto', years: 15, monthlyIncome: 2500000 } } }); }
};
const TIMING = {   // [지금 나이, 은퇴 나이]
  '이미 은퇴(62세)': [62, 60], '50세 은퇴(연금계좌 잠김)': [40, 50], '55세 은퇴': [45, 55], '60세 은퇴': [52, 60], '66세 은퇴': [58, 66]
};
const PORTFOLIO = {
  '현금만': () => ({ accounts: [{ kind: '현금', balance: 6e8 }] }),
  '해외주식(배당 적음, 이익 큼)': () => ({ accounts: [{ kind: '해외주식', balance: 8e8, principal: 2e8, dividendYield: 0.006 }] }),
  '해외주식(고배당)': () => ({ accounts: [{ kind: '해외주식', balance: 1.2e9, principal: 1e9, dividendYield: 0.04 }] }),
  '해외주식(손실 중)': () => ({ accounts: [{ kind: '해외주식', balance: 3e8, principal: 4e8, dividendYield: 0.01 }, { kind: '현금', balance: 5e7 }] }),
  '국내주식·국내상장 해외ETF': () => ({ accounts: [{ kind: '국내주식', balance: 3e8, dividendYield: 0.02 }, { kind: '국내상장 해외ETF', balance: 4e8, principal: 2e8, dividendYield: 0.01 }] }),
  '연금계좌 위주': () => ({ accounts: [{ kind: '연금저축', balance: 4e8 }, { kind: 'IRP', balance: 2e8 }, { kind: '현금', balance: 3e7 }] }),
  'ISA·섞임': () => ({ accounts: [{ kind: 'ISA', balance: 8e7, principal: 6e7 }, { kind: '해외주식', balance: 3e8, principal: 2e8, dividendYield: 0.015 }, { kind: '연금저축', balance: 1e8 }, { kind: '현금', balance: 5e7 }], annualSaving: 2e7, salary: 5e7 }),
  '집만(꺼낼 돈 거의 없음)': () => ({ accounts: [{ kind: '집', balance: 1e9, publicPrice: 7e8 }, { kind: '현금', balance: 1e7 }] }),
  '빚 많음': () => ({ accounts: [{ kind: '현금', balance: 1e8 }, { kind: '해외주식', balance: 2e8, principal: 1.5e8 }, { kind: '집', balance: 8e8, publicPrice: 5.6e8 }], debt: 4e8, annualRepay: 1.2e7 }),
  '고가 주택·종부세': () => ({ accounts: [{ kind: '집', balance: 3e9, publicPrice: 2.2e9 }, { kind: '해외주식', balance: 1e9, principal: 4e8, dividendYield: 0.006 }, { kind: '연금저축', balance: 2e8 }], annualSaving: 5e7, salary: 1.5e8 })
};
const NPS = {
  '국민연금 없음': () => ({ mode: 'direct', monthly: 0 }),
  '직접 130만': () => ({ mode: 'direct', monthly: 1300000 }),
  '자동 25년': () => ({ mode: 'auto', years: 25, monthlyIncome: 4500000 }),
  '자동 8년(10년 미만)': () => ({ mode: 'auto', years: 8, monthlyIncome: 3000000 })
};
const SPEND = { '생활비 200만': 2e6, '생활비 600만': 6e6 };

function make(h, tm, pf, nps, sp) {
  const [now, ret] = TIMING[tm];
  const p = Object.assign({ baseYear: Y, birthYear: Y - now, retireAge: ret, planAge: 95, spendMonthly: SPEND[sp], annualSaving: 1.5e7, nps: NPS[nps]() }, PORTFOLIO[pf]());
  return HOUSEHOLD[h](p);
}
const zero = p => {
  const q = JSON.parse(JSON.stringify(p));
  Object.assign(q, { inflation: 0, returnRate: 0, cashRate: 0, savingGrowth: 0, houseGrowth: 0 });
  q.accounts.forEach(a => { a.rate = 0; });
  return q;
};
const liquidSum = b => Object.values(b).reduce((s, v) => s + v, 0);

// ───── 장부 맞추기 ─────
function ledger(p) {
  const r = E.simulate(p), bad = [];
  const tol = L => 20 + Math.abs(L) * 1e-9;
  let prev = p.accounts.filter(a => a.kind !== '집').reduce((s, a) => s + a.balance, 0);
  let debt = p.debt || 0;
  for (const x of r.rows) {
    const now = liquidSum(x.bal);
    if (x.phase === 'work') {
      const want = prev + x.saved + x.refund - x.isaTax - x.workTax;
      if (Math.abs(now - want) > tol(want)) bad.push(`${x.age}세(일하는 해) 장부 차이 ${Math.round(now - want).toLocaleString()}원`);
      debt = Math.max(0, debt - (p.annualRepay || 0));
    } else {
      if (x === r.rows.find(y => y.phase === 'retire')) {
        const start = liquidSum(r.atRetire.bal), paid = debt - r.atRetire.debtLeft;
        if (Math.abs(prev - paid - start) > tol(prev)) bad.push(`은퇴 때 빚 갚기 장부 차이 ${Math.round(prev - paid - start).toLocaleString()}원`);
        prev = start;
      }
      // 배당·이자는 자산 안에서 나오는 돈이라 밖에서 들어오는 돈이 아님. 밖에서 들어오는 돈 = 국민연금 + 기초연금
      const want = prev + x.publicPension + x.basicPension - (x.need - x.short) - (x.taxTotal - x.unpaidTax);
      if (Math.abs(now - want) > tol(want)) bad.push(`${x.age}세(은퇴) 장부 차이 ${Math.round(now - want).toLocaleString()}원`);
    }
    prev = now;
  }
  return bad;
}

// ───── 방향 규칙 ─────
const M = (p, o) => E.sustainableMonthly(p, o);
function rules(p, withImprove) {
  const bad = [], r = E.simulate(p), base = M(p);
  const chk = (c, msg) => { if (!c) bad.push(msg); };
  for (const x of r.rows) {
    for (const [k, v] of Object.entries(x.bal)) chk(Number.isFinite(v) && v >= 0, `${x.age}세 ${k} 잔액 ${v}`);
    if (x.phase === 'retire') {
      for (const [k, v] of Object.entries(x.tax)) chk(Number.isFinite(v) && v >= -1, `${x.age}세 세금 ${k}=${v}`);
      chk(x.short >= 0 && x.short <= x.need + 1 && x.unpaidTax >= 0, `${x.age}세 부족액 범위 밖`);
      chk(x.take.pensionIn === 0 || x.age >= 55 || p.spouse, `${x.age}세에 55세 전 연금으로 받기(해지만 가능해야 함)`);
      chk(x.take.pensionIn + x.take.pensionOut === 0 || x.age >= 55 || p.spouse || liquidSum(x.bal) - x.bal.pension < 1, `${x.age}세: 다른 돈이 남았는데 55세 전 연금계좌 해지`);
    }
  }
  const tw = (f, o) => { const q = JSON.parse(JSON.stringify(p)); f(q); return M(q, o); };
  const lastAt = s => E.simulate(p, s).lastAge;
  chk(lastAt(p.spendMonthly * 1.3) <= r.lastAge, '생활비를 늘렸는데 버티는 나이가 늘어남');
  chk(tw(q => { q.returnRate = (q.returnRate ?? 0.06) + 0.02; q.accounts.forEach(a => { if (a.rate != null) a.rate += 0.02; }); }) >= base - 1000, '수익률을 올렸는데 쓸 수 있는 돈이 줄어듦');
  chk(tw(q => { q.annualSaving = (q.annualSaving || 0) + 1e7; }) >= base - 1000, '저축을 늘렸는데 쓸 수 있는 돈이 줄어듦');
  chk(tw(q => { q.accounts.push({ kind: '현금', balance: 1e8 }); }) >= base - 1000, '현금 1억을 더했는데 쓸 수 있는 돈이 줄어듦');
  chk(tw(q => { q.nps = { mode: 'direct', monthly: ((q.nps.mode === 'direct' ? q.nps.monthly : 0) || 0) + 500000 }; }) >= base - 1000 || p.nps.mode === 'auto', '국민연금을 늘렸는데 쓸 수 있는 돈이 줄어듦');
  chk(tw(q => { q.planAge = 100; }) <= base + 1000, '계획 나이를 늘렸는데 쓸 수 있는 돈이 늘어남');
  if (withImprove) {
    const im = E.improvements(p);
    for (const x of im.list) {
      chk(x.saving > 0, `개선 방법 ${x.id} 효과가 0 이하`);
      chk(x.monthlyGain >= 0, `개선 방법 ${x.id}가 쓸 수 있는 돈을 줄임`);
      if (!p.spouse) chk(x.id !== 'giftToSpouse', '혼자인데 배우자 방법');
    }
    for (let i = 1; i < im.list.length; i++) chk(im.list[i - 1].saving >= im.list[i].saving, '개선 방법 순서');
    if (im.list.length) chk(im.combined.monthly >= im.base.monthly - 1000, '함께 바꾸면 쓸 수 있는 돈이 줄어듦');
    if (im.list.length) chk(im.combined.saving >= Math.max(...im.list.map(x => x.saving)) - 10000, '함께 바꾸기 효과가 가장 좋은 방법 하나보다 작음');
  }
  return bad;
}

// ───── 경계 상황 ─────
const B = (now, o) => Object.assign({ baseYear: Y, birthYear: Y - now, retireAge: 60, planAge: 95, spendMonthly: 3e6, annualSaving: 1e7, nps: { mode: 'direct', monthly: 1e6 },
  accounts: [{ kind: '해외주식', balance: 5e8, principal: 3e8, dividendYield: 0.01 }, { kind: '연금저축', balance: 2e8 }, { kind: '현금', balance: 5e7 }] }, o);
const SPECIAL = {
  '계획 나이 = 지금 나이(70세)': B(70, { retireAge: 65, planAge: 70 }),
  '계획 나이 100세': B(50, { planAge: 100 }),
  '생활비 0원': B(55, { spendMonthly: 0 }),
  '자산 없이 국민연금만': B(64, { retireAge: 64, accounts: [], nps: { mode: 'direct', monthly: 1.5e6 } }),
  '자산 0, 국민연금 0': B(64, { retireAge: 64, accounts: [], nps: { mode: 'direct', monthly: 0 } }),
  '국민연금 60세 조기': B(55, { nps: { mode: 'auto', years: 30, monthlyIncome: 4e6, startAge: 60 } }),
  '국민연금 70세 연기': B(55, { nps: { mode: 'auto', years: 30, monthlyIncome: 4e6, startAge: 70 } }),
  '국민연금 상한 넘는 소득': B(45, { nps: { mode: 'auto', years: 35, monthlyIncome: 2e7 } }),
  '부부 나이 차 15살(배우자 많음)': B(50, { spouse: { birthYear: Y - 65, nps: { mode: 'direct', monthly: 8e5 } } }),
  '부부 나이 차 15살(배우자 적음)': B(60, { retireAge: 62, spouse: { birthYear: Y - 45, nps: { mode: 'direct', monthly: 0 } } }),
  '물가 0%': B(50, { inflation: 0 }),
  '물가 5%': B(50, { inflation: 0.05 }),
  '수익률 −2%': B(50, { returnRate: -0.02 }),
  '계좌별 수익률(해외 10%, 현금 1%)': B(50, { accounts: [{ kind: '해외주식', balance: 5e8, principal: 3e8, rate: 0.1 }, { kind: '현금', balance: 5e7, rate: 0.01 }] }),
  '연봉 3,000만(16.5%·서민형 ISA)': B(40, { salary: 3e7, annualSaving: 3e7 }),
  '연봉 1억': B(40, { salary: 1e8, annualSaving: 4e7 }),
  '집 공시 9억 경계(특례 끝)': B(60, { accounts: [{ kind: '집', balance: 1.3e9, publicPrice: 9e8 }, { kind: '현금', balance: 8e8 }] }),
  '집 공시 12억 경계(종부세 시작)': B(60, { accounts: [{ kind: '집', balance: 1.7e9, publicPrice: 1.2e9 + 1e6 }, { kind: '현금', balance: 8e8 }] }),
  '기초연금 경계(재산 적음)': B(66, { retireAge: 66, spendMonthly: 1.2e6, accounts: [{ kind: '현금', balance: 6e7 }, { kind: '집', balance: 3e8, publicPrice: 2e8 }], nps: { mode: 'direct', monthly: 7e5 } }),
  '부부 기초연금 경계': B(66, { retireAge: 66, spendMonthly: 1.8e6, accounts: [{ kind: '현금', balance: 8e7 }, { kind: '집', balance: 3e8, publicPrice: 2.2e8 }], nps: { mode: 'direct', monthly: 6e5 }, spouse: { birthYear: Y - 66, nps: { mode: 'direct', monthly: 3e5 } } }),
  '금융소득 1,000만 근처': B(60, { accounts: [{ kind: '해외주식', balance: 2.6e8, principal: 2e8, dividendYield: 0.04 }, { kind: '현금', balance: 1e8 }] }),
  '금융소득 2,000만 근처': B(60, { accounts: [{ kind: '해외주식', balance: 5.1e8, principal: 4e8, dividendYield: 0.04 }, { kind: '현금', balance: 1e8 }] }),
  '연금계좌 1,500만 경계': B(60, { spendMonthly: 1.3e6, accounts: [{ kind: '연금저축', balance: 3e8 }], nps: { mode: 'direct', monthly: 0 } }),
  '빚이 유동자산보다 큼': B(55, { retireAge: 58, debt: 9e8, annualRepay: 1e7 }),
  '은퇴 나이 = 지금 나이': B(58, { retireAge: 58 }),
  '은퇴 나이 75세': B(60, { retireAge: 75 }),
  '원금 모름(해외주식)': B(50, { accounts: [{ kind: '해외주식', balance: 5e8 }, { kind: '현금', balance: 5e7 }] }),
  '혼자인데 공동 명의 표시': B(50, { accounts: [{ kind: '해외주식', balance: 5e8, owner: '공동' }, { kind: '현금', balance: 5e7, owner: '배우자' }] }),
  'ISA만 큼': B(50, { accounts: [{ kind: 'ISA', balance: 3e8, principal: 1e8 }] }),
  '국내상장 해외ETF만 큼(배당 2%)': B(55, { accounts: [{ kind: '국내상장 해외ETF', balance: 1e9, principal: 4e8, dividendYield: 0.02 }] })
};

// ───── 실행 ─────
const t0 = Date.now(), fails = new Map();
let n = 0, nImp = 0;
const keys = o => Object.keys(o);
for (const h of keys(HOUSEHOLD)) for (const tm of keys(TIMING)) for (const pf of keys(PORTFOLIO)) for (const ns of keys(NPS)) for (const sp of keys(SPEND)) {
  n++;
  const name = [h, tm, pf, ns, sp].join(' / ');
  const p = make(h, tm, pf, ns, sp);
  const add = (kind, msgs) => msgs.forEach(m => { const k = kind + ': ' + m.replace(/[\d,.-]+원/g, '…원').replace(/^\d+세/, 'N세'); if (!fails.has(k)) fails.set(k, []); fails.get(k).push(name); });
  try {
    add('장부', ledger(zero(p)));
    if (!QUICK || n % 5 === 0) { const imp = n % 7 === 0; if (imp) nImp++; add('규칙', rules(p, imp)); }
  } catch (e) { add('오류', [e.message]); }
}
for (const [name, p] of Object.entries(SPECIAL)) {
  n++;
  const add = (kind, msgs) => msgs.forEach(m => { const k = kind + ': ' + m.replace(/[\d,.-]+원/g, '…원').replace(/^\d+세/, 'N세'); if (!fails.has(k)) fails.set(k, []); fails.get(k).push('경계 · ' + name); });
  try { add('장부', ledger(zero(p))); nImp++; add('규칙', rules(p, true)); } catch (e) { add('오류', [e.stack.split('\n').slice(0, 2).join(' ')]); }
}
const sec = ((Date.now() - t0) / 1000).toFixed(1);
if (fails.size) {
  for (const [k, list] of fails) { console.log(`✗ ${k}  (${list.length}건)`); list.slice(0, 3).forEach(x => console.log('    예: ' + x)); }
  console.log(`\n경우 ${n}개 (개선 비교 ${nImp}개) 중 문제 ${fails.size}종류 · ${sec}초`);
  process.exit(1);
}
console.log(`✓ 경우 ${n}개 모두 통과 (장부 맞추기 ${n}개, 방향 규칙 ${QUICK ? Math.floor(n / 5) + Object.keys(SPECIAL).length : n}개, 개선 비교 ${nImp}개) · ${sec}초`);
