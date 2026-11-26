// 시안용 데이터: 앱과 같은 계산 엔진으로 예시(1985년생, 55세 은퇴, 생활비 300만원)를 계산한다.
// ① 고침: 연말 잔액은 "그해 말 물가"로 나눠 현재 물가 기준으로 바꾼다(앱은 그해 초 물가로 나눠 2% 크게 보였음).
const E = require('./eng/retire.js');
let P = require('../rep-params.json').params;
// 시안용: 두 번째 해외주식 계좌를 배당주(배당률 3.5%, 예: SCHD)로 둔다. 첫 번째는 성장주(0.6%, 예: QQQ).
P.accounts[4].dividendYield = 0.035;
const STK = P.accounts.filter(a => /주식|ETF/.test(a.kind));
const stTot = STK.reduce((t, a) => t + a.balance, 0);
const stockMix = [{name: '배당주', ex: 'SCHD 같은', y: 0.035, test: a => (a.dividendYield || 0) >= 0.02}, {name: '성장주', ex: 'QQQ 같은', y: 0.006, test: a => (a.dividendYield || 0) < 0.02}]
  .map(m => ({name: m.name, ex: m.ex, y: m.y, share: STK.filter(m.test).reduce((t, a) => t + a.balance, 0) / stTot}));
const R = 55;

const liq = b => b.cash + b.isa + b.foreign + b.domestic + b.kretf + b.pension;
const grp = (b, d) => [(b.foreign + b.domestic + b.kretf) / d, b.pension / d, (b.isa + b.cash) / d];
const endDefl = x => x.infl * (1 + P.inflation);   // 연말 물가

function yearOf(x){
  const m = v => v / 12 / x.infl;
  return {a: x.age,
    src: {nps: m(x.publicPension + x.basicPension), pen: m(x.take.pensionIn + x.take.pensionOut), div: m(x.dividend), sell: m(x.take.foreign + x.take.kretf + x.take.domestic), cash: m(x.take.cash + x.take.isa + x.interest)},
    tax: Object.fromEntries(['pensionAcct', 'income', 'foreignDivTax', 'stock', 'isa', 'health', 'house'].map(k => [k, m(x.tax[k])])),
    unpaid: m(x.unpaidTax || 0), short: m(Math.max(0, x.short - (x.debtRepay || 0))), debt: m(x.debtRepay || 0),
    net: m(Math.max(0, x.need - x.short - (x.debtRepay || 0)))};
}
function stages(r){
  const rows = r.rows.filter(x => x.phase === 'retire' && x.age <= 100);
  const ys = rows.map(yearOf), sig = y => Object.entries(y.src).filter(([, v]) => v >= 1e4).map(([k]) => k).join(',') + (y.short >= 1e4 ? ',short' : '');
  let st = [];
  ys.forEach((y, i) => { if (!st.length || sig(y) !== sig(ys[i - 1])) st.push({a0: y.a, ys: []}); st.at(-1).ys.push(y); });
  const merged = [];
  st.forEach((s, i) => { if (s.ys.length < 2 && st[i + 1]) { st[i + 1].a0 = s.a0; st[i + 1].ys = s.ys.concat(st[i + 1].ys); } else merged.push(s); });
  const balAt = a => { if (a === R && r.atRetire) return grp(r.atRetire.bal, r.atRetire.infl); const x = rows.find(z => z.age === a - 1); return x ? grp(x.bal, endDefl(x)) : [0, 0, 0]; };
  return merged.map(s => {
    const n = s.ys.length, avg = f => s.ys.reduce((t, y) => t + f(y), 0) / n, a1 = s.ys.at(-1).a;
    const src = Object.fromEntries(['nps', 'pen', 'div', 'sell', 'cash'].map(k => [k, avg(y => y.src[k])]));
    const tax = Object.fromEntries(Object.keys(s.ys[0].tax).map(k => [k, avg(y => y.tax[k])]));
    return {a0: s.a0, a1, n, src, tax, unpaid: avg(y => y.unpaid), short: avg(y => y.short), net: avg(y => y.net), b0: balAt(s.a0), b1: balAt(a1 + 1)};
  });
}

