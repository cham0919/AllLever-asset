// 은퇴 설계 엔진 검산 테스트: node --test tools/retire/
// 기대값은 모두 손으로 계산한 값이다(계산 과정은 각 테스트 주석).
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../js/retire.js');

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('1. 종합소득세 세율표: 과세표준 3,000만', () => {
  // 1,400만까지 84만 + 1,600만 × 15% = 324만
  near(E.incomeTax(30000000), 3240000);
});

test('2. 연금소득공제: 1,000만과 한도 900만', () => {
  // 350만 + 350만×40% + 300만×20% = 350 + 140 + 60 = 550만
  near(E.pensionDeduction(10000000), 5500000);
  near(E.pensionDeduction(300000000), 9000000);
});

test('3. 연금계좌 나이별 세율', () => {
  assert.equal(E.pensionAcctRate(69), 0.05);
  assert.equal(E.pensionAcctRate(70), 0.04);
  assert.equal(E.pensionAcctRate(80), 0.03);
});

test('4. 연금계좌 1,500만 이하: 65세 1,200만', () => {
  // 1,200만 × 5% × 1.1 = 66만
  const r = E.privatePensionTax({ inLimit: 12000000, age: 65 });
  near(r.tax, 660000); assert.equal(r.method, '저율');
});

test('5. 연금계좌 1,500만 초과: 78세 2,400만, 다른 소득 없음 → 종합과세가 유리', () => {
  // 분리과세: 2,400만 × 15% × 1.1 = 396만
  // 종합과세: 연금소득공제 490 + 700×20% + 1,000×10% = 730만 → 연금소득금액 1,670만
  //   인적공제 150 + 경로 100 = 250만 → 과표 1,420만 → 84만 + 20만×15% = 87만 − 표준세액공제 7만 = 80만 × 1.1 = 88만
  const r = E.privatePensionTax({ inLimit: 24000000, age: 78 });
  assert.equal(r.method, '종합과세'); near(r.tax, 880000);
});

test('6. 연금계좌 1,500만 초과에 국민연금이 크면 → 16.5% 분리과세가 유리', () => {
  // 국민연금 5,000만만: 공제 900만 → 4,100만 − 150만 = 3,950만 → 84 + 2,550×15% = 466.5 − 7 = 459.5만
  // 합치면 7,400만: 6,500만 − 150만 = 6,350만 → 624 + 1,350×24% = 948 − 7 = 941만
  // 늘어나는 세금 481.5만 × 1.1 = 529.65만 > 분리과세 396만 → 분리과세
  const r = E.privatePensionTax({ inLimit: 24000000, age: 66, publicPension: 50000000 });
  assert.equal(r.method, '분리과세'); near(r.tax, 3960000);
});

test('7. 해외주식 양도세: 이익 1,000만', () => {
  // (1,000만 − 250만) × 20% × 1.1 = 165만
  near(E.foreignStockTax(10000000), 1650000);
  near(E.foreignStockTax(2000000), 0);
});

test('8. 연금계좌 연간 수령 한도', () => {
  // 1억 ÷ (11 − 1) × 1.2 = 1,200만, 11년차부터 한도 없음
  near(E.pensionAnnualLimit(100000000, 1), 12000000);
  assert.equal(E.pensionAnnualLimit(100000000, 11), Infinity);
});

test('9. 건강보험료: 국민연금 1,800만 + 금융소득 500만 + 집 공시 5억', () => {
  // 소득: 1,800만 × 50% ÷ 12 = 75만 × 7.19% = 53,925 (금융소득 1,000만 이하라 미반영)
  // 재산: 5억 × 44% = 2.2억 − 1억 = 1.2억(12,000만) → 20등급 490점 × 211.5 = 103,635
  // 합계 157,560 × (1 + 13.14% 장기요양) = 178,263.38
  const r = E.healthInsurance({ publicPension: 18000000, interest: 5000000, housePrice: 500000000 });
  near(r.monthly, 178263.38, 0.5); assert.equal(r.finCounted, false);
});

test('10. 건강보험료: 금융소득 1,000만 넘으면 전액 반영', () => {
  // (1,800만 × 50% + 1,200만) ÷ 12 = 175만 × 7.19% = 125,825
  const r = E.healthInsurance({ publicPension: 18000000, interest: 12000000 });
  near(r.incomePart, 125825); assert.equal(r.finCounted, true);
});

test('11. 재산세: 1세대 1주택 공시 3억', () => {
  // 과표 3억 × 43% = 1.29억 → 특례세율 3만 + 6,900만 × 0.1% = 99,000
  // 도시지역분 1.29억 × 0.14% = 180,600, 지방교육세 99,000 × 20% = 19,800 → 299,400
  near(E.propertyTax(300000000), 299400);
});

test('12. 종부세: 1세대 1주택 공시 15억, 72세, 12년 보유', () => {
  // 과표 (15억 − 12억) × 60% = 1.8억 × 0.5% = 90만
  // 재산세 공제: 재산세(6.75억 과표) 207만 × (1.8억×45%×0.4% ÷ 207만) = 32.4만 → 57.6만
  // 고령 40% + 장기 40% = 80% 공제 → 11.52만 × 1.2(농특세) = 138,240
  near(E.jongbuTax(1500000000, { age: 72, holdYears: 12 }), 138240);
  near(E.jongbuTax(1100000000, { age: 72 }), 0);
});

