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
  '빚은 가계부 상환액만큼 해마다 줄고, 은퇴할 때 남은 빚은 모아 둔 돈으로 갚아요. 그래도 남으면 은퇴 후에도 해마다 갚아요',
  '55세 전에는 다른 돈을 다 쓴 뒤에만 연금계좌를 해지해 꺼내고 16.5%를 내요',
  '연금저축·IRP에 넣은 돈은 일하는 동안 연봉에 따라 13.2% 또는 16.5%를 돌려받아 다시 넣어요(나만, 한 해 900만원까지)'
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
// 근로소득: 총급여 → 근로소득금액, 근로소득세액공제 한도
function wageIncomeAmount(wage) { if (!(wage > 0)) return 0; const t = R('근로소득공제'); return clamp0(wage - Math.min(progressive(wage, t.구간), t.한도)); }
function wageCreditLimit(w) {   // 대장 '근로소득세액공제'.한도 식
  if (w <= 33e6) return 740000;
  if (w <= 70e6) return Math.max(660000, 740000 - (w - 33e6) * 0.008);
  if (w <= 120e6) return Math.max(500000, 660000 - (w - 70e6) * 0.5);
  return Math.max(200000, 500000 - (w - 120e6) * 0.5);
}
function comprehensiveTax({ pension = 0, interest = 0, domesticDiv = 0, foreignDiv = 0, age = 65, other = 0, wage = 0 }) {
  const fin = interest + domesticDiv + foreignDiv;
  const foreignPaid = foreignDiv * 0.15;
  const wr = R('금융소득.원천징수');
  const pensionAmt = clamp0(pension - pensionDeduction(pension));
  const pd = R('인적공제');
  const personal = pd.기본_1인당 + (age >= 70 ? pd.경로_70세이상 : 0);
  const std = wage > 0 ? R('표준세액공제').근로소득자 : R('표준세액공제').근로소득_없는_종합소득자;
  const limit = R('금융소득.종합과세기준');
  const wAmt = wageIncomeAmount(wage);
  // 근로소득세액공제: 산출세액 중 근로소득 몫에 55%·30%, 한도는 총급여에 따라
  const wc = t => { if (!(wage > 0) || !(t > 0)) return 0; const tot = pensionAmt + other + fin; const sh = tot > 0 ? Math.min(1, wAmt / tot) : 0; return Math.min(progressive(t * sh, R('근로소득세액공제').공제), wageCreditLimit(wage)); };
  let national, finSeparate = 0;
  if (fin <= limit) {
    const t = incomeTax(clamp0(pensionAmt + other - personal));
    national = clamp0(t - std - wc(t));
    // 금융소득은 원천징수로 끝(분리과세). 해외배당은 14% − 외국 세금(이미 15%라 0)
    finSeparate = (interest + domesticDiv) * wr + clamp0(foreignDiv * wr - foreignPaid);
  } else {
    // 2,000만 넘으면 종합과세: 일반산출세액과 비교산출세액 중 큰 것
    const t1 = limit * wr + incomeTax(clamp0(pensionAmt + other + (fin - limit) - personal));
    const t2 = fin * wr + incomeTax(clamp0(pensionAmt + other - personal));
    let t = clamp0(Math.max(t1, t2) - std);
    t = clamp0(t - wc(t));
    const totalIncome = pensionAmt + other + fin;
    const credit = totalIncome > 0 ? Math.min(foreignPaid, t * foreignDiv / totalIncome) : 0;
    national = clamp0(t - credit);
  }
  const nat = national + finSeparate;
  return { national: nat, local: nat * LOCAL, total: nat * (1 + LOCAL), foreignPaid };
}

