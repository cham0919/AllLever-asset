// 은퇴 설계 엔진 자동 점검: 무작위 입력 N개로 "절대 깨지면 안 되는 규칙"을 확인한다.
// 실행: node tools/qa/retire-scenarios.js [개수=300] [시드=1]
const E = require('../../js/retire.js');

const N = Number(process.argv[2] || 300);
let seed = Number(process.argv[3] || 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);

function randomInput() {
  const birthYear = Math.floor(between(1955, 2000));
  const nowAge = 2026 - birthYear;
  const retireAge = Math.max(nowAge, Math.floor(between(40, 66)));
  const kinds = ['해외주식', '국내주식', '국내상장 해외ETF', '연금저축', 'IRP', 'ISA', '현금', '집'];
  const couple = rnd() < 0.4;
  const accounts = [];
  const n = 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const kind = pick(kinds);
    const balance = Math.round(between(0, kind === '집' ? 2e9 : 8e8));
    const a = { kind, balance, owner: couple ? pick(['나', '배우자', '공동']) : '나' };
    if (rnd() < 0.5) a.rate = between(0, 0.1);
    if (/주식|ETF/.test(kind)) { a.dividendYield = pick([0, 0.006, 0.015, 0.035]); a.principal = Math.round(balance * between(0.2, 1.3)); }
    if (kind === '집') a.publicPrice = Math.round(balance * between(0.5, 0.8));
    accounts.push(a);
  }
  const p = {
    birthYear, retireAge, planAge: pick([90, 95, 100]),
    spendMonthly: Math.round(between(1e6, 8e6)), annualSaving: Math.round(between(0, 5e7)),
    inflation: pick([0, 0.02, 0.03]), returnRate: pick([0.03, 0.06, 0.08]), accounts,
    nps: rnd() < 0.5 ? { mode: 'direct', monthly: Math.round(between(0, 2e6)) } : { mode: 'auto', years: Math.floor(between(0, 40)), monthlyIncome: Math.round(between(5e5, 7e6)) }
  };
  if (couple) p.spouse = { birthYear: birthYear + Math.floor(between(-5, 6)), nps: { mode: 'direct', monthly: Math.round(between(0, 1.5e6)) } };
  return p;
}

const fails = [];
const check = (cond, msg, p) => { if (!cond) fails.push({ msg, p }); };
const finite = v => Number.isFinite(v);
const t0 = Date.now();
for (let c = 0; c < N; c++) {
  const p = randomInput();
  let r;
  try { r = E.simulate(p); } catch (e) { fails.push({ msg: '오류: ' + e.message, p }); continue; }
  for (const x of r.rows) {
    for (const [k, v] of Object.entries(x.bal)) {
      check(finite(v) && v >= -1, `${x.age}세 ${k} 잔액이 음수이거나 숫자가 아님: ${v}`, p);
    }
    if (x.phase === 'retire') {
      check(finite(x.taxTotal) && x.taxTotal >= 0, `${x.age}세 세금이 음수이거나 숫자가 아님`, p);
      for (const [k, v] of Object.entries(x.tax)) check(finite(v) && v >= -1, `${x.age}세 ${k} 세금 ${v}`, p);
      check(x.short >= 0, `${x.age}세 부족액 음수`, p);
    }
  }
  check(r.lastAge >= p.retireAge - 1 && r.lastAge <= 101, `버티는 나이 범위 밖: ${r.lastAge}`, p);
  // 생활비를 줄이면 버티는 나이가 줄면 안 된다
  const less = E.simulate(p, p.spendMonthly * 0.7);
  check(less.lastAge >= r.lastAge, `생활비를 줄였는데 버티는 나이가 줄어듦 ${r.lastAge} → ${less.lastAge}`, p);
  if (c % 10 === 0) {
    // 계획 나이까지 쓸 수 있는 돈으로 다시 계산하면 계획 나이까지 버텨야 한다
    const m = E.sustainableMonthly(p);
    if (m > 0) check(E.simulate(p, m).lastAge >= r.params.planAge, `쓸 수 있는 돈 ${m}으로 계획 나이 못 감`, p);
    // 개선 방법 목록: 효과는 양수, 큰 순서, 혼자면 배우자 방법 없음
    const im = E.improvements(p);
    for (let i = 0; i < im.list.length; i++) {
      check(im.list[i].saving > 0, '효과가 0 이하인 방법이 목록에 있음', p);
      if (i) check(im.list[i - 1].saving >= im.list[i].saving, '효과 순서가 틀림', p);
    }
    if (!p.spouse) check(!im.list.some(x => x.id === 'giftToSpouse'), '혼자인데 배우자 방법이 나옴', p);
  }
}
const ms = Date.now() - t0;
if (fails.length) {
  const seen = new Set();
  for (const f of fails) { if (seen.has(f.msg)) continue; seen.add(f.msg); console.log('✗', f.msg, '\n  입력:', JSON.stringify(f.p)); if (seen.size > 10) break; }
  console.log(`\n${N}개 중 실패 ${fails.length}건 (${ms}ms)`);
  process.exit(1);
}
console.log(`✓ ${N}개 시나리오 모두 통과 (${ms}ms)`);