test('13. 국민연금 자동 계산: 평균소득자 40년 = 소득대체율 43%', () => {
  // 1.29 × (A + A) × (1 + 0.05 × 240 ÷ 12) ÷ 12 = 1.29 × 2 × 3,193,511 × 2 ÷ 12 = 1,373,209.7
  const m = E.npsEstimate({ birthYear: 2000, years: 40, monthlyIncome: 3193511, endYear: 2065 });
  near(m, 1373209.7, 0.5);
  // 15년: × (0.5 + 0.05 × 5) = 0.75 → 514,953.6, 2년 당겨 받으면 × 0.88
  near(E.npsEstimate({ birthYear: 2000, years: 15, monthlyIncome: 3193511, endYear: 2040 }), 514953.6, 0.5);
  near(E.npsEstimate({ birthYear: 2000, years: 15, monthlyIncome: 3193511, endYear: 2040, startAge: 63 }), 514953.6 * 0.88, 0.5);
});

test('14. 금융소득 2,000만 초과 종합과세: 이자 3,000만, 다른 소득 없음', () => {
  // 일반: 2,000만×14% + (1,000만 − 150만)×6% = 280 + 51 = 331만
  // 비교: 3,000만 × 14% = 420만 → 큰 쪽 420만 − 7만 = 413만 × 1.1 = 454.3만
  near(E.comprehensiveTax({ interest: 30000000, age: 66 }).total, 4543000);
  // 2,000만 이하: 1,000만 × 14% × 1.1 = 154만
  near(E.comprehensiveTax({ interest: 10000000, age: 66 }).total, 1540000);
});

test('15. 기초연금: 소득·재산 없으면 기준연금액 전액, 금융자산 10억이면 0원', () => {
  near(E.basicPension({ npsMonthly: 0, housePrice: 0, financial: 0 }), 349700);
  // (10억 − 2,000만) × 4% ÷ 12 = 326.7만 > 선정기준액 247만
  near(E.basicPension({ npsMonthly: 0, housePrice: 0, financial: 1e9 }), 0);
});

const tiny = {
  birthYear: 1966, retireAge: 60, planAge: 61, spendMonthly: 1000000, inflation: 0, cashRate: 0,
  accounts: [{ kind: '현금', balance: 30000000, rate: 0 }]
};

test('16. 버티는 나이: 현금 3,000만, 월 100만, 물가·이자 0', () => {
  // 한 해 1,200만 + 건보료 최저 20,160 × 1.1314 × 12 = 273,709 → 1,227만
  // 60, 61세는 다 쓰고 62세에 모자람 → 버티는 나이 61세
  const r = E.simulate(tiny);
  assert.equal(r.lastAge, 61);
  near(r.rows[0].tax.health, 20160 * 1.1314 * 12, 1);
});

test('17. 계획 나이까지 쓸 수 있는 돈: 같은 조건, 61세까지', () => {
  // 2 × (12S + 273,709) ≤ 3,000만 → S ≤ 1,227,190 → 천 원 단위 내림 1,227,000
  assert.equal(E.sustainableMonthly(tiny), 1227000);
});

test('18. 기본 꺼내 쓰는 순서: 현금 → 해외주식, 연금은 마지막', () => {
  const r = E.simulate({
    birthYear: 1966, retireAge: 60, planAge: 95, spendMonthly: 2000000, inflation: 0, cashRate: 0,
    accounts: [{ kind: '현금', balance: 10000000, rate: 0 }, { kind: '해외주식', balance: 100000000, principal: 50000000, rate: 0 },
      { kind: '연금저축', balance: 50000000, rate: 0 }]
  });
  const y = r.rows[0];
  near(y.take.cash, 10000000);
  assert.ok(y.take.foreign > 14000000);
  assert.equal(y.take.pensionIn + y.take.pensionOut, 0);
  // 판 돈의 절반이 이익 → (이익 − 250만) × 22%
  near(y.tax.stock, (y.take.foreign / 2 - 2500000) * 0.22, 1);
});

// ── 2단계: 부부, 국내상장 해외ETF, 개선 방법 ──

test('19. 부부 기초연금: 둘 다 65세 이상, 소득·재산 없음 → 각각 20% 감액', () => {
  // 349,700 × 0.8 = 279,760
  const r = E.basicPensionCouple({ npsMonthly: [0, 0], eligible: [true, true], housePrice: 0, financial: 0 });
  near(r[0], 279760); near(r[1], 279760);
  near(E.basicPensionCouple({ npsMonthly: [0, 0], eligible: [true, false], housePrice: 0, financial: 0 })[0], 349700);
});