// 지금 가진 계좌 안에서 가장 좋은 방법(최적 계산)
function strat(){
  const O = E.optimize(P);
  const nw = o => E.netWealthAt(E.simulate(P, null, Object.assign({uniformRates: true}, o)), P.planAge);
  const all = nw(O);
  const gain = Object.fromEntries(Object.keys(O).map(k => { const o = Object.assign({}, O); delete o[k]; return [k, all - nw(o)]; }));
  return {opt: O, gain, vsBasic: all - nw({}), monthlyBasic: E.sustainableMonthly(P)};
}
function base(){
  const S = strat(), O = S.opt;
  const r = E.simulate(P, null, O), nowAge = P.baseYear - P.birthYear;
  const work = r.rows.filter(x => x.phase === 'work');
  const start = P.accounts.filter(a => a.kind !== '집').reduce((s, a) => s + a.balance, 0);
  const house = P.accounts.filter(a => a.kind === '집').reduce((s, a) => s + a.balance, 0);
  // 모으기: 나이마다 그해 초 잔액(지금 → 은퇴 직전)
  let put = start; const grow = [{age: nowAge, put, bal: start}];
  work.forEach(x => { put += (x.saved + x.refund) / x.infl; grow.push({age: x.age + 1, put, bal: liq(x.bal) / endDefl(x)}); });
  const savedReal = work.reduce((s, y) => s + y.saved / y.infl, 0), refundReal = work.reduce((s, y) => s + y.refund / y.infl, 0);
  const atL = liq(r.atRetire.bal) / r.atRetire.infl, preDebt = grow.at(-1).bal, debtPaid = Math.max(0, preDebt - atL);
  const st = stages(r);
  const row100 = r.rows.find(x => x.age === 100);
  const left100 = row100 ? grp(row100.bal, endDefl(row100)) : [0, 0, 0];
  // 앱의 2% 오차가 얼마였는지(비교용)
  const appAt100 = row100 ? liq(row100.bal) / row100.infl : 0;
  return {nowAge, R, planAge: P.planAge, spend: P.spendMonthly, realRet: (1 + P.returnRate) / (1 + P.inflation) - 1, ret: P.returnRate, infl: P.inflation,
    annualSaving: P.annualSaving, start, house, grow, savedReal, refundReal, preDebt, debtPaid, atL, atG: grp(r.atRetire.bal, r.atRetire.infl),
    lastAge: r.lastAge, maxMonthly: E.sustainableMonthly(P, O), st, left100, appAt100, stockMix, strat: S,
    accts: [...new Set(P.accounts.filter(a => a.kind !== '집' && a.balance > 0).map(a => a.kind))], div: r.rows.filter(x => x.phase === 'retire').map(x => ({a: x.age, div: x.dividend / x.infl, fin: x.finOver}))};
}

