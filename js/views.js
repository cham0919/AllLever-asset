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
  return `<section class="card hledger" data-act="homeLedger" role="button" tabindex="0">
    <div class="hl-top"><span class="label">${P.cur ? '이번 달' : `${P.y}년 ${P.m}월`} 가계부</span><span class="go">›</span></div>
    ${bs?.total ? `<div class="big num">${rem >= 0 ? `${money(rem)} <em>남았어요</em>` : `${money(-rem)} <em class="up">넘었어요</em>`}</div>
      <div class="btrack sm"><i class="${bClass(r)}" style="width:${Math.min(r, 1) * 100}%"></i>${bs.cur ? `<b class="bpace" style="left:${Math.min(bs.okLine / bs.total, 1) * 100}%"></b>` : ''}</div>
      <div class="hl-row"><span>예산 ${money(bs.total)} 중 ${Math.round(r * 100)}%</span><span>${bs.cur && bs.left ? `하루 <b>${money(bs.daily)}</b> 쓸 수 있어요` : ''}</span></div>`
    : `<div class="big num">${money(b.expense)} <em>썼어요</em></div><div class="hl-row"><span>수입 ${money(b.income)} · 저축 ${money(b.save)}</span>${ed ? '<button class="hl-link" data-act="homeBud">예산 정하기 ›</button>' : ''}</div>`}
    ${P.cur && TX ? `<div class="hl-today"><span>오늘</span><b class="num">${today ? money(today) + ' 썼어요' : '아직 지출이 없어요'}</b></div>` : ''}
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
  if (!pts.length){ $('#view').innerHTML = led + `<div class="empty"><b>자산 데이터가 없어요</b>자산 탭에서 월말 잔액을 입력하면 순자산과 목표가 홈에 표시돼요.</div>` + fab; return; }
  const cur = pts.at(-1), G = HOME_GROUPS;
  const inv = grpSum(G.invest, cur), est = grpSum(G.estate, cur), cash = grpSum(G.cash, cur);
  const list = S.years[cur.y].assets;
  const loose = list.filter(a => a.big !== '부채' && !Object.values(G).some(g => g.match(a)));
  const looseSum = loose.reduce((s, a) => s + cur.val(a), 0);
  const rTotal = cagr(pts, x => x.total), rNet = cagr(pts, x => x.net),
        rInv = cagr(pts, x => grpSum(G.invest, x)), rEst = cagr(pts, x => grpSum(G.estate, x));
  const span = rTotal || rNet;
  const foot = (r) => r ? `<div class="f"><span>연평균 증가</span><b class="num ${dir(r.rate)}">${pct(r.rate, 2)}</b></div>`
                        : `<div class="f"><span>연평균 증가</span><span>-</span></div>`;
  const tot = Math.max(cur.total, 1);
  const prevX = pts.length > 1 ? pts.at(-2) : null;
  $('#view').innerHTML = led + `
  <section class="card hero">
    <div class="label">${cur.y}년 ${cur.m}월 말 순자산</div>
    <div class="big num">${money(cur.net)}</div>
    <div class="sub">${prevX ? `${prevX.y !== cur.y ? prevX.y + '년 ' : ''}${prevX.m}월 대비 <span class="${dir(cur.net - prevX.net)}">${signed(cur.net - prevX.net)}</span>` : '첫 기록이에요'}</div>
    <div class="sub" style="font-size:12px;margin-top:14px">총자산 구성</div>
    <div class="flow" style="margin-top:6px"><i style="width:${inv/tot*100}%;background:var(--accent)"></i><i style="width:${est/tot*100}%;background:var(--fixed)"></i><i style="width:${cash/tot*100}%;background:var(--saving)"></i>${looseSum?`<i style="width:${looseSum/tot*100}%;background:var(--faint)"></i>`:''}</div>
    <div class="flow-lg"><span>금융투자 ${pctPlain(inv/tot,0)}</span><span>부동산 ${pctPlain(est/tot,0)}</span><span>현금 ${pctPlain(cash/tot,0)}</span></div>
  </section>${homeGoal(pts)}
  ${loose.length ? `<div class="warn"><b>분류되지 않은 자산 ${loose.length}개</b> · ${loose.map(a => esc(a.small)).join(', ')} (${money(looseSum)})<br>홈의 금융투자·부동산·현금 어디에도 들어가지 않아요. 자산 입력 화면에서 중분류 이름을 눌러 홈 묶음을 정해 주세요.</div>` : ''}
  <div class="home-grid">
    <div class="hc"><div class="t">총자산</div><div class="v num">${money(cur.total)}</div>${foot(rTotal)}</div>
    <div class="hc"><div class="t">순자산</div><div class="v num">${money(cur.net)}</div>${foot(rNet)}</div>
    <div class="hc"><div class="t"><i class="dot" style="background:var(--expense)"></i>부채</div><div class="v num">${money(cur.debt)}</div>
      <div class="f"><span>총자산 대비</span><b class="num">${pctPlain(cur.total ? cur.debt / cur.total : 0)}</b></div></div>
    <div class="hc"><div class="t"><i class="dot" style="background:var(--accent)"></i>금융투자</div><div class="v num">${money(inv)}</div>${foot(rInv)}</div>
    <div class="hc"><div class="t"><i class="dot" style="background:var(--fixed)"></i>부동산</div><div class="v num">${money(est)}</div>${foot(rEst)}</div>
    <div class="hc"><div class="t"><i class="dot" style="background:var(--saving)"></i>현금비중</div><div class="v num">${cur.net > 0 ? pctPlain(cash / cur.net) : '-'}</div>
      <div class="f"><span>현재 현금</span><b class="num">${money(cash)}</b></div></div>
  </div>
  <p class="note" style="margin:0 4px 12px">${span ? `연평균 증가율: ${span.from.y}년 ${span.from.m}월 → ${cur.y}년 ${cur.m}월 (${span.n}개월) 잔액 기준 연환산${span.n < 12 ? ' · <b>1년 미만 기간이라 실제보다 크게 보일 수 있어요</b>' : ''}. 저축·추가 납입도 포함돼요.` : '연평균 수익률은 두 달 이상 기록이 쌓이면 표시돼요.'}
  현금비중은 순자산 대비예요.</p>${fab}${fab ? '<div style="height:64px"></div>' : ''}`;
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
  if (pts.length < 2){ $('#view').innerHTML = `<div class="empty"><b>분석하려면 두 달 이상의 자산 기록이 필요해요</b>엑셀 '자산관리' 시트에 월별로 입력하면 표시돼요.</div>`; return; }
  const g = S.goal, cur = pts.at(-1), curI = ymIdx(cur.y, cur.m), T = g.target;
  const inp = analysisInputs(pts);
  const base = g.planBase ?? pts[0].net;
  const plan = planCurve(base, g);
  const proj = project(cur.net, inp.rate, inp.save, T);
  const projHit = proj.months != null ? curI + proj.months : null;
  // 계획 대비: 계획 곡선이 현재 순자산에 도달하는 시점과 오늘(기록 기준) 비교
  let planReach = null; for (let i = plan.start; i < plan.start + 12 * plan.ends.length; i++){ const v = plan.at(i); if (v != null && v >= cur.net){ planReach = i; break; } }
  const ahead = planReach != null ? planReach - curI : null;   // + 빠름, − 늦음
  const planNow = plan.at(curI);
  const pctDone = Math.min(1, Math.max(0, cur.net / T));
  const aheadTxt = ahead == null ? '-' : ahead === 0 ? '계획과 같은 속도' : ahead > 0 ? `${durText(ahead)} 빠름` : `${durText(-ahead)} 늦음`;

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
  <section class="card hero">
    <div class="label">목표 ${T / 1e8}억 · 현재 순자산</div>
    <div class="big num">${money(cur.net)}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="t">연평균 수익률</div><div class="v num ${dir(inp.rate)}">${pct(inp.rate, 2)}</div><div class="h">저축 제외 · ${inp.rateMonths}개월 기록</div></div>
      <div class="stat"><div class="t">월 저축 (최근 평균)</div><div class="v num">${money(inp.save)}</div><div class="h">가계부 저축 · ${inp.saveMonths}개월</div></div>
      <div class="stat"><div class="t">목표까지</div><div class="v num">${proj.months != null ? durText(proj.months) : '60년 이상'}</div><div class="h">${projHit != null ? ymText(projHit) + ' 예상' : ''}</div></div>
      <div class="stat"><div class="t">계획 대비</div><div class="v num ${ahead > 0 ? 'down' : ahead < 0 ? 'up' : ''}">${aheadTxt}</div><div class="h">계획 달성 ${plan.hitYear ?? '-'}년</div></div>
    </div>
  </section>

  <section class="card"><h3>순자산 경로 <small>${pts[0].y}년 ${pts[0].m}월 ~</small></h3>
    <div class="chart tall"><canvas id="cPath"></canvas></div>
    <div class="lgd"><span><i style="border-color:var(--accent)"></i>실제</span><span><i style="border-color:var(--accent);border-top-style:dashed"></i>예상</span>
      <span><i style="border-color:#A0A7B1"></i>계획</span><span id="lgSim" style="display:none"><i style="border-color:var(--repay);border-top-style:dashed"></i>시뮬레이션</span>
      <span><i style="border-color:var(--expense);border-top-style:dotted"></i>목표 ${T / 1e8}억</span></div>
  </section>

  <section class="card"><h3>계획 대비 실제 <small>연 ${pct(g.planRate, 0).replace('+','')} + ${money(g.planSave)}/년</small></h3>
    <div class="big2 num ${ahead > 0 ? 'down' : ahead < 0 ? 'up' : ''}">${aheadTxt}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="t">계획상 지금 순자산</div><div class="v num">${planNow != null ? money(planNow) : '-'}</div><div class="h">${cur.y}년 ${cur.m}월 기준</div></div>
      <div class="stat"><div class="t">실제와 차이</div><div class="v num ${planNow != null ? dir(cur.net - planNow) : ''}">${planNow != null ? signed(cur.net - planNow) : '-'}</div></div>
      <div class="stat"><div class="t">계획 ${T / 1e8}억 달성</div><div class="v num">${plan.hitYear ?? '-'}년</div><div class="h">${plan.ends.length - 1}년 차</div></div>
      <div class="stat"><div class="t">현재 추세 달성</div><div class="v num">${projHit != null ? idxYM(projHit)[0] + '년' : '-'}</div><div class="h">${projHit != null && plan.hitIdx != null ? (projHit > plan.hitIdx ? `계획보다 ${durText(projHit - plan.hitIdx)} 늦음` : `계획보다 ${durText(plan.hitIdx - projHit)} 빠름`) : ''}</div></div>
    </div>
    <p class="note">계획: ${g.planYear - 1}년 말 순자산 ${money(base)}${g.planBase == null ? '(첫 기록값)' : ''}에서 시작, 매년 × ${(1 + g.planRate).toFixed(2)} + ${money(g.planSave)}. 빠름/늦음 = 계획 곡선이 지금 순자산에 닿는 시점과 오늘의 차이.</p>
  </section>

  <section class="card"><h3>목표 진척도 <small>${pctPlain(pctDone, 1)}</small></h3>
    <div class="prog"><i style="width:${pctDone * 100}%"></i></div>
    <div class="flow-lg" style="margin-bottom:6px"><span>${money(cur.net)}</span><span>${T / 1e8}억</span></div>
    ${MS.map(msRow).join('')}
  </section>

  <section class="card"><h3>목표 시뮬레이터 <button id="simReset" style="font-size:13px;color:var(--accent);font-weight:600">초기화</button></h3>
    <div class="rng"><div class="lab"><span>월 저축액</span><b class="num" id="simSaveV"></b></div><input type="range" id="simSave" min="0" max="20000000" step="100000"></div>
    <div class="rng"><div class="lab"><span>연 수익률 (저축 제외)</span><b class="num" id="simRateV"></b></div><input type="range" id="simRate" min="-5" max="30" step="0.5"></div>
    <div class="res" id="simRes"></div>
  </section>

  <section class="card"><h3>FIRE · 배당 전환 시 <small>연 ${+(DR * 100).toFixed(2)}% · 배당소득세 15.4% 차감</small></h3>
    <div class="seg" id="segFire" style="margin-bottom:14px"><button data-v="fin">금융자산</button><button data-v="net">순자산 전체</button></div>
    <div class="t" style="font-size:13px;color:var(--sub);font-weight:600">지금 ${useNet ? '순자산을 모두' : '금융자산을 모두'} 배당에 넣으면 매달</div>
    <div class="big2 num" style="color:var(--saving);margin-top:4px">${money(divMonth)}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="t">${useNet ? '순자산 원금' : '금융자산 원금'}</div><div class="v num">${money(principal)}</div>
        <div class="h">${useNet ? `총자산 ${money(cur.total)} − 부채 ${money(cur.debt)}` : `금융투자 ${money(inv)} + 현금 ${money(cash)}`}</div></div>
      <div class="stat"><div class="t">연 실수령 배당</div><div class="v num">${money(divYear)}</div><div class="h">원금 × ${+(DR * 100).toFixed(2)}% × ${+(DN * 100).toFixed(1)}%</div></div>
      <div class="stat"><div class="t">월 지출 대비</div><div class="v num">${cover != null ? pctPlain(cover, 0) : '-'}</div><div class="h">최근 평균 지출 ${money(inp.expense)}</div></div>
      <div class="stat"><div class="t">${money(T)} 달성 시 월 배당</div><div class="v num">${money(goalMonth)}</div><div class="h">목표액 전부 배당 가정</div></div>
    </div>
    <p class="note">${useNet ? '아파트를 팔고 대출을 모두 갚은 뒤 남는 돈 전부를 배당에 넣는 가정이에요. 매각 비용·양도세와 이후 주거비는 빠져 있어요.' : '부동산은 제외한 계산이에요.'} 퇴직금(퇴직연금)은 55세 전 인출에 제한이 있을 수 있어요.</p>
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
      <div style="font-size:13px;color:var(--sub)">${hit2 != null ? durText(p2.months) + ' 후' : ''}${diff ? ' · ' + diff : ''}${plan.hitIdx != null && hit2 != null ? ` · 계획(${plan.hitYear}년) 대비 ${hit2 > plan.hitIdx ? durText(hit2 - plan.hitIdx) + ' 늦음' : durText(plan.hitIdx - hit2) + ' 빠름'}` : ''}</div>`;
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
  if (!b.has){ emptyMonth(m, '가계부'); $('#view').innerHTML = bsegHtml() + rsegHtml() + (TX ? `<div class="empty"><b>${m}월 거래가 없어요</b>달력에서 거래를 입력하면 항목별로 합산돼요.</div>` : $('#view').innerHTML); return; }
  const ed = canEdit();
  const dExp = pb.has ? b.expense - pb.expense : null;
  const dSav = pb.has ? b.saving - pb.saving : null;
  const exItems = b.items.filter(i=>EXP_KINDS.includes(i.kind) && i.amt>0).sort((x,y)=>y.amt-x.amt);
  const flowTot = Math.max(b.income, b.expense + b.save, 1);
  let html = `${bsegHtml()}${rsegHtml()}${!TX && ed ? `<div class="ebtnrow"><button class="btn" data-act="editBudget">✎ ${m}월 한꺼번에 입력</button></div>` : ''}
  <section class="card hero">
    <div class="label">${m}월 저축</div>
    <div class="big num">${money(b.save)}</div>
    <div class="sub">저축률 <b style="color:var(--saving)">${pctPlain(b.rate)}</b>${dSav!=null?` · 전월 대비 <span class="${dir(dSav)}">${signed(dSav)}</span>`:''}</div>
    <div class="split">
      <div class="s"><div class="t"><i class="dot" style="background:var(--saving)"></i>저축</div><div class="v num">${money(b.save)}</div>
        <div class="d">${pb.has?`<span class="${dir(b.save-pb.save)}">${signed(b.save-pb.save)}</span>`:'<span class="muted">가계부에 입력한 저축</span>'}</div></div>
      <div class="s"><div class="t"><i class="dot" style="background:var(--faint)"></i>남은 돈</div><div class="v num ${b.left<0?'up':''}">${money(b.left)}</div>
        <div class="d">${pb.has?`<span class="${dir(b.left-pb.left)}">${signed(b.left-pb.left)}</span>`:'<span class="muted">수입 − 지출 − 저축</span>'}</div></div>
    </div>
    <div class="flow"><i style="width:${b.fixed/flowTot*100}%;background:var(--fixed)"></i><i style="width:${b.variable/flowTot*100}%;background:var(--expense)"></i><i style="width:${b.save/flowTot*100}%;background:var(--saving)"></i></div>
    <div class="flow-lg"><span>고정비 ${pctPlain(b.income? b.fixed/b.income:0,0)}</span><span>변동비 ${pctPlain(b.income? b.variable/b.income:0,0)}</span><span>저축 ${pctPlain(b.income? b.save/b.income:0,0)}</span></div>
  </section>
  <div class="tiles">
    <div class="tile"><div class="t"><i class="dot" style="background:var(--income)"></i>수입</div><div class="v num">${money(b.income)}</div>${pb.has?`<div class="d ${dir(b.income-pb.income)}">${signed(b.income-pb.income)}</div>`:''}</div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--expense)"></i>지출</div><div class="v num">${money(b.expense)}</div>${dExp!=null?`<div class="d ${dir(dExp)}">${signed(dExp)}</div>`:''}</div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--saving)"></i>저축</div><div class="v num">${money(b.save)}</div>${dSav!=null?`<div class="d ${dir(dSav)}">${signed(dSav)}</div>`:''}</div>
  </div>${TX ? '<div id="rpStat"></div>' : ''}
  <section class="card">
    <h3>수입 배분 <small>수입 ${money(b.income)} 기준</small></h3>
    <div class="donut"><canvas id="cFlow"></canvas><div class="center"><div><b class="num">${pctPlain(Math.max(b.rate,0),0)}</b><span>저축률</span></div></div></div>
    <div class="legend">
      ${[['고정비',b.fixed,'--fixed'],['변동비',b.variable,'--expense'],['저축',b.save,'--saving'],['남은 돈',Math.max(b.left,0),'--faint']].map(([n,a,c])=>`
      <div class="lg"><i class="dot" style="background:var(${c})"></i><span class="n">${n}</span><span class="p num">${b.income?pctPlain(a/b.income,0):'-'}</span><span class="a num">${money(a)}</span></div>`).join('')}
    </div>
  </section>`;
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
  html += `<section class="card"><h3>상세 내역${TX ? ' <small>항목을 누르면 거래가 보여요</small>' : ed ? ' <small>항목을 누르면 고칠 수 있어요</small>' : ''}</h3>${KINDS.map(k=>{
    const all = b.items.filter(i=>i.kind===k), its = S.showZero ? all : all.filter(i => !zero(i)); if (!all.length || (!its.length && !ed)) return '';
    const tot = its.reduce((a,i)=>a+i.amt,0), color = k==='수입'?'--income':k==='고정비'?'--fixed':k==='저축'?'--saving':'--expense';
    const max = Math.max(...its.map(i=>Math.abs(i.amt)),1);
    const prevMap = {}; pb.items.filter(i=>i.kind===k).forEach(i=>prevMap[i.name]=(prevMap[i.name]||0)+i.amt);
    return `<div class="group"><div class="gh"><span><span class="tag">${k}</span></span><span class="num">${money(tot)}</span></div>
      ${its.map(i=>{ const d = pb.has && prevMap[i.name]!=null ? i.amt - prevMap[i.name] : null;
        const pend = pendOf(i);
        return `<div class="row${ed || TX ? ' tap' : ''}${i.filled ? '' : ' unfilled'}"${ed || TX ? ` data-act="eb" data-k="${m}|${b.items.indexOf(i)}" role="button" tabindex="0"` : ''}><div class="n">${esc(i.name)}${pend ? '<span class="memo pend">저장 대기</span>' : i.memo?`<span class="memo">${esc(i.memo)}</span>`:''}
          <div class="bar"><i style="width:${Math.abs(i.amt)/max*100}%;background:var(${color})"></i></div></div>
          <div class="a num">${i.filled ? money(i.amt) : TX ? '-' : '입력 안 함'}${d && i.filled?`<span class="d ${dir(d)}">${signed(d)}</span>`:''}</div>${ed ? '<span class="pen" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span>' : ''}</div>`;}).join('')}
      ${ed ? `<button class="eadd" data-act="addB" data-kind="${k}">+ ${k} 항목 추가</button>` : ''}</div>`;
  }).join('')}${nZero ? `<button class="zt" data-act="zeroItems">${S.showZero ? '0원 항목 숨기기' : `0원 항목 ${nZero}개 보기`}</button>` : ''}</section>`;
  $('#view').innerHTML = html;
  donut('cFlow', ['고정비','변동비','저축','남은 돈'], [b.fixed,b.variable,b.save,Math.max(b.left,0)], [css('--fixed'),css('--expense'),css('--saving'),css('--faint')]);
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
function viewAsset(){
  const m = S.month.asset, A = analysis(m), c = A.c, p = A.p;
  if (!c.has) return emptyMonth(m, '자산');
  const edA = canEdit();
  const d = (cur, prev, kind) => A.prevOk ? `<div class="d ${dir(cur-prev)}">${signed(cur-prev)}${prev? ' ('+pct((cur-prev)/prev)+')' : ''}</div>` : `<div class="d muted">전월 데이터 없음</div>`;
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
  <section class="card hero">
    <div class="label">${m}월 말 순자산</div>
    <div class="big num">${money(c.net)}</div>
    <div class="sub">${A.prevOk ? `전월 대비 <span class="${dir(A.dNet)}"><b>${signed(A.dNet)}</b> (${A.rNet!=null?pct(A.rNet,2):'-'})</span>` : '전월 자산 데이터가 없어 비교할 수 없어요'}</div>
  </section>
  <div class="tiles two">
    <div class="tile"><div class="t">총자산</div><div class="v num">${money(c.total)}</div>${d(c.total,p.total)}</div>
    <div class="tile"><div class="t">부채</div><div class="v num">${money(c.debt)}</div>${d(c.debt,p.debt)}</div>
    <div class="tile"><div class="t">유동자산</div><div class="v num">${money(c.liquid)}</div>${d(c.liquid,p.liquid)}</div>
    <div class="tile"><div class="t">비유동자산</div><div class="v num">${money(c.fixedA)}</div>${d(c.fixedA,p.fixedA)}</div>
  </div>
  ${ytd ? `<section class="card"><h3>1월 대비 현재 <small>1월 → ${L}월</small></h3>
    <div class="stats">${ytd.map(([n,a,b,note])=>`
      <div class="stat"><div class="t">${n}</div><div class="v num ${dir(b-a)}" style="font-size:22px">${a?pct((b-a)/Math.abs(a),2):'-'}</div>
        <div class="h" style="color:var(--sub)"><span class="${dir(b-a)}" style="white-space:nowrap">${signed(b-a)}</span> · <span style="white-space:nowrap">${money(a)}</span> → <span style="white-space:nowrap">${money(b)}</span></div>
        ${note?`<div class="h">${note}</div>`:''}</div>`).join('')}
    </div></section>` : ''}
  <section class="card"><h3>${m}월 자산 분석 <small>전월 대비</small></h3>
    ${A.prevOk ? `<div class="stats">
      <div class="stat"><div class="t">순자산 증감</div><div class="v num ${dir(A.dNet)}">${signed(A.dNet)}</div></div>
      <div class="stat"><div class="t">순자산 증가율</div><div class="v num ${dir(A.dNet)}">${A.rNet!=null?pct(A.rNet,2):'-'}</div><div class="h">순자산 증감 ÷ 전월 순자산</div></div>
      <div class="stat"><div class="t">총자산 증감</div><div class="v num ${dir(A.dTotal)}">${signed(A.dTotal)}</div></div>
      <div class="stat"><div class="t">총자산 증감률</div><div class="v num ${dir(A.dTotal)}">${A.rTotal!=null?pct(A.rTotal,2):'-'}</div></div>
      <div class="stat"><div class="t"><i class="dot" style="background:var(--saving)"></i> 저축</div><div class="v num">${A.saving!=null?money(A.saving):'-'}</div><div class="h">가계부에 입력한 저축</div></div>
      <div class="stat"><div class="t">저축 외 자산 변동</div><div class="v num ${A.other!=null?dir(A.other):''}">${A.other!=null?signed(A.other):'-'}</div><div class="h">순자산 증감 − 저축 (투자손익 · 시세)</div></div>
      <div class="stat"><div class="t">저축 제외 수익률</div><div class="v num ${A.rOther!=null?dir(A.rOther):''}">${A.rOther!=null?pct(A.rOther,2):'-'}</div><div class="h">저축 외 변동 ÷ 전월 순자산</div></div>
      <div class="stat"><div class="t">부채비율</div><div class="v num">${pctPlain(A.debtRatio)}</div><div class="h">부채 ÷ 총자산</div></div>
    </div>` : `<div class="stats"><div class="stat"><div class="t">부채비율</div><div class="v num">${pctPlain(A.debtRatio)}</div></div></div><p class="note">전월 자산을 입력하면 증감·수익률이 표시돼요.</p>`}
  </section>
  <section class="card"><h3>항목별 자산 <small>${A.prevOk?'괄호: 전월 대비':''}</small></h3>
    ${BIGS.map(big=>{
      const its = list.filter(a=>a.big===big); if (!its.length) return '';
      const tot = big==='유동자산'?c.liquid:big==='비유동자산'?c.fixedA:c.debt, ptot = big==='유동자산'?p.liquid:big==='비유동자산'?p.fixedA:p.debt;
      return `<div class="group"><div class="gh"><span><span class="tag">${big}</span></span><span class="num" style="text-align:right">${money(tot)}${A.prevOk&&tot!==ptot?`<span class="${dir(tot-ptot)}" style="display:block;font-size:12px;font-weight:500">${signed(tot-ptot)}</span>`:''}</span></div>
      ${midsOf(big).map(md=>{
        const sub = its.filter(a=>a.mid===md), st = sub.reduce((s,a)=>s+c.val(a),0), sp = sub.reduce((s,a)=>s+(p.val?p.val(a):0),0);
        return `<div class="mgrp"><div class="mh"><div class="n">${esc(md)}<small>${sub.length}개 항목</small></div><div class="a num">${money(st)}${A.prevOk&&st!==sp?`<span class="d ${dir(st-sp)}">${signed(st-sp)}</span>`:''}</div></div>
        <div class="mitems">${sub.map(a=>{ const v=c.val(a), pv=A.prevOk? p.val(a):null, dd = pv!=null? v-pv : 0;
          return `<div class="row sub-row"><div class="n">${esc(a.small)}<div class="bar"><i style="width:${tot? Math.abs(v)/Math.abs(tot)*100:0}%;background:${big==='부채'?'var(--expense)':'var(--accent)'}"></i></div></div>
          <div class="a num">${money(v)}${dd?`<span class="d ${dir(dd)}">${signed(dd)}</span>`:''}</div></div>`;}).join('')}</div></div>`;
      }).join('')}</div>`;
    }).join('')}
  </section>
  <section class="card"><h3>순자산 · 총자산 · 부채 추이</h3><div class="chart"><canvas id="cNet"></canvas></div></section>
  <section class="card"><h3>자산 구성 변화 <small>중분류</small></h3><div class="chart tall"><canvas id="cMix"></canvas></div></section>
  <section class="card"><h3>항목별 추이 <select class="pick" id="pick">${opt.map(o=>`<option value="${esc(o[0])}"${o[0]===S.assetPick?' selected':''}>${esc(o[1])}</option>`).join('')}</select></h3>
    <div class="chart"><canvas id="cPick"></canvas></div><div id="pickInfo" class="note"></div></section>`;
  $('#view').innerHTML = html;

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
      ${m && canEdit() ? `<div style="margin-top:20px;max-width:320px;margin-inline:auto"><button class="btn" data-act="${what==='자산'?'editAsset':'editBudget'}">${m}월 ${what==='자산'?'잔액':'가계부'} 입력하기</button></div>` : ''}</div>`;
}