test('20. 국내상장 해외ETF: 팔아서 남긴 이익도 배당소득 15.4%', () => {
  // 생활비 1,200만 + 건보료 최저 273,709 + 세금(꺼낸 돈의 절반이 이익 × 15.4%)
  // 꺼낸 돈 D = 12,273,709 + 0.077 D → D = 13,297,626, 세금 = 0.077 D = 1,023,917
  const r = E.simulate({ birthYear: 1966, retireAge: 60, planAge: 61, spendMonthly: 1000000, inflation: 0, cashRate: 0,
    accounts: [{ kind: '국내상장 해외ETF', balance: 100000000, principal: 50000000, rate: 0 }] });
  near(r.rows[0].tax.income, 1023917, 2);
  near(r.rows[0].take.kretf, 13297626, 2);
});

const pair = {
  birthYear: 1966, retireAge: 60, planAge: 61, spendMonthly: 750000, inflation: 0, cashRate: 0,
  accounts: [{ kind: '해외주식', balance: 50000000, principal: 25000000, rate: 0, owner: '나' },
    { kind: '해외주식', balance: 50000000, principal: 25000000, rate: 0, owner: '배우자' }]
};
test('21. 부부는 250만 공제를 사람마다 받는다', () => {
  // 꺼낸 돈 약 927만 → 이익 약 463만. 혼자면 (463 − 250) × 22% > 0, 부부면 한 사람 232만이라 0원
  const single = E.simulate(pair);
  const couple = E.simulate(Object.assign({ spouse: { birthYear: 1966 } }, pair));
  assert.ok(single.rows[0].tax.stock > 400000);
  near(couple.rows[0].tax.stock, 0);
});

test('22. 배우자 명의로 옮기면 옮길 때 가격이 새 원금 → 양도세가 줄어든다', () => {
  const base = Object.assign({ spouse: { birthYear: 1966 } }, pair, {
    spendMonthly: 2000000,
    accounts: [{ kind: '해외주식', balance: 100000000, principal: 20000000, rate: 0, owner: '나' }] });
  const a = E.simulate(base), b = E.simulate(base, null, { giftToSpouse: true });
  assert.ok(b.rows[0].tax.stock < a.rows[0].tax.stock);
});

test('23. 해마다 이익 250만원만큼 팔고 다시 사기: 원금이 해마다 250만 오른다', () => {
  // 60·61·62세 세 번 → 원금 750만. 62세에 남은 해외주식의 세금:
  //   그냥: (1억 − 250만) × 22% = 2,145만 / 실현: (1억 − 750만 − 250만) × 22% = 1,980만
  const p = { birthYear: 1966, retireAge: 60, planAge: 62, spendMonthly: 0, inflation: 0, cashRate: 0,
    accounts: [{ kind: '해외주식', balance: 100000000, principal: 0, rate: 0 }, { kind: '현금', balance: 10000000, rate: 0 }] };
  const row = r => r.rows.find(x => x.age === 62);
  near(row(E.simulate(p)).residualTax, 21450000, 1);
  near(row(E.simulate(p, null, { harvest: true })).residualTax, 19800000, 1);
});

test('24. 연금 일찍 꺼내기: 쓸 돈이 적어도 1,500만(한도 안)까지 꺼낸다', () => {
  // 한도: 1억 ÷ 10 × 1.2 = 1,200만 → 1,200만 꺼냄, 세금 1,200만 × 5.5% = 66만
  const r = E.simulate({ birthYear: 1966, retireAge: 60, planAge: 61, spendMonthly: 500000, inflation: 0, cashRate: 0,
    accounts: [{ kind: '연금저축', balance: 100000000, rate: 0 }, { kind: '현금', balance: 50000000, rate: 0 }] }, null, { pensionEarly: true });
  near(r.rows[0].take.pensionIn, 12000000);
  near(r.rows[0].tax.pensionAcct, 660000);
});

test('25. 배당 대신 팔아서 쓰기: 배당이 0이 된다', () => {
  const p = { birthYear: 1966, retireAge: 60, planAge: 61, spendMonthly: 1000000, inflation: 0, cashRate: 0,
    accounts: [{ kind: '해외주식', balance: 100000000, dividendYield: 0.04, rate: 0.05 }] };
  near(E.simulate(p).rows[0].dividend, 4000000);
  near(E.simulate(p, null, { noDividend: true }).rows[0].dividend, 0);
});

test('26. 세금 줄이기 목록: 혼자면 배우자 방법이 없고, 효과가 있는 것만 큰 순서로', () => {
  const p = { birthYear: 1975, retireAge: 55, planAge: 95, spendMonthly: 3000000, annualSaving: 10000000,
    accounts: [{ kind: '해외주식', balance: 2e8, principal: 1.2e8, dividendYield: 0.006 }, { kind: '연금저축', balance: 2e8 }, { kind: '현금', balance: 2e7 }],
    nps: { mode: 'direct', monthly: 1100000 } };
  const im = E.improvements(p);
  assert.ok(!im.list.some(x => x.id === 'giftToSpouse'));
  assert.ok(im.list.length > 0);
  for (let i = 1; i < im.list.length; i++) assert.ok(im.list[i - 1].saving >= im.list[i].saving);
  assert.ok(im.list.every(x => x.saving > 10000));
});
