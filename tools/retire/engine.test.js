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

test('18. 기본 순서: 55세부터 연금계좌를 1,500만(한도) 안에서 먼저, 그다음 현금 → 해외주식', () => {
  const p = {
    birthYear: 1966, retireAge: 60, planAge: 95, spendMonthly: 2000000, inflation: 0, cashRate: 0,
    accounts: [{ kind: '현금', balance: 10000000, rate: 0 }, { kind: '해외주식', balance: 100000000, principal: 50000000, rate: 0 },
      { kind: '연금저축', balance: 50000000, rate: 0 }]
  };
  // 연금 한도 = 5,000만 ÷ 10 × 1.2 = 600만 → 600만 먼저, 현금 1,000만, 나머지 해외주식
  const y = E.simulate(p).rows[0];
  near(y.take.pensionIn, 6000000); near(y.take.cash, 10000000);
  assert.ok(y.take.foreign > 8000000);
  near(y.tax.stock, Math.max(0, y.take.foreign / 2 - 2500000) * 0.22, 1);
  // 옛 순서(연금계좌 맨 마지막)
  const o = E.simulate(p, null, { pensionLast: true }).rows[0];
  near(o.take.cash, 10000000); assert.equal(o.take.pensionIn + o.take.pensionOut, 0); assert.ok(o.take.foreign > 14000000);
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
  const y = E.simulate(p).rows[0];
  near(y.dividend, (100000000 - y.take.foreign) * 0.04);   // 배당은 꺼내고 남은 잔액에서 나온다
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

test('27. 빚: 해마다 상환액만큼 줄고, 은퇴할 때 남은 빚은 현금으로 갚는다', () => {
  // 지금 58세, 60세 은퇴. 빚 5,000만, 한 해 1,000만 상환 → 58·59세 두 해 → 3,000만 남음 → 현금 1억에서 갚아 7,000만
  const r = E.simulate({ birthYear: 1968, retireAge: 60, planAge: 61, spendMonthly: 0, inflation: 0, cashRate: 0,
    debt: 50000000, annualRepay: 10000000, accounts: [{ kind: '현금', balance: 100000000, rate: 0 }] });
  near(r.atRetire.bal.cash, 70000000); near(r.atRetire.debtLeft, 0);
});

test('28. 연금계좌에 들어간 저축은 세액공제를 돌려받아 다시 넣는다', () => {
  // 연금저축만 있음, 한 해 저축 1,000만 → 공제 한도 900만 × 13.2% = 118.8만. 연봉 5,000만이면 16.5% → 148.5만
  const p = s => ({ birthYear: 1967, retireAge: 60, planAge: 61, spendMonthly: 0, inflation: 0, returnRate: 0, annualSaving: 10000000, salary: s,
    accounts: [{ kind: '연금저축', balance: 10000000, rate: 0 }] });
  // 돌려받은 세금은 연금계좌가 아닌 다른 곳(여기서는 현금)에 다시 넣는다
  const a = E.simulate(p(80000000)).atRetire.bal, b = E.simulate(p(50000000)).atRetire.bal;
  near(a.pension, 20000000); near(a.cash, 1188000); near(b.cash, 1485000);
});

test('29. ISA 먼저 채우고 3년마다 연금계좌로: 옮긴 돈 10%(300만 한도)만큼 추가 공제', () => {
  // 현금만, 수익률 0, 한 해 저축 2,500만, 3년 일함 → ISA 해마다 2,000만, 현금 500만
  // 3년째 ISA 6,000만(이익 0) → 연금계좌로. 추가 공제 min(600만, 300만) × 13.2% = 39.6만(현금으로)
  const r = E.simulate({ birthYear: 1969, retireAge: 60, planAge: 61, spendMonthly: 0, inflation: 0, cashRate: 0, returnRate: 0, annualSaving: 25000000, salary: 80000000,
    accounts: [{ kind: '현금', balance: 10000000, rate: 0 }] }, null, { openIsa: true });
  near(r.atRetire.bal.pension, 60000000);
  near(r.atRetire.bal.isa, 0);
  near(r.atRetire.bal.cash, 10000000 + 15000000 + 396000);
});

test('30. ISA 다음 연금계좌: 저축 2,500만 → ISA 2,000만, 연금 500만(공제 66만)', () => {
  const r = E.simulate({ birthYear: 1965, retireAge: 62, planAge: 63, spendMonthly: 0, inflation: 0, cashRate: 0, returnRate: 0, annualSaving: 25000000, salary: 80000000,
    accounts: [{ kind: '현금', balance: 10000000, rate: 0 }] }, null, { openIsa: true, fillPension: true });
  near(r.atRetire.bal.isa, 20000000); near(r.atRetire.bal.pension, 5000000); near(r.atRetire.bal.cash, 10000000 + 660000);
});

// ── 경우별 점검에서 찾아 고친 규칙들 ──
const z = o => Object.assign({ birthYear: 1966, retireAge: 60, planAge: 61, inflation: 0, cashRate: 0, returnRate: 0 }, o);
const HI_MIN = 20160 * 1.1314 * 12;   // 건보료 최저 273,709

test('31. 55세 전에는 연금계좌를 해지해서만 꺼내고 16.5%를 낸다', () => {
  // 50세, 연금저축 1억뿐, 생활비 월 100만 → D = (1,200만 + 273,709) ÷ (1 − 16.5%) = 14,698,753
  const r = E.simulate(z({ birthYear: 1976, retireAge: 50, spendMonthly: 1000000, accounts: [{ kind: '연금저축', balance: 1e8, rate: 0 }] }));
  const y = r.rows[0], D = (12e6 + HI_MIN) / 0.835;
  near(y.take.pensionIn, 0); near(y.take.pensionOut, D, 2); near(y.tax.pensionAcct, D * 0.165, 2);
});

test('32. 연금 수령 한도를 넘는 돈은 연금외수령 16.5%', () => {
  // 60세 1년차 한도 1,200만(5.5% = 66만). 생활비 2,000만 → D(1 − 0.165) = 2,000만 + 273,709 + 66만 − 1,200만 × 0.165
  const r = E.simulate(z({ spendMonthly: 20e6 / 12, accounts: [{ kind: '연금저축', balance: 1e8, rate: 0 }] }));
  const y = r.rows[0], D = (20e6 + HI_MIN + 660000 - 12e6 * 0.165) / 0.835;
  near(y.take.pensionIn, 12e6); near(y.take.pensionOut, D - 12e6, 2); near(y.tax.pensionAcct, 660000 + (D - 12e6) * 0.165, 2);
});

test('33. ISA: 이익 200만원 넘는 부분만 9.9%', () => {
  // 원금 절반 → 이익 = D/2. D = 12,273,709 + 0.099 × (D/2 − 200만) → D = 12,075,709 ÷ 0.9505
  const r = E.simulate(z({ spendMonthly: 1e6, accounts: [{ kind: 'ISA', balance: 1e8, principal: 5e7, rate: 0 }] }));
  const D = (12e6 + HI_MIN - 198000) / 0.9505;
  near(r.rows[0].take.isa, D, 2); near(r.rows[0].tax.isa, 0.0495 * D - 198000, 2);
});

test('34. 국민연금 받는 나이: 출생 연도별', () => {
  assert.equal(E.npsClaimAge(1960), 62); assert.equal(E.npsClaimAge(1965), 64); assert.equal(E.npsClaimAge(1970), 65);
});

test('35. 기초연금 소득역전 방지 감액(혼자): 선정기준액을 넘는 만큼만 깎음', () => {
  // 금융자산 7.1억 → (7.1억 − 2,000만) × 4% ÷ 12 = 230만 = 소득인정액. 230만 + 34.97만 > 247만 → 247만 − 230만 = 17만
  near(E.basicPension({ npsMonthly: 0, housePrice: 0, financial: 710000000 }), 170000);
  // 차이가 기준연금액의 10%(34,970)보다 작으면 10% 지급: 소득인정액 246만
  near(E.basicPension({ npsMonthly: 0, housePrice: 0, financial: 20000000 + 2460000 * 12 / 0.04 }), 34970);
});

test('36. 기초연금 소득역전 방지 감액(부부): 합계를 깎고 비율대로 나눔', () => {
  // 소득인정액 380만, 둘 다 279,760 → 합 559,520. 395.2만 − 380만 = 15.2만 → 7.6만씩
  const r = E.basicPensionCouple({ npsMonthly: [0, 0], eligible: [true, true], housePrice: 0, financial: 1160000000 });
  near(r[0], 76000); near(r[1], 76000);
});

test('37. 은퇴 때 다 못 갚은 빚은 은퇴 후 해마다 갚는다(상환액 없으면 10년)', () => {
  // 현금 1억으로 3억 중 1억 갚음 → 2억 남음 → 해마다 2,000만
  const r = E.simulate(z({ spendMonthly: 0, debt: 3e8, accounts: [{ kind: '현금', balance: 1e8, rate: 0 }] }));
  near(r.atRetire.debtLeft, 2e8); near(r.rows[0].debtRepay, 2e7); near(r.rows[0].living, 0);
});

// ── 11/26 보강: 퇴직금·연금 계좌 돈 나누기·국민연금 시기·근로·월세·집 여러 채·피부양자·줄별 수익률 ──
test('38. 퇴직소득세: 퇴직금 1억, 근속 20년', () => {
  // 근속연수공제 1,500만 + (20−10)×250만 = 4,000만 → (1억 − 4,000만) × 12 ÷ 20 = 환산급여 3,600만
  // 환산급여공제 800만 + (3,600만 − 800만) × 60% = 2,480만 → 과표 1,120만 × 6% = 67.2만 → ÷ 12 × 20 = 112만
  near(E.retireIncomeTax(100000000, 20), 1120000);
});
test('39. 연금 계좌 돈 나누기 순서: 세액공제 안 받은 돈 → 퇴직금 → 나머지', () => {
  const sp = E.pensionSplit({ nd: 100, ret: 200 }, 250, 100);
  assert.deepEqual(sp, { in: { nd: 100, ret: 150, rest: 0 }, out: { nd: 0, ret: 50, rest: 50 } });
});
test('40. 퇴직금을 연금으로 받을 때 세금: 10년차까지 70%, 11년차부터 60%, 연금 밖은 100%', () => {
  // 이연퇴직소득 1억·세금 500만 중 1,000만을 꺼냄 → 50만 × 70% × 1.1 = 38.5만
  const pb = { ret: 1e8, retTax: 5e6 };
  near(E.retireDrawTax(pb, { in: { ret: 1e7 }, out: { ret: 0 } }, 5), 385000);
  near(E.retireDrawTax(pb, { in: { ret: 1e7 }, out: { ret: 0 } }, 12), 330000);
  near(E.retireDrawTax(pb, { in: { ret: 0 }, out: { ret: 1e7 } }, 5), 550000);
});
test('41. 국민연금 직접 입력 금액도 2년 일찍 받으면 12% 줄어든다', () => {
  // 1985년생 정해진 나이 65세 → 63세: × 0.88
  const r = E.simulate({ birthYear: 1985, retireAge: 55, spendMonthly: 0, nps: { mode: 'direct', monthly: 1000000, startAge: 63 }, accounts: [] });
  near(r.params.npsMonthly, 880000);
});
test('42. 집이 두 채면 재산세 과표 비율 60%, 1주택 특례세율 없음', () => {
  near(E.housePropertyBase(5e8, false), 3e8);
  near(E.housePropertyBase(5e8, true), 5e8 * 0.44);
  assert.ok(E.propertyTax(5e8, false) > E.propertyTax(5e8, true));
});
test('43. 월세 1,200만(집 두 채, 다른 소득 없음): 분리과세 61.6만보다 종합과세 22만이 적다', () => {
  // 분리: (1,200만 × 50% − 200만) × 14% × 1.1 = 61.6만
  // 종합: 소득금액 600만 − 기본공제 150만 = 450만 × 6% = 27만 − 표준세액공제 7만 = 20만 × 1.1 = 22만
  // personTax는 내부 함수라 집 두 채 시뮬레이션의 첫해로 확인
  const res = E.simulate({ birthYear: 1960, retireAge: 66, spendMonthly: 0, planAge: 70, endAge: 66, baseYear: 2026, nps: { mode: 'direct', monthly: 0 },
    accounts: [{ kind: '집', balance: 5e8, publicPrice: 3e8, use: 'live' }, { kind: '집', balance: 3e8, publicPrice: 2e8, use: 'rent', rent: 1e6 }] });
  near(res.rows[0].tax.rent, 220000, 2);
  near(res.rows[0].rent, 12e6);
});
test('44. 근로소득세: 총급여 3,000만(62세, 다른 소득 없음)', () => {
  // 근로소득공제 750만 + 1,500만 × 15% = 975만 → 근로소득금액 2,025만 − 150만 = 1,875만
  // 산출 84만 + 475만 × 15% = 155.25만, 근로세액공제 71.5만 + 25.25만 × 30% = 79.075만 → 한도 74만
  // 155.25 − 13(표준) − 74 = 68.25만 × 1.1 = 75.075만
  near(E.wageIncomeAmount(3e7), 20250000);
  near(E.comprehensiveTax({ wage: 3e7, other: E.wageIncomeAmount(3e7), age: 62 }).total, 750750);
});
test('45. 피부양자: 국민연금 1,800만·재산 기준 안 → 건보료 0, 2,100만이면 지역가입자', () => {
  const base = { ppl: [{}], work: [{ wage: 0, biz: 0 }], H: { propBase: [3e8], rent: [null] }, ages: [66], year: 2040, infl: 1, p: { dependent: true } };
  assert.equal(E.healthYear(Object.assign({}, base, { inc: [{ publicPension: 18e6 }], per: [{ fin: 0, rentAmt: 0 }] })).health, 0);
  assert.ok(E.healthYear(Object.assign({}, base, { inc: [{ publicPension: 21e6 }], per: [{ fin: 0, rentAmt: 0 }] })).health > 0);
});
test('46. 부부가 자녀의 피부양자가 되려면 둘 다 소득 요건: 배우자가 2,500만이면 둘 다 지역가입자', () => {
  const r = E.healthYear({ ppl: [{}, {}], work: [{ wage: 0, biz: 0 }, { wage: 0, biz: 0 }], H: { propBase: [1e8, 1e8], rent: [null, null] }, ages: [66, 64], year: 2040, infl: 1, p: { dependent: true },
    inc: [{ publicPension: 15e6 }, { publicPension: 25e6 }], per: [{ fin: 0 }, { fin: 0 }] });
  assert.deepEqual(r.status, ['지역', '지역']);
  assert.ok(r.health > 0);
});
test('47. 한 계좌 안 줄별 수익률: QLD 반(10%) + 커버드콜 반(6%, 배당 12%) → 1년 뒤 비중이 바뀐다', () => {
  // 은퇴 후(배당은 꺼냄): 1.10과 0.94 → 합 1.02. QLD 비중 0.55 ÷ 1.02 = 0.5392
  const x = { bal: 100, rate: 0, div: 0, lots: [{ r: 0.10, d: 0, s: 0.5 }, { r: 0.06, d: 0.12, s: 0.5 }] };
  E.growLots(x, l => 1 + l.r - l.d);
  near(x.bal, 102, 1e-9);
  near(x.lots[0].s, 0.55 / 1.02, 1e-9);
  near(x.div, 0.47 / 1.02 * 0.12, 1e-9);
});
test('48. 은퇴할 때 퇴직금 → IRP(이연퇴직소득)로 들어가고, 연봉이 0이면 연금계좌 세액공제가 없다', () => {
  const p = { birthYear: 1971, retireAge: 60, spendMonthly: 0, baseYear: 2026, salary: 0, annualSaving: 1e7, inflation: 0, returnRate: 0, cashRate: 0,
    severance: { amount: 1e8, years: 20 }, nps: { mode: 'direct', monthly: 0 }, accounts: [{ kind: 'IRP', balance: 1e7 }] };
  const r = E.simulate(p);
  assert.equal(r.refunds, 0);
  // 수익률 0: IRP 1,000만 + 5년 저축 5,000만(계좌가 IRP뿐이라 모두 IRP로) + 퇴직금 1억 = 1억 6,000만
  near(r.atRetire.bal.pension, 1.6e8);
  assert.ok(r.notes.some(n => n.includes('퇴직금')));
});