// 연금계좌에서 꺼낸 돈의 세금(지방세 포함)
// inLimit: 연금수령 한도 안에서 꺼낸 돈, outLimit: 한도를 넘어 꺼낸 돈(연금외수령 16.5%)
// publicPension 등은 1,500만 초과 시 종합과세가 유리한지 비교하려고 받는다
function privatePensionTax({ inLimit = 0, outLimit = 0, age, publicPension = 0, interest = 0, domesticDiv = 0, foreignDiv = 0, other = 0, wage = 0 }) {
  const sep = R('연금계좌.분리과세기준');
  const outTax = outLimit * R('연금계좌.세율').연금외수령 * (1 + LOCAL);
  if (inLimit <= sep.기준) {
    return { tax: inLimit * pensionAcctRate(age) * (1 + LOCAL) + outTax, method: '저율', outTax };
  }
  // 1,500만 초과: 전체 16.5% 분리과세 vs 다른 소득과 합쳐 종합과세 중 적은 것
  const separate = inLimit * sep.초과시_분리과세율 * (1 + LOCAL);
  const base = comprehensiveTax({ pension: publicPension, interest, domesticDiv, foreignDiv, age, other, wage }).total;
  const merged = comprehensiveTax({ pension: publicPension + inLimit, interest, domesticDiv, foreignDiv, age, other, wage }).total - base;
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

// 퇴직소득세(국세): 퇴직금 S, 근속 연수 n
// 근속연수공제 → 12배로 환산 → 환산급여공제 → 세율표 → 12로 나누고 근속 연수를 곱한다
function retireIncomeTax(S, years) {
  const n = Math.max(1, Math.ceil(years || 1));
  if (!(S > 0)) return 0;
  const svc = progressive(n, R('퇴직소득.근속연수공제').구간);
  const conv = clamp0(S - svc) * 12 / n;
  const base = clamp0(conv - progressive(conv, R('퇴직소득.환산급여공제').구간));
  return incomeTax(base) / 12 * n;
}
// 연금 계좌에서 꺼낸 돈을 나눈다: 세액공제 안 받은 돈(세금 없음) → 이연퇴직소득 → 나머지(세액공제 받은 돈 + 불어난 몫)
// 연금으로 받은 몫(pIn)을 먼저, 그다음 연금 밖으로 꺼낸 몫(pOut)
function pensionSplit(pb, pIn, pOut) {
  let nd = pb.nd || 0, ret = pb.ret || 0;
  const cut = amt => { const a = Math.min(amt, nd); nd -= a; amt -= a; const b = Math.min(amt, ret); ret -= b; amt -= b; return { nd: a, ret: b, rest: amt }; };
  return { in: cut(pIn), out: cut(pOut) };
}
// 이연퇴직소득을 꺼낼 때 세금(지방세 포함): 연금으로 받으면 연차에 따라 70%·60%·50%, 연금 밖으로 꺼내면 100%
function retireDrawTax(pb, sp, yearNo) {
  if (!(pb.ret > 0) || !(sp.in.ret + sp.out.ret > 0)) return 0;
  const t = R('연금계좌.세율').이연퇴직소득_연금수령_비율;
  const ratio = yearNo <= 10 ? t['10년차이하'] : yearNo <= 20 ? t['11~20년차'] : t['21년차이상'];
  const per = pb.retTax / pb.ret;
  return (sp.in.ret * per * ratio + sp.out.ret * per) * (1 + LOCAL);
}

// ── 건강보험료 (지역가입자, 장기요양 포함, 한 해) ──────────────
// 집 공시가격 → 재산세 과세표준 → 1억 공제 → 등급 점수 × 점수당 금액
function housePropertyBase(price, one = true) {
  const r = R('재산세.공정시장가액비율');
  const ratio = !one ? r.일반주택 : price <= 3e8 ? r['1세대1주택_3억이하'] : price <= 6e8 ? r['1세대1주택_6억이하'] : r['1세대1주택_6억초과'];
  return price * ratio;
}
function healthPropertyMonthly(price) { return healthPropertyMonthlyBase(price > 0 ? housePropertyBase(price) : 0); }
// 재산세 과세표준 합(집 여러 채) → 건보료 재산 몫(월)
function healthPropertyMonthlyBase(taxBase) {
  if (!(taxBase > 0)) return 0;
  const base = taxBase - R('건보.재산').기본공제;
  if (base <= 0) return 0;
  const man = base / MAN;
  const table = R('건보.재산점수표').표;
  let score = table[table.length - 1][3];
  for (const [, lo, hi, s] of table) { if (hi === null || man <= hi) { score = s; break; } }
  return score * R('건보.재산').점수당_금액;
}
function healthInsurance({ publicPension = 0, wage = 0, business = 0, interest = 0, dividend = 0, housePrice = 0, propertyBase = null }) {
  const ev = R('건보.지역.소득평가');
  const rate = R('건강보험.요율');
  const lim = R('건강보험.상한하한');
  const fin = interest + dividend;
  const income = publicPension * 0.5 + wage * 0.5 + business + (fin > ev.금융소득_미반영_이하 ? fin : 0);
  const incomeMonthly = Math.max(income / 12 * rate, lim.지역_하한);
  const propMonthly = propertyBase != null ? healthPropertyMonthlyBase(propertyBase) : healthPropertyMonthly(housePrice);
  const hi = Math.min(incomeMonthly + propMonthly, lim.보수외소득_및_지역_상한);
  const ltc = hi * R('장기요양.요율').건보료_대비_비율;
  return { monthly: hi + ltc, annual: (hi + ltc) * 12, incomePart: incomeMonthly, propertyPart: propMonthly, finCounted: fin > ev.금융소득_미반영_이하 };
}

// ── 집 보유세 (1세대 1주택) ─────────────────────────────────
function propertyTax(price, one = true) {
  if (!(price > 0)) return 0;
  const base = housePropertyBase(price, one);
  const special = one && price <= 9e8;   // 1세대 1주택 특례세율: 시가표준액 9억 이하
  const main = progressive(base, (special ? R('재산세.세율_1주택특례') : R('재산세.세율_일반주택')).구간);
  const sub = R('재산세.부가세목');
  return main + base * sub.도시지역분_세율 + main * sub.지방교육세_재산세대비;
}
// 종부세(한 사람, 추정). one: 1세대 1주택(12억 공제·고령·장기보유 공제), 아니면 9억 공제. many: 3주택 이상 세율
// price: 그 사람이 가진 집 공시가격 합(지분만큼)
function jongbuTax(price, { age = 60, holdYears = 0, one = true, many = false } = {}) {
  const p = R('종부세.과세표준');
  const base = (price - (one ? p.기본공제_1세대1주택 : p.기본공제_일반)) * p.공정시장가액비율;
  if (base <= 0) return 0;
  let tax = progressive(base, R('종부세.세율')[many ? '3주택이상' : '2주택이하']);
  // 재산세 중복분 공제(추정): 재산세 × (종부 과표분 재산세 상당액 ÷ 전체 재산세 상당액)
  const pr = R('재산세.공정시장가액비율')[one ? '1세대1주택_6억초과' : '일반주택'];
  const full = progressive(price * pr, R('재산세.세율_일반주택').구간);
  const part = base * pr * 0.004;
  const mainProp = progressive(housePropertyBase(price, one), R('재산세.세율_일반주택').구간);
  if (full > 0) tax = clamp0(tax - mainProp * Math.min(1, part / full));
  if (!one) return tax * (1 + R('종부세.공제와상한').농특세);
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
function basicPension({ npsMonthly, housePrice, financial, region = '대도시', infl = 1, otherMonthly = 0 }) {
  const conv = R('기초연금.재산소득환산');
  const prop = clamp0(housePrice - conv.기본재산액[region] * infl) + clamp0(financial - conv.금융재산_공제 * infl);
  const recognized = npsMonthly + otherMonthly + prop * conv.소득환산율_연 / 12;
  if (recognized > R('기초연금.선정기준액').단독 * infl) return 0;
  const base = R('기초연금.기준연금액') * infl;
  const aBenefit = npsMonthly / 2;   // A급여액 ≈ 국민연금의 절반(추정)
  let amt = Math.min(base, clamp0(base - aBenefit * 2 / 3) + base / 2);
  // 소득역전 방지: 소득인정액 + 기초연금이 선정기준액을 넘으면 넘는 만큼 깎는다(최소 기준연금액의 10%)
  const sel = R('기초연금.선정기준액').단독 * infl, rv = R('기초연금.소득역전감액');
  if (recognized + amt > sel) amt = Math.max(sel - recognized, base * rv.최소비율_단독);
  return amt;
}

// 부부 기초연금(월, 한 사람당 금액 배열). 둘 다 받으면 각각 20% 감액
function basicPensionCouple({ npsMonthly, eligible, housePrice, financial, region = '대도시', infl = 1, otherMonthly = 0 }) {
  const conv = R('기초연금.재산소득환산');
  const prop = clamp0(housePrice - conv.기본재산액[region] * infl) + clamp0(financial - conv.금융재산_공제 * infl);
  const recognized = npsMonthly[0] + npsMonthly[1] + otherMonthly + prop * conv.소득환산율_연 / 12;
  if (recognized > R('기초연금.선정기준액').부부 * infl) return [0, 0];
  const base = R('기초연금.기준연금액') * infl;
  const each = npsMonthly.map((n, i) => eligible[i] ? Math.min(base, clamp0(base - n / 2 * 2 / 3) + base / 2) : 0);
  const both = eligible[0] && eligible[1];
  const cut = both ? 1 - R('기초연금.산정').부부_동시수급_감액 : 1;
  let amts = each.map(v => v * cut);
  // 소득역전 방지 감액: 합이 선정기준액을 넘는 만큼 깎고, 두 사람 비율로 나눈다(부부 합계 최소 20%, 한 사람 최소 10%)
  const sel = R('기초연금.선정기준액').부부 * infl, rv = R('기초연금.소득역전감액');
  const tot = amts[0] + amts[1];
  if (tot > 0 && recognized + tot > sel) {
    const newTot = Math.max(sel - recognized, base * (both ? rv.최소비율_부부합계 : rv.최소비율_단독));
    amts = amts.map(v => v > 0 ? Math.max(newTot * v / tot, base * rv.부부_1인_최소비율) : 0);
  }
  return amts;
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
    pension: { bal: 0, rate: defRate, yearNo: 0, nd: 0, ret: 0, retTax: 0 }
  };
}
// 계좌를 사람별 묶음으로. owner: '나' | '배우자' | '공동'(share = 내 몫, 기본 반씩). 혼자면 모두 나.
// 투자 계좌는 '줄'(lots)로 나눠 갖고 있을 수 있다: holdings [{w: 비중, rate: 1년 수익률(배당 포함), div: 배당률}]
// 줄마다 불어나는 속도가 달라 해마다 비중이 바뀐다(예: QLD 반 + 커버드콜 반 → 해가 갈수록 QLD 비중이 커짐).
// 꺼내 쓸 때는 줄 비율대로 판다. 연금저축·IRP·ISA는 계좌 안에서 배당에 그때 세금이 없어 배당률을 쓰지 않는다.
const LOT_KINDS = ['isa', 'foreign', 'domestic', 'kretf', 'pension'];
function syncLots(x) {
  if (!x.lots || !x.lots.length) return;
  x.rate = x.lots.reduce((s, l) => s + l.s * l.r, 0);
  if ('div' in x) x.div = x.lots.reduce((s, l) => s + l.s * l.d, 0);
}
// 줄마다 f(줄) 배로 불리고 비중을 다시 맞춘다
function growLots(x, f) {
  if (!(x.bal > 0)) return;
  if (!x.lots || !x.lots.length) { x.bal *= f({ r: x.rate, d: x.div || 0 }); return; }
  const fs = x.lots.map(l => l.s * f(l)), F = fs.reduce((a, b) => a + b, 0);
  if (F > 0) x.lots.forEach((l, i) => { l.s = fs[i] / F; });
  x.bal *= F;
  syncLots(x);
}
// 두 줄 묶음 합치기(가중치 = 금액)
// 묶음에 새 돈 넣기: newLots(새로 살 비중)가 있으면 그 비중으로 사고, 없으면 지금 비중대로(줄 비중 그대로)
function addMoney(x, amt, basis = true) {
  if (!(amt > 0)) return;
  if (x.newLots && x.newLots.length && x.lots) { x.lots = x.lots.length && x.bal > 0 ? mergeLots(x.lots, x.bal, x.newLots, amt) : x.newLots.map(l => ({ ...l })); x.bal += amt; syncLots(x); }
  else x.bal += amt;
  if (basis && 'basis' in x) x.basis += amt;
}
function mergeLots(a, wa, b, wb) {
  const out = [];
  const add = (l, w) => { const o = out.find(z => z.r === l.r && z.d === l.d); if (o) o.v += l.s * w; else out.push({ r: l.r, d: l.d, v: l.s * w }); };
  (a || []).forEach(l => add(l, wa)); (b || []).forEach(l => add(l, wb));
  const tot = out.reduce((s, l) => s + l.v, 0);
  return out.filter(l => l.v > 0).map(l => ({ r: l.r, d: l.d, s: tot > 0 ? l.v / tot : 0 }));
}
function makePeople(accounts, defRate, cashRate, couple) {
  const bs = [emptyBuckets(defRate, cashRate), emptyBuckets(defRate, cashRate)];
  const house = { price: 0, publicPrice: 0 };
  const houses = [];
  const lotsV = bs.map(() => ({}));   // 사람·묶음별 줄 금액 {k: [{r, d, v}]}
  const newV = bs.map(() => ({}));    // 새로 넣는 돈을 살 비중(계좌에 newHoldings가 있을 때만). 없으면 지금 비중대로 산다
  const cashW = bs.map(() => ({ v: 0, rv: 0, rb: 0 }));
  for (const a of accounts) {
    const k = KIND[a.kind];
    if (!k) continue;
    if (k === 'house') {
      const pub = a.publicPrice || a.balance * 0.7;
      house.price += a.balance; house.publicPrice += pub;
      houses.push({ price: a.balance, publicPrice: pub, owner: a.owner || '나', share: a.share, use: a.use || 'live', rent: a.rent || 0, deposit: a.deposit || 0, since: a.since, registered: !!a.registered });
      continue;
    }
    const mine = a.owner === '공동' || a.owner === '공동명의' ? (a.share != null ? a.share : 0.5) : 1;
    const shares = !couple || !a.owner || a.owner === '나' ? [1, 0] : a.owner === '배우자' ? [0, 1] : [mine, 1 - mine];
    shares.forEach((sh, i) => {
      if (!sh) return;
      const x = bs[i][k], bal = a.balance * sh;
      x.bal += bal;
      if (a.savingShare > 0) x.saveW = (x.saveW || 0) + a.savingShare * sh;   // 매년 저축 중 이 계좌에 넣는 몫
      if ('basis' in x) x.basis += (a.principal != null ? a.principal : a.balance) * sh;
      if (k === 'cash') { if (a.rate != null) { cashW[i].rv += a.rate * bal; cashW[i].rb += bal; } return; }
      // 연금 계좌 안 돈 나누기(사람마다): 세액공제 안 받은 돈, 이연퇴직소득과 그 세금
      if (k === 'pension') { x.nd += (a.nonDeductible || 0) * sh; x.ret += (a.severance || 0) * sh; x.retTax += (a.severanceTax != null ? a.severanceTax : 0) * sh;
        if (a.severance && a.severanceTax == null) x.retTaxUnknown = (x.retTaxUnknown || 0) + a.severance * sh; }
      const hs = Array.isArray(a.holdings) && a.holdings.length ? a.holdings : [{ w: 1, rate: a.rate, div: a.dividendYield }];
      const wsum = hs.reduce((s, h) => s + (h.w || 0), 0) || 1;
      const arr = lotsV[i][k] || (lotsV[i][k] = []);
      for (const h of hs) {
        const r = h.rate != null ? h.rate : defRate, d = ('div' in x) ? (h.div || 0) : 0, v = bal * (h.w || 0) / wsum;
        const o = arr.find(z => z.r === r && z.d === d); if (o) o.v += v; else arr.push({ r, d, v });
      }
      // 새로 넣는 돈의 비중: 계좌의 newHoldings, 없으면 그 계좌의 지금 비중. 계좌 잔액(0이면 1원)으로 가중
      if (Array.isArray(a.newHoldings) && a.newHoldings.length) {
        const nw = a.newHoldings.reduce((q, h) => q + (h.w || 0), 0) || 1, wt = Math.max(bal, 1);
        const na = newV[i][k] || (newV[i][k] = { arr: [], any: true });
        for (const h of a.newHoldings) { const r = h.rate != null ? h.rate : defRate, d = ('div' in x) ? (h.div || 0) : 0, v = wt * (h.w || 0) / nw;
          const o = na.arr.find(z => z.r === r && z.d === d); if (o) o.v += v; else na.arr.push({ r, d, v }); }
      } else {
        const na = newV[i][k] || (newV[i][k] = { arr: [], any: false }), wt = Math.max(bal, 1);
        for (const h of hs) { const r = h.rate != null ? h.rate : defRate, d = ('div' in x) ? (h.div || 0) : 0, v = wt * (h.w || 0) / wsum;
          const o = na.arr.find(z => z.r === r && z.d === d); if (o) o.v += v; else na.arr.push({ r, d, v }); }
      }
    });
  }
  bs.forEach((b, i) => {
    for (const k of LOT_KINDS) {
      const arr = lotsV[i][k] || [], tot = arr.reduce((s, l) => s + l.v, 0);
      b[k].lots = tot > 0 ? arr.filter(l => l.v > 0).map(l => ({ r: l.r, d: l.d, s: l.v / tot })) : [];
      const nv = newV[i][k];
      if (nv && nv.any) { const nt = nv.arr.reduce((s, l) => s + l.v, 0); b[k].newLots = nv.arr.filter(l => l.v > 0).map(l => ({ r: l.r, d: l.d, s: l.v / nt })); }
      syncLots(b[k]);
    }
    // 현금: 이자율을 넣은 계좌는 그 값, 안 넣은 계좌는 기본값으로 잔액 가중 평균
    if (b.cash.bal > 0 && cashW[i].rb) b.cash.rate = (cashW[i].rv + b.cash.rate * (b.cash.bal - cashW[i].rb)) / b.cash.bal;
  });
  return { bs: couple ? bs : [bs[0]], house, houses };
}
const liquidOf = b => LIQ.reduce((s, k) => s + b[k].bal, 0);

// ── 한 해 꺼내 쓰기 계획 ───────────────────────────────────
// 기본 순서: 현금 → ISA → 해외주식 → 국내상장 해외ETF → 국내주식 → 연금저축·IRP(55세부터)
// 기본 순서: 55세부터 연금저축·IRP를 한 해 1,500만원(한 사람) 안에서 먼저 함께 쓰고,
// 모자라는 돈은 현금 → ISA → 해외주식 → 국내상장 해외ETF → 국내주식 → 연금계좌(1,500만 넘는 몫) 순서로 (11/25 사용자 결정)
const ORDER_BASIC = ['cash', 'isa', 'foreign', 'kretf', 'domestic', 'pension'];

function drawPlan(ppl, need, ages, order, opt) {
  const n = ppl.length;
  const take = ppl.map(() => ({ cash: 0, isa: 0, foreign: 0, domestic: 0, kretf: 0, pensionIn: 0, pensionOut: 0 }));
  let left = need;
  const minAge = R('연금계좌.수령요건').최소나이;
  const limits = ppl.map((pp, i) => pensionAnnualLimit(pp.b.pension.bal, pp.b.pension.yearNo + 1));
  const cap0 = R('연금계좌.분리과세기준').기준;
  const capOf = i => cap0 + (ppl[i].b.pension.nd || 0) + (ppl[i].b.pension.ret || 0);   // 1,500만 기준은 세액공제 받은 돈과 불어난 몫에만
  if (opt.pensionEarly) {
    // 개선 방법: 쓸 돈이 적어도 해마다 한 사람 1,500만까지 꼭 꺼내 낮은 세율 구간을 채운다. 쓰고 남으면 다시 투자
    for (let i = 0; i < n; i++) {
      if (ages[i] < Math.max(minAge, opt.pensionEarlyAge || 0)) continue;
      const t = Math.min(capOf(i), limits[i], ppl[i].b.pension.bal);
      take[i].pensionIn += t; left -= t;
    }
  } else if (!opt.pensionLast) {
    // 기본: 55세부터 필요한 만큼, 한 사람 한 해 1,500만 안에서 먼저 꺼낸다
    for (let i = 0; i < n && left > 0; i++) {
      if (ages[i] < minAge) continue;
      const t = Math.min(left, capOf(i), limits[i], ppl[i].b.pension.bal);
      take[i].pensionIn += t; left -= t;
    }
  }
  for (const k of order) {
    if (left <= 0) break;
    if (k === 'pension') {
      for (let i = 0; i < n && left > 0; i++) {
        const p = ppl[i].b.pension;
        // 55세 전: 연금으로 받을 수 없어 해지·중도인출(연금외수령, 16.5%)로만 꺼낸다 — 다른 돈을 다 쓴 다음
        if (ages[i] < minAge) { const outL = Math.min(left, p.bal); take[i].pensionOut += outL; left -= outL; continue; }
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
  const psplit = take.map((tk, i) => pensionSplit(ppl[i].b.pension, tk.pensionIn, tk.pensionOut));
  return { take, gain, short: clamp0(left), taken, psplit };
}

// 한 사람의 그해 세금(건보료·보유세 제외)
function personTax({ age, publicPension, interest, domesticDiv, foreignDiv, take, gain, isaFreeLeft, psplit, pb, wage = 0, biz = 0, rent = null }) {
  const finDomestic = domesticDiv + gain.kretf;          // 국내상장 해외ETF 매매차익은 배당소득
  const sp = psplit || { in: { nd: 0, ret: 0, rest: take.pensionIn }, out: { nd: 0, ret: 0, rest: take.pensionOut } };
  const other = wageIncomeAmount(wage) + biz;   // 근로소득금액 + 사업소득금액
  const pp = privatePensionTax({ inLimit: sp.in.rest, outLimit: sp.out.rest, age, publicPension, interest, domesticDiv: finDomestic, foreignDiv, other, wage });
  const merged = pp.method === '종합과세';
  const cArgs = { pension: publicPension + (merged ? sp.in.rest : 0), interest, domesticDiv: finDomestic, foreignDiv, age, wage };
  const ct = comprehensiveTax(Object.assign({ other }, cArgs));
  // 주택임대소득: 수입 2,000만 이하면 14% 분리과세와 종합과세 중 적은 쪽, 넘으면 종합과세
  let rentTax = 0, rentAmt = 0;
  if (rent && rent.gross > 0) {
    const tr = R('주택임대.과세');
    rentAmt = rent.gross * (1 - rent.expRate);
    const withRent = comprehensiveTax(Object.assign({ other: other + rentAmt }, cArgs)).total - ct.total;
    if (rent.gross <= tr.분리과세_수입_이하) {
      const otherAmt = clamp0(publicPension - pensionDeduction(publicPension)) + other;
      const sep = clamp0(rentAmt - (otherAmt <= 2e7 ? rent.add : 0)) * tr.분리과세_세율 * (1 + LOCAL);
      rentTax = Math.min(sep, withRent);
    } else rentTax = withRent;
  }
  const retT = pb ? retireDrawTax(pb, sp, pb.yearNo + 1) : 0;
  const isaTaxable = clamp0(gain.isa - isaFreeLeft);
  const parts = {
    pensionAcct: (merged ? pp.outTax : pp.tax) + retT,
    income: ct.total,
    foreignDivTax: ct.foreignPaid,
    stock: foreignStockTax(gain.foreign),
    isa: isaTaxable * R('ISA').초과분_세율 * (1 + LOCAL),
    rent: rentTax
  };
  return { parts, method: pp.method, fin: interest + finDomestic + foreignDiv, rentAmt, other };
}


// ── 집 여러 채: 그해 보유세·월세·건보 재산(사람마다 지분) ─────────────
// houses: [{publicPrice, price, owner '나'|'배우자'|'공동명의', share(내 지분), use 'live'|'rent'|'empty', rent(월, 지금 돈), deposit(지금 돈), since, registered}]
function houseYear(houses, { t, year, infl, ages, couple, p }) {
  const n = couple ? 2 : 1, g = Math.pow(1 + p.houseGrowth, t);
  const one = houses.length === 1;   // 세대가 가진 집이 한 채
  const out = { publicTotal: 0, propTax: 0, jongbu: 0, deposits: 0, rentCash: 0, rentAmtTotal: 0, propBase: Array(n).fill(0), rent: Array(n).fill(null) };
  const own = Array.from({ length: n }, () => ({ pub: 0, cnt: 0, dep: 0, gross: 0, expW: 0, regAll: true }));
  const tr = R('주택임대.과세'), dr = R('주택임대.간주임대료');
  for (const h of houses) {
    const pub = h.publicPrice * g;
    const sh = n === 1 ? [1] : h.owner === '배우자' ? [0, 1] : (h.owner === '공동명의' || h.owner === '공동') ? [h.share != null ? h.share : 0.5, 1 - (h.share != null ? h.share : 0.5)] : [1, 0];
    out.publicTotal += pub;
    out.propTax += propertyTax(pub, one);
    const base = housePropertyBase(pub, one);
    const rentY = h.use === 'rent' ? (h.rent || 0) * 12 * infl : 0, dep = h.use === 'rent' ? (h.deposit || 0) * infl : 0;
    out.rentCash += rentY; out.deposits += dep;
    // 1주택 월세는 기준시가 12억 이하면 세금 없음
    const free = one && pub <= tr['1주택_비과세_기준시가_이하'];
    sh.forEach((x, i) => {
      if (!(x > 0)) return;
      out.propBase[i] += base * x;
      own[i].pub += pub * x; own[i].cnt += 1; own[i].dep += dep * x;
      if (!free && rentY > 0) { own[i].gross += rentY * x; own[i].expW += rentY * x * (h.registered ? tr.필요경비율_등록 : tr.필요경비율); if (!h.registered) own[i].regAll = false; }
    });
  }
  // 종부세: 사람마다. 1주택 단독명의는 12억 공제·고령·장기보유 공제. 부부 공동명의 1주택은 각자 9억 공제와 '1주택자 특례'(한 사람이 12억 공제) 중 적은 쪽
  const hold = h => h && h.since ? year - h.since : p.holdYears + t;
  if (one && houses[0]) {
    const h = houses[0], pub = h.publicPrice * g;
    const joint = n === 2 && (h.owner === '공동명의' || h.owner === '공동');
    if (!joint) out.jongbu = jongbuTax(pub, { age: ages[h.owner === '배우자' && n === 2 ? 1 : 0], holdYears: hold(h), one: true });
    else {
      const each = own.reduce((s, o) => s + jongbuTax(o.pub, { one: false }), 0);
      const special = Math.min(...ages.map(a => jongbuTax(pub, { age: a, holdYears: hold(h), one: true })));
      out.jongbu = Math.min(each, special);
    }
  } else out.jongbu = own.reduce((s, o) => s + (o.pub > 0 ? jongbuTax(o.pub, { one: false, many: o.cnt >= 3 }) : 0), 0);
  // 월세 소득(사람마다). 간주임대료: 3주택 이상이고 보증금 3억 넘으면, 2주택이고 보증금 12억 넘으면
  own.forEach((o, i) => {
    let gross = o.gross;
    if ((o.cnt >= 3 && o.dep > dr.보증금_공제) || (o.cnt === 2 && o.dep > dr['2주택_보증금_기준'])) gross += clamp0(o.dep - dr.보증금_공제) * dr.반영비율 * dr.정기예금이자율;
    if (gross > 0) {
      const expRate = o.gross > 0 ? o.expW / o.gross : tr.필요경비율;
      out.rent[i] = { gross, expRate, add: o.regAll ? tr.추가공제_등록 : tr.추가공제 };
      out.rentAmtTotal += gross * (1 - expRate);
    }
  });
  return out;
}
// ── 건보료·4대보험(그해, 세대): 지역가입자 / 직장가입자 / 피부양자 ─────────
// 피부양자: 직장 다니는 자녀가 있거나(p.dependent) 배우자가 직장에 다니면, 소득 2,000만원 이하·재산 기준을 맞춘 사람은 건보료 0
//   부부가 자녀의 피부양자가 되려면 두 사람 모두 소득 요건을 맞춰야 한다(별표 1의2 제1호 라목). 재산은 사람마다
function healthYear({ ppl, inc, per, work, H, ages, year, p, infl }) {
  const n = ppl.length, ev = R('건보.지역.소득평가'), rate = R('건강보험.요율'), lim = R('건강보험.상한하한'), ltc = R('장기요양.요율').건보료_대비_비율;
  const dep = R('건보.피부양자');
  const yr = String(Math.min(2033, Math.max(2026, year)));
  const npsRate = k => { const t = R(k); return t[yr] != null ? t[yr] : t['2033~']; };
  let social = 0, health = 0;
  const employee = work.map(w => w.wage > 0);
  // 직장가입자: 본인 부담 = 보수 × 요율 ÷ 2(상한), 장기요양. 국민연금(60세 미만)·고용보험도 낸다
  ppl.forEach((pp, i) => {
    if (employee[i]) {
      const m = Math.min(work[i].wage / 12 * rate, lim.직장_보수월액보험료_상한 * infl) / 2;
      health += m * (1 + ltc) * 12;
      const other = inc[i].publicPension * 0.5 + (per[i].fin > ev.금융소득_미반영_이하 ? per[i].fin : 0) + work[i].biz + (per[i].rentAmt || 0);
      const extra = R('건보.직장_보수외소득').기준;
      if (other > extra) health += Math.min((other - extra) / 12 * rate, lim.보수외소득_및_지역_상한 * infl) * (1 + ltc) * 12;
      if (!work[i].after65) social += work[i].wage * R('고용보험.요율.근로자');
      if (ages[i] < 60) social += Math.min(work[i].wage / 12, R('국민연금.기준소득월액').상한 * infl) * 12 * npsRate('국민연금.요율.근로자');
    } else if (work[i].biz > 0 && ages[i] < 60) {
      social += Math.min(work[i].biz / 12, R('국민연금.기준소득월액').상한 * infl) * 12 * npsRate('국민연금.요율.지역임의');
    }
  });
  // 피부양자 소득(사람마다, 금액 그대로): 공적연금 + 근로 + 사업·임대 소득금액 + 금융소득(1,000만 넘으면 전부)
  const depIncome = i => inc[i].publicPension + work[i].wage + work[i].biz + (per[i].rentAmt || 0) + (per[i].fin > ev.금융소득_미반영_이하 ? per[i].fin : 0);
  // 사업소득이 있으면 안 된다. 사업자등록이 없는 월세(주택임대사업자 아님)는 소득금액 500만원 이하면 없는 것으로 본다
  // 세법·건보 기준 금액은 법이 바뀌기 전까지 그대로라 물가로 늘리지 않는다
  const bizOK = i => { const ra = per[i].rentAmt || 0, reg = H.rent[i] && H.rent[i].add === R('주택임대.과세').추가공제_등록;
    return !(work[i].biz > 0) && (ra <= 0 || (!reg && ra <= dep.사업소득_미등록_예외_한도)); };
  const incOK = i => depIncome(i) <= dep.소득_한도 && bizOK(i);
  const propOK = i => { const b = H.propBase[i]; return b <= dep.재산과표_한도 || (b <= dep.재산과표_상한 && depIncome(i) <= dep['재산과표_5.4억초과시_소득한도']); };
  const others = ppl.map((_, i) => i).filter(i => !employee[i]);
  const isDep = Array(n).fill(false);
  if (p.dependent) {   // 직장 다니는 자녀: 부부는 둘 다 소득 요건
    const allInc = others.every(incOK);
    others.forEach(i => { if (allInc && propOK(i)) isDep[i] = true; });
  }
  others.forEach(i => { if (!isDep[i] && employee.some(e => e) && incOK(i) && propOK(i)) isDep[i] = true; });   // 직장 다니는 배우자의 피부양자
  // 나머지는 지역가입자로 한 세대
  const loc = others.filter(i => !isDep[i]);
  if (loc.length) {
    const income = loc.reduce((s, i) => s + inc[i].publicPension * 0.5 + (per[i].fin > ev.금융소득_미반영_이하 ? per[i].fin : 0) + work[i].biz + (per[i].rentAmt || 0), 0);
    const base = loc.reduce((s, i) => s + H.propBase[i], 0);
    health += healthInsurance({ business: income, propertyBase: base }).annual;
  }
  const status = ppl.map((_, i) => employee[i] ? '직장' : isDep[i] ? '피부양자' : '지역');
  return { health, social, status };
}

// ── 전체 시뮬레이션 ───────────────────────────────────────
// p: {
//   birthYear, retireAge, planAge(95), spendMonthly(현재 물가, 원), inflation(0.02), returnRate(0.06), cashRate(0.02),
//   annualSaving(현재 물가, 원/년), savingGrowth(기본 = 물가), houseGrowth(기본 = 물가), holdYears, region('대도시'),
//   accounts: [{kind, balance, owner?, rate?, dividendYield?, principal?, publicPrice?}],
//   nps: {mode:'direct', monthly, startAge} | {mode:'auto', years, monthlyIncome, startAge},
//   spouse?: {birthYear, nps}
// }
// opt(개선 방법): {pensionEarly, harvest, giftToSpouse, noDividend, openIsa, fillPension}, pensionLast(옛 기본 순서: 연금계좌 맨 마지막, 비교·테스트용)
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
    // 직접 넣은 금액은 정해진 나이(공단 「내 연금 알아보기」) 기준 → 일찍·늦게 받으면 같은 비율로 줄이고 늘린다
    const claim = npsClaimAge(birthYear);
    let m = n.monthly || 0;
    if (start < claim) m *= R('국민연금.조기수령')[Math.min(5, claim - start) + '년'];
    else if (start > claim) m *= 1 + Math.min(5, start - claim) * 12 * R('국민연금.연기수령')['1개월당_가산'];
    return { start, monthly: m };
  };
  const me = npsOf(q.birthYear, q.nps, q.retireAge);
  q.npsMonthly = me.monthly; q.npsStart = me.start;
  q.persons = [{ birthYear: q.birthYear, npsMonthly: me.monthly, npsStart: me.start, salary: q.salary }];
  if (q.spouse && q.spouse.birthYear) {
    const spRetire = q.retireAge + (q.birthYear - q.spouse.birthYear);   // 같은 해에 은퇴한다고 본다
    const sp = npsOf(q.spouse.birthYear, q.spouse.nps, spRetire);
    q.persons.push({ birthYear: q.spouse.birthYear, npsMonthly: sp.monthly, npsStart: sp.start, salary: q.spouse.salary });
  }
  return q;
}

function simulate(p0, spendOverride, opt = {}) {
  const p = normalize(p0);
  const couple = p.persons.length === 2;
  const spend = spendOverride != null ? spendOverride : p.spendMonthly;
  const { bs, house, houses } = makePeople(p.accounts || [], p.returnRate, p.cashRate, couple);
  const isaFree = sal => sal > 0 && sal <= R('ISA').서민형_총급여_이하 ? R('ISA').비과세_서민형 : R('ISA').비과세_일반;
  const ppl = p.persons.map((x, i) => Object.assign({ b: bs[i], isaFreeLeft: isaFree(x.salary) }, x));
  // 세금 효과만 보려고 비교할 때는 현금 빼고 모든 계좌 수익률을 같은 평균으로 맞춘다
  if (opt.uniformRates) {
    let w = 0, t = 0;
    for (const pp of ppl) for (const k of LIQ) if (k !== 'cash') { w += pp.b[k].bal; t += pp.b[k].bal * pp.b[k].rate; }
    const avg = w > 0 ? t / w : p.returnRate;
    for (const pp of ppl) for (const k of LIQ) if (k !== 'cash') { pp.b[k].rate = avg; (pp.b[k].lots || []).forEach(l => { l.r = avg; }); (pp.b[k].newLots || []).forEach(l => { l.r = avg; }); }
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
      g.lots = mergeLots(g.lots, g.bal, f.lots, move);
      g.bal += move; g.basis += move;
      syncLots(g);
      if (p.retireAge - (p.baseYear - p.birthYear) < 1) notes.push('증여 후 1년 안에 팔면 효과가 없어요');
    }
  }
  // 개선 4: 배당 대신 팔아서 쓰기 — 같은 총수익률의 배당 없는 상품으로 본다
  if (opt.noDividend) ppl.forEach(pp => { for (const k of ['foreign', 'kretf', 'domestic']) { (pp.b[k].lots || []).forEach(l => { l.d = 0; }); (pp.b[k].newLots || []).forEach(l => { l.d = 0; }); pp.b[k].div = 0; } });
  const nowAge = p.baseYear - p.birthYear;
  let debt = p.debt || 0, isaYears = 0, refunds = 0, debtYearly = 0;
  const isaMoves = [];
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
    const H = houseYear(houses, { t, year, infl, ages, couple, p });
    if (age < p.retireAge) {
      let workTax = 0;   // 일하는 동안 배당·이자에서 떼는 세금(장부 확인용)
      for (const pp of ppl) {
        const b = pp.b;
        workTax += b.cash.bal * b.cash.rate * wr + b.foreign.bal * b.foreign.div * 0.15 + (b.domestic.bal * b.domestic.div + b.kretf.bal * b.kretf.div) * wr;
        b.cash.bal *= 1 + b.cash.rate * (1 - wr);
        growLots(b.isa, l => 1 + l.r);
        growLots(b.foreign, l => 1 + l.r - l.d * 0.15);
        growLots(b.domestic, l => 1 + l.r - l.d * wr);
        growLots(b.kretf, l => 1 + l.r - l.d * wr);
        growLots(b.pension, l => 1 + l.r);
        if (opt.harvest) b.foreign.basis += Math.min(harvestCap, clamp0(b.foreign.bal - b.foreign.basis));
      }
      // 저축 넣기. 개선 방법: ISA를 먼저(한 해 2,000만) → 연금계좌(한 해 900만) → 나머지는 지금 자산 비율대로
      const me = ppl[0].b, isaR = R('ISA'), cr = R('연금계좌.세액공제');
      let rest = p.annualSaving * Math.pow(1 + p.savingGrowth, t);
      const toPension = ppl.map(() => 0);
      if (opt.openIsa && rest > 0) { const c = Math.min(rest, isaR.연납입한도); addMoney(me.isa, c); rest -= c; isaYears++; }
      // 연금계좌 채우기: 나 → 배우자(연봉이 있을 때) 순서로 한 사람 900만까지
      if (opt.fillPension) ppl.forEach((pp, i) => {
        if (rest <= 0 || (i > 0 && !(pp.salary > 0))) return;
        const c = Math.min(rest, cr.한도_합산); addMoney(pp.b.pension, c); rest -= c; toPension[i] += c;
      });
      const skip = [...(opt.openIsa ? ['isa'] : []), ...(opt.fillPension ? ['pension'] : [])];   // 한도까지 채운 계좌에는 더 넣지 않음
      const keys0 = LIQ.filter(k => !skip.includes(k));
      const tot0 = ppl.reduce((s, pp) => s + keys0.reduce((a, k) => a + pp.b[k].bal, 0), 0);
      if (!skip.includes('pension')) ppl.forEach((pp, i) => { toPension[i] += tot0 > 0 ? rest * pp.b.pension.bal / tot0 : 0; });   // 비율대로 나눌 때 각자 연금계좌에 들어가는 몫
      addSaving(ppl, rest, skip);
      // 연금계좌 세액공제(일하는 동안, 사람마다): 한 해 900만까지 × 13.2% (총급여 5,500만 이하 16.5%). 연봉이 0이면 공제받을 세금이 없다
      const crRate = sal => sal === 0 ? 0 : (sal && sal <= cr.저소득_총급여_이하_근로만 ? cr.공제율_저소득 : cr.공제율) * (1 + LOCAL);
      let refund = ppl.reduce((s, pp, i) => s + Math.min(toPension[i], cr.한도_합산) * crRate(pp.salary), 0);
      // ISA 3년 만기마다 연금계좌로 옮기기: ISA 세금(비과세 한도 넘는 이익 9.9%) 내고 옮김, 옮긴 돈의 10%(300만까지) 추가 공제
      if (opt.openIsa && isaYears > 0 && isaYears % isaR.의무기간_년 === 0 && me.isa.bal > 0) {
        const free = isaFree(p.salary);
        const isaTax = clamp0(me.isa.bal - me.isa.basis - free) * isaR.초과분_세율 * (1 + LOCAL);
        const moved = me.isa.bal - isaTax;
        refund += Math.min(moved * cr.ISA전환_추가비율, cr.ISA전환_추가한도) * crRate(p.salary);
        me.pension.bal += moved; me.isa.bal = 0; me.isa.basis = 0;
        isaMoves.push({ age, moved, isaTax });
      }
      if (refund > 0) addSaving(ppl, refund, [...new Set([...skip, 'pension'])]);   // 돌려받은 세금은 다시 투자(연금계좌 말고)
      refunds += refund / infl;
      debt = clamp0(debt - p.annualRepay);   // 빚은 가계부 상환액만큼 해마다 준다
      rows.push({ age, year, phase: 'work', infl, inflEnd: infl * (1 + p.inflation), housePrice, bal: snapshot(ppl), saved: p.annualSaving * Math.pow(1 + p.savingGrowth, t), refund, workTax, isaTax: isaMoves.length && isaMoves.at(-1).age === age ? isaMoves.at(-1).isaTax : 0 });
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
      let sevIn = 0;
      ppl.forEach((pp, i) => {
        const sv = (i === 0 ? p.severance : (p.spouse || {}).severance) || null;
        const pb = pp.b.pension;
        if (sv && sv.amount > 0) {
          const amt = sv.amount * infl, tax = retireIncomeTax(amt, sv.years);
          if (!(pb.bal > 0) || !pb.lots || !pb.lots.length) pb.lots = [{ r: p.pensionRate != null ? p.pensionRate : p.returnRate, d: 0, s: 1 }];
          pb.bal += amt; pb.ret += amt; pb.retTax += tax; syncLots(pb); sevIn += amt;
          notes.push(`${i ? '배우자' : '나'} 퇴직금 ${Math.round(amt / MAN).toLocaleString()}만원(그해 돈)을 IRP로 받아요. 퇴직소득세 ${Math.round(tax * (1 + LOCAL) / MAN).toLocaleString()}만원은 꺼낼 때 30~50% 줄여서 내요`);
        }
        // 이미 IRP에 있는 퇴직금인데 이연퇴직소득세를 모르면: 근속 연수(없으면 10년)로 추정
        if (pb.retTaxUnknown > 0) { pb.retTax += retireIncomeTax(pb.retTaxUnknown, (i === 0 ? p.severanceYearsInIrp : (p.spouse || {}).severanceYearsInIrp) || 10); pb.retTaxUnknown = 0; notes.push('연금 계좌 안 퇴직금의 이연퇴직소득세를 근속 연수로 추정했어요'); }
      });
      atRetire = { age, infl, housePrice, bal: snapshot(ppl), debtLeft: debt, severance: sevIn };
      debtYearly = debt > 0 ? Math.max(p.annualRepay || 0, debt / 10) : 0;   // 다 못 갚은 빚은 은퇴 후에도 갚는다(상환액이 없으면 10년)
    }
    const living = spend * 12 * infl;
    const debtRepay = Math.min(debt, debtYearly);
    const need = living + debtRepay;   // 생활비 + 남은 빚 갚기
    // 배당·이자는 연초에 꺼내고 남은 잔액에서 나온다(꺼낸 몫에는 배당이 없음) → 꺼낼 돈과 함께 맞춘다
    // 은퇴 후 버는 돈(그해 돈): 사람마다 근로(총급여)·사업(소득금액)
    // 고용보험: 65세 이후에 새로 고용된 사람은 실업급여 보험료를 내지 않는다(보험료징수법 제13조 제3항). 은퇴 후 일은 은퇴한 해에 시작한다고 본다
    const work = ppl.map(() => ({ wage: 0, biz: 0, after65: false }));
    for (const w of (p.workAfter || [])) {
      const i = Math.min(w.who || 0, ppl.length - 1);
      if (ages[i] > (w.untilAge || 0)) continue;
      const amt = (w.monthly || 0) * 12 * infl;
      if (w.kind === 'business') work[i].biz += amt; else { work[i].wage += amt; work[i].after65 = ages[i] - (age - p.retireAge) >= 65; }
    }
    const earnM = work.map(w => (wageIncomeAmount(w.wage) + w.biz) / 12);   // 월 소득금액
    // 국민연금: 받는 나이부터. 60세 이상 65세 미만인 동안 소득이 A값보다 200만원 이상 많으면 깎인다(제63조의2, 2025-12-16 개정. 감액은 연금의 절반까지)
    const pubs = ppl.map((pp, i) => {
      if (ages[i] < pp.npsStart) return 0;
      let m = pp.npsMonthly * infl;
      const over = earnM[i] - R('국민연금.A값')['2026'] * infl;
      if (over > 0 && ages[i] >= 60 && ages[i] < 65) m -= Math.min(m / 2, progressive(over, R('국민연금.소득활동감액').구간));
      return m * 12;
    });
    const incomeOf = takes => ppl.map((pp, i) => {
      const b = pp.b, tk = takes ? takes[i] : {};
      const left = k => clamp0(b[k].bal - (tk[k] || 0));
      return { publicPension: pubs[i], interest: left('cash') * b.cash.rate, foreignDiv: left('foreign') * b.foreign.div,
        domesticDiv: left('domestic') * b.domestic.div + left('kretf') * b.kretf.div, wage: work[i].wage, biz: work[i].biz, rent: H.rent[i] };
    });
    const financial = ppl.reduce((s, pp) => s + liquidOf(pp.b), 0);
    // 기초연금 소득인정액: 근로는 (월 − 기본공제) × 70%, 사업·임대 소득금액은 그대로. 재산은 집 공시가격 − 임대보증금
    const bpI = R('기초연금.소득인정액_일부');
    const otherM = work.reduce((s, w) => s + clamp0(w.wage / 12 - bpI.근로소득_기본공제 * infl) * (1 - bpI.근로소득_추가공제율) + w.biz / 12, 0) + H.rentAmtTotal / 12;
    const bpHouse = clamp0(H.publicTotal - H.deposits);
    let basic;
    if (couple) basic = basicPensionCouple({ npsMonthly: pubs.map(x => x / 12), eligible: ages.map(a => a >= 65), housePrice: bpHouse, financial, region: p.region, infl, otherMonthly: otherM }).map(v => v * 12);
    else basic = [ages[0] >= 65 ? basicPension({ npsMonthly: pubs[0] / 12, housePrice: bpHouse, financial, region: p.region, infl, otherMonthly: otherM }) * 12 : 0];
    const basicSum = basic[0] + (basic[1] || 0);
    const workCash = work.reduce((s, w) => s + w.wage + w.biz, 0);
    const evalYear = draw => {
      const plan = drawPlan(ppl, draw, ages, p.order, Object.assign({ pensionEarlyAge: p.retireAge }, opt));
      const inc = incomeOf(plan.take);
      const income = inc.reduce((s, x) => s + x.publicPension + x.interest + x.foreignDiv + x.domesticDiv, 0) + basicSum + H.rentCash + workCash;
      const per = ppl.map((pp, i) => personTax(Object.assign({ age: ages[i], take: plan.take[i], gain: plan.gain[i], isaFreeLeft: pp.isaFreeLeft, psplit: plan.psplit[i], pb: pp.b.pension }, inc[i])));
      const hh = healthYear({ ppl, inc, per, work, H, ages, year, p, infl });
      const parts = { pensionAcct: 0, income: 0, foreignDivTax: 0, stock: 0, isa: 0, rent: 0 };
      per.forEach(x => { for (const k in parts) parts[k] += x.parts[k]; });
      parts.health = hh.health;
      parts.social = hh.social;
      parts.house = H.propTax + H.jongbu;
      const total = Object.values(parts).reduce((s, v) => s + v, 0);
      const ev = R('건보.지역.소득평가');
      return { plan, parts, total, per, inc, income, hh, finOver: per.some(x => x.fin > ev.금융소득_미반영_이하) };
    };
    let draw = 0, ev;
    for (let i = 0; i < 60; i++) {
      ev = evalYear(draw);
      const want = clamp0(need + ev.total - ev.income);
      if (Math.abs(want - draw) < 1) { draw = want; break; }
      draw = want;
    }
    ev = evalYear(draw);
    const plan = ev.plan, inc = ev.inc, income = ev.income;
    const surplus = income + plan.taken - need - ev.total;   // 쓰고 남는 돈(배당이 많거나 연금을 미리 꺼낸 경우)
    // 실제로 꺼낸다
    ppl.forEach((pp, i) => {
      const b = pp.b, tk = plan.take[i];
      for (const k of ['isa', 'foreign', 'kretf']) if (tk[k] > 0 && b[k].bal > 0) b[k].basis *= 1 - tk[k] / b[k].bal;
      if (tk.isa > 0) pp.isaFreeLeft = clamp0(pp.isaFreeLeft - plan.gain[i].isa);
      for (const k of ['cash', 'isa', 'foreign', 'domestic', 'kretf']) b[k].bal -= tk[k];
      const pw = tk.pensionIn + tk.pensionOut;
      if (pw > 0) {
        const sp = plan.psplit[i], r = sp.in.ret + sp.out.ret;
        if (r > 0 && b.pension.ret > 0) { b.pension.retTax *= clamp0(1 - r / b.pension.ret); b.pension.ret = clamp0(b.pension.ret - r); }
        b.pension.nd = clamp0(b.pension.nd - sp.in.nd - sp.out.nd);
        b.pension.bal -= pw; b.pension.yearNo += 1;
      }
      // 개선 2: 그해 이익이 250만에 못 미치면 남는 만큼 팔고 다시 사서 원금을 올린다
      if (opt.harvest) b.foreign.basis += Math.min(clamp0(harvestCap - plan.gain[i].foreign), clamp0(b.foreign.bal - b.foreign.basis));
    });
    for (const pp of ppl) for (const k of LIQ) if (pp.b[k].bal < 1) { pp.b[k].bal = 0; if ('basis' in pp.b[k]) pp.b[k].basis = 0; }
    if (plan.short > 1 && depletedAge === null) depletedAge = age;
    debt -= debtRepay;
    const row = {
      age, year, phase: 'retire', infl, inflEnd: infl * (1 + p.inflation), housePrice, need, living, debtRepay,
      publicPension: inc.reduce((s, x) => s + x.publicPension, 0),
      basicPension: basicSum,
      interest: inc.reduce((s, x) => s + x.interest, 0),
      dividend: inc.reduce((s, x) => s + x.foreignDiv + x.domesticDiv, 0),
      take: sumTake(plan.take), tax: ev.parts, taxTotal: ev.total, rent: H.rentCash, work: workCash, healthStatus: ev.hh.status,
      pensionMethod: ev.per.map(x => x.method), finOver: ev.finOver,
      short: Math.min(plan.short, need),            // 생활비 중 못 쓴 돈
      unpaidTax: clamp0(plan.short - need)          // 돈이 바닥나 못 낸 세금·건보료
    };
    for (const pp of ppl) {
      const b = pp.b;
      growLots(b.isa, l => 1 + l.r);
      growLots(b.foreign, l => 1 + l.r - l.d);
      growLots(b.domestic, l => 1 + l.r - l.d);
      growLots(b.kretf, l => 1 + l.r - l.d);
      growLots(b.pension, l => 1 + l.r);
    }
    // 남는 돈은 연말에 다시 투자한다: 해외주식이 있으면 해외주식에(원금도 늘어남), 없으면 현금으로
    if (surplus > 0) {
      const tgt = ppl.find(pp => pp.b.foreign.bal > 0);
      if (tgt) { tgt.b.foreign.bal += surplus; tgt.b.foreign.basis += surplus; } else ppl[0].b.cash.bal += surplus;
    }
    row.bal = snapshot(ppl);
    // 계획 나이에 남은 돈을 한꺼번에 찾을 때 붙는 세금(비교를 공정하게 하려고 넣는다)
    if (age === p.planAge) {
      row.residualTax = ppl.reduce((s, pp) => {
        const b = pp.b;
        return s + clamp0(b.pension.bal - b.pension.nd - b.pension.ret) * R('연금계좌.세율').연금외수령 * (1 + LOCAL) + b.pension.retTax * (1 + LOCAL)
          + foreignStockTax(clamp0(b.foreign.bal - b.foreign.basis))
          + clamp0(b.kretf.bal - b.kretf.basis) * wr
          + clamp0(b.isa.bal - b.isa.basis - pp.isaFreeLeft) * R('ISA').초과분_세율 * (1 + LOCAL);
      }, 0);
    }
    rows.push(row);
  }
  const lastAge = depletedAge === null ? p.endAge + 1 : depletedAge - 1;   // 101 = 100세 이상
  return { params: p, rows, atRetire, lastAge, ok: lastAge >= p.planAge, notes, refunds, isaMoves };
}

