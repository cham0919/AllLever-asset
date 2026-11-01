// 화면: 홈 · 목표(분석) · 가계부 요약 · 연간 · 자산
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
/* ───────── 화면: 홈 ───────── */
// '현재' = 오늘 날짜 이전에서 자산이 입력된 가장 최근 (연도, 월). 모든 연도 파일을 통틀어 찾는다.
function assetPoints(){
  const now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1, pts = [];
  for (const y of [...yearsList()].reverse()){
    const lim = y < cy ? 12 : y === cy ? cm : 0;
    for (let m = 1; m <= lim; m++){ const x = aMonth(m, y); if (x.has) pts.push(x); }
  }
  return pts;   // 시간순
}
const grpSum = (g, x) => S.years[x.y].assets.filter(g.match).reduce((s, a) => s + x.val(a), 0);
const monthsBetween = (a, b) => (b.y * 12 + b.m) - (a.y * 12 + a.m);
// 연평균 증가율(CAGR): 값이 처음 0보다 컸던 달 → 현재. 저축·추가 납입이 포함된 잔액 기준이라 '수익률'이 아님
function cagr(pts, fn){
  const cur = pts.at(-1), v1 = fn(cur), st = pts.find(x => fn(x) > 0);
  if (!st || st === cur || v1 <= 0) return null;
  const n = monthsBetween(st, cur), v0 = fn(st);
  return {rate: Math.pow(v1 / v0, 12 / n) - 1, n, from: st, total: v1 / v0 - 1};
}
// 홈 위쪽: 이번 달 가계부 (매일 보는 것) — 올해 파일이 있으면 이번 달, 없으면 보고 있는 해의 마지막 기록 달
function homeLedgerPos(){
  const now = new Date(), cy = now.getFullYear();
  if (S.years?.[cy]) return {y: cy, m: now.getMonth() + 1, cur: true};
  const y = S.year; if (!y) return null; let m = 12; while (m > 1 && !bMonth(m, y).has) m--; return {y, m, cur: false};
}
function homeLedger(){
  const P = homeLedgerPos(); if (!P) return '';
  const Y = S.years[P.y], b = bMonth(P.m, P.y), TX = Y?.txMode, ed = canEdit(P.y) && TX;
  const now = new Date(), today = P.cur ? (Y.tx?.[P.m] || []).filter(t => !t.skip && t.d === now.getDate() && EXP_KINDS.includes(t.kind)).reduce((a, t) => a + t.amt, 0) : 0;
  const bs = TX ? budState(P.y, P.m) : null, rem = bs ? bs.total - bs.spent : 0, r = bs?.total ? bs.spent / bs.total : 0;
  if (TX && bs && !bs.total) setTimeout(() => budCarry(P.y, P.m), 0);
  const three = `<div class="hl3 num"><div><span>수입</span><b class="i">${money(b.income)}</b></div><div><span>지출</span><b class="e">${money(b.expense)}</b></div><div><span>저축</span><b class="s">${money(b.save)}</b></div></div>`;
  return `<section class="card hledger" data-act="homeLedger" role="button" tabindex="0">
    <div class="hl-top"><span class="label">${P.cur ? '' : `${P.y}년 `}${P.m}월 가계부</span>${P.cur && TX ? `<span class="hl-tday num">오늘 ${money(today)} ›</span>` : '<span class="go">›</span>'}</div>
    ${bs?.total ? `<div class="big num">${rem >= 0 ? `${money(rem)} <em>남았어요</em>` : `${money(-rem)} <em class="up">넘었어요</em>`}</div>
      <div class="btrack sm"><i class="${bClass(r)}" style="width:${Math.min(r, 1) * 100}%"></i>${bs.cur ? `<b class="bpace" style="left:${Math.min(bs.okLine / bs.total, 1) * 100}%"></b>` : ''}</div>
      <div class="hl-row"><span>예산 ${money(bs.total)} 중 ${Math.round(r * 100)}%</span><span>${bs.cur ? `오늘까지 적정 <b>${money(bs.okLine)}</b>` : ''}</span></div>`
    : `<div class="big num">${money(b.expense)} <em>썼어요</em></div>${ed ? '<div class="hl-row"><span></span><button class="hl-link" data-act="homeBud">예산 정하기 ›</button></div>' : ''}`}
    ${three}
  </section>`;
}
// 홈: 목표 진척 한 줄
function homeGoal(pts){
  if (pts.length < 2) return '';
  const g = S.goal, cur = pts.at(-1), T = g.target, done = Math.min(1, Math.max(0, cur.net / T));
  const inp = analysisInputs(pts), proj = project(cur.net, inp.rate, inp.save, T), hit = proj.months != null ? ymIdx(cur.y, cur.m) + proj.months : null;
  return `<section class="card hgoal" data-act="homeGoal" role="button" tabindex="0"><div class="hl-top"><span class="label">목표 ${T / 1e8}억까지</span><span class="go">›</span></div>
    <div class="hg-row"><b class="num">${pctPlain(done, 1)}</b><span>${hit != null ? `지금 속도면 ${ymText(hit)} 달성` : '지금 속도로는 60년 이상'}</span></div>
    <div class="prog"><i style="width:${done * 100}%"></i></div></section>`;
}
function viewHome(){
  const pts = assetPoints(), led = homeLedger(), P = homeLedgerPos();
  const fab = P && S.years[P.y]?.txMode && P.cur && canEdit(P.y) ? '<button class="fab" data-act="homeAddTx" aria-label="거래 추가">+</button>' : '';
  if (!pts.length){ $('#view').innerHTML = led + `<section class="card hero"><div class="label">순자산</div><button class="btn" data-act="homeAsset" style="margin-top:12px">${new Date().getMonth() + 1}월 말 잔액 입력하기</button></section>` + fab; return; }
  const cur = pts.at(-1), G = HOME_GROUPS;
  const inv = grpSum(G.invest, cur), est = grpSum(G.estate, cur), cash = grpSum(G.cash, cur);
  const list = S.years[cur.y].assets;
  const loose = list.filter(a => a.big !== '부채' && !Object.values(G).some(g => g.match(a)));
  const looseSum = loose.reduce((s, a) => s + cur.val(a), 0);
  const rTotal = cagr(pts, x => x.total), rNet = cagr(pts, x => x.net), rInv = cagr(pts, x => grpSum(G.invest, x));
  const span = rNet || rTotal, tot = Math.max(cur.total, 1);
  const prevX = pts.length > 1 ? pts.at(-2) : null;
  // 총자산 구성: 큰 금액부터, 0원은 빼요
  const mix = [['부동산', est, 'var(--fixed)'], ['금융투자', inv, 'var(--accent)'], ['현금', cash, 'var(--saving)'], ['기타', looseSum, 'var(--faint)']]
    .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const rate = (n, r) => `<div><span>${n}</span><b class="num ${r ? dir(r.rate) : ''}">${r ? pct(r.rate, 1) : '-'}</b></div>`;
  $('#view').innerHTML = led + `
  <section class="card hero hnet" data-act="homeAsset" role="button" tabindex="0">
    <div class="hl-top"><span class="label">${cur.m}월 말 순자산</span><span class="go">›</span></div>
    <div class="big num">${money(cur.net)}</div>
    <div class="sub">${prevX ? `${prevX.y !== cur.y ? prevX.y + '년 ' : ''}${prevX.m}월보다 <span class="num ${dir(cur.net - prevX.net)}">${signed(cur.net - prevX.net)}</span>` : '첫 기록이에요'}</div>
    <div class="heq num">총자산 <b>${money(cur.total)}</b>${cur.debt ? ` − 부채 <b>${money(cur.debt)}</b>` : ''}</div>
    <div class="flow">${mix.map(x => `<i style="width:${x[1] / tot * 100}%;background:${x[2]}"></i>`).join('')}</div>
    <div class="hmix">${mix.map(x => `<div><i class="dot" style="background:${x[2]}"></i><span>${x[0]}</span><b class="num">${money(x[1])}</b><em class="num">${pctPlain(x[1] / tot, 0)}</em></div>`).join('')}</div>
  </section>${homeGoal(pts)}
  ${span ? `<section class="card hrate"><div class="hl-top"><span class="label">연평균 증가</span><span class="num">${span.n}개월 기준</span></div>
    <div class="hr3">${rate('순자산', rNet)}${rate('총자산', rTotal)}${rate('금융투자', rInv)}</div>
    ${span.n < 12 ? '<p class="note">1년 미만 기록이라 실제보다 크게 보일 수 있어요</p>' : ''}</section>` : ''}
  ${fab}${fab ? '<div style="height:64px"></div>' : ''}`;
}

