// 은퇴 설계 계산 엔진 (1단계: 혼자 기준)
// - 화면 없이 숫자만 계산한다. 세법 수치는 모두 js/rules.js(RULES)에서 읽는다.
// - 시뮬레이션은 "그해 금액(명목)"으로 돌리고, 화면에 보여 줄 때만 현재 물가 기준으로 바꾼다.
// - 세법의 금액 기준(1,500만, 2,000만, 250만 등)은 앞으로도 지금 법 그대로라고 본다(현행 세법 기준).
// - 국민연금·기초연금 금액과 생활비는 물가만큼 오른다.
// 추정 단순화는 ASSUMPTIONS 에 모아 두고 계산 내역 화면에 그대로 보여 준다.
(function (root) {
'use strict';
const RULES = (typeof root.RULES !== 'undefined') ? root.RULES : require('./rules.js').RULES;
const R = id => { const v = RULES[id]; if (v === undefined) throw new Error('세법 수치 없음: ' + id); return v; };

const BASE_YEAR = 2026;
const LOCAL = R('지방소득세.비율');            // 지방소득세 = 국세의 10%
const MAN = 10000;

const ASSUMPTIONS = [
  '2026년 세법 기준. 세법의 금액 기준은 앞으로도 그대로라고 봐요',
  '국민연금·기초연금·생활비는 물가만큼 올라요',
  '해외주식은 미국 주식으로 보고 배당에서 미국 세금 15%를 떼요',
  '국민연금은 받는 금액 전체를 세금 계산에 넣어요(2002년 전 납부분 비과세는 빼지 않음)',
  '건강보험료는 그해 소득으로 계산해요(실제로는 1~2년 늦게 반영)',
  '건강보험료 재산은 집 공시가격만 넣어요(전월세·대출 공제 미반영)',
  '연금저축·IRP 납입금은 모두 세액공제를 받았다고 봐요',
  '해마다 연초에 꺼내 쓰고, 남은 돈이 한 해 동안 불어난다고 봐요'
];

// ── 공통 도구 ──────────────────────────────────────────────
// 표 형식 [하한, 상한, 비율, 하한까지 누적] 을 따라 누진 계산
function progressive(x, table) {
  if (!(x > 0)) return 0;
  for (const [lo, hi, rate, cum] of table) {
    if (hi === null || x <= hi) return cum + (x - lo) * rate;
  }
  return 0;
}
const clamp0 = x => (x > 0 ? x : 0);

// ── 세금 함수 (모두 원 단위, 한 해 기준) ──────────────────────
// 종합소득세 산출세액(국세)
function incomeTax(base) { return progressive(base, R('소득세.세율표').구간); }

// 연금소득공제 (한도 900만)
function pensionDeduction(gross) {
  const t = R('연금소득공제');
  return Math.min(progressive(gross, t.구간), t.한도);
}

// 연금계좌 연금수령 세율(국세) — 나이별
function pensionAcctRate(age) {
  const t = R('연금계좌.세율');
  return age >= 80 ? t['80세이상'] : age >= 70 ? t['70~79세'] : t['70세미만'];
}

// 종합소득세(지방세 포함) — 연금소득과 금융소득
// pension: 종합과세에 넣는 연금(공적연금 + 종합을 고른 사적연금)
// fin: 이자 + 배당(연 2,000만 넘으면 종합과세), foreignDiv: 그중 해외배당, foreignPaid: 해외에서 낸 세금
function comprehensiveTax({ pension = 0, interest = 0, domesticDiv = 0, foreignDiv = 0, age = 65 }) {
  const fin = interest + domesticDiv + foreignDiv;
  const foreignPaid = foreignDiv * 0.15;
  const wr = R('금융소득.원천징수');
  const pensionAmt = clamp0(pension - pensionDeduction(pension));
  const pd = R('인적공제');
  const personal = pd.기본_1인당 + (age >= 70 ? pd.경로_70세이상 : 0);
  const std = R('표준세액공제').근로소득_없는_종합소득자;
  const limit = R('금융소득.종합과세기준');
  let national, finSeparate = 0;
  if (fin <= limit) {
    const t = incomeTax(clamp0(pensionAmt - personal));
    national = clamp0(t - std);
    // 금융소득은 원천징수로 끝(분리과세). 해외배당은 14% − 외국 세금(이미 15%라 0)
    finSeparate = (interest + domesticDiv) * wr + clamp0(foreignDiv * wr - foreignPaid);
  } else {
    // 2,000만 넘으면 종합과세: 일반산출세액과 비교산출세액 중 큰 것
    const t1 = limit * wr + incomeTax(clamp0(pensionAmt + (fin - limit) - personal));
    const t2 = fin * wr + incomeTax(clamp0(pensionAmt - personal));
    let t = clamp0(Math.max(t1, t2) - std);
    const totalIncome = pensionAmt + fin;
    const credit = totalIncome > 0 ? Math.min(foreignPaid, t * foreignDiv / totalIncome) : 0;
    national = clamp0(t - credit);
  }
  const nat = national + finSeparate;
  return { national: nat, local: nat * LOCAL, total: nat * (1 + LOCAL), foreignPaid };
}

// 연금계좌에서 꺼낸 돈의 세금(지방세 포함)
// inLimit: 연금수령 한도 안에서 꺼낸 돈, outLimit: 한도를 넘어 꺼낸 돈(연금외수령 16.5%)
// publicPension 등은 1,500만 초과 시 종합과세가 유리한지 비교하려고 받는다
function privatePensionTax({ inLimit = 0, outLimit = 0, age, publicPension = 0, interest = 0, domesticDiv = 0, foreignDiv = 0 }) {
  const sep = R('연금계좌.분리과세기준');
  const outTax = outLimit * R('연금계좌.세율').연금외수령 * (1 + LOCAL);
  if (inLimit <= sep.기준) {
    return { tax: inLimit * pensionAcctRate(age) * (1 + LOCAL) + outTax, method: '저율', outTax };
  }
  // 1,500만 초과: 전체 16.5% 분리과세 vs 다른 소득과 합쳐 종합과세 중 적은 것
  const separate = inLimit * sep.초과시_분리과세율 * (1 + LOCAL);
  const base = comprehensiveTax({ pension: publicPension, interest, domesticDiv, foreignDiv, age }).total;
  const merged = comprehensiveTax({ pension: publicPension + inLimit, interest, domesticDiv, foreignDiv, age }).total - base;
  return separate <= merged
    ? { tax: separate + outTax, method: '분리과세', outTax }
    : { tax: merged + outTax, method: '종합과세', outTax };
}

// 해외주식 양도소득세(지방세 포함): 이익 합계에서 250만 빼고 22%
function foreignStockTax(gain) {
  return clamp0(gain - R('주식.기본공제')) * R('주식.해외세율').일반 * (1 + LOCAL);
}

// 연금계좌 연간 연금수령 한도 (연차 11년부터 없음)
function pensionAnnualLimit(balance, yearNo) {
  const t = R('연금계좌.수령요건');
  if (yearNo >= t.한도없음_연차) return Infinity;
  return balance / (11 - yearNo) * 1.2;
}

// ── 건강보험료 (지역가입자, 장기요양 포함, 한 해) ──────────────
// 집 공시가격 → 재산세 과세표준 → 1억 공제 → 등급 점수 × 점수당 금액
function housePropertyBase(price) {
  const r = R('재산세.공정시장가액비율');
  const ratio = price <= 3e8 ? r['1세대1주택_3억이하'] : price <= 6e8 ? r['1세대1주택_6억이하'] : r['1세대1주택_6억초과'];
  return price * ratio;
}
function healthPropertyMonthly(price) {
  if (!(price > 0)) return 0;
  const base = housePropertyBase(price) - R('건보.재산').기본공제;
  if (base <= 0) return 0;
  const man = base / MAN;
  const table = R('건보.재산점수표').표;
  let score = table[table.length - 1][3];
  for (const [, lo, hi, s] of table) { if (hi === null || man <= hi) { score = s; break; } }
  return score * R('건보.재산').점수당_금액;
}
function healthInsurance({ publicPension = 0, wage = 0, business = 0, interest = 0, dividend = 0, housePrice = 0 }) {
  const ev = R('건보.지역.소득평가');
  const rate = R('건강보험.요율');
  const lim = R('건강보험.상한하한');
  const fin = interest + dividend;
  const income = publicPension * 0.5 + wage * 0.5 + business + (fin > ev.금융소득_미반영_이하 ? fin : 0);
  const incomeMonthly = Math.max(income / 12 * rate, lim.지역_하한);
  const propMonthly = healthPropertyMonthly(housePrice);
  const hi = Math.min(incomeMonthly + propMonthly, lim.보수외소득_및_지역_상한);
  const ltc = hi * R('장기요양.요율').건보료_대비_비율;
  return { monthly: hi + ltc, annual: (hi + ltc) * 12, incomePart: incomeMonthly, propertyPart: propMonthly, finCounted: fin > ev.금융소득_미반영_이하 };
}

// ── 집 보유세 (1세대 1주택) ─────────────────────────────────
function propertyTax(price) {
  if (!(price > 0)) return 0;
  const base = housePropertyBase(price);
  const special = price <= 9e8;   // 1세대 1주택 특례세율: 시가표준액 9억 이하
  const main = progressive(base, (special ? R('재산세.세율_1주택특례') : R('재산세.세율_일반주택')).구간);
  const sub = R('재산세.부가세목');
  return main + base * sub.도시지역분_세율 + main * sub.지방교육세_재산세대비;
}
// 실제 종부세 계산 (1세대 1주택, 추정)
function jongbuTax(price, { age = 60, holdYears = 0 } = {}) {
  const p = R('종부세.과세표준');
  const base = (price - p.기본공제_1세대1주택) * p.공정시장가액비율;
  if (base <= 0) return 0;
  let tax = progressive(base, R('종부세.세율')['2주택이하']);
  // 재산세 중복분 공제(추정): 재산세 × (종부 과표분 재산세 상당액 ÷ 전체 재산세 상당액)
  const pr = R('재산세.공정시장가액비율')['1세대1주택_6억초과'];
  const full = progressive(price * pr, R('재산세.세율_일반주택').구간);
  const part = base * pr * 0.004;
  const mainProp = progressive(housePropertyBase(price), R('재산세.세율_일반주택').구간);
  if (full > 0) tax = clamp0(tax - mainProp * Math.min(1, part / full));
  const c = R('종부세.공제와상한');
  const old = age >= 70 ? c.고령['70~'] : age >= 65 ? c.고령['65~69'] : age >= 60 ? c.고령['60~64'] : 0;
  const hold = holdYears >= 15 ? c.장기보유['15~'] : holdYears >= 10 ? c.장기보유['10~14'] : holdYears >= 5 ? c.장기보유['5~9'] : 0;
  tax *= (1 - Math.min(old + hold, c.공제합계_최대));
  return tax * (1 + c.농특세);
}

// ── 국민연금 자동 계산(추정) ────────────────────────────────
// 오늘 돈 기준 월 금액. B = 본인 월소득(오늘 기준, 상하한 적용), years = 총 가입 연수
// 가입 기간은 endYear 에서 거꾸로 이어서 냈다고 본다.
function npsConstant(year) {
  if (year >= 2026) return { c: 1.29 };
  if (year >= 2009) return { c: 1.485 - 0.015 * (year - 2009) };
  if (year === 2008) return { c: 1.5 };
  if (year >= 1999) return { c: 1.8 };
  return { c: 2.4, old: true };   // 1988~1998: 2.4 × (A + 0.75B)
}
function npsClaimAge(birthYear) {
  const t = R('국민연금.수급나이');
  if (birthYear >= 1969) return t['1969~'];
  for (const k of Object.keys(t)) {
    const [a, b] = k.split('~').map(Number);
    if (b && birthYear >= a && birthYear <= b) return t[k];
  }
  return 65;
}
function npsEstimate({ birthYear, years, monthlyIncome, endYear, startAge }) {
  if (!(years >= 10)) return 0;
  const lim = R('국민연금.기준소득월액');
  const A = R('국민연금.A값')['2026'];
  const B = Math.min(Math.max(monthlyIncome, lim.하한), lim.상한);
  const from = endYear - years + 1;
  let sum = 0;
  for (let y = from; y <= endYear; y++) {
    const k = npsConstant(y);
    sum += k.old ? k.c * (A + 0.75 * B) : k.c * (A + B);
  }
  let annual = sum / years;   // Σ 상수 × (A+B) × P_k/P
  // n = 20년 넘는 개월 수 → (1 + 0.05 × n ÷ 12), 10~20년은 0.5 + 0.05 × (연수 − 10)
  if (years >= 20) annual *= 1 + 0.05 * ((years - 20) * 12) / 12;
  else annual *= 0.5 + 0.05 * (years - 10);
  const claim = npsClaimAge(birthYear);
  const s = startAge || claim;
  if (s < claim) {
    annual *= R('국민연금.조기수령')[Math.min(5, claim - s) + '년'];   // 1년 당길 때마다 6%씩 줄어듦
  } else if (s > claim) {
    annual *= 1 + Math.min(5, s - claim) * 12 * R('국민연금.연기수령')['1개월당_가산'];
  }
  return annual / 12;
}

// ── 기초연금(추정, 단독) ───────────────────────────────────
// 월 금액(그해 명목). infl = 2026년 대비 물가 배수(기준연금액·선정기준액은 해마다 물가만큼 오름)
function basicPension({ npsMonthly, housePrice, financial, region = '대도시', infl = 1 }) {
  const conv = R('기초연금.재산소득환산');
  const prop = clamp0(housePrice - conv.기본재산액[region] * infl) + clamp0(financial - conv.금융재산_공제 * infl);
  const recognized = npsMonthly + prop * conv.소득환산율_연 / 12;
  if (recognized > R('기초연금.선정기준액').단독 * infl) return 0;
  const base = R('기초연금.기준연금액') * infl;
  const aBenefit = npsMonthly / 2;   // A급여액 ≈ 국민연금의 절반(추정)
  return Math.min(base, clamp0(base - aBenefit * 2 / 3) + base / 2);
}

// ── 계좌 정리 ─────────────────────────────────────────────
// 입력 계좌 종류 → 계산 묶음
const KIND = { '해외주식': 'foreign', '국내주식': 'domestic', '연금저축': 'pension', 'IRP': 'pension', 'ISA': 'isa', '현금': 'cash', '기타': 'cash', '집': 'house' };

function makeBuckets(accounts, defRate, cashRate) {
  const b = {
    cash: { bal: 0, rate: cashRate },
    isa: { bal: 0, basis: 0, rate: defRate },
    foreign: { bal: 0, basis: 0, rate: defRate, div: 0 },
    domestic: { bal: 0, rate: defRate, div: 0 },
    pension: { bal: 0, rate: defRate, yearNo: 0 },
    house: { price: 0, publicPrice: 0 }
  };
  const w = { foreign: 0, domestic: 0, isa: 0, pension: 0 };
  const rw = { foreign: 0, domestic: 0, isa: 0, pension: 0, cash: 0 };
  for (const a of accounts) {
    const k = KIND[a.kind];
    if (!k) continue;
    if (k === 'house') { b.house.price += a.balance; b.house.publicPrice += a.publicPrice || a.balance * 0.7; continue; }
    const x = b[k];
    x.bal += a.balance;
    if (a.rate != null) rw[k] += a.rate * a.balance;
    if (k === 'foreign') { x.basis += a.principal != null ? a.principal : a.balance; w.foreign += (a.dividendYield || 0) * a.balance; }
    if (k === 'domestic') w.domestic += (a.dividendYield || 0) * a.balance;
    if (k === 'isa') x.basis += a.principal != null ? a.principal : a.balance;
  }
  for (const k of ['foreign', 'domestic', 'isa', 'pension', 'cash']) {
    if (b[k].bal > 0 && rw[k] > 0) b[k].rate = rw[k] / b[k].bal;
  }
  if (b.foreign.bal > 0) b.foreign.div = w.foreign / b.foreign.bal;
  if (b.domestic.bal > 0) b.domestic.div = w.domestic / b.domestic.bal;
  return b;
}
const liquid = b => b.cash.bal + b.isa.bal + b.foreign.bal + b.domestic.bal + b.pension.bal;

// ── 한 해 꺼내 쓰기 ────────────────────────────────────────
// 기본 순서: 현금 → ISA → 해외주식 → 국내주식 → 연금저축·IRP(55세부터)
const ORDER_BASIC = ['cash', 'isa', 'foreign', 'domestic', 'pension'];

function drawPlan(b, need, age, order, isaFreeLeft) {
  // need 만큼 순서대로 꺼낸다. 실제로 꺼내지는 않고 계획만 돌려준다.
  const take = { cash: 0, isa: 0, foreign: 0, domestic: 0, pensionIn: 0, pensionOut: 0 };
  let left = need, gainF = 0, gainIsa = 0;
  for (const k of order) {
    if (left <= 0) break;
    if (k === 'pension') {
      if (age < R('연금계좌.수령요건').최소나이) continue;
      const p = b.pension;
      const lim = pensionAnnualLimit(p.bal, p.yearNo + 1);
      const inL = Math.min(left, p.bal, lim);
      take.pensionIn = inL; left -= inL;
      const outL = Math.min(left, p.bal - inL);
      take.pensionOut = outL; left -= outL;
      continue;
    }
    const x = b[k];
    const t = Math.min(left, x.bal);
    if (t <= 0) continue;
    take[k] = t; left -= t;
    if (k === 'foreign') gainF = t * (1 - x.basis / x.bal);
    if (k === 'isa') gainIsa = t * (1 - x.basis / x.bal);
  }
  return { take, short: clamp0(left), gainF, gainIsaTaxable: clamp0(gainIsa - isaFreeLeft), gainIsa };
}

// 그해 세금·건보료 전체
function yearTax({ age, publicPension, interest, domesticDiv, foreignDiv, plan, housePrice, publicPrice, holdYears, retired }) {
  const pp = privatePensionTax({ inLimit: plan.take.pensionIn, outLimit: plan.take.pensionOut, age, publicPension, interest, domesticDiv, foreignDiv });
  const merged = pp.method === '종합과세';
  const ct = comprehensiveTax({ pension: publicPension + (merged ? plan.take.pensionIn : 0), interest, domesticDiv, foreignDiv, age });
  const pensionAcct = merged ? pp.outTax : pp.tax;
  const ft = foreignStockTax(plan.gainF);
  const isaTax = plan.gainIsaTaxable * R('ISA').초과분_세율 * (1 + LOCAL);
  const hi = retired ? healthInsurance({ publicPension, interest, dividend: domesticDiv + foreignDiv, housePrice: publicPrice }) : { annual: 0 };
  const prop = propertyTax(publicPrice) + jongbuTax(publicPrice, { age, holdYears });
  // 종합소득세 안에 해외배당 외국 세금은 없으므로 따로 더한다
  const parts = {
    pensionAcct,
    income: ct.total,           // 국민연금·금융소득(종합과세분 포함, 분리과세 원천징수 포함)
    foreignDivTax: ct.foreignPaid,
    stock: ft,
    isa: isaTax,
    health: hi.annual,
    house: prop
  };
  const total = Object.values(parts).reduce((s, v) => s + v, 0);
  return { parts, total, method: pp.method, healthFin: hi.finCounted };
}

// ── 전체 시뮬레이션 ───────────────────────────────────────
// p: {
//   birthYear, retireAge, planAge(95), spendMonthly(오늘 물가, 원), inflation(0.02), returnRate(0.06), cashRate(0.02),
//   annualSaving(오늘 물가, 원/년), savingGrowth(기본 = 물가), houseGrowth(기본 = 물가), holdYears,
//   accounts: [{kind, balance, rate?, dividendYield?, principal?, publicPrice?}],
//   nps: {mode:'direct', monthly(오늘 돈), startAge} | {mode:'auto', years, monthlyIncome, startAge},
//   region('대도시'), order(기본 순서)
// }
function normalize(p) {
  const q = Object.assign({ planAge: 95, inflation: 0.02, returnRate: 0.06, cashRate: 0.02, annualSaving: 0, holdYears: 0, region: '대도시', order: ORDER_BASIC, endAge: 100 }, p);
  if (q.savingGrowth == null) q.savingGrowth = q.inflation;
  if (q.houseGrowth == null) q.houseGrowth = q.inflation;
  const claim = npsClaimAge(q.birthYear);
  const n = q.nps || { mode: 'direct', monthly: 0 };
  q.npsStart = n.startAge || claim;
  if (n.mode === 'auto') {
    const endYear = q.birthYear + Math.min(q.retireAge, 60) - 1;
    q.npsMonthly = npsEstimate({ birthYear: q.birthYear, years: n.years, monthlyIncome: n.monthlyIncome, endYear, startAge: q.npsStart });
  } else q.npsMonthly = n.monthly || 0;
  return q;
}

function simulate(p0, spendOverride) {
  const p = normalize(p0);
  const spend = spendOverride != null ? spendOverride : p.spendMonthly;
  const b = makeBuckets(p.accounts || [], p.returnRate, p.cashRate);
  const nowAge = BASE_YEAR - p.birthYear;
  const rows = [];
  let isaFreeLeft = R('ISA').비과세_일반;
  let depletedAge = null;
  let atRetire = null;
  for (let age = nowAge; age <= p.endAge; age++) {
    const t = age - nowAge;                      // 2026년부터 지난 해 수
    const infl = Math.pow(1 + p.inflation, t);
    const housePrice = b.house.price * Math.pow(1 + p.houseGrowth, t);
    const publicPrice = b.house.publicPrice * Math.pow(1 + p.houseGrowth, t);
    if (age < p.retireAge) {
      // 일하는 동안: 불리고(배당은 외국 세금 15% 떼고 재투자), 연말에 저축을 더한다
      b.cash.bal *= 1 + b.cash.rate * (1 - R('금융소득.원천징수') * (1 + LOCAL));
      b.isa.bal *= 1 + b.isa.rate;
      b.foreign.bal *= 1 + b.foreign.rate - b.foreign.div * 0.15;
      b.domestic.bal *= 1 + b.domestic.rate - b.domestic.div * R('금융소득.원천징수') * (1 + LOCAL);
      b.pension.bal *= 1 + b.pension.rate;
      const save = p.annualSaving * Math.pow(1 + p.savingGrowth, t);
      addSaving(b, save);
      rows.push({ age, year: BASE_YEAR + t, phase: 'work', infl, bal: snapshot(b), housePrice });
      continue;
    }
    if (!atRetire) atRetire = { age, infl, bal: snapshot(b), housePrice };
    const retired = true;
    const need = spend * 12 * infl;
    const publicPension = age >= p.npsStart ? p.npsMonthly * 12 * infl : 0;
    const interest = b.cash.bal * b.cash.rate;
    const foreignDiv = b.foreign.bal * b.foreign.div;
    const domesticDiv = b.domestic.bal * b.domestic.div;
    const financial = liquid(b);
    const basic = age >= 65 ? basicPension({ npsMonthly: publicPension / 12, housePrice: publicPrice, financial, region: p.region, infl }) * 12 : 0;
    const income = publicPension + interest + foreignDiv + domesticDiv + basic;
    // 세금을 포함해 모자라는 돈을 맞출 때까지 반복
    let draw = 0, plan, tax;
    for (let i = 0; i < 40; i++) {
      plan = drawPlan(b, draw, age, p.order, isaFreeLeft);
      tax = yearTax({ age, publicPension, interest, domesticDiv, foreignDiv, plan, housePrice, publicPrice, holdYears: p.holdYears + t, retired });
      const want = clamp0(need + tax.total - income);
      if (Math.abs(want - draw) < 1) { draw = want; break; }
      draw = want;
    }
    plan = drawPlan(b, draw, age, p.order, isaFreeLeft);
    tax = yearTax({ age, publicPension, interest, domesticDiv, foreignDiv, plan, housePrice, publicPrice, holdYears: p.holdYears + t, retired });
    const surplus = income - need - tax.total;
    const short = plan.short;
    // 실제로 꺼낸다
    const tk = plan.take;
    if (tk.foreign > 0) { b.foreign.basis *= 1 - tk.foreign / b.foreign.bal; }
    if (tk.isa > 0) { b.isa.basis *= 1 - tk.isa / b.isa.bal; isaFreeLeft = clamp0(isaFreeLeft - plan.gainIsa); }
    b.cash.bal -= tk.cash; b.isa.bal -= tk.isa; b.foreign.bal -= tk.foreign; b.domestic.bal -= tk.domestic;
    if (tk.pensionIn + tk.pensionOut > 0) { b.pension.bal -= tk.pensionIn + tk.pensionOut; b.pension.yearNo += 1; }
    if (surplus > 0) b.cash.bal += surplus;      // 남는 돈은 현금으로 모은다
    for (const k of ['cash', 'isa', 'foreign', 'domestic', 'pension']) if (b[k].bal < 1) b[k].bal = 0;
    const row = {
      age, year: BASE_YEAR + t, phase: 'retire', infl, housePrice,
      need, publicPension, basicPension: basic, interest, foreignDiv, domesticDiv,
      take: tk, tax: tax.parts, taxTotal: tax.total, pensionMethod: tax.method, healthFin: tax.healthFin,
      short, bal: null
    };
    if (short > 1 && depletedAge === null) depletedAge = age;
    // 남은 돈 불리기 (배당·이자는 이미 꺼내 썼으므로 가격 상승분만)
    b.isa.bal *= 1 + b.isa.rate;
    b.foreign.bal *= 1 + b.foreign.rate - b.foreign.div;
    b.domestic.bal *= 1 + b.domestic.rate - b.domestic.div;
    b.pension.bal *= 1 + b.pension.rate;
    row.bal = snapshot(b);
    rows.push(row);
  }
  const lastAge = depletedAge === null ? p.endAge + 1 : depletedAge - 1;   // 101 = 100세 이상
  return { params: p, rows, atRetire, lastAge, ok: lastAge >= p.planAge };
}

function addSaving(b, amount) {
  // 저축은 지금 자산 비율대로 나눠 넣는다(집 제외)
  const keys = ['cash', 'isa', 'foreign', 'domestic', 'pension'];
  const tot = keys.reduce((s, k) => s + b[k].bal, 0);
  for (const k of keys) {
    const share = tot > 0 ? b[k].bal / tot : (k === 'cash' ? 1 : 0);
    const add = amount * share;
    b[k].bal += add;
    if (k === 'foreign' || k === 'isa') b[k].basis += add;
  }
}
function snapshot(b) {
  return { cash: b.cash.bal, isa: b.isa.bal, foreign: b.foreign.bal, domestic: b.domestic.bal, pension: b.pension.bal };
}

// 계획 나이까지 버틸 수 있는 가장 큰 월 생활비(현재 물가 기준)
function sustainableMonthly(p0) {
  const p = normalize(p0);
  let lo = 0, hi = 5e7;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = simulate(p0, mid);
    if (r.lastAge >= p.planAge) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}

// 화면용 요약(현재 물가 기준)
function summary(p0) {
  const r = simulate(p0);
  const p = r.params;
  const real = (v, infl) => v / infl;
  const ar = r.atRetire;
  const liquidAt = ar ? Object.values(ar.bal).reduce((s, v) => s + v, 0) : 0;
  const retireRows = r.rows.filter(x => x.phase === 'retire' && x.age <= Math.min(r.lastAge, p.planAge));
  const taxReal = retireRows.reduce((s, x) => s + real(x.taxTotal, x.infl), 0);
  return {
    retireAge: p.retireAge, planAge: p.planAge, lastAge: r.lastAge, ok: r.ok,
    npsMonthly: p.npsMonthly, npsStart: p.npsStart,
    assetAtRetire: ar ? real(liquidAt + ar.housePrice, ar.infl) : 0,
    liquidAtRetire: ar ? real(liquidAt, ar.infl) : 0,
    sustainableMonthly: sustainableMonthly(p0),
    totalTax: taxReal,
    rows: r.rows
  };
}

const api = {
  BASE_YEAR, ASSUMPTIONS, ORDER_BASIC,
  progressive, incomeTax, pensionDeduction, pensionAcctRate, comprehensiveTax, privatePensionTax,
  foreignStockTax, pensionAnnualLimit, housePropertyBase, healthPropertyMonthly, healthInsurance,
  propertyTax, jongbuTax, npsEstimate, npsClaimAge, basicPension,
  simulate, sustainableMonthly, summary
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Retire = api;
})(typeof window !== 'undefined' ? window : globalThis);
