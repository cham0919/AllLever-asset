// 은퇴 설계 계산 엔진 (1단계: 혼자 기준)
// - 화면 없이 숫자만 계산한다. 세법 수치는 모두 js/rules.js(RULES)에서 읽는다.
// - 시뮬레이션은 "그해 금액(명목)"으로 돌리고, 화면에 보여 줄 때만 현재 물가 기준으로 바꾼다.
// - 세법의 금액 기준(1,500만, 2,000만, 250만 등)은 앞으로도 지금 법 그대로라고 본다(현행 세법 기준).
// - 국민연금·기초연금 금액과 생활비는 물가만큼 오른다.
// 추정 단순화는 ASSUMPTIONS 에 모아 두고 계산 내역 화면에 그대로 보여 준다.
(function (root) {
'use strict';
// 브라우저: js/rules.js 가 만든 전역 RULES(const라 window에는 없음) / node: require
const RULES_ = (typeof RULES !== 'undefined') ? RULES : require('./rules.js').RULES;
const R = id => { const v = RULES_[id]; if (v === undefined) throw new Error('세법 수치 없음: ' + id); return v; };

const BASE_YEAR = 2026;   // 세법 기준 연도. 시간 계산의 시작 연도는 p.baseYear(앱은 올해)로 따로 받는다
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
  '해마다 연초에 꺼내 쓰고, 남은 돈이 한 해 동안 불어난다고 봐요',
  '세금 합계에는 계획 나이에 남은 돈을 한꺼번에 찾을 때의 세금도 넣어요',
  '부부는 같은 해에 은퇴하고, 생활비는 함께 써요',
  '쓰고 남는 돈은 해외주식에 다시 넣어요(해외주식이 없으면 현금)',
  '빚은 가계부 상환액만큼 해마다 줄고, 은퇴할 때 남은 빚은 모아 둔 돈으로 갚아요'
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

// 부부 기초연금(월, 한 사람당 금액 배열). 둘 다 받으면 각각 20% 감액
function basicPensionCouple({ npsMonthly, eligible, housePrice, financial, region = '대도시', infl = 1 }) {
  const conv = R('기초연금.재산소득환산');
  const prop = clamp0(housePrice - conv.기본재산액[region] * infl) + clamp0(financial - conv.금융재산_공제 * infl);
  const recognized = npsMonthly[0] + npsMonthly[1] + prop * conv.소득환산율_연 / 12;
  if (recognized > R('기초연금.선정기준액').부부 * infl) return [0, 0];
  const base = R('기초연금.기준연금액') * infl;
  const each = npsMonthly.map((n, i) => eligible[i] ? Math.min(base, clamp0(base - n / 2 * 2 / 3) + base / 2) : 0);
  const both = eligible[0] && eligible[1];
  const cut = both ? 1 - R('기초연금.산정').부부_동시수급_감액 : 1;
  return each.map(v => v * cut);
}

// ── 계좌 정리 ─────────────────────────────────────────────
// 입력 계좌 종류 → 계산 묶음
// 국내상장 해외ETF: 국내 증권사에서 산 해외지수 ETF. 팔아서 남긴 이익도 배당소득(15.4%)이고 금융소득에 들어간다.
const KIND = {
  '해외주식': 'foreign', '국내주식': 'domestic', '국내상장 해외ETF': 'kretf',
  '연금저축': 'pension', 'IRP': 'pension', 'ISA': 'isa', '현금': 'cash', '기타': 'cash', '집': 'house'
};
const LIQ = ['cash', 'isa', 'foreign', 'domestic', 'kretf', 'pension'];

function emptyBuckets(defRate, cashRate) {
  return {
    cash: { bal: 0, rate: cashRate },
    isa: { bal: 0, basis: 0, rate: defRate },
    foreign: { bal: 0, basis: 0, rate: defRate, div: 0 },
    domestic: { bal: 0, rate: defRate, div: 0 },
    kretf: { bal: 0, basis: 0, rate: defRate, div: 0 },
    pension: { bal: 0, rate: defRate, yearNo: 0 }
  };
}
// 계좌를 사람별 묶음으로. owner: '나' | '배우자' | '공동'(반씩). 혼자면 모두 나.
function makePeople(accounts, defRate, cashRate, couple) {
  const bs = [emptyBuckets(defRate, cashRate), emptyBuckets(defRate, cashRate)];
  const house = { price: 0, publicPrice: 0 };
  const acc = bs.map(() => ({ rate: {}, rb: {}, w: {} }));   // rate: 수익률×잔액 합, rb: 수익률을 넣은 잔액
  for (const a of accounts) {
    const k = KIND[a.kind];
    if (!k) continue;
    if (k === 'house') { house.price += a.balance; house.publicPrice += a.publicPrice || a.balance * 0.7; continue; }
    const shares = !couple || !a.owner || a.owner === '나' ? [1, 0] : a.owner === '배우자' ? [0, 1] : [0.5, 0.5];
    shares.forEach((sh, i) => {
      if (!sh) return;
      const x = bs[i][k], bal = a.balance * sh;
      x.bal += bal;
      if (a.rate != null) { acc[i].rate[k] = (acc[i].rate[k] || 0) + a.rate * bal; acc[i].rb[k] = (acc[i].rb[k] || 0) + bal; }
      if ('div' in x) acc[i].w[k] = (acc[i].w[k] || 0) + (a.dividendYield || 0) * bal;
      if ('basis' in x) x.basis += (a.principal != null ? a.principal : a.balance) * sh;
    });
  }
  bs.forEach((b, i) => {
    for (const k of LIQ) {
      // 수익률을 넣은 계좌는 그 값, 안 넣은 계좌는 기본값으로 잔액 가중 평균(0%도 넣은 값으로 본다)
      if (b[k].bal > 0 && acc[i].rb[k]) b[k].rate = (acc[i].rate[k] + b[k].rate * (b[k].bal - acc[i].rb[k])) / b[k].bal;
      if ('div' in b[k] && b[k].bal > 0) b[k].div = (acc[i].w[k] || 0) / b[k].bal;
    }
  });
  return { bs: couple ? bs : [bs[0]], house };
}
const liquidOf = b => LIQ.reduce((s, k) => s + b[k].bal, 0);

// ── 한 해 꺼내 쓰기 계획 ───────────────────────────────────
// 기본 순서: 현금 → ISA → 해외주식 → 국내상장 해외ETF → 국내주식 → 연금저축·IRP(55세부터)
const ORDER_BASIC = ['cash', 'isa', 'foreign', 'kretf', 'domestic', 'pension'];

function drawPlan(ppl, need, ages, order, opt) {
  const n = ppl.length;
  const take = ppl.map(() => ({ cash: 0, isa: 0, foreign: 0, domestic: 0, kretf: 0, pensionIn: 0, pensionOut: 0 }));
  let left = need;
  const minAge = R('연금계좌.수령요건').최소나이;
  const limits = ppl.map((pp, i) => pensionAnnualLimit(pp.b.pension.bal, pp.b.pension.yearNo + 1));
  // 개선 1: 연금계좌에서 해마다 한 사람 1,500만까지 꼭 꺼낸다(낮은 세율 구간을 해마다 채움). 쓰고 남으면 현금으로 모은다
  if (opt.pensionEarly) {
    const cap = R('연금계좌.분리과세기준').기준;
    for (let i = 0; i < n; i++) {
      if (ages[i] < Math.max(minAge, opt.pensionEarlyAge || 0)) continue;
      const t = Math.min(cap, limits[i], ppl[i].b.pension.bal);
      take[i].pensionIn += t; left -= t;
    }
  }
  for (const k of order) {
    if (left <= 0) break;
    if (k === 'pension') {
      for (let i = 0; i < n && left > 0; i++) {
        if (ages[i] < minAge) continue;
        const p = ppl[i].b.pension;
        const roomIn = clamp0(Math.min(limits[i], p.bal) - take[i].pensionIn);
        const inL = Math.min(left, roomIn); take[i].pensionIn += inL; left -= inL;
        const roomOut = clamp0(p.bal - take[i].pensionIn - take[i].pensionOut);
        const outL = Math.min(left, roomOut); take[i].pensionOut += outL; left -= outL;
      }
      continue;
    }
    const avail = ppl.reduce((s, pp) => s + pp.b[k].bal, 0);
    const t = Math.min(left, avail);
    if (t <= 0) continue;
    ppl.forEach((pp, i) => { take[i][k] += t * pp.b[k].bal / avail; });
    left -= t;
  }
  const gain = take.map((tk, i) => {
    const b = ppl[i].b;
    const g = k => (tk[k] > 0 && b[k].bal > 0 ? tk[k] * (1 - b[k].basis / b[k].bal) : 0);
    return { foreign: g('foreign'), isa: g('isa'), kretf: clamp0(g('kretf')) };
  });
  const taken = take.reduce((s, tk) => s + tk.cash + tk.isa + tk.foreign + tk.domestic + tk.kretf + tk.pensionIn + tk.pensionOut, 0);
  return { take, gain, short: clamp0(left), taken };
}

// 한 사람의 그해 세금(건보료·보유세 제외)
function personTax({ age, publicPension, interest, domesticDiv, foreignDiv, take, gain, isaFreeLeft }) {
  const finDomestic = domesticDiv + gain.kretf;          // 국내상장 해외ETF 매매차익은 배당소득
  const pp = privatePensionTax({ inLimit: take.pensionIn, outLimit: take.pensionOut, age, publicPension, interest, domesticDiv: finDomestic, foreignDiv });
  const merged = pp.method === '종합과세';
  const ct = comprehensiveTax({ pension: publicPension + (merged ? take.pensionIn : 0), interest, domesticDiv: finDomestic, foreignDiv, age });
  const isaTaxable = clamp0(gain.isa - isaFreeLeft);
  const parts = {
    pensionAcct: merged ? pp.outTax : pp.tax,
    income: ct.total,
    foreignDivTax: ct.foreignPaid,
    stock: foreignStockTax(gain.foreign),
    isa: isaTaxable * R('ISA').초과분_세율 * (1 + LOCAL)
  };
  return { parts, method: pp.method, fin: interest + finDomestic + foreignDiv };
}

// ── 전체 시뮬레이션 ───────────────────────────────────────
// p: {
//   birthYear, retireAge, planAge(95), spendMonthly(현재 물가, 원), inflation(0.02), returnRate(0.06), cashRate(0.02),
//   annualSaving(현재 물가, 원/년), savingGrowth(기본 = 물가), houseGrowth(기본 = 물가), holdYears, region('대도시'),
//   accounts: [{kind, balance, owner?, rate?, dividendYield?, principal?, publicPrice?}],
//   nps: {mode:'direct', monthly, startAge} | {mode:'auto', years, monthlyIncome, startAge},
//   spouse?: {birthYear, nps}
// }
// opt(개선 방법): {pensionEarly, harvest, giftToSpouse, noDividend}
function normalize(p) {
  const q = Object.assign({ planAge: 95, inflation: 0.02, returnRate: 0.06, cashRate: 0.02, annualSaving: 0, debt: 0, annualRepay: 0, holdYears: 0, region: '대도시', order: ORDER_BASIC, endAge: 100, baseYear: BASE_YEAR }, p);
  if (q.retireAge < q.baseYear - q.birthYear) q.retireAge = q.baseYear - q.birthYear;   // 이미 은퇴했으면 올해부터
  if (q.savingGrowth == null) q.savingGrowth = q.inflation;
  if (q.houseGrowth == null) q.houseGrowth = q.inflation;
  const npsOf = (birthYear, nps, retireAge) => {
    const n = nps || { mode: 'direct', monthly: 0 };
    const start = n.startAge || npsClaimAge(birthYear);
    if (n.mode === 'auto') {
      const endYear = birthYear + Math.min(retireAge, 60) - 1;
      return { start, monthly: npsEstimate({ birthYear, years: n.years, monthlyIncome: n.monthlyIncome, endYear, startAge: start }) };
    }
    return { start, monthly: n.monthly || 0 };
  };
  const me = npsOf(q.birthYear, q.nps, q.retireAge);
  q.npsMonthly = me.monthly; q.npsStart = me.start;
  q.persons = [{ birthYear: q.birthYear, npsMonthly: me.monthly, npsStart: me.start }];
  if (q.spouse && q.spouse.birthYear) {
    const spRetire = q.retireAge + (q.birthYear - q.spouse.birthYear);   // 같은 해에 은퇴한다고 본다
    const sp = npsOf(q.spouse.birthYear, q.spouse.nps, spRetire);
    q.persons.push({ birthYear: q.spouse.birthYear, npsMonthly: sp.monthly, npsStart: sp.start });
  }
  return q;
}

function simulate(p0, spendOverride, opt = {}) {
  const p = normalize(p0);
  const couple = p.persons.length === 2;
  const spend = spendOverride != null ? spendOverride : p.spendMonthly;
  const { bs, house } = makePeople(p.accounts || [], p.returnRate, p.cashRate, couple);
  const ppl = p.persons.map((x, i) => Object.assign({ b: bs[i], isaFreeLeft: R('ISA').비과세_일반 }, x));
  // 세금 효과만 보려고 비교할 때는 현금 빼고 모든 계좌 수익률을 같은 평균으로 맞춘다
  if (opt.uniformRates) {
    let w = 0, t = 0;
    for (const pp of ppl) for (const k of LIQ) if (k !== 'cash') { w += pp.b[k].bal; t += pp.b[k].bal * pp.b[k].rate; }
    const avg = w > 0 ? t / w : p.returnRate;
    for (const pp of ppl) for (const k of LIQ) if (k !== 'cash') pp.b[k].rate = avg;
  }
  const harvestCap = R('주식.기본공제');
  const notes = [];
  // 개선 3: 해외주식 절반을 배우자 이름으로(증여 시점 가격이 새 원금이 됨, 10년 6억까지 증여세 없음)
  if (opt.giftToSpouse && couple) {
    const f = ppl[0].b.foreign;
    const move = Math.min(f.bal / 2, 6e8);
    if (move > 0) {
      const ratio = move / f.bal;
      f.basis *= 1 - ratio; f.bal -= move;
      const g = ppl[1].b.foreign;
      g.rate = (g.rate * g.bal + f.rate * move) / (g.bal + move);
      g.div = (g.div * g.bal + f.div * move) / (g.bal + move);
      g.bal += move; g.basis += move;
      if (p.retireAge - (p.baseYear - p.birthYear) < 1) notes.push('증여 후 1년 안에 팔면 효과가 없어요');
    }
  }
  // 개선 4: 배당 대신 팔아서 쓰기 — 같은 총수익률의 배당 없는 상품으로 본다
  if (opt.noDividend) ppl.forEach(pp => { pp.b.foreign.div = 0; pp.b.kretf.div = 0; pp.b.domestic.div = 0; });
  const nowAge = p.baseYear - p.birthYear;
  let debt = p.debt || 0;
  const rows = [];
  let depletedAge = null, atRetire = null;
  const wr = R('금융소득.원천징수') * (1 + LOCAL);
  for (let age = nowAge; age <= p.endAge; age++) {
    const t = age - nowAge;
    const year = p.baseYear + t;
    const ages = ppl.map(pp => year - pp.birthYear);
    const infl = Math.pow(1 + p.inflation, t);
    const housePrice = house.price * Math.pow(1 + p.houseGrowth, t);
    const publicPrice = house.publicPrice * Math.pow(1 + p.houseGrowth, t);
    if (age < p.retireAge) {
      for (const pp of ppl) {
        const b = pp.b;
        b.cash.bal *= 1 + b.cash.rate * (1 - wr);
        b.isa.bal *= 1 + b.isa.rate;
        b.foreign.bal *= 1 + b.foreign.rate - b.foreign.div * 0.15;
        b.domestic.bal *= 1 + b.domestic.rate - b.domestic.div * wr;
        b.kretf.bal *= 1 + b.kretf.rate - b.kretf.div * wr;
        b.pension.bal *= 1 + b.pension.rate;
        if (opt.harvest) b.foreign.basis += Math.min(harvestCap, clamp0(b.foreign.bal - b.foreign.basis));
      }
      addSaving(ppl, p.annualSaving * Math.pow(1 + p.savingGrowth, t));
      debt = clamp0(debt - p.annualRepay);   // 빚은 가계부 상환액만큼 해마다 준다
      rows.push({ age, year, phase: 'work', infl, housePrice, bal: snapshot(ppl) });
      continue;
    }
    if (!atRetire) {
      // 은퇴할 때 남은 빚은 모아 둔 돈으로 갚는다(현금 → ISA → 해외주식 → 국내상장 해외ETF → 국내주식, 연금계좌 제외)
      if (debt > 0) {
        for (const k of ['cash', 'isa', 'foreign', 'kretf', 'domestic']) for (const pp of ppl) {
          const x = pp.b[k], t = Math.min(debt, x.bal);
          if (t <= 0) continue;
          if ('basis' in x) x.basis *= 1 - t / x.bal;
          x.bal -= t; debt -= t;
        }
      }
      atRetire = { age, infl, housePrice, bal: snapshot(ppl), debtLeft: debt };
    }
    const need = spend * 12 * infl;
    const inc = ppl.map((pp, i) => ({
      publicPension: ages[i] >= pp.npsStart ? pp.npsMonthly * 12 * infl : 0,
      interest: pp.b.cash.bal * pp.b.cash.rate,
      foreignDiv: pp.b.foreign.bal * pp.b.foreign.div,
      domesticDiv: pp.b.domestic.bal * pp.b.domestic.div + pp.b.kretf.bal * pp.b.kretf.div
    }));
    const financial = ppl.reduce((s, pp) => s + liquidOf(pp.b), 0);
    let basic;
    if (couple) basic = basicPensionCouple({ npsMonthly: inc.map(x => x.publicPension / 12), eligible: ages.map(a => a >= 65), housePrice: publicPrice, financial, region: p.region, infl }).map(v => v * 12);
    else basic = [ages[0] >= 65 ? basicPension({ npsMonthly: inc[0].publicPension / 12, housePrice: publicPrice, financial, region: p.region, infl }) * 12 : 0];
    const income = inc.reduce((s, x) => s + x.publicPension + x.interest + x.foreignDiv + x.domesticDiv, 0) + basic[0] + (basic[1] || 0);
    const evalYear = draw => {
      const plan = drawPlan(ppl, draw, ages, p.order, Object.assign({ pensionEarlyAge: p.retireAge }, opt));
      const per = ppl.map((pp, i) => personTax(Object.assign({ age: ages[i], take: plan.take[i], gain: plan.gain[i], isaFreeLeft: pp.isaFreeLeft }, inc[i])));
      // 건보료는 한 세대로(금융소득 1,000만 기준은 사람별)
      const ev = R('건보.지역.소득평가');
      const hiIncome = per.reduce((s, x, i) => s + inc[i].publicPension * 0.5 + (x.fin > ev.금융소득_미반영_이하 ? x.fin : 0), 0);
      const hi = healthInsurance({ business: hiIncome, housePrice: publicPrice });
      const parts = { pensionAcct: 0, income: 0, foreignDivTax: 0, stock: 0, isa: 0 };
      per.forEach(x => { for (const k in parts) parts[k] += x.parts[k]; });
      parts.health = hi.annual;
      parts.house = propertyTax(publicPrice) + jongbuTax(publicPrice, { age: ages[0], holdYears: p.holdYears + t });
      const total = Object.values(parts).reduce((s, v) => s + v, 0);
      return { plan, parts, total, per, finOver: per.some(x => x.fin > ev.금융소득_미반영_이하) };
    };
    let draw = 0, ev;
    for (let i = 0; i < 40; i++) {
      ev = evalYear(draw);
      const want = clamp0(need + ev.total - income);
      if (Math.abs(want - draw) < 1) { draw = want; break; }
      draw = want;
    }
    ev = evalYear(draw);
    const plan = ev.plan;
    const surplus = income + plan.taken - need - ev.total;   // 쓰고 남는 돈(배당이 많거나 연금을 미리 꺼낸 경우)
    // 실제로 꺼낸다
    ppl.forEach((pp, i) => {
      const b = pp.b, tk = plan.take[i];
      for (const k of ['isa', 'foreign', 'kretf']) if (tk[k] > 0 && b[k].bal > 0) b[k].basis *= 1 - tk[k] / b[k].bal;
      if (tk.isa > 0) pp.isaFreeLeft = clamp0(pp.isaFreeLeft - plan.gain[i].isa);
      for (const k of ['cash', 'isa', 'foreign', 'domestic', 'kretf']) b[k].bal -= tk[k];
      const pw = tk.pensionIn + tk.pensionOut;
      if (pw > 0) { b.pension.bal -= pw; b.pension.yearNo += 1; }
      // 개선 2: 그해 이익이 250만에 못 미치면 남는 만큼 팔고 다시 사서 원금을 올린다
      if (opt.harvest) b.foreign.basis += Math.min(clamp0(harvestCap - plan.gain[i].foreign), clamp0(b.foreign.bal - b.foreign.basis));
    });
    // 남는 돈은 다시 투자한다: 해외주식이 있으면 해외주식에(원금도 늘어남), 없으면 현금으로
    if (surplus > 0) {
      const tgt = ppl.find(pp => pp.b.foreign.bal > 0);
      if (tgt) { tgt.b.foreign.bal += surplus; tgt.b.foreign.basis += surplus; } else ppl[0].b.cash.bal += surplus;
    }
    for (const pp of ppl) for (const k of LIQ) if (pp.b[k].bal < 1) { pp.b[k].bal = 0; if ('basis' in pp.b[k]) pp.b[k].basis = 0; }
    if (plan.short > 1 && depletedAge === null) depletedAge = age;
    const row = {
      age, year, phase: 'retire', infl, housePrice, need,
      publicPension: inc.reduce((s, x) => s + x.publicPension, 0),
      basicPension: basic[0] + (basic[1] || 0),
      interest: inc.reduce((s, x) => s + x.interest, 0),
      dividend: inc.reduce((s, x) => s + x.foreignDiv + x.domesticDiv, 0),
      take: sumTake(plan.take), tax: ev.parts, taxTotal: ev.total,
      pensionMethod: ev.per.map(x => x.method), finOver: ev.finOver,
      short: plan.short
    };
    for (const pp of ppl) {
      const b = pp.b;
      b.isa.bal *= 1 + b.isa.rate;
      b.foreign.bal *= 1 + b.foreign.rate - b.foreign.div;
      b.domestic.bal *= 1 + b.domestic.rate - b.domestic.div;
      b.kretf.bal *= 1 + b.kretf.rate - b.kretf.div;
      b.pension.bal *= 1 + b.pension.rate;
    }
    row.bal = snapshot(ppl);
    // 계획 나이에 남은 돈을 한꺼번에 찾을 때 붙는 세금(비교를 공정하게 하려고 넣는다)
    if (age === p.planAge) {
      row.residualTax = ppl.reduce((s, pp) => {
        const b = pp.b;
        return s + b.pension.bal * R('연금계좌.세율').연금외수령 * (1 + LOCAL)
          + foreignStockTax(clamp0(b.foreign.bal - b.foreign.basis))
          + clamp0(b.kretf.bal - b.kretf.basis) * wr
          + clamp0(b.isa.bal - b.isa.basis - pp.isaFreeLeft) * R('ISA').초과분_세율 * (1 + LOCAL);
      }, 0);
    }
    rows.push(row);
  }
  const lastAge = depletedAge === null ? p.endAge + 1 : depletedAge - 1;   // 101 = 100세 이상
  return { params: p, rows, atRetire, lastAge, ok: lastAge >= p.planAge, notes };
}

function sumTake(takes) {
  const o = {};
  for (const tk of takes) for (const k in tk) o[k] = (o[k] || 0) + tk[k];
  return o;
}
function addSaving(ppl, amount) {
  // 저축은 지금 자산 비율대로 나눠 넣는다(집 제외)
  const tot = ppl.reduce((s, pp) => s + liquidOf(pp.b), 0);
  for (const pp of ppl) for (const k of LIQ) {
    const share = tot > 0 ? pp.b[k].bal / tot : (k === 'cash' && pp === ppl[0] ? 1 : 0);
    const add = amount * share;
    pp.b[k].bal += add;
    if ('basis' in pp.b[k]) pp.b[k].basis += add;
  }
}
function snapshot(ppl) {
  const o = { cash: 0, isa: 0, foreign: 0, domestic: 0, kretf: 0, pension: 0 };
  for (const pp of ppl) for (const k of LIQ) o[k] += pp.b[k].bal;
  return o;
}

// 계획 나이까지 버틸 수 있는 가장 큰 월 생활비(현재 물가 기준, 천 원 단위)
function sustainableMonthly(p0, opt = {}) {
  const p = normalize(p0);
  let lo = 0, hi = 5e7;
  for (let i = 0; i < 26; i++) {   // 5천만 ÷ 2^26 ≈ 0.7원 정밀도
    const mid = (lo + hi) / 2;
    if (simulate(p0, mid, opt).lastAge >= p.planAge) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}

// 은퇴 후 계획 나이까지 세금·건보료 합계(현재 물가 기준)
// 계획 나이까지 다 쓰지 못하고 남은 돈은 그때 한꺼번에 찾는다고 보고 그 세금도 더한다
function taxToPlan(r) {
  return r.rows.filter(x => x.phase === 'retire' && x.age <= r.params.planAge)
    .reduce((s, x) => s + (x.taxTotal + (x.residualTax || 0)) / x.infl, 0);
}

// 화면용 요약(현재 물가 기준)
function summary(p0, opt = {}) {
  const r = simulate(p0, null, opt);
  const p = r.params;
  const ar = r.atRetire;
  const liquidAt = ar ? Object.values(ar.bal).reduce((s, v) => s + v, 0) : 0;
  return {
    retireAge: p.retireAge, planAge: p.planAge, lastAge: r.lastAge, ok: r.ok,
    npsMonthly: p.npsMonthly, npsStart: p.npsStart,
    assetAtRetire: ar ? (liquidAt + ar.housePrice) / ar.infl : 0,
    liquidAtRetire: ar ? liquidAt / ar.infl : 0,
    sustainableMonthly: sustainableMonthly(p0, opt),
    totalTax: taxToPlan(r),
    notes: r.notes,
    rows: r.rows
  };
}

// ── 세금 줄이기: 개선 방법별 비교 ──────────────────────────
const IMPROVEMENTS = [
  { id: 'pensionEarly', title: '연금저축·IRP는 은퇴하면 바로, 한 해 1,500만원 안에서' },
  { id: 'harvest', title: '해외주식은 해마다 이익 250만원만큼 팔고 다시 사기' },
  { id: 'giftToSpouse', title: '해외주식 절반을 배우자 이름으로', couple: true },
  { id: 'noDividend', title: '배당 대신 팔아서 쓰기', needFinOver: true }
];
// 효과 = 같은 생활비를 쓸 때 세금·건보료가 줄어 생기는 돈(현재 물가 기준)
// - 둘 다 계획 나이까지 버티면: 계획 나이에 세금을 다 내고 남는 돈의 차이
//   (세금 합계만 비교하면 돈을 더 남기는 방법이 남은 돈의 세금 때문에 불리해 보인다)
// - 한쪽이라도 중간에 바닥나면: 먼저 바닥나는 나이까지 낸 세금·건보료의 차이
function netWealthAt(r, age) {
  const x = r.rows.find(y => y.age === age);
  if (!x) return 0;
  return (Object.values(x.bal).reduce((s, v) => s + v, 0) - (x.residualTax || 0)) / x.infl;
}
function taxUpTo(r, age) {
  return r.rows.filter(x => x.phase === 'retire' && x.age <= age).reduce((s, x) => s + x.taxTotal / x.infl, 0);
}
function effect(base, r) {
  const plan = base.params.planAge;
  if (base.lastAge >= plan && r.lastAge >= plan) return netWealthAt(r, plan) - netWealthAt(base, plan);
  const a = Math.min(base.lastAge, r.lastAge, plan);
  return taxUpTo(base, a) - taxUpTo(r, a);
}
function improvements(p0) {
  const base = simulate(p0);
  const baseU = simulate(p0, null, { uniformRates: true });
  const couple = base.params.persons.length === 2;
  const finOver = base.rows.some(x => x.finOver);
  const baseMonthly = sustainableMonthly(p0);
  const list = [];
  for (const m of IMPROVEMENTS) {
    if (m.couple && !couple) continue;
    if (m.needFinOver && !finOver) continue;
    const opt = { [m.id]: true };
    const r = simulate(p0, null, opt);
    list.push({
      id: m.id, title: m.title,
      saving: effect(baseU, simulate(p0, null, Object.assign({ uniformRates: true }, opt))),
      monthlyGain: sustainableMonthly(p0, opt) - baseMonthly,
      lastAge: r.lastAge, notes: r.notes
    });
  }
  // 효과가 있는 것만(1만원 넘게), 큰 순서. 매달 쓸 수 있는 돈이나 버티는 나이가 줄어드는 방법은 빼요
  const useful = list.filter(x => x.saving > 10000 && x.monthlyGain >= 0 && x.lastAge >= base.lastAge).sort((a, b) => b.saving - a.saving);
  const allOpt = Object.fromEntries(useful.map(x => [x.id, true]));
  const all = simulate(p0, null, allOpt);
  return {
    base: { tax: taxToPlan(base), monthly: baseMonthly, lastAge: base.lastAge },
    list: useful,
    combined: { opt: allOpt, saving: effect(baseU, simulate(p0, null, Object.assign({ uniformRates: true }, allOpt))), tax: taxToPlan(all), monthly: sustainableMonthly(p0, allOpt), lastAge: all.lastAge }
  };
}

const api = {
  BASE_YEAR, ASSUMPTIONS, ORDER_BASIC, IMPROVEMENTS, KIND,
  progressive, incomeTax, pensionDeduction, pensionAcctRate, comprehensiveTax, privatePensionTax,
  foreignStockTax, pensionAnnualLimit, housePropertyBase, healthPropertyMonthly, healthInsurance,
  propertyTax, jongbuTax, npsEstimate, npsClaimAge, basicPension, basicPensionCouple,
  simulate, sustainableMonthly, summary, improvements, taxToPlan, effect, netWealthAt
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Retire = api;
})(typeof window !== 'undefined' ? window : globalThis);