function sumTake(takes) {
  const o = {};
  for (const tk of takes) for (const k in tk) o[k] = (o[k] || 0) + tk[k];
  return o;
}
function addSaving(ppl, amount, skip = []) {
  // 매년 저축을 어느 계좌에 넣나: 계좌에 savingShare(몫)를 정했으면 그 몫대로.
  // 정하지 않았으면("모르겠어요") 현금을 뺀 투자 계좌의 잔액 비율대로, 투자 계좌가 없으면 현금으로. skip: 이미 한도까지 채운 계좌 등
  const keys = LIQ.filter(k => !skip.includes(k));
  const cells = [];
  for (const pp of ppl) for (const k of keys) cells.push({ x: pp.b[k], k, me: pp === ppl[0] });
  const sw = cells.reduce((s, c) => s + (c.x.saveW || 0), 0);
  let w;
  if (sw > 0) w = c => (c.x.saveW || 0) / sw;
  else {
    const inv = cells.filter(c => c.k !== 'cash'), it = inv.reduce((s, c) => s + c.x.bal, 0);
    if (it > 0) w = c => c.k === 'cash' ? 0 : c.x.bal / it;
    else { const ct = cells.filter(c => c.k === 'cash').reduce((s, c) => s + c.x.bal, 0); w = c => c.k !== 'cash' ? 0 : ct > 0 ? c.x.bal / ct : (c.me ? 1 : 0); }
  }
  for (const c of cells) addMoney(c.x, amount * w(c));
  // 몫을 정한 계좌가 한도로 빠져(skip) 아무 데도 못 넣으면 현금으로
  if (sw === 0 && !cells.length) addMoney(ppl[0].b.cash, amount);
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
  { id: 'pensionEarly', title: '연금저축·IRP를 쓸 돈이 적어도 해마다 1,500만원까지 꺼내 두기' },
  { id: 'harvest', title: '해외주식은 해마다 이익 250만원만큼 팔고 다시 사기' },
  { id: 'giftToSpouse', title: '해외주식 절반을 배우자 이름으로', couple: true },
  { id: 'noDividend', title: '배당 대신 팔아서 쓰기', needFinOver: true },
  { id: 'openIsa', title: 'ISA에 해마다 2,000만원까지 넣고 3년마다 연금계좌로 옮기기', title0: 'ISA를 만들어 해마다 2,000만원까지 넣고 3년마다 연금계좌로 옮기기', acc: 'isa', work: true },
  { id: 'fillPension', title: '연금저축·IRP에 해마다 900만원까지 넣기', title0: '연금저축·IRP를 만들어 해마다 900만원까지 넣기', acc: 'pension', work: true }
];
// 효과 = 같은 생활비를 쓸 때 세금·건보료가 줄어 생기는 돈(현재 물가 기준)
// - 둘 다 계획 나이까지 버티면: 계획 나이에 세금을 다 내고 남는 돈의 차이
//   (세금 합계만 비교하면 돈을 더 남기는 방법이 남은 돈의 세금 때문에 불리해 보인다)
// - 한쪽이라도 중간에 바닥나면: 먼저 바닥나는 나이까지 낸 세금·건보료의 차이
function netWealthAt(r, age) {
  const x = r.rows.find(y => y.age === age);
  if (!x) return 0;
  // 연말 잔액은 연말 물가로 나눈다(연초 물가로 나누면 물가 한 해만큼 크게 보임)
  return (Object.values(x.bal).reduce((s, v) => s + v, 0) - (x.residualTax || 0)) / (x.inflEnd || x.infl);
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
// 계획 나이 전에 돈이 바닥나는 사람: 효과 = 매달 더 쓸 수 있는 돈 × 12 × 은퇴 기간(수익률은 같게 맞춰서)
function improvements(p0) {
  const base = simulate(p0);
  const baseU = simulate(p0, null, { uniformRates: true });
  const short = baseU.lastAge < baseU.params.planAge;
  const years = baseU.params.planAge - baseU.params.retireAge + 1;
  const baseMU = short ? sustainableMonthly(p0, { uniformRates: true }) : 0;
  const eff = opt => short ? (sustainableMonthly(p0, Object.assign({ uniformRates: true }, opt)) - baseMU) * 12 * years
    : effect(baseU, simulate(p0, null, Object.assign({ uniformRates: true }, opt)));
  const couple = base.params.persons.length === 2;
  const finOver = base.rows.some(x => x.finOver);
  const baseMonthly = sustainableMonthly(p0);
  const list = [];
  for (const m of IMPROVEMENTS) {
    if (m.couple && !couple) continue;
    if (m.needFinOver && !finOver) continue;
    // 은퇴 전 저축으로 넣는 방법: 아직 일하는 해가 있고 저축이 있을 때만
    if (m.work && !(base.params.annualSaving > 0 && base.rows.some(x => x.phase === 'work'))) continue;
    const opt = { [m.id]: true };
    const r = simulate(p0, null, opt);
    const fresh = m.acc ? !(base.rows[0] && base.rows[0].bal[m.acc] > 0) : false;   // 지금 그 계좌가 없으면 '만들어'
    list.push({
      id: m.id, title: fresh && m.title0 ? m.title0 : m.title, fresh,
      saving: eff(opt),
      monthlyGain: sustainableMonthly(p0, opt) - baseMonthly,
      lastAge: r.lastAge, notes: r.notes
    });
  }
  // 효과가 있는 것만(1만원 넘게), 큰 순서. 매달 쓸 수 있는 돈이나 버티는 나이가 줄어드는 방법은 빼요
  const useful = list.filter(x => x.saving > 10000 && x.monthlyGain >= 0 && x.lastAge >= base.lastAge).sort((a, b) => b.saving - a.saving);
  // 함께 쓸 묶음: 효과가 큰 것부터 하나씩 더해 보고, 더해서 효과가 커질 때만 넣는다
  // (예: 저축이 적으면 ISA를 먼저 채우느라 연금계좌 세액공제를 못 받아 둘을 같이 하면 오히려 줄어듦)
  const allOpt = {};
  let best = 0;
  for (const x of useful) {
    const tryOpt = Object.assign({}, allOpt, { [x.id]: true });
    const v = Object.keys(allOpt).length ? eff(tryOpt) : x.saving;
    if (v > best + 10000) { Object.assign(allOpt, { [x.id]: true }); best = v; x.inCombined = true; }
    else { x.inCombined = false; x.notes = x.notes.concat('다른 방법과 같이 하면 효과가 줄어 함께 계산에서 뺐어요'); }
  }
  const all = simulate(p0, null, allOpt);
  return {
    base: { tax: taxToPlan(base), monthly: baseMonthly, lastAge: base.lastAge },
    list: useful,
    measure: short ? 'monthly' : 'wealth',
    combined: { opt: allOpt, saving: best, tax: taxToPlan(all), monthly: sustainableMonthly(p0, allOpt), lastAge: all.lastAge }
  };
}

const api = {
  BASE_YEAR, ASSUMPTIONS, ORDER_BASIC, IMPROVEMENTS, KIND,
  progressive, incomeTax, pensionDeduction, pensionAcctRate, comprehensiveTax, privatePensionTax,
  foreignStockTax, pensionAnnualLimit, housePropertyBase, healthPropertyMonthly, healthInsurance,
  propertyTax, jongbuTax, npsEstimate, retireIncomeTax, pensionSplit, retireDrawTax, wageIncomeAmount, growLots, houseYear, healthYear, npsClaimAge, basicPension, basicPensionCouple,
  simulate, sustainableMonthly, summary, improvements, taxToPlan, effect, netWealthAt
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Retire = api;
})(typeof window !== 'undefined' ? window : globalThis);