// ⑬ 수익률 바꿔 보기, ⑭ 은퇴 직후 하락
function path(r){ return r.rows.filter(x => x.age >= P.baseYear - P.birthYear && x.age <= 100).map(x => ({age: x.age + 1, v: liq(x.bal) / endDefl(x)})); }
function scen(p, opt){
  const r = E.simulate(p, null, opt || {});
  const row100 = r.rows.find(x => x.age === 100);
  return {lastAge: r.lastAge, monthly: E.sustainableMonthly(p, opt || {}), left100: row100 ? liq(row100.bal) / endDefl(row100) : 0,
    atL: liq(r.atRetire.bal) / r.atRetire.infl, path: path(r)};
}
function extras(){
  const rates = [0.04, 0.05, 0.06, 0.07, 0.08].map(x => Object.assign({rate: x}, scen(Object.assign({}, P, {returnRate: x}))));
  const shocks = [{key: 'none', name: '떨어지지 않으면'}, {key: 'early', name: '55세에 주식 −30%', opt: {shock: {age: 55, pct: 0.3}}}, {key: 'late', name: '75세에 주식 −30%', opt: {shock: {age: 75, pct: 0.3}}}]
    .map(s => Object.assign(s, scen(P, s.opt)));
  return {rates, shocks, infl: P.inflation};
}
// 결과 화면 시안: 배당주 비중별로 다시 계산(진짜 엔진 숫자)
function withP(p, fn){ const o = P; P = p; try { return fn(); } finally { P = o; } }
function yearly(r){
  const g0 = [0, 0, 0];
  P.accounts.forEach(a => { const k = /주식|ETF/.test(a.kind) ? 0 : /IRP|연금/.test(a.kind) ? 1 : a.kind === '집' ? -1 : 2; if (k >= 0) g0[k] += a.balance; });
  const out = [{age: P.baseYear - P.birthYear, g: g0}];
  r.rows.filter(x => x.age < 100).forEach(x => out.push({age: x.age + 1, g: x.age + 1 === R ? grp(r.atRetire.bal, r.atRetire.infl) : grp(x.bal, endDefl(x))}));
  return out;
}
function result(){
  const actual = stockMix[0].share;
  return [0, actual, 0.5, 1].map(sh => {
    const p = JSON.parse(JSON.stringify(P));
    if (sh !== actual) p.accounts.forEach(a => { if (/주식|ETF/.test(a.kind)) a.dividendYield = sh * 0.035 + (1 - sh) * 0.006; });
    return withP(p, () => { const b = base(), r = E.simulate(P, null, b.strat.opt);
      return {share: sh, actual: sh === actual, lastAge: b.lastAge, maxMonthly: b.maxMonthly, atL: b.atL, left100: b.left100, st: b.st, yearly: yearly(r), debtPaid: b.debtPaid}; });
  });
}
// 계획 개선하기 시안: 이 예시 / IRP·ISA가 없는 예시
function improveMock(){
  const one = p => withP(p, () => { const im = E.improvements2(P), b = E.simulate(P, null, im.baseOpt);
    let combo = null;
    if (im.list.length > 1) { const fx = Object.fromEntries(im.list.map(x => [x.id, true])), o = E.optimize(P, fx);
      const bU = E.simulate(P, null, Object.assign({uniformRates: true}, im.baseOpt)), rU = E.simulate(P, null, Object.assign({uniformRates: true}, o));
      combo = {opt: o, saving: E.effect(bU, rU), monthlyGain: E.sustainableMonthly(P, o) - im.baseMonthly}; }
    return {accts: [...new Set(P.accounts.filter(a => a.kind !== '집' && a.balance > 0).map(a => a.kind))], baseOpt: im.baseOpt, baseMonthly: im.baseMonthly, lastAge: b.lastAge, list: im.list, combo}; });
  const q = JSON.parse(JSON.stringify(P)), f = q.accounts.find(a => a.kind === '해외주식');
  q.accounts.forEach(a => { if (/IRP|연금|ISA/.test(a.kind)) { f.balance += a.balance; a.balance = 0; } });
  q.accounts = q.accounts.filter(a => a.balance > 0);
  return [one(JSON.parse(JSON.stringify(P))), one(q)];
}
module.exports = {base, extras, result, improveMock};
if (require.main === module) {
  const b = base();
  console.log(JSON.stringify({atL: b.atL, debtPaid: b.debtPaid, preDebt: b.preDebt, saved: b.savedReal, refund: b.refundReal, max: b.maxMonthly, last: b.lastAge, left100: b.left100, appAt100: b.appAt100}, null, 1));
  b.st.forEach(s => console.log(s.a0, s.a1, s.b0.map(v => Math.round(v / 1e4)), s.b1.map(v => Math.round(v / 1e4)), Math.round(s.net)));
  const x = extras(); x.rates.forEach(r => console.log(r.rate, r.lastAge, r.monthly, Math.round(r.left100 / 1e4))); x.shocks.forEach(s => console.log(s.key, s.lastAge, s.monthly, Math.round(s.left100 / 1e4)));
}