/* ───────── 화면: 분석 ───────── */
const ymIdx = (y, m) => y * 12 + (m - 1);
const idxYM = i => [Math.floor(i / 12), (i % 12) + 1];
const ymText = i => { const [y, m] = idxYM(i); return `${y}년 ${m}월`; };
const durText = n => n == null ? '-' : (n >= 12 ? `${Math.floor(n / 12)}년` : '') + (n % 12 ? ` ${n % 12}개월` : (n < 12 ? '0개월' : ''));
// 그 달 저축 (가계부에 '저축'으로 입력한 금액, 가계부가 없는 달은 0)
const savingOf = (m, y) => { const b = bMonth(m, y); return b.has ? b.save : 0; };
// 실제 기록에서 '저축 제외 수익률'의 연환산 값과 최근 12개월 평균 월 저축
function analysisInputs(pts){
  let g = 1, n = 0;
  for (let i = 1; i < pts.length; i++){
    const a = pts[i-1], b = pts[i];
    if (ymIdx(b.y, b.m) - ymIdx(a.y, a.m) !== 1 || a.net <= 0) continue;
    g *= 1 + (b.net - a.net - savingOf(b.m, b.y)) / a.net; n++;
  }
  const rate = n ? Math.pow(g, 12 / n) - 1 : 0;
  const cur = pts.at(-1), sv = [];
  for (let k = 0; k < 24 && sv.length < 12; k++){
    const [y, m] = idxYM(ymIdx(cur.y, cur.m) - k); const b = bMonth(m, y);
    if (b.has) sv.push(b.saving);
  }
  const ex = []; for (let k = 0; k < 24 && ex.length < 12; k++){ const [y, m] = idxYM(ymIdx(cur.y, cur.m) - k); const b = bMonth(m, y); if (b.has) ex.push(b.expense); }
  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  return {rate, rateMonths: n, save: avg(sv), saveMonths: sv.length, expense: avg(ex)};
}
// 예측: 다음 달 순자산 = 이번 달 × (1 + 월 수익률) + 월 저축
function project(start, rate, save, target, max = 720){
  const rm = Math.pow(1 + rate, 1/12) - 1, vals = [start]; let v = start;
  while (v < target && vals.length <= max){ v = v * (1 + rm) + save; vals.push(v); }
  return {vals, months: v >= target ? vals.length - 1 : null};
}
// 계획: 매년 말 = 전년도 말 × (1 + r) + 연 저축. 월 값은 연말 사이를 직선으로 잇는다.
function planCurve(base, g){
  const y0 = g.planYear - 1, ends = [base]; let v = base;
  while (v < g.target && ends.length < 80){ v = v * (1 + g.planRate) + g.planSave; ends.push(v); }
  const at = i => { const k = i - ymIdx(y0, 12); if (k < 0) return null; const q = Math.floor(k / 12), r = k % 12;
    if (q >= ends.length - 1) return q === ends.length - 1 && r === 0 ? ends.at(-1) : null;
    return ends[q] + (ends[q+1] - ends[q]) * r / 12; };
  let hit = null; for (let i = ymIdx(y0, 12); i <= ymIdx(y0, 12) + 12 * (ends.length - 1); i++){ const v2 = at(i); if (v2 != null && v2 >= g.target){ hit = i; break; } }
  return {at, ends, start: ymIdx(y0, 12), hitIdx: hit, hitYear: ends.length > 1 && ends.at(-1) >= g.target ? y0 + ends.length - 1 : null};
}
let anaChart = null;
function viewAnalysis(){
  const pts = assetPoints();
  if (pts.length < 2){   // 기록이 한 달 이하: 진행률만 (예상 시점은 두 달부터)
    const T0 = S.goal.target, c0 = pts.at(-1), d0 = c0 ? Math.min(1, Math.max(0, c0.net / T0)) : 0;
    $('#view').innerHTML = `<section class="card hero"><div class="label">목표 ${T0 / 1e8}억까지</div>
      ${c0 ? `<div class="gtop"><b class="num">${pctPlain(d0, 0)}</b><span class="num"><b>${money(c0.net)}</b> / ${T0 / 1e8}억</span></div>` : '<div class="big num" style="color:var(--faint)">—</div>'}<div class="prog"><i style="width:${d0 * 100}%"></i></div>
      ${c0 ? '' : '<button class="btn" data-act="homeAsset">잔액 입력하기</button>'}</section>`; return; }
  const g = S.goal, cur = pts.at(-1), curI = ymIdx(cur.y, cur.m), T = g.target;
  const inp = analysisInputs(pts);
  const base = g.planBase ?? pts[0].net;
  const plan = planCurve(base, g);
  const proj = project(cur.net, inp.rate, inp.save, T);
  const projHit = proj.months != null ? curI + proj.months : null;
  const planNow = plan.at(curI), gap = planNow != null ? cur.net - planNow : null;   // 계획상 지금 순자산과 차이
  const pctDone = Math.min(1, Math.max(0, cur.net / T));

  // 마일스톤
  const nice = v => { const u = v >= 1e9 ? 1e8 : v >= 1e8 ? 5e7 : 1e7; return Math.max(u, Math.round(v / u) * u); };
  const MS = [...new Set([0.25, 0.5, 0.75].map(f => nice(T * f)))].filter(v => v < T).concat([T]);
  const msRow = v => {
    const got = pts.find(x => x.net >= v);
    const pk = got ? null : proj.vals.findIndex(x => x >= v);
    let pi = null; for (let i = plan.start; i < plan.start + 12 * plan.ends.length; i++){ const pv = plan.at(i); if (pv != null && pv >= v){ pi = i; break; } }
    const right = got ? `<b>${got.y}년 ${got.m}월 달성</b>`
      : pk >= 0 ? `<b>예상 ${ymText(curI + pk)}</b><small>${durText(pk)} 후${pi != null ? ` · 계획 ${ymText(pi)}` : ''}</small>`
      : '<b>-</b>';
    return `<div class="ms ${got ? 'done' : ''}"><div class="ck">${got ? '✓' : ''}</div><div class="n">${money(v)}</div><div class="r">${right}</div></div>`;
  };

  // FIRE: 금융자산(홈의 금융투자 + 현금) 전부 배당 → 배당소득세 15.4% 뗀 금액 (배당률은 설정에서)
  const G = HOME_GROUPS, inv = grpSum(G.invest, cur), cash = grpSum(G.cash, cur), fin = inv + cash;
  // 원금 선택: 금융자산(부동산 제외) 또는 순자산 전체(부동산 매각·부채 상환 후 남는 돈)
  const useNet = S.fireBase === 'net', principal = useNet ? Math.max(cur.net, 0) : fin;
  const DR = g.divRate ?? 0.04, DN = DIV_NET;
  const divYear = principal * DR * DN, divMonth = divYear / 12, goalMonth = T * DR * DN / 12;
  const cover = inp.expense ? divMonth / inp.expense : null;

  $('#view').innerHTML = `
  <section class="card hero"><div class="label">목표 ${T / 1e8}억까지</div>
    <div class="gtop"><b class="num">${pctPlain(pctDone, 0)}</b><span class="num"><b>${money(cur.net)}</b> / ${T / 1e8}억</span></div>
    <div class="prog"><i style="width:${pctDone * 100}%"></i></div>
    <div class="gwhen"><b>${projHit != null ? `${ymText(projHit)} 달성 예상` : '60년 안에 달성하기 어려워요'}</b></div>
    <div class="kv grate"><span>연평균 수익률 <small>저축 제외 · ${inp.rateMonths}개월</small></span><b class="num ${dir(inp.rate)}">${pct(inp.rate, 1)}</b></div>
  </section>

  ${gap != null ? `<section class="card gplan"><h3>계획 대비 <small>연 ${pct(g.planRate, 0).replace('+', '')} · 매년 ${money(g.planSave)}</small></h3>
    <div class="gbig num ${gap >= 0 ? 'down' : 'up'}">${money(Math.abs(gap))} ${gap >= 0 ? '앞서요' : '부족해요'}</div>
    <div class="kv"><span>계획상 지금</span><b class="num">${money(planNow)}</b></div>
    ${plan.hitYear ? `<div class="kv"><span>${T / 1e8}억 달성</span><b class="num">계획 ${plan.hitYear}년 → 예상 ${projHit != null ? idxYM(projHit)[0] + '년' : '-'}</b></div>` : ''}
  </section>` : ''}

  <section class="card"><h3>순자산 경로</h3>
    <div class="chart tall"><canvas id="cPath"></canvas></div>
    <div class="lgd"><span><i style="border-color:var(--accent)"></i>실제</span><span><i style="border-color:var(--accent);border-top-style:dashed"></i>예상</span>
      <span><i style="border-color:#A0A7B1"></i>계획</span><span id="lgSim" style="display:none"><i style="border-color:var(--repay);border-top-style:dashed"></i>시뮬레이션</span>
      <span><i style="border-color:var(--expense);border-top-style:dotted"></i>목표 ${T / 1e8}억</span></div>
  </section>

  <section class="card"><h3>중간 목표</h3>${MS.map(msRow).join('')}</section>

  <section class="card"><h3>목표 시뮬레이터 <button id="simReset" style="font-size:13px;color:var(--accent);font-weight:600">초기화</button></h3>
    <div class="rng"><div class="lab"><span>월 저축액</span><b class="num" id="simSaveV"></b></div><input type="range" id="simSave" min="0" max="20000000" step="100000"></div>
    <div class="rng"><div class="lab"><span>연 수익률 (저축 제외)</span><b class="num" id="simRateV"></b></div><input type="range" id="simRate" min="-5" max="30" step="0.5"></div>
    <div class="res" id="simRes"></div>
  </section>

  <section class="card"><h3>FIRE · 배당으로 바꾸면 <small>연 ${+(DR * 100).toFixed(2)}% · 배당소득세 15.4%만 반영</small></h3>
    <div class="seg" id="segFire" style="margin-bottom:14px"><button data-v="fin">금융자산</button><button data-v="net">순자산 전체</button></div>
    <div class="label">${useNet ? '순자산' : '금융자산'} ${money(principal)} 기준 매달</div>
    <div class="big2 num" style="color:var(--saving);margin-top:4px">${money(divMonth)}</div>
    ${cover != null ? `<div class="heq num" style="border:0;padding:0;margin-top:4px">한 달 지출의 <b>${pctPlain(cover, 0)}</b> · ${T / 1e8}억 달성 시 매달 <b>${money(goalMonth)}</b></div>` : ''}
  </section>`;
  seg('#segFire', S.fireBase, v => { S.fireBase = v; LS.set('fireBase', v); const y = window.scrollY; render(); window.scrollTo(0, y); });

  // ── 그래프
  const endI = Math.max(projHit ?? curI + 120, plan.hitIdx ?? 0, curI + 12) + 6;
  const startI = Math.min(ymIdx(pts[0].y, pts[0].m), plan.start);
  const N = endI - startI + 1, lab = Array.from({length:N}, (_, k) => startI + k);
  const actual = lab.map(i => { const p = pts.find(x => ymIdx(x.y, x.m) === i); return p ? p.net : null; });
  const fut = lab.map(i => i >= curI && i - curI < proj.vals.length ? proj.vals[i - curI] : null);
  const pl = lab.map(i => plan.at(i));
  const span = N / 12, step = span > 24 ? 5 : span > 10 ? 2 : 1;
  const line = (label, data, color, extra = {}) => ({label, data, borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2.2, tension: .25, spanGaps: true, ...extra});
  const ds = [
    line('실제', actual, css('--accent'), {borderWidth: 3.2, pointHoverRadius: 4}),
    line('예상', fut, css('--accent'), {borderDash: [6, 5]}),
    line('계획', pl, '#A0A7B1', {borderWidth: 2}),
    line('시뮬레이션', lab.map(() => null), css('--repay'), {borderDash: [4, 4], hidden: true}),
    line(`목표 ${T / 1e8}억`, lab.map(() => T), css('--expense'), {borderDash: [2, 4], borderWidth: 1.4}),
  ];
  mk('cPath', {type: 'line', data: {labels: lab.map(i => ymText(i)), datasets: ds},
    options: {interaction: {mode: 'index', intersect: false},
      plugins: {legend: {display: false}, tooltip: {...baseTip, filter: c => c.raw != null && c.datasetIndex !== 4, callbacks: {label: c => ` ${c.dataset.label}: ${money(c.raw)}`}}},
      scales: {x: {grid: {display: false}, border: {display: false}, ticks: {autoSkip: false, maxRotation: 0, callback: (v, k) => { const [y, m] = idxYM(lab[k]); return m === 1 && y % step === 0 ? `'${String(y).slice(2)}` : ''; }}},
               y: scaleWon()}}});
  anaChart = charts.at(-1);

  // ── 시뮬레이터
  const sim = S.sim || {save: Math.round(inp.save / 1e5) * 1e5, rate: Math.round(inp.rate * 200) / 2};
  const sv = $('#simSave'), rt = $('#simRate');
  sv.value = sim.save; rt.value = sim.rate;
  const upd = () => {
    const s2 = +sv.value, r2 = +rt.value / 100; S.sim = {save: s2, rate: +rt.value};
    $('#simSaveV').textContent = money(s2); $('#simRateV').textContent = (r2 * 100).toFixed(1) + '%';
    const p2 = project(cur.net, r2, s2, T), hit2 = p2.months != null ? curI + p2.months : null;
    const changed = Math.abs(s2 - inp.save) > 5e4 || Math.abs(r2 - inp.rate) > 0.0026;
    let diff = '';
    if (hit2 != null && projHit != null && changed){ const d = projHit - hit2; diff = d > 0 ? `현재 추세보다 <b class="down">${durText(d)} 단축</b>` : d < 0 ? `현재 추세보다 <b class="up">${durText(-d)} 지연</b>` : '현재 추세와 같아요'; }
    $('#simRes').innerHTML = `<div style="font-size:13px;color:var(--sub)">${T / 1e8}억 달성</div>
      <div class="big2 num" style="margin:2px 0">${hit2 != null ? ymText(hit2) : '60년 내 달성 어려워요'}</div>
      <div style="font-size:13px;color:var(--sub)">${hit2 != null ? durText(p2.months) + ' 후' : ''}${diff ? ' · ' + diff : ''}</div>`;
    if (anaChart){
      const d3 = anaChart.data.datasets[3];
      d3.data = lab.map(i => i >= curI && i - curI < p2.vals.length ? p2.vals[i - curI] : null);
      d3.hidden = !changed; $('#lgSim').style.display = changed ? '' : 'none';
      anaChart.update('none');
    }
  };
  sv.oninput = upd; rt.oninput = upd; upd();
  $('#simReset').onclick = () => { S.sim = null; sv.value = Math.round(inp.save / 1e5) * 1e5; rt.value = Math.round(inp.rate * 200) / 2; upd(); };
}

/* ───────── 화면: 가계부 ───────── */
function viewBudget(){
  const TX = S.model.txMode, v = effView();
  if (v === 'cal') return viewCal();
  if (v === 'bud') return viewBud();
  if (S.rview === 'y') return viewTrend();
  // 리포트 › 이번 달: 저축·수입 배분(요약) + 어디에 썼나·누적·달라진 점·큰 지출(통계)
  const m = S.month.budget, b = bMonth(m), pb = bMonth(m-1);
  if (!b.has){ emptyMonth(m, '가계부'); $('#view').innerHTML = bsegHtml() + rsegHtml() + (TX ? `<div class="empty"><b>${m}월 거래가 없어요</b></div>` : $('#view').innerHTML); return; }
  const ed = canEdit();
  const dExp = pb.has ? b.expense - pb.expense : null;
  const dSav = pb.has ? b.saving - pb.saving : null;
  const exItems = b.items.filter(i=>EXP_KINDS.includes(i.kind) && i.amt>0).sort((x,y)=>y.amt-x.amt);
  const flowTot = Math.max(b.income, b.expense + b.save, 1);
  let html = `${bsegHtml()}${rsegHtml()}${!TX && ed ? `<div class="ebtnrow"><button class="btn" data-act="editBudget">✎ ${m}월 한꺼번에 입력</button></div>` : ''}
  <section class="card rsum"><h3>${m}월${pb.has ? ` <small>${m === 1 ? '지난달' : (m - 1) + '월'} 대비</small>` : ''}</h3>
    <div class="t3 num">${[['수입', b.income, pb.income], ['지출', b.expense, pb.expense], ['저축', b.save, pb.save]].map(([n, v, p]) => { const d = pb.has ? v - p : null;
      return `<div><span>${n}</span><b>${money(v)}</b>${d == null ? '' : `<em class="${dir(d)}">${d ? `${d > 0 ? '▲' : '▼'} ${money(Math.abs(d))}` : '변동 없음'}</em>`}</div>`; }).join('')}</div>
    <div class="flow">${[[b.fixed, '--fixed'], [b.variable, '--expense'], [b.save, '--saving'], [Math.max(b.left, 0), '--faint']].map(([a, c]) => `<i style="width:${a / flowTot * 100}%;background:var(${c})"></i>`).join('')}</div>
    <div class="hmix">${[['고정비', b.fixed, '--fixed'], ['변동비', b.variable, '--expense'], ['저축', b.save, '--saving'], ['남은 돈', b.left, '--faint']].map(([n, a, c]) => `<div><i class="dot" style="background:var(${c})"></i><span>${n}</span><b class="num${a < 0 ? ' up' : ''}">${money(a)}</b><em class="num">${b.income ? pctPlain(a / b.income, 0) : ''}</em></div>`).join('')}</div>
  </section>${TX ? '<div id="rpStat"></div>' : ''}`;
  if (exItems.length && !TX) html += `
  <section class="card">
    <h3>지출 구성 <small>${exItems.length}개 항목</small></h3>
    <div class="donut"><canvas id="cExp"></canvas><div class="center"><div><b class="num" style="font-size:18px">${money(b.expense)}</b><span>총 지출</span></div></div></div>
    <div class="legend">${exItems.map((i,k)=>`
      <div class="lg"><i class="dot" style="background:${PALETTE[k%PALETTE.length]}"></i><span class="n">${esc(i.name)} <span class="muted" style="font-size:12px">${i.kind}</span></span><span class="p num">${pctPlain(i.amt/b.expense,0)}</span><span class="a num">${money(i.amt)}</span></div>`).join('')}</div>
  </section>`;
  // 그 달에 0원인 항목(금액·거래 없음)은 숨겨요. 저장 대기 중인 항목과 '0원 항목 보기'를 켰을 때는 보여요
  const pendOf = i => S.queue.some(o => o.t === 'b' && o.y === S.year && o.m === m && o.kind === i.kind && o.name === i.name);
  const zero = i => !i.amt && !pendOf(i), nZero = b.items.filter(zero).length;
  // 구분마다 합계(+ 수입 대비 비중), 항목은 큰 금액부터 한 줄. 지난달보다 바뀐 항목에만 ▲▼
  const KC = {'수입': '--income', '고정비': '--fixed', '변동비': '--expense', '저축': '--saving'};
  let anyD = false;
  const groups = KINDS.map(k=>{
    const all = b.items.filter(i=>i.kind===k), its = (S.showZero ? all : all.filter(i => !zero(i))).slice().sort((a,z)=>z.amt-a.amt); if (!all.length || (!its.length && !ed)) return '';
    const tot = its.reduce((a,i)=>a+i.amt,0);
    const prevMap = {}; pb.items.filter(i=>i.kind===k).forEach(i=>prevMap[i.name]=(prevMap[i.name]||0)+i.amt);
    return `<div class="dk"><div class="dkh"><span><i class="dot" style="background:var(${KC[k]})"></i>${k}${k !== '수입' && b.income > 0 ? `<small>수입의 ${pctPlain(tot / b.income, 0)}</small>` : ''}</span><b class="num">${money(tot)}</b></div>
      ${its.map(i=>{ const d = pb.has && prevMap[i.name]!=null ? i.amt - prevMap[i.name] : null, pend = pendOf(i);
        if (d && i.filled) anyD = true;
        return `<div class="row dit${ed || TX ? ' tap' : ''}${i.filled ? '' : ' unfilled'}"${ed || TX ? ` data-act="eb" data-k="${m}|${b.items.indexOf(i)}" role="button" tabindex="0"` : ''}><div class="n">${esc(i.name)}${pend ? '<span class="memo pend">저장 대기</span>' : i.memo?`<span class="memo">${esc(i.memo)}</span>`:''}</div>
          ${d && i.filled ? `<span class="dch ${dir(d)} num">${d > 0 ? '▲' : '▼'} ${money(Math.abs(d))}</span>` : ''}<div class="a num">${i.filled ? money(i.amt) : TX ? '-' : '입력 안 함'}</div>${ed ? '<span class="pen" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span>' : TX ? '<span class="go" aria-hidden="true">›</span>' : ''}</div>`;}).join('')}
      ${ed ? `<button class="eadd" data-act="addB" data-kind="${k}">+ ${k} 항목 추가</button>` : ''}</div>`;
  }).join('');
  html += `<section class="card dlist"><h3>상세 내역${anyD ? ' <small>▲▼ 지난달 대비</small>' : ''}</h3>${groups}${nZero ? `<button class="zt" data-act="zeroItems">${S.showZero ? '0원 항목 숨기기' : `0원 항목 ${nZero}개 보기`}</button>` : ''}</section>`;
  $('#view').innerHTML = html;
  if (TX) statInto($('#rpStat'));
  if (exItems.length && !TX) donut('cExp', exItems.map(i=>i.name), exItems.map(i=>i.amt), exItems.map((_,k)=>PALETTE[k%PALETTE.length]));
}

/* ───────── 화면: 월별추이 ───────── */
function viewTrend(){
  const ms = Array.from({length:12},(_,i)=>bMonth(i+1)), on = ms.filter(x=>x.has);
  if (!on.length){ emptyMonth(null, '가계부'); $('#view').innerHTML = bsegHtml() + rsegHtml() + $('#view').innerHTML; return; }
  const tot = k => on.reduce((a,x)=>a+x[k],0);
  const inc = tot('income'), exp = tot('expense'), sav = tot('save'), left = tot('left');
  const nul = (x,k) => x.has ? x[k] : null;
  const cum = k => { let c = 0; return ms.map(x => { if (!x.has) return null; c += x[k]; return c; }); };
  $('#view').innerHTML = bsegHtml() + rsegHtml() + `
  <section class="card hero">
    <div class="label">${S.model.year}년 누적 저축 <span class="muted">· ${on.length}개월</span></div>
    <div class="big num">${money(sav)}</div>
    <div class="sub">평균 저축률 <b style="color:var(--saving)">${pctPlain(inc? sav/inc : 0)}</b> · 월평균 ${money(sav/on.length)}</div>
    <div class="split" style="margin-top:8px">
      <div class="s"><div class="t"><i class="dot" style="background:var(--saving)"></i>저축</div><div class="v num">${money(sav)}</div><div class="d muted">월 ${money(sav/on.length)}</div></div>
      <div class="s"><div class="t"><i class="dot" style="background:var(--faint)"></i>남은 돈</div><div class="v num ${left<0?'up':''}">${money(left)}</div><div class="d muted">월 ${money(left/on.length)}</div></div>
    </div>
  </section>
  <div class="tiles">
    <div class="tile"><div class="t"><i class="dot" style="background:var(--income)"></i>총 수입</div><div class="v num">${money(inc)}</div><div class="d muted">월 ${money(inc/on.length)}</div></div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--expense)"></i>총 지출</div><div class="v num">${money(exp)}</div><div class="d muted">월 ${money(exp/on.length)}</div></div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--saving)"></i>저축</div><div class="v num">${money(sav)}</div><div class="d muted">월 ${money(sav/on.length)}</div></div>
  </div>
  <section class="card"><h3>월별 수입 · 지출 · 저축</h3><div class="chart tall"><canvas id="cTrend"></canvas></div></section>
  <section class="card"><h3>월별 저축 · 남은 돈</h3><div class="chart"><canvas id="cSav"></canvas></div></section>
  <section class="card"><h3>누적 저축 · 저축률</h3><div class="chart"><canvas id="cRate"></canvas></div></section>
  <section class="card"><h3>지출 구성 추이 <small>고정비 · 변동비</small></h3><div class="chart"><canvas id="cExpT"></canvas></div></section>
  <section class="card"><h3>월별 요약 <small>탭하면 해당 월로 이동</small></h3>
    <table class="num" style="font-size:12.5px"><thead><tr><th>월</th><th>수입</th><th>지출</th><th>저축</th><th>남은 돈</th></tr></thead>
    <tbody>${ms.map(x=>`<tr class="click ${x.has?'':'off'}" data-m="${x.m}"><td>${x.m}월</td><td>${x.has?money(x.income):'-'}</td><td>${x.has?money(x.expense):'-'}</td>
      <td><b>${x.has?money(x.save):'-'}</b></td><td class="${x.has&&x.left<0?'up':''}">${x.has?money(x.left):'-'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>합계</td><td>${money(inc)}</td><td>${money(exp)}</td><td>${money(sav)}</td><td>${money(left)}</td></tr></tfoot></table>
  </section>`;
  const leg = {position:'bottom', labels:{usePointStyle:true, pointStyle:'circle', boxWidth:7, boxHeight:7, padding:14}};
  const tipIdx = {...baseTip, ...tipWon, mode:'index', intersect:false};
  mk('cTrend', {type:'bar', data:{labels:monthLabels(), datasets:[
      {label:'수입', data:ms.map(x=>nul(x,'income')), backgroundColor:css('--income'), borderRadius:4, maxBarThickness:14},
      {label:'지출', data:ms.map(x=>nul(x,'expense')), backgroundColor:css('--expense'), borderRadius:4, maxBarThickness:14},
      {label:'저축', data:ms.map(x=>nul(x,'save')), backgroundColor:css('--saving'), borderRadius:4, maxBarThickness:14}]},
    options:{plugins:{legend:leg, tooltip:tipIdx}, scales:{x:scaleX, y:scaleWon()}}});
  mk('cSav', {type:'bar', data:{labels:monthLabels(), datasets:[
      {label:'저축', data:ms.map(x=>nul(x,'save')), backgroundColor:css('--saving'), borderRadius:3, maxBarThickness:22},
      {label:'남은 돈', data:ms.map(x=>x.has ? Math.max(x.left, 0) : null), backgroundColor:css('--faint'), borderRadius:3, maxBarThickness:22}]},
    options:{plugins:{legend:leg, tooltip:{...tipIdx, callbacks:{...tipWon.callbacks, footer:it=>{ const t=it.reduce((a,c)=>a+(c.raw||0),0); return '합계 '+money(t); }}}},
      scales:{x:{...scaleX, stacked:true}, y:scaleWon({stacked:true})}}});
  mk('cRate', {data:{labels:monthLabels(), datasets:[
      {type:'line', label:'저축률', data:ms.map(x=>x.has? +(x.rate*100).toFixed(1) : null), borderColor:css('--ink'), backgroundColor:css('--ink'), tension:.35, pointRadius:3, spanGaps:true, yAxisID:'y1', borderWidth:1.8},
      {type:'bar', label:'누적 저축', data:cum('save'), backgroundColor:css('--saving'), borderRadius:3, maxBarThickness:22, yAxisID:'y', stack:'c'}]},
    options:{plugins:{legend:leg, tooltip:{...baseTip, mode:'index', intersect:false, callbacks:{label:c=> c.raw==null?'':` ${c.dataset.label}: ${c.dataset.yAxisID==='y1'? c.raw+'%' : money(c.raw)}`}}},
      scales:{x:{...scaleX, stacked:true}, y:scaleWon({position:'left', stacked:true}), y1:{position:'right', grid:{display:false}, border:{display:false}, ticks:{callback:v=>v+'%', maxTicksLimit:5}}}}});
  mk('cExpT', {type:'bar', data:{labels:monthLabels(), datasets:[
      {label:'고정비', data:ms.map(x=>nul(x,'fixed')), backgroundColor:css('--fixed'), borderRadius:3, maxBarThickness:22},
      {label:'변동비', data:ms.map(x=>nul(x,'variable')), backgroundColor:css('--expense'), borderRadius:3, maxBarThickness:22}]},
    options:{plugins:{legend:leg, tooltip:tipIdx}, scales:{x:{...scaleX, stacked:true}, y:scaleWon({stacked:true})}}});
  document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => { const m=+tr.dataset.m; if (!bMonth(m).has) return; S.month.budget = m; S.bview = 'rep'; S.rview = 'm'; LS.set('bview', 'rep'); LS.set('rview', 'm'); go('budget'); });
}

/* ───────── 화면: 자산 ───────── */
const assetOpen = new Set();   // 항목별 자산에서 펼친 중분류 (앱을 다시 열면 접혀요)
function viewAsset(){
  const m = S.month.asset, A = analysis(m), c = A.c, p = A.p;
  if (!c.has) return emptyMonth(m, '자산');
  const edA = canEdit();
  const list = S.model.assets;
  const ms = Array.from({length:12},(_,i)=>aMonth(i+1));
  // 1월 대비 현재 — 엑셀과 같은 기준: 오늘 날짜의 월, 그 달이 미입력이면 그 이전 마지막 입력월
  const now = new Date(), Y = S.model.year;
  const TM = now.getFullYear() > Y ? 12 : now.getFullYear() < Y ? 0 : now.getMonth() + 1;
  let L = 0; for (let k = TM; k >= 1; k--) if (ms[k-1].has) { L = k; break; }
  const j = ms[0], cur = ms[Math.max(L,1)-1];
  let ytd = null;
  if (j.has && L >= 2){
    ytd = [['총자산 증가율', j.total, cur.total, ''], ['순자산 증가율', j.net, cur.net, '']];
    for (const g of RETURN_GROUPS){
      const its = list.filter(a => inGroup(g, a)); if (!its.length) continue;   // 해당 항목이 없으면 생략
      const sum = x => its.reduce((s, a) => s + x.val(a), 0);
      ytd.push([g.label, sum(j), sum(cur), g.note]);
    }
  }
  const opt = [['__net','순자산'],['__total','총자산'],['__debt','부채'],
    ...BIGS.flatMap(b => midsOf(b).map(md => ['mid:'+b+'|'+md, `${md} (${b})`])),
    ...list.map((a,i)=>['item:'+i, `${a.small} · ${a.mid}`])];
  if (!opt.some(o=>o[0]===S.assetPick)) S.assetPick = '__net';

  let html = `${edA ? `<div class="ebtnrow"><button class="btn" data-act="editAsset">✎ ${m}월 말 잔액 입력</button></div>` : ''}
  <section class="card hero"><div class="label">${m}월 말 순자산</div>
    <div class="big num">${money(c.net)}</div>
    ${A.prevOk ? `<div class="sub">${m === 1 ? '지난달' : (m - 1) + '월'}보다 <span class="num ${dir(A.dNet)}">${signed(A.dNet)}</span></div>` : ''}
    <div class="heq num">총자산 <b>${money(c.total)}</b>${c.debt ? ` − 부채 <b>${money(c.debt)}</b>` : ''}</div>
  </section>
  ${A.prevOk && A.saving != null && A.dNet ? (() => { const parts = [['저축', A.saving, '--saving'], ['투자·시세', A.other, '--accent']], pos = parts.filter(x => x[1] > 0), tp = pos.reduce((t, x) => t + x[1], 0) || 1;
    return `<section class="card"><h3>${m === 1 ? '지난달' : (m - 1) + '월'}보다 ${A.dNet > 0 ? '늘어난' : '줄어든'} ${money(Math.abs(A.dNet))}</h3>
    <div class="flow">${pos.map(x => `<i style="width:${x[1] / tp * 100}%;background:var(${x[2]})"></i>`).join('')}</div>
    <div class="hmix">${parts.map(x => `<div><i class="dot" style="background:var(${x[2]})"></i><span>${x[0]}</span><b class="num ${x[1] < 0 ? 'down' : ''}">${x[1] < 0 ? signed(x[1]) : money(x[1])}</b><em></em></div>`).join('')}</div>
    ${ytd ? `<div class="heq num">1월부터 순자산 <b class="${dir(ytd[1][2] - ytd[1][1])}">${signed(ytd[1][2] - ytd[1][1])}</b>${ytd[1][1] ? ` (${pct((ytd[1][2] - ytd[1][1]) / Math.abs(ytd[1][1]), 1)})` : ''}</div>` : ''}</section>`; })() : ''}
  <section class="card alist"><h3>항목별 자산 <small>${A.prevOk?'전월 대비':''}</small></h3>
    ${BIGS.map(big=>{
      const its = list.filter(a=>a.big===big); if (!its.length) return '';
      const tot = big==='유동자산'?c.liquid:big==='비유동자산'?c.fixedA:c.debt;
      return `<div class="agp"><div class="agh2"><span>${big}</span><b class="num">${money(tot)}</b></div>
      ${midsOf(big).map((md,k)=>{
        const sub = its.filter(a=>a.mid===md), st = sub.reduce((s,a)=>s+c.val(a),0), sp = sub.reduce((s,a)=>s+(p.val?p.val(a):0),0);
        const shown = sub.filter(a=>c.val(a)), multi = shown.length > 1, key = big+'|'+md, open = multi && assetOpen.has(key);
        return `<button class="amid"${multi?` aria-expanded="${open}" data-k="${esc(key)}"`:''}><i class="dot" style="background:${big==='부채'?'var(--expense)':PALETTE[k%PALETTE.length]}"></i><span class="n">${esc(md)}</span>
          <span class="v num">${money(st)}${A.prevOk&&st!==sp?`<span class="d ${dir(st-sp)}">${signed(st-sp)}</span>`:''}</span><span class="chev">${multi?'›':''}</span></button>
          ${multi?`<div class="aits">${shown.map(a=>`<div class="ait"><span>${esc(a.small)}</span><span class="num">${money(c.val(a))}</span></div>`).join('')}</div>`:''}`;
      }).join('')}</div>`;
    }).join('')}
  </section>
  <section class="card"><h3>순자산 · 총자산 · 부채 추이</h3><div class="chart"><canvas id="cNet"></canvas></div></section>
  <section class="card"><h3>자산 구성 변화 <small>중분류</small></h3><div class="chart tall"><canvas id="cMix"></canvas></div></section>
  <section class="card"><h3>항목별 추이 <select class="pick" id="pick">${opt.map(o=>`<option value="${esc(o[0])}"${o[0]===S.assetPick?' selected':''}>${esc(o[1])}</option>`).join('')}</select></h3>
    <div class="chart"><canvas id="cPick"></canvas></div><div id="pickInfo" class="note"></div></section>`;
  $('#view').innerHTML = html;
  $('#view').querySelectorAll('.amid[data-k]').forEach(b => b.onclick = () => {   // 중분류를 누르면 항목 펼치기·접기
    const k = b.dataset.k, on = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', on); on ? assetOpen.add(k) : assetOpen.delete(k);
  });

  const leg = {position:'bottom', labels:{usePointStyle:true, pointStyle:'circle', boxWidth:7, boxHeight:7, padding:14}};
  const line = (label, data, color, fill) => ({label, data, borderColor:color, backgroundColor:fill||color, tension:.35, pointRadius:3, pointHoverRadius:5, spanGaps:true, fill:!!fill, borderWidth:2.2});
  const g = (x,k) => x.has ? x[k] : null;
  mk('cNet', {type:'line', data:{labels:monthLabels(), datasets:[
      line('순자산', ms.map(x=>g(x,'net')), css('--accent')),
      line('총자산', ms.map(x=>g(x,'total')), css('--saving')),
      line('부채', ms.map(x=>g(x,'debt')), css('--expense'))]},
    options:{interaction:{mode:'index', intersect:false}, plugins:{legend:leg, tooltip:{...baseTip, ...tipWon}}, scales:{x:scaleX, y:scaleWon()}}});
  const mids = ['유동자산','비유동자산'].flatMap(b=>midsOf(b).map(md=>[b,md]));
  mk('cMix', {type:'bar', data:{labels:monthLabels(), datasets: mids.map(([b,md],k)=>({label:md, backgroundColor:PALETTE[k%PALETTE.length], maxBarThickness:24, borderRadius:2,
      data: ms.map(x=> x.has ? list.filter(a=>a.big===b&&a.mid===md).reduce((s,a)=>s+x.val(a),0) : null)}))},
    options:{interaction:{mode:'index', intersect:false}, plugins:{legend:leg, tooltip:{...baseTip, ...tipWon}}, scales:{x:{...scaleX, stacked:true}, y:scaleWon({stacked:true})}}});
  const drawPick = () => {
    const k = S.assetPick; let data, color = css('--accent');
    if (k==='__net') data = ms.map(x=>g(x,'net'));
    else if (k==='__total') { data = ms.map(x=>g(x,'total')); color = css('--saving'); }
    else if (k==='__debt') { data = ms.map(x=>g(x,'debt')); color = css('--expense'); }
    else if (k.startsWith('mid:')) { const [b,md] = k.slice(4).split('|'); if (b==='부채') color = css('--expense');
      data = ms.map(x=> x.has ? list.filter(a=>a.big===b&&a.mid===md).reduce((s,a)=>s+x.val(a),0) : null); }
    else { const a = list[+k.slice(5)]; if (a.big==='부채') color = css('--expense'); data = a.v.map(v=>v); }
    const label = opt.find(o=>o[0]===k)[1];
    const ch = charts.find(c=>c.canvas.id==='cPick'); if (ch){ ch.destroy(); charts.splice(charts.indexOf(ch),1); }
    mk('cPick', {type:'line', data:{labels:monthLabels(), datasets:[line(label, data, color, color+'22')]},
      options:{plugins:{legend:{display:false}, tooltip:{...baseTip, ...tipWon}}, scales:{x:scaleX, y:scaleWon()}}});
    const pts = data.map((v,i)=>[i+1,v]).filter(x=>x[1]!=null);
    $('#pickInfo').innerHTML = pts.length>=2 ? `${pts[0][0]}월 → ${pts.at(-1)[0]}월: <b class="${dir(pts.at(-1)[1]-pts[0][1])}">${signed(pts.at(-1)[1]-pts[0][1])}</b>${pts[0][1]?` (${pct((pts.at(-1)[1]-pts[0][1])/Math.abs(pts[0][1]))})`:''}` : '';
  };
  drawPick();
  $('#pick').onchange = e => { S.assetPick = e.target.value; LS.set('assetPick', S.assetPick); drawPick(); };
}

function emptyMonth(m, what){
  if (!S.model && !S.gfiles.length) return viewOnboard();
  $('#view').innerHTML = !S.model ? `
    <div class="empty"><b>시트를 불러오지 못했어요</b>새로고침 버튼을 누르거나 설정에서 연결을 확인해 주세요.
      <div style="margin-top:20px;max-width:320px;margin-inline:auto"><button class="btn" data-act="sync">다시 불러오기</button><button class="btn ghost" data-act="openSheet">설정 열기</button></div></div>`
    : `<div class="empty"><b>${m?m+'월 ':''}${what} 데이터가 없어요</b>${m && canEdit() ? '' : '시트의 ' + (what==='자산'?"'자산관리' 시트 "+(m||'')+"월 열":(m||'')+"월 시트") + '에 입력하면 여기에 표시돼요.'}
      ${m && canEdit() ? (what === '자산' ? `<div style="margin-top:20px">${assetBtns(m)}</div>` : `<div style="margin-top:20px;max-width:320px;margin-inline:auto"><button class="btn" data-act="editBudget">${m}월 가계부 입력하기</button></div>`) : ''}</div>`;
}
// 자산: 이번 달 데이터가 없을 때만 — 전월 불러오기 · 신규 입력하기
const assetBtns = m => `<div class="ebtnrow abtns"><button class="btn ghost" data-act="prevAsset">전월 불러오기</button><button class="btn" data-act="editAsset">신규 입력하기</button></div>`;
