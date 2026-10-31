'use strict';
/* ───────── 저장소 ───────── */
// 개인용 앱(asset-app)과 같은 도메인(github.io)에서 열려도 저장소가 섞이지 않게 접두어를 따로 써요
const LSP = 'alv.';
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(LSP+k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(LSP+k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(LSP+k); }catch(e){} }
};
const S = {
  tab: (t => t === 'trend' ? (LS.set('bview', 'year'), 'budget') : ['home','budget','asset','analysis','settings'].includes(t) ? t : 'home')(LS.get('tab','home')),
  theme: LS.get('theme','system'),
  unit: LS.get('unit','short'),
  gfiles: LS.get('gfiles', []),          // 구글 연결 시트 [{id, name, year, mime}]
  guser: LS.get('guser', null),          // 연결된 구글 계정 이메일 (토큰은 저장하지 않음)
  years: LS.get('years', null),          // 연도 → 데이터
  year: LS.get('year', null),
  model: null,                           // 현재 선택 연도의 데이터
  meta: LS.get('meta', {}),
  month: { budget:null, asset:null },
  assetPick: LS.get('assetPick','__net'),
  goal: Object.assign({target:1e9, planRate:0.06, planSave:2.4e7, planYear:new Date().getFullYear(), planBase:null, divRate:0.04, divNet:0.846}, LS.get('goal', {})),
  sim: null,   // 시뮬레이터 값 (앱 안에서만, 저장 안 함)
  fireBase: LS.get('fireBase', 'fin'),   // FIRE 배당 원금: fin 금융자산 / net 순자산
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ───────── 포맷 ───────── */
const won = n => (n<0?'-':'') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원';
function shortWon(n){
  const a = Math.abs(Math.round(n)), s = n<0 ? '-' : '';
  if (a >= 1e8){ let e = Math.floor(a/1e8), m = Math.round((a%1e8)/1e4); if (m>=10000){e++;m=0}
    return s + e.toLocaleString('ko-KR') + '억' + (m ? ' ' + m.toLocaleString('ko-KR') + '만' : '') + '원'; }
  if (a >= 1e4) return s + Math.round(a/1e4).toLocaleString('ko-KR') + '만원';
  return s + a.toLocaleString('ko-KR') + '원';
}
const money = n => S.unit === 'full' ? won(n) : shortWon(n);
const signed = n => (n>0?'+':'') + money(n);
const pct = (x, d=1) => (x>0?'+':'') + (x*100).toFixed(d) + '%';
const pctPlain = (x, d=1) => (x*100).toFixed(d) + '%';
const dir = n => n>0 ? 'up' : n<0 ? 'down' : 'muted';
const axisWon = v => { const a=Math.abs(v); return a>=1e8 ? (+(v/1e8).toFixed(2)).toString()+'억' : a>=1e4 ? Math.round(v/1e4).toLocaleString()+'만' : v; };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PALETTE = ['#3182F6','#22B07D','#F59E0B','#8B5CF6','#F04452','#06B6D4','#EC4899','#84CC16','#F97316','#6366F1','#14B8A6','#A855F7'];

/* ───────── 엑셀 파싱 (값은 앱에서 직접 계산) ───────── */
const KINDS = ['수입','고정비','변동비'], BIGS = ['유동자산','비유동자산','부채'];
const toNum = v => { if (v==null || v==='') return null; if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = String(v).replace(/[,원\s]/g,''); if (t==='' || t==='-') return null; const n = Number(t); return isFinite(n) ? n : null; };
const str = v => v==null ? '' : String(v).trim();

function parseWorkbook(buf){
  const wb = XLSX.read(buf, {type:'array'});
  const rows = name => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, raw:true, defval:null}) : null;
  let year = null;
  const st = rows('설정');
  let prevDebt = null;   // 설정 '전년 12월 말 부채' (1월 대출 상환액 계산용)
  if (st) for (const r of st){
    const lab = c => str(c).replace(/\s/g,'');
    let i = r.findIndex(c => lab(c) === '기준연도'); if (i >= 0 && year == null) year = toNum(r[i+1]);
    i = r.findIndex(c => lab(c) === '전년12월말부채'); if (i >= 0) prevDebt = toNum(r[i+1]);
  }
  if (!year) year = new Date().getFullYear();

  const budget = {}, tx = {}, reps = {}; let txMode = false;
  for (let m=1; m<=12; m++){
    const R = rows(m+'월'); const items = [];
    tx[m] = []; reps[m] = [];
    if (R){
      const h = R.findIndex(r => str(r[0]).startsWith('구분'));
      const C = h >= 0 ? ledgerCols(R, h) : null;
      if (h >= 0) for (let i=h+1; i<R.length; i++){
        const r = R[i], k = str(r[0]);
        if (k.startsWith('▲')) break;
        if (!KINDS.includes(k)) continue;
        const name = str(r[1]), amt = toNum(r[2]);
        if (!name && amt==null) continue;
        items.push({kind:k, name: name || '(이름 없음)', amt: amt ?? 0, memo: str(r[3]), filled: amt!=null,
          subs: C.sub >= 0 ? splitSubs(r[C.sub]) : [], bud: C.bud >= 0 ? toNum(r[C.bud]) : null});
      }
      if (C && C.tx >= 0){ txMode = true; tx[m] = readTx(R, C.txH, C.tx, m).map(({row, ...t}) => t); }
      if (C && C.rep >= 0) reps[m] = readReps(R, C.repH, C.rep, C.repEnd).map(({row, ...r}) => r);
    }
    budget[m] = items;
  }

  const A = rows('자산관리'); const assets = [];
  if (!A) throw new Error("'자산관리' 시트를 찾지 못했어요");
  let h = A.findIndex(r => str(r[0]) === '대분류');
  if (h < 0) throw new Error("'자산관리' 시트에서 '대분류' 머리글을 찾지 못했어요");
  const monthCol = {};
  A[h].forEach((c,i) => { const mm = /^(\d{1,2})월$/.exec(str(c)); if (mm) monthCol[+mm[1]] = i; });
  for (let i=h+1; i<A.length; i++){
    const r = A[i], b = str(r[0]);
    if (b.startsWith('▲') || b === '요약') break;
    if (!BIGS.includes(b)) continue;
    const v = []; for (let m=1; m<=12; m++) v.push(monthCol[m]!=null ? toNum(r[monthCol[m]]) : null);
    assets.push({big:b, mid: str(r[1]) || '기타', small: str(r[2]) || str(r[1]) || '항목', v});
  }
  const Y = {year, budget, assets, prevDebt};
  if (txMode){ Object.assign(Y, {txMode, tx, reps}); for (let m = 1; m <= 12; m++) recalcMonth(Y, m); }
  return Y;
}

/* ───────── 계산 ───────── */
// 자산 묶음은 모두 중분류 이름으로 정한다. 소분류(항목) 이름은 자유롭게 바꾸거나 추가해도 된다.
// 대분류(유동자산·비유동자산·부채)와 아래 중분류 이름은 시트와 같아야 한다.
const MIDS = {
  invest: ['투자', '퇴직금', '코인'],   // 홈 '금융투자'
  cash:   ['저축', '청약'],             // 홈 '현금'
  estate: ['부동산'],                   // 홈 '부동산'
  stock:  ['투자', '퇴직금'],           // 자산 탭 '주식 계좌 증가율' (중분류 '코인'은 제외)
};
const inMids = (mids, a) => a.big !== '부채' && mids.includes(a.mid);
const HOME_GROUPS = {
  invest: {label:'금융투자', note:'중분류 ' + MIDS.invest.join(' · '), match: a => inMids(MIDS.invest, a)},
  estate: {label:'부동산',   note:'중분류 ' + MIDS.estate.join(' · '), match: a => inMids(MIDS.estate, a)},
  cash:   {label:'현금',     note:'중분류 ' + MIDS.cash.join(' · '),   match: a => inMids(MIDS.cash, a)},
};
const RETURN_GROUPS = [
  {name:'주식',   label:'주식 계좌 증가율', note:'중분류 ' + MIDS.stock.join(' + ') + ' · 추가 납입 포함',  match: a => inMids(MIDS.stock, a)},
  {name:'부동산', label:'부동산 평가액 변화', note:'중분류 ' + MIDS.estate.join(' + '), match: a => inMids(MIDS.estate, a)},
];
const inGroup = (g, a) => g.match(a);

function wrapYM(m, y){ if (m < 1) return [m + 12, y - 1]; if (m > 12) return [m - 12, y + 1]; return [m, y]; }
function bMonth(m, y = S.year){
  [m, y] = wrapYM(m, y);
  const items = (S.years?.[y]?.budget?.[m]) || [];
  const sum = k => items.filter(i=>i.kind===k).reduce((a,i)=>a+i.amt,0);
  const income = sum('수입'), fixed = sum('고정비'), variable = sum('변동비'), expense = fixed + variable;
  const has = items.some(i => i.filled && i.amt !== 0);
  const cash = income - expense, repay = loanRepay(m, y), saving = cash + repay;
  return {m, y, items, has, income, fixed, variable, expense, cash, repay, saving, rate: income ? saving/income : 0};
}
// 대출상환 저축 = 전월 부채 − 이번 달 부채 (줄어든 만큼만). 엑셀과 같은 규칙:
// 1월은 설정 시트의 '전년 12월 말 부채' 우선, 없으면 등록된 전년도 파일의 12월 값.
function loanRepay(m, y){
  const c = aMonth(m, y); if (!c.has) return 0;
  let prev = null;
  if (m === 1 && S.years?.[y]?.prevDebt != null) prev = S.years[y].prevDebt;
  else { const p = aMonth(m - 1, y); if (p.has) prev = p.debt; }
  return prev == null ? 0 : Math.max(0, prev - c.debt);
}
function aMonth(m, y = S.year){
  [m, y] = wrapYM(m, y);
  const M = S.years?.[y];
  if (!M) return {has:false, m, y};
  const idx = m-1, list = M.assets;
  const has = list.some(a => a.v[idx] != null);
  // 다른 연도 파일의 같은 항목은 대분류|중분류|소분류 이름으로 맞춰 찾고,
  // 이름이 바뀌어 못 찾으면 같은 대분류·중분류 안에서 같은 순서의 항목으로 맞춘다.
  const key = a => a.big + '|' + a.mid + '|' + a.small, byKey = new Map();
  list.forEach(a => byKey.set(key(a), (byKey.get(key(a)) || 0) + (a.v[idx] ?? 0)));
  const val = a => {
    if (list.includes(a)) return a.v[idx] ?? 0;
    if (byKey.has(key(a))) return byKey.get(key(a));
    const own = Object.values(S.years).find(Y => Y.assets.includes(a));
    if (!own) return 0;
    const same = x => x.big === a.big && x.mid === a.mid;
    const pos = own.assets.filter(same).indexOf(a), here = list.filter(same);
    const cand = here[pos];
    return cand && !own.assets.some(o => key(o) === key(cand)) ? (cand.v[idx] ?? 0) : 0;
  };
  const by = b => list.filter(a=>a.big===b).reduce((s,a)=>s+val(a),0);
  const liquid = by('유동자산'), fixedA = by('비유동자산'), debt = by('부채');
  const total = liquid + fixedA;
  return {m, y, has, liquid, fixedA, debt, total, net: total-debt, val};
}
function analysis(m){
  const c = aMonth(m), p = aMonth(m-1), b = bMonth(m);
  const r = {c, p, prevOk: c.has && p.has};
  if (r.prevOk){
    r.dTotal = c.total - p.total; r.dNet = c.net - p.net;
    r.rTotal = p.total ? r.dTotal/p.total : null; r.rNet = p.net ? r.dNet/p.net : null;
    r.cash = b.has ? b.cash : null; r.repay = b.repay;
    r.saving = (r.cash || 0) + r.repay;
    r.other = r.dNet - r.saving;
    r.rOther = (r.other!=null && p.net) ? r.other/p.net : null;
  }
  r.debtRatio = c.total ? c.debt/c.total : 0;
  return r;
}
const lastWith = fn => { for (let m=12; m>=1; m--) if (fn(m).has) return m; return 1; };
const midsOf = big => [...new Set(S.model.assets.filter(a=>a.big===big).map(a=>a.mid))];

/* ───────── 차트 ───────── */
const charts = [];
function killCharts(){ while (charts.length) charts.pop().destroy(); }
function mk(id, cfg){
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 11;
  Chart.defaults.color = css('--sub');
  Chart.defaults.borderColor = css('--line');
  cfg.options = Object.assign({responsive:true, maintainAspectRatio:false, animation:{duration:350}}, cfg.options||{});
  charts.push(new Chart(el, cfg));
}
const tipWon = {callbacks:{label: c => ` ${c.dataset.label ? c.dataset.label+': ' : (c.label? c.label+': ' : '')}${c.raw==null?'-':money(c.raw)}`}};
const baseTip = {backgroundColor:'#191F28', padding:10, cornerRadius:10, titleFont:{weight:'700'}, boxPadding:4};
function donut(id, labels, data, colors){
  mk(id, {type:'doughnut', data:{labels, datasets:[{data, backgroundColor:colors, borderWidth:0, hoverOffset:4}]},
    options:{cutout:'72%', plugins:{legend:{display:false}, tooltip:{...baseTip, ...tipWon,
      callbacks:{label: c => { const t = c.dataset.data.reduce((a,b)=>a+b,0); return ` ${c.label}: ${money(c.raw)} (${t?pctPlain(c.raw/t):'-'})`; }}}}}});
}
const monthLabels = () => Array.from({length:12}, (_,i)=>(i+1)+'월');
const scaleWon = (extra={}) => ({grid:{color:css('--line')}, border:{display:false}, ticks:{callback:axisWon, maxTicksLimit:6}, ...extra});
const scaleX = {grid:{display:false}, border:{display:false}, ticks:{maxRotation:0, autoSkip:false, callback:(v,i)=>i+1}};

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
  const now = new Date(), today = P.cur ? (Y.tx?.[P.m] || []).filter(t => !t.skip && t.d === now.getDate() && t.kind !== '수입').reduce((a, t) => a + t.amt, 0) : 0;
  const bs = TX ? budState(P.y, P.m) : null, rem = bs ? bs.total - bs.spent : 0, r = bs?.total ? bs.spent / bs.total : 0;
  return `<section class="card hledger" data-act="homeLedger" role="button" tabindex="0">
    <div class="hl-top"><span class="label">${P.cur ? '이번 달' : `${P.y}년 ${P.m}월`} 가계부</span><span class="go">›</span></div>
    ${bs?.total ? `<div class="big num">${rem >= 0 ? `${money(rem)} <em>남았어요</em>` : `${money(-rem)} <em class="up">넘었어요</em>`}</div>
      <div class="btrack sm"><i class="${bClass(r)}" style="width:${Math.min(r, 1) * 100}%"></i>${bs.cur ? `<b class="bpace" style="left:${Math.min(bs.okLine / bs.total, 1) * 100}%"></b>` : ''}</div>
      <div class="hl-row"><span>예산 ${money(bs.total)} 중 ${Math.round(r * 100)}%</span><span>${bs.cur && bs.left ? `하루 <b>${money(bs.daily)}</b> 쓸 수 있어요` : ''}</span></div>`
    : `<div class="big num">${money(b.expense)} <em>썼어요</em></div><div class="hl-row"><span>수입 ${money(b.income)} · 일반 저축 ${money(b.cash)}</span>${ed ? '<button class="hl-link" data-act="homeBud">예산 정하기 ›</button>' : ''}</div>`}
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
  ${loose.length ? `<div class="warn"><b>분류되지 않은 자산 ${loose.length}개</b> · ${loose.map(a => esc(a.small)).join(', ')} (${money(looseSum)})<br>중분류가 투자·퇴직금·코인·저축·청약·부동산이 아니라 홈의 금융투자·부동산·현금 어디에도 들어가지 않아요.</div>` : ''}
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
// 저축 합계 (엑셀과 같은 규칙: 가계부 미입력 달은 대출상환 저축만)
const savingOf = (m, y) => { const b = bMonth(m, y); return b.has ? b.saving : loanRepay(m, y); };
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
  const ahead = planReach != null ? planReach - curI : null;   // + 앞섬, − 뒤처짐
  const planNow = plan.at(curI);
  const pctDone = Math.min(1, Math.max(0, cur.net / T));
  const aheadTxt = ahead == null ? '-' : ahead === 0 ? '계획과 같은 속도' : ahead > 0 ? `${durText(ahead)} 앞섬` : `${durText(-ahead)} 뒤처짐`;

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

  // FIRE: 금융자산(홈의 금융투자 + 현금) 전부 배당 → 세후 (배당률·세후 비율은 설정에서)
  const G = HOME_GROUPS, inv = grpSum(G.invest, cur), cash = grpSum(G.cash, cur), fin = inv + cash;
  // 원금 선택: 금융자산(부동산 제외) 또는 순자산 전체(부동산 매각·부채 상환 후 남는 돈)
  const useNet = S.fireBase === 'net', principal = useNet ? Math.max(cur.net, 0) : fin;
  const DR = g.divRate ?? 0.04, DN = g.divNet ?? 0.846;
  const divYear = principal * DR * DN, divMonth = divYear / 12, goalMonth = T * DR * DN / 12;
  const cover = inp.expense ? divMonth / inp.expense : null;

  $('#view').innerHTML = `
  <section class="card hero">
    <div class="label">목표 ${T / 1e8}억 · 현재 순자산</div>
    <div class="big num">${money(cur.net)}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="t">연평균 수익률</div><div class="v num ${dir(inp.rate)}">${pct(inp.rate, 2)}</div><div class="h">저축 제외 · ${inp.rateMonths}개월 기록</div></div>
      <div class="stat"><div class="t">월 저축 (최근 평균)</div><div class="v num">${money(inp.save)}</div><div class="h">일반 + 대출상환 · ${inp.saveMonths}개월</div></div>
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
    <p class="note">계획: ${g.planYear - 1}년 말 순자산 ${money(base)}${g.planBase == null ? '(첫 기록값)' : ''}에서 시작, 매년 × ${(1 + g.planRate).toFixed(2)} + ${money(g.planSave)}. 앞섬/뒤처짐 = 계획 곡선이 지금 순자산에 닿는 시점과 오늘의 차이.</p>
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

  <section class="card"><h3>FIRE · 배당 전환 시 <small>연 ${+(DR * 100).toFixed(2)}% · 세후 ${+(DN * 100).toFixed(1)}%</small></h3>
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
  const exItems = b.items.filter(i=>i.kind!=='수입' && i.amt>0).sort((x,y)=>y.amt-x.amt);
  const flowTot = Math.max(b.income, b.expense, 1);
  let html = `${bsegHtml()}${rsegHtml()}${!TX && ed ? `<div class="ebtnrow"><button class="btn" data-act="editBudget">✎ ${m}월 한꺼번에 입력</button></div>` : ''}
  <section class="card hero">
    <div class="label">${m}월 저축 합계 <span class="muted">· 일반 + 대출상환</span></div>
    <div class="big num ${b.saving<0?'up':''}">${money(b.saving)}</div>
    <div class="sub">저축률 <b style="color:var(--saving)">${pctPlain(b.rate)}</b>${dSav!=null?` · 전월 대비 <span class="${dir(dSav)}">${signed(dSav)}</span>`:''}</div>
    <div class="split">
      <div class="s"><div class="t"><i class="dot" style="background:var(--saving)"></i>일반 저축</div><div class="v num ${b.cash<0?'up':''}">${money(b.cash)}</div>
        <div class="d">${pb.has?`<span class="${dir(b.cash-pb.cash)}">${signed(b.cash-pb.cash)}</span>`:'<span class="muted">수입 − 지출</span>'}</div></div>
      <div class="s"><div class="t"><i class="dot" style="background:var(--repay)"></i>대출상환 저축</div><div class="v num">${money(b.repay)}</div>
        <div class="d">${pb.has?`<span class="${dir(b.repay-pb.repay)}">${signed(b.repay-pb.repay)}</span>`:'<span class="muted">부채 감소분</span>'}</div></div>
    </div>
    <div class="flow"><i style="width:${b.fixed/flowTot*100}%;background:var(--fixed)"></i><i style="width:${b.variable/flowTot*100}%;background:var(--expense)"></i><i style="width:${Math.max(b.cash,0)/flowTot*100}%;background:var(--saving)"></i></div>
    <div class="flow-lg"><span>고정비 ${pctPlain(b.income? b.fixed/b.income:0,0)}</span><span>변동비 ${pctPlain(b.income? b.variable/b.income:0,0)}</span><span>일반 저축 ${pctPlain(b.income? Math.max(b.cash,0)/b.income:0,0)}</span></div>
  </section>
  <div class="tiles">
    <div class="tile"><div class="t"><i class="dot" style="background:var(--income)"></i>수입</div><div class="v num">${money(b.income)}</div>${pb.has?`<div class="d ${dir(b.income-pb.income)}">${signed(b.income-pb.income)}</div>`:''}</div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--expense)"></i>지출</div><div class="v num">${money(b.expense)}</div>${dExp!=null?`<div class="d ${dir(dExp)}">${signed(dExp)}</div>`:''}</div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--saving)"></i>저축 합계</div><div class="v num">${money(b.saving)}</div>${dSav!=null?`<div class="d ${dir(dSav)}">${signed(dSav)}</div>`:''}</div>
  </div>${TX ? '<div id="rpStat"></div>' : ''}
  <section class="card">
    <h3>수입 배분 <small>수입 ${money(b.income)} 기준</small></h3>
    <div class="donut"><canvas id="cFlow"></canvas><div class="center"><div><b class="num">${pctPlain(Math.max(b.rate,0),0)}</b><span>저축률${b.repay?' (상환 포함)':''}</span></div></div></div>
    <div class="legend">
      ${[['고정비',b.fixed,'--fixed'],['변동비',b.variable,'--expense'],['일반 저축',Math.max(b.cash,0),'--saving']].map(([n,a,c])=>`
      <div class="lg"><i class="dot" style="background:var(${c})"></i><span class="n">${n}</span><span class="p num">${b.income?pctPlain(a/b.income,0):'-'}</span><span class="a num">${money(a)}</span></div>`).join('')}
      <div class="lg" style="border-top:1px solid var(--line);padding-top:10px"><i class="dot" style="background:var(--repay)"></i><span class="n">대출상환 저축 <span class="muted" style="font-size:12px">수입 외</span></span><span class="p num"></span><span class="a num">+${money(b.repay)}</span></div>
      <div class="lg"><i class="dot" style="background:transparent"></i><span class="n"><b>저축 합계</b></span><span class="p num">${pctPlain(b.rate,0)}</span><span class="a num"><b>${money(b.saving)}</b></span></div>
    </div>
  </section>`;
  if (exItems.length && !TX) html += `
  <section class="card">
    <h3>지출 구성 <small>${exItems.length}개 항목</small></h3>
    <div class="donut"><canvas id="cExp"></canvas><div class="center"><div><b class="num" style="font-size:18px">${money(b.expense)}</b><span>총 지출</span></div></div></div>
    <div class="legend">${exItems.map((i,k)=>`
      <div class="lg"><i class="dot" style="background:${PALETTE[k%PALETTE.length]}"></i><span class="n">${esc(i.name)} <span class="muted" style="font-size:12px">${i.kind}</span></span><span class="p num">${pctPlain(i.amt/b.expense,0)}</span><span class="a num">${money(i.amt)}</span></div>`).join('')}</div>
  </section>`;
  html += `<section class="card"><h3>상세 내역${TX ? ' <small>항목을 누르면 거래가 보여요</small>' : ed ? ' <small>항목을 누르면 고칠 수 있어요</small>' : ''}</h3>${KINDS.map(k=>{
    const its = b.items.filter(i=>i.kind===k); if (!its.length) return '';
    const tot = its.reduce((a,i)=>a+i.amt,0), color = k==='수입'?'--income':k==='고정비'?'--fixed':'--expense';
    const max = Math.max(...its.map(i=>Math.abs(i.amt)),1);
    const prevMap = {}; pb.items.filter(i=>i.kind===k).forEach(i=>prevMap[i.name]=(prevMap[i.name]||0)+i.amt);
    return `<div class="group"><div class="gh"><span><span class="tag">${k}</span></span><span class="num">${money(tot)}</span></div>
      ${its.map(i=>{ const d = pb.has && prevMap[i.name]!=null ? i.amt - prevMap[i.name] : null;
        const pend = S.queue.some(o => o.t === 'b' && o.y === S.year && o.m === m && o.kind === i.kind && o.name === i.name);
        return `<div class="row${ed || TX ? ' tap' : ''}${i.filled ? '' : ' unfilled'}"${ed || TX ? ` data-act="eb" data-k="${m}|${b.items.indexOf(i)}" role="button" tabindex="0"` : ''}><div class="n">${esc(i.name)}${pend ? '<span class="memo pend">저장 대기</span>' : i.memo?`<span class="memo">${esc(i.memo)}</span>`:''}
          <div class="bar"><i style="width:${Math.abs(i.amt)/max*100}%;background:var(${color})"></i></div></div>
          <div class="a num">${i.filled ? money(i.amt) : TX ? '-' : '입력 안 함'}${d && i.filled?`<span class="d ${dir(d)}">${signed(d)}</span>`:''}</div>${ed ? '<span class="pen" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span>' : ''}</div>`;}).join('')}
      ${ed ? `<button class="eadd" data-act="addB" data-kind="${k}">+ ${k} 항목 추가</button>` : ''}</div>`;
  }).join('')}</section>`;
  $('#view').innerHTML = html;
  donut('cFlow', ['고정비','변동비','일반 저축'], [b.fixed,b.variable,Math.max(b.cash,0)], [css('--fixed'),css('--expense'),css('--saving')]);
  if (TX) statInto($('#rpStat'));
  if (exItems.length && !TX) donut('cExp', exItems.map(i=>i.name), exItems.map(i=>i.amt), exItems.map((_,k)=>PALETTE[k%PALETTE.length]));
}

/* ───────── 화면: 월별추이 ───────── */
function viewTrend(){
  const ms = Array.from({length:12},(_,i)=>bMonth(i+1)), on = ms.filter(x=>x.has);
  if (!on.length){ emptyMonth(null, '가계부'); $('#view').innerHTML = bsegHtml() + rsegHtml() + $('#view').innerHTML; return; }
  const tot = k => on.reduce((a,x)=>a+x[k],0);
  const inc = tot('income'), exp = tot('expense'), sav = tot('saving'), cash = tot('cash'), rep = tot('repay');
  const nul = (x,k) => x.has ? x[k] : null;
  const cum = k => { let c = 0; return ms.map(x => { if (!x.has) return null; c += x[k]; return c; }); };
  const share = v => sav ? pctPlain(v/sav, 0) : '-';
  $('#view').innerHTML = bsegHtml() + rsegHtml() + `
  <section class="card hero">
    <div class="label">${S.model.year}년 누적 저축 합계 <span class="muted">· ${on.length}개월</span></div>
    <div class="big num">${money(sav)}</div>
    <div class="sub">평균 저축률 <b style="color:var(--saving)">${pctPlain(inc? sav/inc : 0)}</b> · 월평균 ${money(sav/on.length)}</div>
    <div class="flow"><i style="width:${sav>0?Math.max(cash,0)/Math.max(sav,1)*100:0}%;background:var(--saving)"></i><i style="width:${sav>0?rep/Math.max(sav,1)*100:0}%;background:var(--repay)"></i></div>
    <div class="split" style="margin-top:8px">
      <div class="s"><div class="t"><i class="dot" style="background:var(--saving)"></i>일반 저축 · ${share(cash)}</div><div class="v num">${money(cash)}</div><div class="d muted">월 ${money(cash/on.length)}</div></div>
      <div class="s"><div class="t"><i class="dot" style="background:var(--repay)"></i>대출상환 · ${share(rep)}</div><div class="v num">${money(rep)}</div><div class="d muted">월 ${money(rep/on.length)}</div></div>
    </div>
  </section>
  <div class="tiles">
    <div class="tile"><div class="t"><i class="dot" style="background:var(--income)"></i>총 수입</div><div class="v num">${money(inc)}</div><div class="d muted">월 ${money(inc/on.length)}</div></div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--expense)"></i>총 지출</div><div class="v num">${money(exp)}</div><div class="d muted">월 ${money(exp/on.length)}</div></div>
    <div class="tile"><div class="t"><i class="dot" style="background:var(--saving)"></i>저축 합계</div><div class="v num">${money(sav)}</div><div class="d muted">월 ${money(sav/on.length)}</div></div>
  </div>
  <section class="card"><h3>월별 수입 · 지출 · 저축 합계</h3><div class="chart tall"><canvas id="cTrend"></canvas></div></section>
  <section class="card"><h3>월별 저축 구성 <small>일반 · 대출상환</small></h3><div class="chart"><canvas id="cSav"></canvas></div></section>
  <section class="card"><h3>누적 저축 · 저축률</h3><div class="chart"><canvas id="cRate"></canvas></div></section>
  <section class="card"><h3>지출 구성 추이 <small>고정비 · 변동비</small></h3><div class="chart"><canvas id="cExpT"></canvas></div></section>
  <section class="card"><h3>월별 요약 <small>탭하면 해당 월로 이동</small></h3>
    <table class="num" style="font-size:12.5px"><thead><tr><th>월</th><th>수입</th><th>지출</th><th>일반</th><th>대출상환</th><th>합계</th></tr></thead>
    <tbody>${ms.map(x=>`<tr class="click ${x.has?'':'off'}" data-m="${x.m}"><td>${x.m}월</td><td>${x.has?money(x.income):'-'}</td><td>${x.has?money(x.expense):'-'}</td>
      <td class="${x.has&&x.cash<0?'up':''}">${x.has?money(x.cash):'-'}</td><td>${x.has?money(x.repay):'-'}</td><td><b>${x.has?money(x.saving):'-'}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td>합계</td><td>${money(inc)}</td><td>${money(exp)}</td><td>${money(cash)}</td><td>${money(rep)}</td><td>${money(sav)}</td></tr></tfoot></table>
  </section>`;
  const leg = {position:'bottom', labels:{usePointStyle:true, pointStyle:'circle', boxWidth:7, boxHeight:7, padding:14}};
  const tipIdx = {...baseTip, ...tipWon, mode:'index', intersect:false};
  mk('cTrend', {type:'bar', data:{labels:monthLabels(), datasets:[
      {label:'수입', data:ms.map(x=>nul(x,'income')), backgroundColor:css('--income'), borderRadius:4, maxBarThickness:14},
      {label:'지출', data:ms.map(x=>nul(x,'expense')), backgroundColor:css('--expense'), borderRadius:4, maxBarThickness:14},
      {label:'저축 합계', data:ms.map(x=>nul(x,'saving')), backgroundColor:css('--saving'), borderRadius:4, maxBarThickness:14}]},
    options:{plugins:{legend:leg, tooltip:tipIdx}, scales:{x:scaleX, y:scaleWon()}}});
  mk('cSav', {type:'bar', data:{labels:monthLabels(), datasets:[
      {label:'일반 저축', data:ms.map(x=>nul(x,'cash')), backgroundColor:css('--saving'), borderRadius:3, maxBarThickness:22},
      {label:'대출상환 저축', data:ms.map(x=>nul(x,'repay')), backgroundColor:css('--repay'), borderRadius:3, maxBarThickness:22}]},
    options:{plugins:{legend:leg, tooltip:{...tipIdx, callbacks:{...tipWon.callbacks, footer:it=>{ const t=it.reduce((a,c)=>a+(c.raw||0),0); return '합계 '+money(t); }}}},
      scales:{x:{...scaleX, stacked:true}, y:scaleWon({stacked:true})}}});
  mk('cRate', {data:{labels:monthLabels(), datasets:[
      {type:'line', label:'저축률', data:ms.map(x=>x.has? +(x.rate*100).toFixed(1) : null), borderColor:css('--ink'), backgroundColor:css('--ink'), tension:.35, pointRadius:3, spanGaps:true, yAxisID:'y1', borderWidth:1.8},
      {type:'bar', label:'누적 일반', data:cum('cash'), backgroundColor:css('--saving'), borderRadius:3, maxBarThickness:22, yAxisID:'y', stack:'c'},
      {type:'bar', label:'누적 대출상환', data:cum('repay'), backgroundColor:css('--repay'), borderRadius:3, maxBarThickness:22, yAxisID:'y', stack:'c'}]},
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
      <div class="stat"><div class="t"><i class="dot" style="background:var(--saving)"></i> 일반 저축</div><div class="v num">${A.cash!=null?money(A.cash):'-'}</div><div class="h">가계부 수입 − 지출</div></div>
      <div class="stat"><div class="t"><i class="dot" style="background:var(--repay)"></i> 대출상환 저축</div><div class="v num">${money(A.repay)}</div><div class="h">부채 감소분</div></div>
      <div class="stat"><div class="t">저축 합계</div><div class="v num">${money(A.saving)}</div><div class="h">일반 + 대출상환</div></div>
      <div class="stat"><div class="t">저축 외 자산 변동</div><div class="v num ${A.other!=null?dir(A.other):''}">${A.other!=null?signed(A.other):'-'}</div><div class="h">순자산 증감 − 저축 합계 (투자손익 · 시세)</div></div>
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
        return `<div class="row mid"><div class="n">${esc(md)}</div><div class="a num">${money(st)}${A.prevOk&&st!==sp?`<span class="d ${dir(st-sp)}">${signed(st-sp)}</span>`:''}</div></div>
        ${sub.map(a=>{ const v=c.val(a), pv=A.prevOk? p.val(a):null, dd = pv!=null? v-pv : 0;
          return `<div class="row sub-row"><div class="n">${esc(a.small)}<div class="bar"><i style="width:${tot? Math.abs(v)/Math.abs(tot)*100:0}%;background:${big==='부채'?'var(--expense)':'var(--accent)'}"></i></div></div>
          <div class="a num">${money(v)}${dd?`<span class="d ${dir(dd)}">${signed(dd)}</span>`:''}</div></div>`;}).join('')}`;
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

/* ───────── 라우팅 ───────── */
const TITLES = {home:'홈', budget:'가계부', asset:'자산', analysis:'목표', settings:'설정'};
const isYearView = () => S.tab === 'budget' && effView() === 'rep' && S.rview === 'y';   // 가계부 › 리포트 › 올해 (예전 월별추이)
function render(){
  killCharts();
  document.body.classList.remove('onboarding');
  document.body.classList.toggle('tab-settings', S.tab === 'settings');
  $('#title').innerHTML = TITLES[S.tab] + (S.meta.source==='demo' ? '<span class="demo-badge">예시</span>' : '');
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab===S.tab));
  const key = S.tab==='asset' ? 'asset' : 'budget';
  const step = $('#stepper'); step.style.display = (S.model && ['budget', 'asset'].includes(S.tab)) ? 'flex' : 'none';
  if (S.model){
    const fn = key==='asset' ? aMonth : bMonth;
    const now = new Date();
    if (S.month[key]==null) S.month[key] = key === 'budget' && S.model.txMode && canEdit() && S.year === now.getFullYear() ? now.getMonth() + 1 : lastWith(fn);
    $('#selY').innerHTML = yearsList().map(y => `<option value="${y}"${y===S.year?' selected':''}>${y}년</option>`).join('');
    const trend = isYearView();
    $('#selMWrap').style.display = trend ? 'none' : '';
    if (!trend) $('#selM').innerHTML = Array.from({length:12}, (_,i) => i+1).map(m =>
      `<option value="${m}"${m===S.month[key]?' selected':''}>${m}월</option>`).join('');
    $('#prevM').disabled = !canShift(-1); $('#nextM').disabled = !canShift(1);
    $('#prevM').setAttribute('aria-label', trend ? '이전 연도' : '이전 달'); $('#nextM').setAttribute('aria-label', trend ? '다음 연도' : '다음 달');
  }
  updateStatus();
  if (S.tab === 'settings'){ syncSheet(); sPage(S.spage || 'main'); return; }
  if (!S.model) return emptyMonth(null, '');
  ({home:viewHome, budget:viewBudget, asset:viewAsset, analysis:viewAnalysis})[S.tab]();
}
function go(tab){ if ($('#ed').classList.contains('on')) closeEd(); if (tab !== 'settings'){ S.spage = 'main'; hPop(); } S.tab = tab; LS.set('tab', tab); window.scrollTo(0,0); render(); }
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'settings' && S.tab === 'settings'){ syncSheet(); sPage('main', true); return; } go(b.dataset.tab); });
const yearsList = () => Object.keys(S.years || {}).map(Number).sort((a,b) => b-a);
const adjYear = n => { const asc = [...yearsList()].reverse(), i = asc.indexOf(S.year); return asc[i+n] ?? null; };
function defaultYear(){ const ys = yearsList(), cy = new Date().getFullYear(); return ys.includes(cy) ? cy : ys[0]; }
function setYear(y){
  const ys = yearsList();
  if (!ys.length){ S.year = null; S.model = null; return; }
  if (!ys.includes(y)) y = defaultYear();
  if (y !== S.year) S.month = {budget:null, asset:null};
  S.year = y; S.model = S.years[y]; LS.set('year', y);
}
function canShift(n){
  if (isYearView()) return adjYear(n) != null;
  const key = S.tab==='asset'?'asset':'budget', m = S.month[key] + n;
  return (m >= 1 && m <= 12) || adjYear(n) != null;
}
function shift(n){
  if (!S.model || !canShift(n)) return;
  if (isYearView()){ setYear(adjYear(n)); return render(); }
  const key = S.tab==='asset'?'asset':'budget', m = S.month[key] + n;
  if (m < 1 || m > 12){ setYear(adjYear(n)); S.month[key] = m < 1 ? 12 : 1; }   // 연도 넘어가기
  else S.month[key] = m;
  render();
}
$('#selY').onchange = e => { setYear(+e.target.value); render(); };
$('#selM').onchange = e => { S.month[S.tab==='asset'?'asset':'budget'] = +e.target.value; render(); };
$('#prevM').onclick = () => shift(-1); $('#nextM').onclick = () => shift(1);
// 좌우 스와이프로 월 이동
(() => { let x0=null, y0=null;
  document.addEventListener('touchstart', e => { if (e.target.closest('canvas,.sheet,select,input')) return; x0=e.touches[0].clientX; y0=e.touches[0].clientY; }, {passive:true});
  document.addEventListener('touchend', e => { if (x0==null) return; const dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0; x0=null;
    if (S.model && S.tab!=='home' && S.tab!=='analysis' && Math.abs(dx)>70 && Math.abs(dy)<40) shift(dx<0?1:-1); }, {passive:true});
})();

/* ───────── 테마 ───────── */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  const t = S.theme==='system' ? (mq.matches?'dark':'light') : S.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t==='dark' ? '#0E1013' : '#F5F6F8';
}
mq.addEventListener?.('change', () => { if (S.theme==='system'){ applyTheme(); render(); } });

/* ───────── 설정 시트 ───────── */
function seg(id, val, cb){ const el = $(id); el.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v===val); b.onclick = () => cb(b.dataset.v); }); }
function goalFields(){
  const g = S.goal;
  $('#gTarget').value = g.target / 1e8; $('#gRate').value = +(g.planRate * 100).toFixed(2); $('#gSave').value = g.planSave / 1e4;
  $('#gYear').value = g.planYear; $('#gBase').value = g.planBase == null ? '' : g.planBase / 1e4;
  $('#gDiv').value = +((g.divRate ?? 0.04) * 100).toFixed(2); $('#gNet').value = +((g.divNet ?? 0.846) * 100).toFixed(1);
  const save = () => {
    const n = id => { const v = $(id).value.trim(); return v === '' ? null : +v; };
    S.goal = {target: (n('#gTarget') || 10) * 1e8, planRate: (n('#gRate') ?? 6) / 100, planSave: (n('#gSave') ?? 2400) * 1e4,
              planYear: n('#gYear') || new Date().getFullYear(), planBase: n('#gBase') == null ? null : n('#gBase') * 1e4,
              divRate: (n('#gDiv') ?? 4) / 100, divNet: (n('#gNet') ?? 84.6) / 100};
    LS.set('goal', S.goal); S.sim = null; if (S.tab === 'analysis') render();
  };
  ['#gTarget','#gRate','#gSave','#gYear','#gBase','#gDiv','#gNet'].forEach(id => $(id).onchange = save);
}
function syncSheet(){
  goalFields();
  seg('#segTheme', S.theme, v => { S.theme=v; LS.set('theme',v); applyTheme(); syncSheet(); render(); });
  seg('#segUnit', S.unit, v => { S.unit=v; LS.set('unit',v); syncSheet(); render(); });
  const ys = yearsList().slice().reverse().join(', '), src = S.meta.source, g = S.goal;
  $('#svData').textContent = !S.model ? '없음' : src === 'google' ? `구글 시트 · ${ys}년` : src === 'local' ? `이 기기에 저장 · ${ys}년` : src === 'file' ? `기기 파일 · ${ys}년` : `예시 데이터 · ${ys}년`;
  $('#btnAddYear').hidden = src !== 'local'; $('#btnExport').hidden = !S.model || src === 'demo'; $('#btnSync').hidden = src !== 'google';
  $('#svSync').textContent = S.meta.syncedAt ? fmtTime(S.meta.syncedAt) : '';
  renderG();
  $('#svGoogle').textContent = S.guser || (S.gfiles.length ? '로그인 필요' : '연결 안 됨');
  // 가계부 (올해 거래 양식 파일이 있을 때만)
  const ly = ledgerYear(), LY = ly && S.years[ly], lm = ly && ledgerMonth(ly), its = LY ? (LY.budget[lm] || []) : [];
  $('#shdLedger').hidden = $('#slLedger').hidden = !LY;
  if (LY){ $('#svInc').textContent = `${its.filter(i => i.kind === '수입').length}개`; $('#svExp').textContent = `${its.filter(i => i.kind !== '수입').length}개`;
    $('#svReps').textContent = `${(LY.reps[lm] || []).length}개`; const bt = its.filter(i => i.bud > 0).reduce((a, i) => a + i.bud, 0); $('#svBud').textContent = bt ? `${lm}월 ${money(bt)}` : '없음'; }
  // 결제수단: 거래 입력 화면에 보일 수단
  const payOn = PAY_OPTS.filter(p => !S.payOff.includes(p));
  $('#svPay').textContent = payOn.length === PAY_OPTS.length ? '전체' : payOn.join(' · ');
  $('#slPay').innerHTML = PAY_OPTS.map(p => `<button class="srow${S.payOff.includes(p) ? '' : ' on'}" data-pay="${p}"><span>${p}</span><b class="chk">✓</b></button>`).join('');
  $('#slPay').querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
    const p = b.dataset.pay, off = S.payOff.includes(p) ? S.payOff.filter(x => x !== p) : [...S.payOff, p];
    if (off.length === PAY_OPTS.length) return toast('결제수단을 하나 이상 골라 두세요');
    S.payOff = off; LS.set('payOff', off); syncSheet(); });
  $('#svGoal').textContent = `목표 ${+(g.target / 1e8).toFixed(1)}억`;
  $('#svFire').textContent = `배당 ${+((g.divRate ?? 0.04) * 100).toFixed(2)}% · 세후 ${+((g.divNet ?? 0.846) * 100).toFixed(1)}%`;
  $('#svView').textContent = `${{system: '시스템', light: '라이트', dark: '다크'}[S.theme] || '시스템'} · ${S.unit === 'full' ? '원 단위' : '억·만원'}`;
  $('#sVer').textContent = APP_VER;
}
const APP_VER = 'v31';   // sw.js 캐시 이름과 같이 올려요
// 가계부 설정 대상: 올해(없으면 보고 있는 해)의 거래 양식 파일, 이번 달(없으면 보고 있는 달)
const ledgerYear = () => { const cy = new Date().getFullYear(); return [cy, S.year].find(y => y && S.years?.[y]?.txMode && canEdit(y)) || null; };
const ledgerMonth = y => y === new Date().getFullYear() ? new Date().getMonth() + 1 : (S.month.budget || 1);
function sPage(key, back){   // 설정 두 단계: main(목록) ↔ 상세
  S.spage = key; if (key !== 'main') hPush(); else if (!$('#ed').classList.contains('on')) hPop();
  $('#sheet').querySelectorAll('.spage').forEach(p => { const on = p.dataset.page === key; p.classList.toggle('on', on); p.classList.toggle('back', on && !!back); });
  window.scrollTo(0, 0);
}
function openSheet(page = 'main'){ S.spage = page; go('settings'); }
$('#sheet').addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g){ if (g.dataset.go === 'main') return goBack(); syncSheet(); sPage(g.dataset.go); return; }
  const a = e.target.closest('[data-sa]'); if (!a) return;
  const y = ledgerYear(); if (!y) return; setYear(y); S.month.budget = ledgerMonth(y);
  ({catInc: () => openCats(['수입']), catExp: () => openCats(['고정비', '변동비']), reps: openReps, bud: openBudEdit})[a.dataset.sa]();
});
function closeSheet(){ if (S.tab === 'settings') go('home'); }
$('#setBtn').onclick = () => openSheet();
$('#btnSync').onclick = () => syncNow(true);
$('#btnDemo').onclick = () => { if (S.meta.source === 'local' && !confirm('예시 데이터로 바꾸면 이 기기에 저장된 데이터가 화면에서 사라져요. 먼저 엑셀로 내보내기를 권해요. 계속할까요?')) return; closeSheet(); loadDemo(); };
$('#btnExport').onclick = () => exportAll();
$('#btnAddYear').onclick = () => addLocalYear();
$('#btnRestart').onclick = () => { if (S.meta.source !== 'local' && !confirm('처음 화면으로 돌아갈까요? 연결한 구글 시트는 그대로 남아요')) return; restartOb(); };
$('#btnFile').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = async e => { const f = e.target.files[0]; if (!f) return; closeSheet();
  try { const md = parseWorkbook(await f.arrayBuffer());
    if (S.meta.source === 'google' && !confirm('구글 시트 연결 대신 이 파일을 이 기기에 저장해서 쓸까요? (구글 시트 연결은 유지돼요)')) { e.target.value=''; return; }
    if (S.meta.source === 'local' && S.years[md.year] && !confirm(`이 기기에 저장된 ${md.year}년 데이터를 이 파일 내용으로 바꿀까요?`)) { e.target.value=''; return; }
    const ys = S.meta.source === 'local' ? {...S.years} : {}; ys[md.year] = md;   // 이 기기 저장 데이터에 연도별로 합침
    finishOb(); setYears(ys, {source:'local', name:f.name}); setYear(md.year); render(); toast(`${md.year}년 파일을 불러왔어요. 이제 앱에서 입력할 수 있어요`); }
  catch(err){ toast('파일을 읽지 못했어요: ' + err.message); } e.target.value=''; };
$('#syncBtn').onclick = () => S.gfiles.length ? syncNow(true) : openSheet('google');

/* ───────── 데이터 반영 ───────── */
function setYears(years, meta, keepView){
  const y = S.year, keep = {...S.month};
  if (meta.source === 'google' && S.queue?.length) reapplyQueue(years);   // 아직 시트에 못 쓴 입력은 유지
  S.years = years; S.meta = {...meta, syncedAt: Date.now()};
  LS.set('years', years); LS.set('meta', S.meta);
  S.year = null; setYear(keepView && years[y] ? y : defaultYear());
  if (keepView && S.year === y) S.month = keep;
  render();
}
async function loadDemo(){
  try {
    const ys = {};
    for (const f of ['demo2025.xlsx', 'demo.xlsx']){ const r = await fetch(f); if (!r.ok) throw new Error(r.status); const md = parseWorkbook(await r.arrayBuffer()); ys[md.year] = md; }
    setYears(ys, {source:'demo'}); toast('예시 데이터를 불러왔어요 (2025 · 2026년)');
  } catch(e){ toast('예시 파일을 불러오지 못했어요'); }
}
const fmtTime = t => { const d = new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
function updateStatus(){
  const q = S.queue?.length || 0;
  if (q && S.model){ $('#status').innerHTML = `<span class="pend">${flushing ? '저장 중…' : navigator.onLine ? '저장 대기 ' + q + '건' : '오프라인 · 대기 ' + q + '건'}</span>`; return; }
  if (S.model && S.meta.source === 'demo'){ $('#status').innerHTML = '<button class="slink" data-act="obRestart">내 데이터로 시작</button>'; return; }
  $('#status').textContent = !S.model ? '' : S.meta.source==='google' ? `업데이트 ${fmtTime(S.meta.syncedAt)}` : S.meta.source==='local' ? '이 기기에 저장' : `기기 파일 · ${fmtTime(S.meta.syncedAt)}`;
}
let toastT; function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'), 2600); }


/* ───────── 구글 계정 연결 (drive.file: 사용자가 고르거나 앱이 만든 파일만) ───────── */
// 공개해도 되는 값이에요(클라이언트 ID·브라우저 API 키는 앱에 들어가는 공개 값). 설정 방법: GOOGLE_SETUP.md
const GOOGLE = {
  clientId: '919106003112-de97gm5uit7f9imrgrusrugj6t4g9v0s.apps.googleusercontent.com',        // OAuth 클라이언트 ID (웹 애플리케이션) … .apps.googleusercontent.com
  apiKey:   'AIzaSyA737jtGTgXBmwvRO-DuAgPvxDMVWN3CZQ',        // Picker용 브라우저 API 키 (HTTP 리퍼러 제한)
  appId:    '919106003112',        // Google Cloud 프로젝트 번호 (숫자)
  authServer: 'https://alllever-asset-auth.alllever.workers.dev',      // 로그인 유지 서버 주소 (server/ 폴더, 예: https://alllever-asset-auth.xxx.workers.dev). 비우면 1시간 로그인 방식
};
const G_SCOPE = 'https://www.googleapis.com/auth/drive.file email';
const MIME_SHEET = 'application/vnd.google-apps.spreadsheet';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const gReady = () => !!(GOOGLE.clientId && GOOGLE.apiKey && GOOGLE.appId);
let gTok = null, gClient = null;   // 토큰은 메모리에만 (약 1시간)
const loadJs = src => new Promise((ok, bad) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const el = document.createElement('script'); el.src = src; el.async = true; el.onload = ok; el.onerror = () => bad(new Error('구글 스크립트를 불러오지 못했어요')); document.head.append(el);
});
async function gInit(){
  if (gClient) return;
  await loadJs('https://accounts.google.com/gsi/client');
  gClient = google.accounts.oauth2.initTokenClient({client_id: GOOGLE.clientId, scope: G_SCOPE, callback: () => {}});
}
// 토큰 받기. 사용자가 누른 버튼에서만 팝업이 뜰 수 있어서, 자동 동기화에서는 남은 토큰만 써요.
// 로그인 유지 서버가 있으면: 기기에 저장된 세션으로 서버에서 새 토큰을 조용히 받아요 (다시 로그인할 필요 없음).
// 세션이 없거나 서버가 다시 로그인하라고 하면, 사용자가 누른 동작일 때만 구글 로그인 화면으로 이동해요.
const gServer = () => (GOOGLE.authServer || '').replace(/\/+$/, '');
async function gToken(interactive, pending){
  if (gTok && Date.now() < gTok.exp - 60e3) return gTok.v;
  if (gServer()){
    const sid = LS.get('gsid', null);
    if (sid){
      let r;
      try { r = await fetch(gServer() + '/token', {method: 'POST', headers: {Authorization: 'Bearer ' + sid}, cache: 'no-store'}); }
      catch(e){ throw new Error('로그인 서버에 연결하지 못했어요'); }
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.access_token){
        gTok = {v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000};
        if (j.email && j.email !== S.guser){ S.guser = j.email; LS.set('guser', j.email); }
        return gTok.v;
      }
      if (r.status === 401) LS.del('gsid');   // 권한 취소·만료 → 다시 로그인
      else throw new Error('로그인 서버 응답 오류');
    }
    if (!interactive) return null;
    gLogin(pending || 'sync');
    return new Promise(() => {});   // 구글 로그인 화면으로 이동 중
  }
  if (!interactive) return null;
  await gInit();
  return new Promise((ok, bad) => {
    gClient.callback = r => {
      if (r.error) return bad(new Error(r.error === 'access_denied' ? '구글 권한을 허용하지 않았어요' : r.error));
      gTok = {v: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000}; ok(gTok.v);
    };
    gClient.error_callback = e => bad(new Error(e?.type === 'popup_closed' ? '로그인 창을 닫았어요' : '로그인 창을 열지 못했어요'));
    gClient.requestAccessToken({prompt: S.guser ? '' : 'consent', login_hint: S.guser || undefined});
  });
}
async function gFetch(url, opt = {}, tok){
  const r = await fetch(url, {...opt, headers: {...(opt.headers || {}), Authorization: 'Bearer ' + tok}});
  if (r.status === 401){ gTok = null; throw Object.assign(new Error('구글 로그인이 만료됐어요'), {auth: true}); }
  if (r.status === 404) throw Object.assign(new Error('파일이 삭제됐거나 접근 권한이 없어요'), {gone: true});
  if (!r.ok) throw new Error('구글 응답 오류 ' + r.status);
  return r;
}
function gLogin(pending){
  try { sessionStorage.setItem(LSP + 'pending', pending); } catch(e){}
  const back = location.origin + location.pathname;
  location.href = gServer() + '/auth/start?return=' + encodeURIComponent(back) + (S.guser ? '&hint=' + encodeURIComponent(S.guser) : '');
}
// 구글 로그인에서 돌아왔을 때: 주소의 #alv_sid=… 를 저장하고 주소창에서 지운 뒤, 하려던 동작을 이어서 해요.
function gReturn(){
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('alv_sid') && !h.has('alv_err')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  let pending = null; try { pending = sessionStorage.getItem(LSP + 'pending'); sessionStorage.removeItem(LSP + 'pending'); } catch(e){}
  if (h.has('alv_err')){
    const e = h.get('alv_err');
    toast(e === 'access_denied' || e === 'denied' ? '구글 권한을 허용하지 않았어요' : e === 'scope' ? "구글 드라이브 권한에 체크해야 시트를 볼 수 있어요" : '구글 로그인을 마치지 못했어요 (' + e + ')');
    return null;
  }
  const sid = h.get('alv_sid');
  if (!/^[\w-]{40,64}$/.test(sid)){ toast('로그인 정보가 올바르지 않아요. 다시 시도해 주세요'); return null; }
  LS.set('gsid', sid);
  if (h.get('alv_email')){ S.guser = h.get('alv_email'); LS.set('guser', S.guser); }
  return pending || 'sync';
}
async function gWhoAmI(tok){
  try { const j = await (await gFetch('https://www.googleapis.com/oauth2/v3/userinfo', {}, tok)).json();
    if (j.email){ S.guser = j.email; LS.set('guser', j.email); } } catch(e){}
}
async function gDownload(f, tok){
  const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id);
  const url = f.mime === MIME_SHEET || !f.mime ? `${base}/export?mimeType=${encodeURIComponent(MIME_XLSX)}` : `${base}?alt=media`;
  const buf = await (await gFetch(url, {cache: 'no-store'}, tok)).arrayBuffer(), h = new Uint8Array(buf.slice(0, 2));
  if (h[0] !== 0x50 || h[1] !== 0x4B) throw new Error('스프레드시트 파일이 아니에요');
  return parseWorkbook(buf);
}
function gSave(){ LS.set('gfiles', S.gfiles); }
function gAdd(list){
  let n = 0;
  for (const d of list) if (!S.gfiles.some(f => f.id === d.id)){ S.gfiles.push({id: d.id, name: d.name, mime: d.mime, year: null}); n++; }
  gSave(); renderG(); return n;
}
// 시트 고르기: 먼저 이 앱이 접근할 수 있는 시트(전에 고른 시트·앱이 만든 시트)를 드라이브에서 직접 목록으로 보여주고,
// 목록에 없는 시트는 구글 선택 창(Picker)으로 추가해요. 홈 화면 앱에서는 Picker가 막힐 수 있어서 이 순서로 해요.
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const leaveLocalOk = () => S.meta.source !== 'local' || !yearsList().length ||
  confirm('구글 시트를 연결하면 이 기기에만 저장된 데이터 대신 시트 데이터를 보여줘요. 먼저 설정 → 엑셀로 내보내기로 백업하세요. 계속할까요?');
async function gPick(){
  if (!gReady()) return toast('개발자 설정이 필요해요');
  if (!leaveLocalOk()) return;
  try {
    const tok = await gToken(true, 'pick'); if (!S.guser) await gWhoAmI(tok);
    if (S.tab !== 'settings' || S.spage !== 'google') openSheet('google');
    const q = `(mimeType='${MIME_SHEET}' or mimeType='${MIME_XLSX}') and trashed=false`;
    const j = await (await gFetch('https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({q, orderBy: 'modifiedTime desc', pageSize: '100',
      fields: 'files(id,name,mimeType,modifiedTime)'}), {cache: 'no-store'}, tok)).json();
    const files = (j.files || []).filter(f => !S.gfiles.some(g => g.id === f.id));
    gChooser(files);
  } catch(e){ toast(e.message); }
}
function gChooser(files){
  const el = $('#gChooser'), sa = isStandalone();
  const day = t => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} 수정`; };
  el.innerHTML = `<h5>연결할 시트 고르기</h5>
    ${files.length ? files.map(f => `<label><input type="checkbox" value="${esc(f.id)}"><span>${esc(f.name)}<small>${day(f.modifiedTime)}</small></span></label>`).join('')
      : S.gfiles.length ? `<p class="note" style="margin:0 0 4px">이 앱이 볼 수 있는 시트는 모두 연결돼 있어요. 다른 시트는 아래 <b>구글 선택 창</b>에서 찾아 주세요.</p>`
      : `<p class="note" style="margin:0 0 4px">이 앱이 볼 수 있는 시트가 아직 없어요. 처음엔 아래 <b>구글 선택 창</b>에서 시트를 고르거나, <b>템플릿으로 새 시트 만들기</b>를 눌러 주세요.</p>`}
    <div class="row2">${files.length ? '<button class="btn" id="gcOk">연결하기</button>' : ''}<button class="btn ghost" id="gcCancel">닫기</button></div>
    <button class="btn ghost" id="gcPicker" style="margin-top:8px">목록에 없는 시트 찾기 (구글 선택 창)</button>
    ${sa ? `<p class="note">홈 화면 앱에서는 구글 선택 창이 열리지 않을 수 있어요. 그럴 땐 <b>사파리</b>에서 이 주소를 열고 같은 계정으로 시트를 한 번 고르면, 이 목록에 나타나요.</p>` : ''}`;
  el.hidden = false;
  el.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  $('#gcCancel').onclick = () => { el.hidden = true; };
  $('#gcPicker').onclick = () => gPicker();
  if (files.length) $('#gcOk').onclick = () => {
    const ids = [...el.querySelectorAll('input:checked')].map(i => i.value);
    if (!ids.length) return toast('연결할 시트를 골라 주세요');
    el.hidden = true;
    const n = gAdd(files.filter(f => ids.includes(f.id)).map(f => ({id: f.id, name: f.name, mime: f.mimeType})));
    if (n) syncGoogle(true);
  };
}
async function gPicker(){
  try {
    const tok = await gToken(true, 'pick');
    await loadJs('https://apis.google.com/js/api.js');
    await new Promise(ok => gapi.load('picker', ok));
    const P = google.picker;
    const view = new P.DocsView(P.ViewId.SPREADSHEETS).setMode(P.DocsViewMode.LIST).setIncludeFolders(false);
    const picker = new P.PickerBuilder().setOAuthToken(tok).setDeveloperKey(GOOGLE.apiKey).setAppId(GOOGLE.appId)
      .addView(view).enableFeature(P.Feature.MULTISELECT_ENABLED).setLocale('ko').setTitle('연도별 자산관리 시트를 고르세요')
      .setCallback(async d => {
        if (d[P.Response.ACTION] !== P.Action.PICKED) return;
        const docs = d[P.Response.DOCUMENTS].map(x => ({id: x[P.Document.ID], name: x[P.Document.NAME], mime: x[P.Document.MIME_TYPE]}));
        $('#gChooser').hidden = true;
        const n = gAdd(docs); if (n) syncGoogle(true); else toast('이미 연결된 시트예요');
      }).build();
    picker.setVisible(true);
  } catch(e){ toast(e.message); }
}
// 앱에 들어 있는 빈 템플릿(template.xlsx)을 구글 시트로 변환해서 업로드하고, 기준 연도·전년 말 부채를 채워요.
function busy(t, sub = ''){   // 전체 화면 로딩창 (t 없으면 닫기)
  const el = $('#busy'); if (!el) return;
  if (!t){ el.classList.remove('on'); return; }
  $('#busyT').textContent = t; $('#busyS').textContent = sub; el.classList.add('on');
}
async function gCreate(year){
  if (!gReady()) return toast('개발자 설정이 필요해요');
  if (!leaveLocalOk()) return;
  if (S.gfiles.some(f => !f.year)) await syncGoogle(false);   // 연도를 아직 모르는 시트가 있으면 먼저 확인
  const used = new Set(S.gfiles.map(f => f.year).filter(Boolean)), cy = new Date().getFullYear();
  let y = year;
  if (!y){
    y = cy; while (used.has(y)) y++;
    const ans = prompt('몇 년도 시트를 만들까요?', String(y)); if (ans == null) return;
    y = parseInt(ans, 10);
  }
  if (!(y >= 2000 && y <= 2100)) return toast('연도를 숫자로 넣어 주세요');
  if (used.has(y)) return toast(`${y}년 시트는 이미 연결돼 있어요`);
  try {
    const tok = await gToken(true, 'create:' + y); if (!S.guser) await gWhoAmI(tok);
    busy('생성 중입니다', `${y}년 시트를 구글 드라이브에 만들고 있어요`);
    const tpl = await fetch('template.xlsx'); if (!tpl.ok) throw new Error('템플릿 파일을 찾지 못했어요');
    const meta = {name: `자산관리_${y}`, mimeType: MIME_SHEET};
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], {type: 'application/json'}));
    form.append('file', new Blob([await tpl.arrayBuffer()], {type: MIME_XLSX}));
    const f = await (await gFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {method: 'POST', body: form}, tok)).json();
    // 기준 연도와, 전년도 데이터가 있으면 12월 말 부채를 넣어요 (1월 대출상환 저축 계산용)
    const prev = S.years?.[y - 1] ? aMonth(12, y - 1) : null;
    const vals = [[y], [prev && prev.has ? Math.round(prev.debt) : '']];
    await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${f.id}/values/${encodeURIComponent('설정!B4:B5')}?valueInputOption=USER_ENTERED`,
      {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({values: vals})}, tok);
    gAdd([{id: f.id, name: f.name, mime: f.mimeType}]);
    busy('거의 다 됐어요', '만든 시트를 불러오고 있어요');
    await syncGoogle(true);
    busy(); toast(`'${f.name}' 시트를 만들었어요`);
  } catch(e){ busy(); toast('시트를 만들지 못했어요: ' + e.message); }
}
function gRemove(i){
  const f = S.gfiles[i]; if (!confirm(`${f.year ? f.year + '년 ' : ''}'${f.name}' 연결을 해제할까요? (구글 드라이브의 파일은 지워지지 않아요)`)) return;
  S.gfiles.splice(i, 1); gSave();
  if (S.meta.source === 'google' && f.year && !S.gfiles.some(g => g.year === f.year)){ delete S.years[f.year]; LS.set('years', S.years); setYear(S.year); render(); }
  syncSheet();
}
function gSignOut(){
  if (!confirm('구글 계정 연결을 해제할까요? 연결한 시트 목록도 지워져요. (구글 드라이브의 파일은 그대로예요)')) return;
  const sid = LS.get('gsid', null);
  if (sid && gServer()) fetch(gServer() + '/logout', {method: 'POST', headers: {Authorization: 'Bearer ' + sid}}).catch(() => {});   // 서버 세션 삭제 + 구글 권한 취소
  else try { if (gTok && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(gTok.v, () => {}); } catch(e){}
  gTok = null; S.gfiles = []; S.guser = null; gSave(); LS.del('guser'); LS.del('gsid');
  if (S.meta.source === 'google'){ S.years = {}; LS.set('years', {}); S.meta = {}; LS.set('meta', {}); setYear(null); render(); }
  syncSheet();
}
function renderG(){
  const ok = gReady();
  $('#gCfg').hidden = ok; $('#gPick').disabled = $('#gCreate').disabled = !ok;
  $('#gUser').textContent = S.guser || (S.gfiles.length ? '로그인 필요' : '연결 안 됨');
  $('#gOut').hidden = !(S.guser || S.gfiles.length);
  const list = S.gfiles.slice().sort((a, b) => (a.year || 9999) - (b.year || 9999));
  $('#gList').innerHTML = list.length ? list.map(f => `<div class="src"><span class="y">${f.year ? f.year + '년' : '확인 전'}</span>
      <span class="u">${esc(f.name)}</span><a href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(f.id)}/edit" target="_blank" rel="noopener">열기</a><button data-i="${S.gfiles.indexOf(f)}">해제</button></div>`).join('')
    : '<p class="note" style="margin:0">연결된 시트가 없어요</p>';
  $('#gList').querySelectorAll('button').forEach(b => b.onclick = () => gRemove(+b.dataset.i));
}
let gSyncing = false;
async function syncGoogle(interactive){
  if (gSyncing || !S.gfiles.length) return;
  gSyncing = true; $('#syncBtn').classList.add('spin');
  try {
    let tok;
    try { tok = await gToken(interactive); } catch(e){ if (interactive) toast(e.message); return; }
    if (!tok){ if (!S.model || gServer()) toast('새로고침 버튼을 눌러 구글 로그인을 이어가 주세요'); return; }   // 자동 동기화: 로그인 만료
    if (!S.guser) await gWhoAmI(tok);
    const res = await Promise.all(S.gfiles.map(f => gDownload(f, tok).then(m => ({f, m}), e => ({f, e}))));
    const old = S.meta.source === 'google' ? (S.years || {}) : {}, next = {}, dup = [], fail = [];
    // 같은 연도 시트는 하나만: 먼저 연결한 시트를 남기고, 나중에 연결한 시트는 연결을 풀어요 (드라이브 파일은 그대로)
    const owner = {};
    for (const r of res) if (r.m && r.f.year === r.m.year && !(r.m.year in owner)) owner[r.m.year] = r.f;   // 이미 그 연도로 쓰던 시트 우선
    for (const r of res){
      if (!r.m){ fail.push(r); continue; }
      const y = r.m.year;
      if (owner[y] && owner[y] !== r.f || next[y]){ dup.push(r.f); continue; }
      next[y] = r.m; r.f.year = y; owner[y] = r.f;
    }
    if (dup.length) S.gfiles = S.gfiles.filter(f => !dup.includes(f));
    for (const r of fail){ const y = r.f.year; if (y && old[y] && !next[y]) next[y] = old[y]; }   // 실패한 연도는 이전 데이터 유지
    gSave(); renderG();
    if (!res.some(r => r.m)){   // 하나도 못 받았으면 기존 데이터·동기화 시각을 그대로 둬요
      toast(fail.some(r => r.e.auth) ? '구글 로그인이 만료됐어요. 새로고침 버튼을 눌러 다시 로그인해 주세요' : '불러오기 실패: ' + fail[0].e.message); return; }
    finishOb(); setYears(next, {source: 'google'}, S.meta.source === 'google'); applyReps();
    if (dup.length){ const d = dup[0], y = res.find(r => r.f === d).m.year;
      toast(`${y}년 시트는 이미 연결돼 있어서 '${d.name}'${dup.length > 1 ? ` 외 ${dup.length - 1}개` : ''}는 연결하지 않았어요`); }
    else if (fail.length) toast(`${fail.length}개 시트를 불러오지 못했어요: ${fail[0].e.message}`);
    else if (interactive) toast('최신 데이터로 업데이트했어요');
  } finally { gSyncing = false; $('#syncBtn').classList.remove('spin'); }
}
function syncNow(interactive){ if (S.gfiles.length) return syncGoogle(interactive); if (interactive){ toast('설정에서 구글 시트를 연결하세요'); openSheet('google'); } }
$('#gPick').onclick = gPick; $('#gCreate').onclick = () => gCreate(); $('#gOut').onclick = gSignOut;

// 화면 안 버튼 동작 (CSP 때문에 onclick 속성 대신 위임)
document.addEventListener('click', e => { const t = e.target.closest('#view [data-tx]'); if (t) return editTx(t.dataset.tx); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'openSheet') openSheet('google'); else if (a === 'loadDemo') loadDemo(); else if (a === 'obRestart') restartOb(); else if (a === 'sync') syncNow(true);
  else if (a === 'editBudget') editBudgetMonth(S.month.budget); else if (a === 'editAsset') editAssetMonth(S.month.asset);
  else if (a === 'eb'){ const [m, k] = b.dataset.k.split('|').map(Number), L = S.years[S.year].budget[m], it = L[k];
    if (S.years[S.year].txMode) openItemTx(m, k); else editBudgetItem(m, it.kind, it.name, occ(L, it, bKey)); }
  else if (a === 'addTx') editTx(null); else if (a === 'reps') openReps(); else if (a === 'addRep') editRep(null, true); else if (a === 'cats') openCats(); else if (a === 'budEdit') openBudEdit();
  else if (a === 'homeLedger' || a === 'homeBud' || a === 'homeAddTx'){ const P = homeLedgerPos(); if (!P) return; setYear(P.y); S.month.budget = P.m;
    if (a === 'homeAddTx') return editTx(null);
    S.bview = a === 'homeBud' ? 'bud' : 'cal'; LS.set('bview', S.bview); go('budget'); if (a === 'homeBud') openBudEdit(); }
  else if (a === 'homeGoal') go('analysis'); else if (a === 'budAdd') openBudAdd(); else if (a === 'goBud'){ S.bview = 'bud'; LS.set('bview', 'bud'); render(); }
  else if (a === 'addB') addBudgetItem(S.month.budget, b.dataset.kind); });

/* ───────── 입력: 앱에서 고친 값을 구글 시트에 저장 ─────────
   - 고친 값은 먼저 화면(기기 데이터)에 반영하고 저장 대기열(queue)에 넣은 뒤 시트에 써요.
   - 시트에 쓰기 직전, 해당 시트를 다시 읽어 행 위치를 이름으로 찾고(구분+항목 / 대분류+중분류+소분류),
     그 칸의 현재 값이 앱이 알던 값과 다르면 덮어쓰기 전에 물어봐요.
   - 인터넷이 끊기면 대기열에 남겨 두고, 연결되면 다시 저장해요.
   - 합계·저축·그래프 수식은 건드리지 않아요. 금액·메모·잔액 칸과 새 항목 행만 써요. */
S.queue = LS.get('queue', []);
const saveQueue = () => LS.set('queue', S.queue);
const gfileOf = y => S.gfiles.find(f => f.year === y);
const canEdit = (y = S.year) => S.meta.source === 'local' ? !!S.years?.[y]
  : S.meta.source === 'google' && !!gfileOf(y) && (gfileOf(y).mime || MIME_SHEET) === MIME_SHEET;
const editNote = y => S.meta.source === 'demo' ? '예시 데이터는 고칠 수 없어요' : S.meta.source !== 'google' ? '구글 시트를 연결하거나 "앱만 사용하기"로 시작하면 입력할 수 있어요'
  : !gfileOf(y) ? `${y}년 시트가 연결돼 있지 않아요` : '엑셀(.xlsx) 파일은 구글 시트로 변환해야 앱에서 입력할 수 있어요';
const colL = i => { let s = ''; i++; while (i){ const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const qs = s => `'${String(s).replace(/'/g, "''")}'`;   // 시트 이름 따옴표
const parseWon = s => { s = String(s ?? '').replace(/[,\s원]/g, ''); if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)(억|만)?$/.exec(s); if (!m) return NaN; return Math.round(+m[1] * (m[2] === '억' ? 1e8 : m[2] === '만' ? 1e4 : 1)); };
const fmtWon = n => n == null || isNaN(n) ? '' : Math.round(n).toLocaleString('ko-KR');
const sameVal = (a, b, memo) => memo ? str(a) === str(b) : (toNum(a) ?? null) === (toNum(b) ?? null);

// 화면 데이터에서 항목 찾기 (같은 이름이 여러 번이면 순서로 구분)
function findBudget(Y, m, kind, name, idx){ return (Y?.budget?.[m] || []).filter(i => i.kind === kind && i.name === name)[idx || 0]; }
function findAsset(Y, big, mid, small, idx){ return (Y?.assets || []).filter(a => a.big === big && a.mid === mid && a.small === small)[idx || 0]; }
function occ(list, it, keyFn){ const k = keyFn(it); return list.filter(x => keyFn(x) === k).indexOf(it); }
const bKey = i => i.kind + '|' + i.name, aKey = a => a.big + '|' + a.mid + '|' + a.small;

// 대기열 작업을 화면 데이터에 반영
function applyOp(years, op){
  const Y = years?.[op.y]; if (!Y) return;
  if (op.t === 'b'){ const it = findBudget(Y, op.m, op.kind, op.name, op.idx); if (!it) return;
    if (op.f === 'memo') it.memo = op.v || ''; else { it.amt = op.v ?? 0; it.filled = op.v != null; } }
  else if (op.t === 'a'){ const a = findAsset(Y, op.big, op.mid, op.small, op.idx); if (a) a.v[op.m - 1] = op.v; }
  else if (op.t === 'addB'){ for (const m of op.months){ const L = Y.budget[m] = Y.budget[m] || [];
      if (!L.some(i => i.kind === op.kind && i.name === op.name)) L.push({kind: op.kind, name: op.name, amt: 0, memo: '', filled: false, subs: [], bud: null}); } }
  else if (op.t === 'addA'){ if (!findAsset(Y, op.big, op.mid, op.small)) Y.assets.push({big: op.big, mid: op.mid, small: op.small, v: Array(12).fill(null)}); }
  else if (op.t === 'tx'){ const L = (Y.tx = Y.tx || {})[op.m] = Y.tx[op.m] || [], i = L.findIndex(t => t.id === op.tx.id);
    if (op.act === 'del'){ if (i >= 0) L.splice(i, 1); } else if (i >= 0) L[i] = {...op.tx}; else L.push({...op.tx}); }
  else if (op.t === 'cat'){ const it = findBudget(Y, op.m, op.kind, op.name, 0); if (it){ it.subs = [...op.subs]; it.bud = op.bud ?? null; } }
  else if (op.t === 'reps'){ (Y.reps = Y.reps || {})[op.m] = op.reps.map(r => ({...r})); }
  else if (op.t === 'renB') for (const m of op.months){ const it = findBudget(Y, m, op.kind, op.name, 0); if (it) it.name = op.to;
    for (const t of Y.tx?.[m] || []) if (t.kind === op.kind && t.name === op.name) t.name = op.to;
    for (const r of Y.reps?.[m] || []) if (r.kind === op.kind && r.name === op.name) r.name = op.to; }
  else if (op.t === 'delB') for (const m of op.months){ const L = Y.budget[m] || [], i = L.findIndex(x => x.kind === op.kind && x.name === op.name); if (i >= 0) L.splice(i, 1);
    if (Y.reps?.[m]) Y.reps[m] = Y.reps[m].filter(r => !(r.kind === op.kind && r.name === op.name)); }
  if (op.m) recalcMonth(Y, op.m); else if (op.months) op.months.forEach(m => recalcMonth(Y, m));
}
function reapplyQueue(years){ for (const op of S.queue) applyOp(years, op); }

// 화면에 바로 반영하고 대기열에 넣은 뒤 저장 시도
function commit(ops, quiet){
  if (!ops.length) return;
  if (S.meta.source === 'local'){   // 이 기기에만 저장
    for (const op of ops) applyOp(S.years, op);
    LS.set('years', S.years); S.meta.savedAt = Date.now(); LS.set('meta', S.meta); render(); if (!quiet) toast(withNote('저장했어요')); return;
  }
  for (const op of ops){ op.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); op.fileId = gfileOf(op.y)?.id; applyOp(S.years, op); S.queue.push(op); }
  saveQueue(); LS.set('years', S.years); render();
  flushQueue(!quiet);
}

// 시트 읽기 (계산되지 않은 원래 값)
async function readRanges(fileId, ranges, tok){
  const q = new URLSearchParams({valueRenderOption: 'UNFORMATTED_VALUE'}); ranges.forEach(r => q.append('ranges', r));
  const j = await (await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchGet?${q}`, {cache: 'no-store'}, tok)).json();
  return (j.valueRanges || []).map(v => v.values || []);
}
// 가계부 'N월' 시트에서 행 위치 찾기 → {rows: [{row, kind, name, amt, memo}], marker}
function locateBudget(V){
  const h = V.findIndex(r => str(r[0]).startsWith('구분')); if (h < 0) return null;
  const rows = []; let marker = null;
  for (let i = h + 1; i < V.length; i++){ const r = V[i] || [], k = str(r[0]);
    if (k.startsWith('▲')){ marker = i + 1; break; }
    if (KINDS.includes(k)) rows.push({row: i + 1, kind: k, name: str(r[1]) || '(이름 없음)', amt: r[2], memo: r[3]}); }
  return {rows, marker};
}
function locateAsset(V){
  const h = V.findIndex(r => str((r || [])[0]) === '대분류'); if (h < 0) return null;
  const col = {}; (V[h] || []).forEach((c, i) => { const mm = /^(\d{1,2})월$/.exec(str(c)); if (mm) col[+mm[1]] = i; });
  const rows = []; let marker = null;
  for (let i = h + 1; i < V.length; i++){ const r = V[i] || [], b = str(r[0]);
    if (b.startsWith('▲') || b === '요약'){ marker = b.startsWith('▲') ? i + 1 : null; break; }
    if (BIGS.includes(b)) rows.push({row: i + 1, big: b, mid: str(r[1]) || '기타', small: str(r[2]) || str(r[1]) || '항목', r}); }
  return {rows, col, marker};
}
let sheetIds = {};   // fileId → {시트이름: sheetId}
async function sheetIdOf(fileId, title, tok){
  if (!sheetIds[fileId]){
    const j = await (await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=sheets.properties(sheetId,title)`, {}, tok)).json();
    sheetIds[fileId] = Object.fromEntries((j.sheets || []).map(s => [s.properties.title, s.properties.sheetId]));
  }
  return sheetIds[fileId][title];
}
async function insertRow(fileId, title, rowNum, tok){   // rowNum(1부터) 위치에 빈 행 넣기 (위 행 서식·드롭다운 이어받음)
  const sid = await sheetIdOf(fileId, title, tok); if (sid == null) throw new Error(`'${title}' 시트를 찾지 못했어요`);
  await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({requests: [{insertDimension: {range: {sheetId: sid, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum}, inheritFromBefore: true}}]})}, tok);
}
// rowNum(1부터) 위치의 c0~c1 열(0부터, c1 미포함)에만 n칸을 넣고 아래를 밀어요. fmtRow(1부터) 행의 서식·드롭다운을 새 칸에 복사.
async function insertCells(fileId, title, rowNum, c0, c1, n, tok, fmtRow = rowNum - 1){
  const sid = await sheetIdOf(fileId, title, tok); if (sid == null) throw new Error(`'${title}' 시트를 찾지 못했어요`);
  const g = (r0, r1) => ({sheetId: sid, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1});
  const dst = g(rowNum - 1, rowNum - 1 + n), src = g(fmtRow - 1, fmtRow), requests = [{insertRange: {range: dst, shiftDimension: 'ROWS'}}];
  if (fmtRow >= 1 && fmtRow < rowNum) for (const pasteType of ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION']) requests.push({copyPaste: {source: src, destination: dst, pasteType}});
  await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requests})}, tok);
}
async function writeCells(fileId, data, tok, input = 'RAW'){
  if (!data.length) return;
  await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({valueInputOption: input, data})}, tok);
}

let flushing = false;
async function flushQueue(interactive){
  if (flushing || !S.queue.length) return;
  if (!navigator.onLine){ updateStatus(); if (interactive) toast('오프라인이에요. 입력은 보관해 두고 연결되면 저장할게요'); return; }
  flushing = true; updateStatus();
  let saved = 0;
  try {
    let tok; try { tok = await gToken(interactive, 'sync'); } catch(e){ if (interactive) toast(e.message); return; }
    if (!tok){ if (interactive) toast('로그인이 필요해요. 새로고침 버튼을 눌러 주세요'); return; }
    // 1) 새 항목 행부터 (행이 밀리니 하나씩)
    for (const op of S.queue.filter(o => ['addB', 'addA', 'renB', 'delB'].includes(o.t))){
      if (op.t === 'renB' || op.t === 'delB'){
        for (const m of op.months){
          const title = m + '월', [V] = await readRanges(op.fileId, [`${qs(title)}!A1:Z2200`], tok), L = locateBudget(V);
          const hit = L && L.rows.find(r => r.kind === op.kind && r.name === op.name); if (!hit) continue;
          const h = V.findIndex(r => str((r || [])[0]).startsWith('구분')), C = ledgerCols(V, h);
          if (op.t === 'renB'){
            const data = [{range: `${qs(title)}!B${hit.row}`, values: [[op.to]]}];
            if (C.tx >= 0){ const T = readTx(V, C.txH, C.tx, m); for (const t of T) if (t.kind === op.kind && t.name === op.name) data.push({range: `${qs(title)}!${colL(C.tx + 2)}${t.row}`, values: [[op.to]]}); }
            if (C.rep >= 0){ const P = readReps(V, C.repH, C.rep, C.repEnd); for (const r of P) if (r.kind === op.kind && r.name === op.name) data.push({range: `${qs(title)}!${colL(C.rep + 2)}${r.row}`, values: [[op.to]]}); }
            await writeCells(op.fileId, data, tok);
          } else {
            if (C.tx >= 0 && readTx(V, C.txH, C.tx, m).some(t => !t.skip && t.kind === op.kind && t.name === op.name)) continue;   // 그새 거래가 생겼으면 남겨요
            if (C.rep >= 0){ const P = readReps(V, C.repH, C.rep, C.repEnd), keep = P.filter(r => !(r.kind === op.kind && r.name === op.name));
              if (keep.length !== P.length){ const n = Math.max(0, ...P.map(r => r.row - C.repH - 1));
                await writeCells(op.fileId, [{range: `${qs(title)}!${colL(C.rep)}${C.repH + 2}:${colL(C.rep + REP_COLS - 1)}${C.repH + 1 + n}`, values: Array.from({length: n}, (_, i) => keep[i] ? repRow(keep[i]) : Array(REP_COLS).fill(''))}], tok); } }
            const sid = await sheetIdOf(op.fileId, title, tok);   // 왼쪽 표(A~F)만 한 칸 위로 (오른쪽 거래 내역은 그대로)
            await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${op.fileId}:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({requests: [{deleteRange: {range: {sheetId: sid, startRowIndex: hit.row - 1, endRowIndex: hit.row, startColumnIndex: 0, endColumnIndex: C.tx >= 0 ? leftW(C) : 6}, shiftDimension: 'ROWS'}}]})}, tok);
          }
        }
      } else if (op.t === 'addB'){
        for (const m of op.months){
          const title = m + '월', [V] = await readRanges(op.fileId, [`${qs(title)}!A1:X400`], tok), L = locateBudget(V);
          if (!L || !L.marker) throw new Error(`${title} 시트에서 '▲' 행을 찾지 못했어요`);
          if (L.rows.some(r => r.kind === op.kind && r.name === op.name)) continue;
          const h = V.findIndex(r => str((r || [])[0]).startsWith('구분')), C = ledgerCols(V, h);
          if (C.tx >= 0) await insertCells(op.fileId, title, L.marker, 0, leftW(C), 1, tok);   // 새 양식: 왼쪽 표에만 칸 넣기
          else await insertRow(op.fileId, title, L.marker, tok);
          await writeCells(op.fileId, [{range: `${qs(title)}!A${L.marker}:B${L.marker}`, values: [[op.kind, op.name]]}], tok);
          if (C.tx >= 0){ const c = k => colL(C.tx + k), r0 = C.txH + 2, r = L.marker;   // 거래 합계 수식
            await writeCells(op.fileId, [{range: `${qs(title)}!C${r}`, values: [[`=SUMIFS($${c(4)}$${r0}:$${c(4)}$2100,$${c(1)}$${r0}:$${c(1)}$2100,A${r},$${c(2)}$${r0}:$${c(2)}$2100,B${r})`]]}], tok, 'USER_ENTERED'); }
        }
      } else {
        const [V] = await readRanges(op.fileId, [`'자산관리'!A1:Z300`], tok), L = locateAsset(V);
        if (!L || !L.marker) throw new Error("'자산관리' 시트에서 '▲' 행을 찾지 못했어요");
        if (!L.rows.some(r => r.big === op.big && r.mid === op.mid && r.small === op.small)){
          await insertRow(op.fileId, '자산관리', L.marker, tok);
          await writeCells(op.fileId, [{range: `'자산관리'!A${L.marker}:C${L.marker}`, values: [[op.big, op.mid, op.small]]}], tok);
        }
      }
      S.queue = S.queue.filter(o => o !== op); saveQueue(); saved++;
    }
    // 2) 거래 내역·반복 거래·세부분류: 그 달 시트를 읽어 ID로 합친 뒤 블록을 통째로 다시 써요
    const LT = ['tx', 'reps', 'cat'], byMon = {};
    for (const op of S.queue.filter(o => LT.includes(o.t))) (byMon[op.fileId + '|' + op.m] = byMon[op.fileId + '|' + op.m] || []).push(op);
    for (const ops of Object.values(byMon)){
      const fileId = ops[0].fileId, title = ops[0].m + '월';
      const [V] = await readRanges(fileId, [`${qs(title)}!A1:Z2200`], tok);
      const h = V.findIndex(r => str((r || [])[0]).startsWith('구분')), C = h >= 0 ? ledgerCols(V, h) : null;
      if (!C || C.tx < 0 || C.rep < 0 || C.sub < 0){ ops.forEach(o => o.err = `${title} 시트에 거래 내역 칸이 없어요 (새 양식 시트가 필요해요)`); continue; }
      const curTx = readTx(V, C.txH, C.tx, ops[0].m), curRep = readReps(V, C.repH, C.rep, C.repEnd), L = locateBudget(V);
      let tx = curTx.map(({row, ...t}) => t), reps = null; const data = [];
      for (const op of ops){
        if (op.t === 'tx'){ const i = tx.findIndex(t => t.id === op.tx.id);
          if (op.act === 'del'){ if (i >= 0) tx.splice(i, 1); } else if (i >= 0) tx[i] = {...op.tx}; else tx.push({...op.tx}); }
        else if (op.t === 'reps') reps = op.reps;
        else { const hit = L.rows.filter(r => r.kind === op.kind && r.name === op.name)[0];
          if (!hit){ op.err = '시트에서 항목을 찾지 못했어요'; continue; }
          data.push({range: `${qs(title)}!${colL(C.sub)}${hit.row}`, values: [[op.subs.join(', ')]]});
          if (C.bud >= 0) data.push({range: `${qs(title)}!${colL(C.bud)}${hit.row}`, values: [[op.bud ?? '']]}); }
      }
      const block = (c, hh, w, rows, used) => { const n = Math.max(rows.length, used); if (!n) return null;
        return {range: `${qs(title)}!${colL(c)}${hh + 2}:${colL(c + w - 1)}${hh + 1 + n}`, values: Array.from({length: n}, (_, i) => rows[i] || Array(w).fill(''))}; };
      const usedTx = Math.max(0, ...curTx.map(t => t.row - C.txH - 1)), usedRep = Math.max(0, ...curRep.map(r => r.row - C.repH - 1));
      if (reps && reps.length > repCap(C)){   // 반복 거래 칸이 모자라면 오른쪽 블록에만 줄을 넣어 거래 내역을 아래로 밀어요
        const k = reps.length - repCap(C);
        await insertCells(fileId, title, C.repH + 2 + repCap(C), C.rep, C.rep + TX_COLS, k, tok, C.repH + 2);
        C.txH += k; C.repEnd += k;
      }
      tx.sort((a, z) => a.d - z.d);
      if (ops.some(o => o.t === 'tx')){ const b = block(C.tx, C.txH, TX_COLS, tx.map(txRow), usedTx); if (b) data.push(b); }
      if (reps){ const b = block(C.rep, C.repH, REP_COLS, reps.map(repRow), Math.min(usedRep, repCap(C))); if (b) data.push(b); }
      await writeCells(fileId, data, tok);
      const Yl = S.years?.[ops[0].y];   // 다른 기기·시트에서 넣은 거래도 화면에 바로 반영
      if (Yl?.txMode && ops.some(o => o.t === 'tx')){ Yl.tx[ops[0].m] = tx.map(t => ({...t})); if (reps) Yl.reps[ops[0].m] = reps.map(r => ({...r})); recalcMonth(Yl, ops[0].m); LS.set('years', S.years); }
      const done = ops.filter(o => !o.err);
      S.queue = S.queue.filter(o => !done.includes(o)); saveQueue(); saved += done.length;
    }
    // 3) 값 쓰기: 파일·시트별로 한 번 읽고, 이름으로 칸을 찾아 비교 후 쓰기
    const byFile = {}; for (const op of S.queue.filter(o => o.t === 'b' || o.t === 'a')) (byFile[op.fileId] = byFile[op.fileId] || []).push(op);
    for (const [fileId, ops] of Object.entries(byFile)){
      const titles = [...new Set(ops.map(o => o.t === 'b' ? o.m + '월' : '자산관리'))];
      const Vs = await readRanges(fileId, titles.map(t => t === '자산관리' ? `'자산관리'!A1:Z300` : `${qs(t)}!A1:D400`), tok);
      const loc = Object.fromEntries(titles.map((t, i) => [t, t === '자산관리' ? locateAsset(Vs[i]) : locateBudget(Vs[i])]));
      const data = [], done = [], conflicts = [];
      for (const op of ops){
        let range, cur;
        if (op.t === 'b'){
          const L = loc[op.m + '월'], hit = L && L.rows.filter(r => r.kind === op.kind && r.name === op.name)[op.idx || 0];
          if (!hit){ op.err = '시트에서 항목을 찾지 못했어요'; continue; }
          range = `${qs(op.m + '월')}!${op.f === 'memo' ? 'D' : 'C'}${hit.row}`; cur = op.f === 'memo' ? hit.memo : hit.amt;
        } else {
          const L = loc['자산관리'], hit = L && L.rows.filter(r => r.big === op.big && r.mid === op.mid && r.small === op.small)[op.idx || 0];
          if (!hit || L.col[op.m] == null){ op.err = '시트에서 항목이나 월 열을 찾지 못했어요'; continue; }
          range = `'자산관리'!${colL(L.col[op.m])}${hit.row}`; cur = hit.r[L.col[op.m]];
        }
        if (!op.force && !sameVal(cur, op.o, op.f === 'memo') && !sameVal(cur, op.v, op.f === 'memo')){ conflicts.push({op, cur}); continue; }
        data.push({range, values: [[op.v == null ? '' : op.v]]}); done.push(op);
      }
      await writeCells(fileId, data, tok);
      S.queue = S.queue.filter(o => !done.includes(o)); saveQueue(); saved += done.length;
      if (conflicts.length && interactive) await resolveConflicts(conflicts);
      else for (const c of conflicts) c.op.conflict = true;
    }
    const stuck = S.queue.filter(o => o.err);
    if (stuck.length) toast(`${stuck.length}건을 저장하지 못했어요: ${stuck[0].err}`);
    else if (saved && interactive) toast(withNote(`구글 시트에 저장했어요${saved > 1 ? ` (${saved}건)` : ''}`));
    S.meta.savedAt = Date.now(); LS.set('meta', S.meta);
  } catch(e){
    if (interactive) toast(e instanceof TypeError ? '연결이 불안정해 저장을 미뤘어요. 연결되면 다시 저장할게요' : '저장하지 못했어요: ' + e.message);
  } finally { flushing = false; saveQueue(); render(); }
}
window.addEventListener('online', () => flushQueue(false));

// 다른 곳에서 먼저 고친 칸: 하나씩 물어보기
function resolveConflicts(list){
  return new Promise(done => {
    const next = () => {
      const c = list.shift(); if (!c){ closeEd(); return done(); }
      const op = c.op, label = op.t === 'b' ? `${op.m}월 ${op.name}${op.f === 'memo' ? ' 메모' : ''}` : `${op.m}월 ${op.small}`;
      const show = v => op.f === 'memo' ? esc(str(v) || '(비어 있음)') : (toNum(v) == null ? '비어 있음' : fmtWon(toNum(v)) + '원');
      openEd(`<h4>시트 값이 바뀌었어요</h4><div class="esub">앱을 연 뒤 다른 곳에서 '${esc(label)}'이(가) 고쳐졌어요.</div>
        <div class="ecard"><div class="kv"><span>시트의 현재 값</span><b class="num">${show(c.cur)}</b></div><div class="kv"><span>지금 입력한 값</span><b class="num">${show(op.v)}</b></div></div>
        <button class="btn" id="cfMine">내 값으로 저장</button><button class="btn ghost" id="cfTheirs">시트 값 유지</button>`, {noClose: true});
      $('#cfMine').onclick = () => { op.force = true; delete op.conflict; saveQueue(); next(); setTimeout(() => flushQueue(true), 0); };
      $('#cfTheirs').onclick = () => { S.queue = S.queue.filter(o => o !== op); saveQueue();
        applyOp(S.years, {...op, v: op.f === 'memo' ? str(c.cur) : toNum(c.cur)}); LS.set('years', S.years); next(); };
    };
    next();
  });
}

/* 입력용 아래 시트 */
// 아래 시트: 손가락으로 아래로 밀면 닫혀요 (맨 위까지 스크롤된 상태이거나 손잡이를 잡았을 때)
function swipeClose(el, canClose, close){
  let y0 = null, dy = 0, drag = false;
  el.addEventListener('touchstart', e => { y0 = null;
    if (!el.classList.contains('on') || !canClose() || e.touches.length > 1) return;
    if (el.scrollTop > 0 && !e.target.closest('.grab,h4,.shead')) return;
    y0 = e.touches[0].clientY; dy = 0; drag = false; }, {passive: true});
  el.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0;
    if (!drag){ if (dy < 10){ if (dy < -4) y0 = null; return; } drag = true; el.style.transition = 'none'; document.activeElement?.blur?.(); }
    el.style.transform = `translateY(${Math.max(0, dy - 10)}px)`; if (e.cancelable) e.preventDefault(); }, {passive: false});
  const end = () => { if (y0 == null) return; y0 = null; el.style.transition = ''; el.style.transform = '';
    if (drag && dy > 90) close(); drag = false; };
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
}
// 입력·편집 화면: 오른쪽에서 밀려 들어오는 전체 화면 (위 '‹ 뒤로', 왼쪽 끝에서 오른쪽으로 밀어도 뒤로)
let edNoClose = false;
function openEd(html, opt = {}){
  edNoClose = !!opt.noClose;
  const el = $('#ed'), was = el.classList.contains('on');
  el.className = 'sheet ed page on' + (opt.tall ? ' tall' : '') + (was ? ' swap' : '');
  el.innerHTML = `<div class="phead"><button class="pback" id="edBack"${edNoClose ? ' hidden' : ''}>‹ 뒤로</button><b id="edTitle"></b><span></span></div>` + html;
  const h = el.querySelector('h4'); if (h) $('#edTitle').textContent = (h.childNodes[0]?.textContent || '').trim();
  $('#edBack').onclick = goBack;
  if (!was){ el.scrollTop = 0; hPush(); }
  const f = el.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 280);
}
function closeEd(){
  $('#ed').classList.remove('on', 'swap');
  if (S.tab === 'settings') syncSheet();
  if (!(S.tab === 'settings' && S.spage && S.spage !== 'main')) hPop();
}
const edBackAction = () => { const x = $('#edX'); x ? x.click() : closeEd(); };
/* 뒤로 가기: 화면을 열 때 브라우저 기록을 하나 쌓아서, 안드로이드 뒤로 버튼·사파리 뒤로 밀기·나중에 앱으로 감쌀 때도 같은 동작을 해요 */
const H = {open: false, skip: false};
function hPush(){ if (H.open) return; try { history.pushState({alv: 1}, ''); H.open = true; } catch(e){} }
function hPop(){ if (!H.open) return; H.open = false; H.skip = true; history.back(); }
function backAction(){
  if ($('#ed').classList.contains('on')){ if (edNoClose) return; edBackAction(); if ($('#ed').classList.contains('on')) hPush(); return; }
  if (S.tab === 'settings' && S.spage && S.spage !== 'main'){ syncSheet(); sPage('main', true); }
}
function goBack(){ if (H.open) history.back(); else backAction(); }
window.addEventListener('popstate', () => { if (H.skip){ H.skip = false; return; } H.open = false; backAction(); });
(() => {   // 화면 왼쪽 끝에서 오른쪽으로 밀면 뒤로 (편집 화면, 설정 상세 화면)
  let x0 = null, y0 = 0, dx = 0, drag = false, tgt = null;
  const target = () => $('#ed').classList.contains('on') ? (edNoClose ? null : $('#ed')) : S.tab === 'settings' && S.spage && S.spage !== 'main' ? $('#sheet .spage.on') : null;
  document.addEventListener('touchstart', e => { x0 = null; if (e.touches.length > 1 || e.touches[0].clientX > 40) return; tgt = target(); if (!tgt) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; drag = false; }, {passive: true});
  document.addEventListener('touchmove', e => { if (x0 == null) return; dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
    if (!drag){ if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8){ x0 = null; return; } if (dx < 10) return; drag = true; tgt.style.transition = 'none'; }
    tgt.style.transform = `translateX(${Math.max(0, dx)}px)`; if (e.cancelable) e.preventDefault(); }, {passive: false});
  const end = () => { if (x0 == null) return; x0 = null; const t = tgt;
    if (drag && dx > 80){ t.style.transition = 'transform .18s ease-out'; t.style.transform = 'translateX(100%)'; setTimeout(() => { t.style.transition = ''; t.style.transform = ''; goBack(); }, 170); }
    else { t.style.transition = ''; t.style.transform = ''; } drag = false; };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();
function bindWon(inp, onChange){
  inp.addEventListener('input', () => {
    const raw = inp.value, n = parseWon(raw);
    if (/^[\d,]*$/.test(raw.replace(/\s/g, ''))){ const pos = raw.length - inp.selectionStart; inp.value = fmtWon(n); try { inp.setSelectionRange(inp.value.length - pos, inp.value.length - pos); } catch(e){} }
    onChange && onChange(parseWon(inp.value));
  });
}

// ② 가계부 항목 하나 고치기
function editBudgetItem(m, kind, name, idx){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  if (S.years[y].txMode) return openItemTx(m, (S.years[y].budget[m] || []).indexOf(findBudget(S.years[y], m, kind, name, idx)));
  const it = findBudget(S.years[y], m, kind, name, idx); if (!it) return;
  const prev = bMonth(m - 1).items.filter(i => i.kind === kind && i.name === name)[0];
  const hist = []; for (let k = 1; k <= 6; k++){ const x = bMonth(m - k); if (x.has){ const p = x.items.find(i => i.kind === kind && i.name === name); if (p && p.filled) hist.push(p.amt); } }
  const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
  openEd(`<h4>${esc(name)} <button class="ex" id="edX">취소</button></h4>
    <div class="esub">${y}년 ${m}월 · ${kind}${prev ? ` · 지난달 ${prev.filled ? money(prev.amt) : '입력 안 함'}` : ''}${avg != null ? ` · 최근 평균 ${money(avg)}` : ''}</div>
    <div class="ewon"><input id="edAmt" inputmode="numeric" autocomplete="off" placeholder="금액 (예: 1200000 또는 120만)" value="${it.filled ? fmtWon(it.amt) : ''}" autofocus><span>원</span></div>
    <div class="ehint" id="edHint"></div>
    <div class="echips">${prev && prev.filled ? '<button data-v="prev">지난달과 같게</button>' : ''}<button data-v="1e4">+1만</button><button data-v="1e5">+10만</button><button data-v="1e6">+100만</button><button data-v="clear">지우기</button></div>
    <input id="edMemo" class="ememo" maxlength="80" placeholder="메모 (선택) · 예: 여행, 가전 구입" value="${esc(it.memo)}">
    <button class="btn" id="edSave">저장</button>`);
  const inp = $('#edAmt'), hint = v => $('#edHint').textContent = v == null ? '비워 두면 "입력 안 함"으로 저장돼요' : isNaN(v) ? '숫자만 넣어 주세요 (예: 120만)' : '= ' + money(v);
  bindWon(inp, hint); hint(parseWon(inp.value));
  $('#ed').querySelectorAll('.echips button').forEach(b => b.onclick = () => {
    const cur = parseWon(inp.value) || 0, v = b.dataset.v;
    inp.value = v === 'clear' ? '' : fmtWon(v === 'prev' ? prev.amt : cur + +v); hint(parseWon(inp.value)); inp.focus(); });
  $('#edX').onclick = closeEd;
  $('#edSave').onclick = () => {
    const v = parseWon(inp.value), memo = $('#edMemo').value.trim();
    if (Number.isNaN(v)) return toast('금액은 숫자로 넣어 주세요');
    const base = {t: 'b', y, m, kind, name, idx}, ops = [];
    const oldAmt = it.filled ? it.amt : null;
    if (v !== oldAmt) ops.push({...base, f: 'amt', v, o: oldAmt});
    if (memo !== str(it.memo)) ops.push({...base, f: 'memo', v: memo, o: str(it.memo)});
    closeEd(); commit(ops);
  };
}

// ③ 이번 달 한꺼번에 입력
function editBudgetMonth(m){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  const items = S.years[y].budget[m] || [], prevB = bMonth(m - 1);
  const prevOf = it => prevB.items.filter(i => i.kind === it.kind && i.name === it.name)[0];
  const val = new Map(items.map(it => [it, it.filled ? it.amt : null]));
  const rowH = (it, k) => { const p = prevOf(it);
    return `<div class="frow" data-k="${k}"><div class="n">${esc(it.name)}${p && p.filled ? `<small>지난달 ${money(p.amt)}</small>` : ''}</div>
      <input inputmode="numeric" autocomplete="off" placeholder="금액 입력" value="${it.filled ? fmtWon(it.amt) : ''}">
      ${p && p.filled ? '<button class="same">같게</button>' : '<span class="same"></span>'}</div>`; };
  openEd(`<h4>${m}월 가계부 입력 <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${y}년 · 비워 둔 칸은 "입력 안 함"으로 저장돼요</div>
    <div class="echips"><button id="fillFixed">고정비 지난달 값으로 채우기</button><button id="onlyEmpty">빈 칸만 보기</button></div>
    ${KINDS.map(k => { const its = items.filter(i => i.kind === k);
      return `<div class="ecard"><div class="etitle">${k}</div>${its.map(it => rowH(it, items.indexOf(it))).join('') || '<p class="note" style="margin:0">항목이 없어요</p>'}
        <button class="eadd" data-kind="${k}">+ ${k} 항목 추가</button></div>`; }).join('')}
    <div class="ebar"><div class="t" id="fSum"></div><button class="btn" id="edSave">시트에 저장</button></div>`, {tall: true});
  const rows = [...$('#ed').querySelectorAll('.frow')];
  const sumUp = () => {
    let changed = 0, inc = 0, exp = 0;
    for (const it of items){ const v = val.get(it); if ((it.filled ? it.amt : null) !== v) changed++; if (v) (it.kind === '수입' ? inc += v : exp += v); }
    $('#fSum').innerHTML = `${changed}개 항목 변경<b class="num">일반 저축 ${money(inc - exp)}</b>`;
  };
  rows.forEach(r => {
    const it = items[+r.dataset.k], inp = r.querySelector('input');
    bindWon(inp, v => { val.set(it, Number.isNaN(v) ? null : v); r.classList.toggle('edited', (it.filled ? it.amt : null) !== val.get(it)); sumUp(); });
    const b = r.querySelector('button.same'); if (b) b.onclick = () => { inp.value = fmtWon(prevOf(it).amt); inp.dispatchEvent(new Event('input')); };
  });
  $('#fillFixed').onclick = () => rows.forEach(r => { const it = items[+r.dataset.k], p = prevOf(it);
    if (it.kind === '고정비' && p && p.filled && !r.querySelector('input').value){ r.querySelector('input').value = fmtWon(p.amt); r.querySelector('input').dispatchEvent(new Event('input')); } });
  $('#onlyEmpty').onclick = e => { const on = e.target.classList.toggle('on'); rows.forEach(r => r.hidden = on && !!r.querySelector('input').value); };
  $('#ed').querySelectorAll('.eadd').forEach(b => b.onclick = () => {
    const n = items.filter(it => (it.filled ? it.amt : null) !== val.get(it)).length;
    if (n && !confirm(`입력 중인 ${n}개 값은 저장되지 않아요. 먼저 저장하려면 취소를 누르세요.`)) return;
    addBudgetItem(m, b.dataset.kind); });
  $('#edX').onclick = closeEd;
  $('#edSave').onclick = () => {
    if ([...rows].some(r => Number.isNaN(parseWon(r.querySelector('input').value)))) return toast('숫자가 아닌 칸이 있어요');
    const ops = [];
    for (const it of items){ const v = val.get(it), o = it.filled ? it.amt : null;
      if (v !== o) ops.push({t: 'b', y, m, kind: it.kind, name: it.name, idx: occ(items, it, bKey), f: 'amt', v, o}); }
    closeEd(); commit(ops); if (!ops.length) toast('바뀐 값이 없어요');
  };
  sumUp();
}

// 가계부 항목 추가
function addBudgetItem(m, kind, fromCats){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  openEd(`<h4>${kind} 항목 추가 <button class="ex" id="edX">취소</button></h4>
    <div class="esub">${y}년 ${m < 12 ? `${m}~12월` : '12월'} 시트의 ${kind} 맨 아래에 추가돼요</div>
    <input id="adName" class="ememo" maxlength="30" placeholder="항목 이름 (예: 넷플릭스, 보험료)" autofocus>
    <button class="btn" id="edSave">추가</button>`);
  $('#edX').onclick = fromCats ? openCats : closeEd;
  $('#edSave').onclick = () => {
    const name = $('#adName').value.trim(); if (!name) return toast('항목 이름을 넣어 주세요');
    if ((S.years[y].budget[m] || []).some(i => i.kind === kind && i.name === name)) return toast('같은 이름의 항목이 이미 있어요');
    const name2 = name.replace(/\|/g, ' '), months = Array.from({length: 13 - m}, (_, i) => m + i);
    closeEd(); commit([{t: 'addB', y, kind, name: name2, months}]);
    if (fromCats) return openCats(null);
    if (!S.years[y].txMode) setTimeout(() => editBudgetItem(m, kind, name, 0), 50);
  };
}

// ④ 자산 월말 잔액 입력
function editAssetMonth(m, bigSel){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  const big = bigSel || '유동자산', list = S.years[y].assets, pv = aMonth(m - 1), cur = aMonth(m);
  const its = list.filter(a => a.big === big), mids = [...new Set(its.map(a => a.mid))];
  const st = editAssetMonth.state && editAssetMonth.state.m === m && editAssetMonth.state.y === y ? editAssetMonth.state : (editAssetMonth.state = {y, m, val: new Map()});
  const V = {get: a => st.val.has(a) ? st.val.get(a) : a.v[m - 1], set: (a, v) => st.val.set(a, v)};   // 탭을 바꿔도 입력값 유지
  const rowH = a => { const p = pv.has ? pv.val(a) : null, v = V.get(a);
    return `<div class="frow${v !== a.v[m - 1] ? ' edited' : ''}" data-k="${list.indexOf(a)}"><div class="n">${esc(a.small)}${p != null && pv.has ? `<small>${pv.m}월 ${money(p)}</small>` : ''}</div>
      <input inputmode="numeric" autocomplete="off" placeholder="잔액 입력" value="${v != null ? fmtWon(v) : ''}">
      ${pv.has ? '<button class="same">그대로</button>' : '<span class="same"></span>'}</div>`; };
  const net = () => { let t = 0; for (const a of list){ const v = V.get(a) ?? 0; t += a.big === '부채' ? -v : v; } return t; };
  const changed = () => list.filter(a => V.get(a) !== a.v[m - 1]).length;
  openEd(`<h4>${m}월 말 잔액 <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${y}년 · 매월 말 기준 잔액${big === '부채' ? ' (부채는 남은 금액을 양수로)' : ''}</div>
    <div class="eseg">${BIGS.map(b => `<button data-b="${b}"${b === big ? ' class="on"' : ''}>${b}</button>`).join('')}</div>
    ${pv.has ? '<div class="echips"><button id="fillSame">빈 칸 모두 지난달 값으로</button></div>' : ''}
    <div class="ecard">${mids.map(md => `<span class="tag">${esc(md)}</span>${its.filter(a => a.mid === md).map(rowH).join('')}`).join('') || '<p class="note" style="margin:0">항목이 없어요</p>'}
      <button class="eadd" id="adA">+ ${big} 항목 추가</button></div>
    <div class="ecard"><div class="kv"><span>순자산 (입력 반영)</span><b class="num" id="aNet"></b></div><div class="kv"><span>전월 대비</span><b class="num" id="aDiff"></b></div></div>
    <div class="ebar"><div class="t" id="fSum"></div><button class="btn" id="edSave">시트에 저장</button></div>`, {tall: true});
  const upd = () => { const n = net(), d = pv.has ? n - pv.net : null;
    $('#aNet').textContent = money(n); $('#aDiff').innerHTML = d == null ? '-' : `<span class="${dir(d)}">${signed(d)}</span>`;
    const c = changed(), left = list.filter(a => V.get(a) == null && (pv.has ? pv.val(a) : 0)).length;
    $('#fSum').innerHTML = `${c}개 항목 변경${left ? ` · ${left}개 비어 있음` : ''}<b>${cur.has || c ? '저장하면 시트에 반영돼요' : '처음 입력하는 달이에요'}</b>`; };
  $('#ed').querySelectorAll('.frow').forEach(r => {
    const a = list[+r.dataset.k], inp = r.querySelector('input');
    bindWon(inp, v => { V.set(a, Number.isNaN(v) ? null : v); r.classList.toggle('edited', V.get(a) !== a.v[m - 1]); upd(); });
    const b = r.querySelector('button.same'); if (b) b.onclick = () => { const p = pv.val(a); inp.value = fmtWon(p); inp.dispatchEvent(new Event('input')); };
  });
  $('#ed').querySelectorAll('.eseg button').forEach(b => b.onclick = () => editAssetMonth(m, b.dataset.b));
  if (pv.has) $('#fillSame').onclick = () => { for (const a of list) if (V.get(a) == null && pv.val(a)) V.set(a, pv.val(a)); editAssetMonth(m, big); toast('빈 칸을 지난달 값으로 채웠어요 (모든 분류)'); };
  $('#adA').onclick = () => addAssetItem(m, big);
  $('#edX').onclick = () => { editAssetMonth.state = null; closeEd(); };
  $('#edSave').onclick = () => {
    if ([...$('#ed').querySelectorAll('.frow input')].some(i => Number.isNaN(parseWon(i.value)))) return toast('숫자가 아닌 칸이 있어요');
    const ops = list.filter(a => V.get(a) !== a.v[m - 1]).map(a => ({t: 'a', y, m, big: a.big, mid: a.mid, small: a.small, idx: occ(list, a, aKey), v: V.get(a), o: a.v[m - 1]}));
    editAssetMonth.state = null; closeEd(); commit(ops); if (!ops.length) toast('바뀐 값이 없어요');
  };
  upd();
}
function addAssetItem(m, big){
  const y = S.year;
  const mids = [...new Set([...(big === '부채' ? ['대출'] : big === '유동자산' ? ['저축', '투자', '코인'] : ['부동산', '퇴직금', '청약']),
    ...S.years[y].assets.filter(a => a.big === big).map(a => a.mid)])];
  openEd(`<h4>${big} 항목 추가 <button class="ex" id="edX">취소</button></h4>
    <div class="esub">'자산관리' 시트의 ${big} 맨 아래(합계에 포함되는 위치)에 추가돼요</div>
    <div class="etitle">중분류</div><div class="echips" id="adMid">${mids.map((md, i) => `<button data-v="${esc(md)}"${i ? '' : ' class="on"'}>${esc(md)}</button>`).join('')}</div>
    <input id="adName" class="ememo" maxlength="30" placeholder="항목 이름 (예: 토스증권, ISA)" autofocus>
    <p class="note">중분류에 따라 홈의 묶음이 정해져요: 투자·퇴직금·코인 = 금융투자, 저축·청약 = 현금, 부동산 = 부동산</p>
    <button class="btn" id="edSave">추가</button>`);
  let mid = mids[0];
  $('#adMid').querySelectorAll('button').forEach(b => b.onclick = () => { mid = b.dataset.v; $('#adMid').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#edX').onclick = () => editAssetMonth(m, big);
  $('#edSave').onclick = () => {
    const small = $('#adName').value.trim(); if (!small) return toast('항목 이름을 넣어 주세요');
    if (findAsset(S.years[y], big, mid, small)) return toast('같은 항목이 이미 있어요');
    commit([{t: 'addA', y, big, mid, small}]);
    editAssetMonth.state = null; editAssetMonth(m, big);
  };
}

/* ───────── 달력 가계부 (거래 내역 · 세부분류 · 반복 거래) ─────────
   시트 'N월'의 같은 머리글 행에 [구분·항목·금액·메모·세부분류·월 예산] + [거래 내역: 일·구분·항목·세부분류·금액·결제수단·메모·ID]
   + [반복 거래: 일·구분·항목·세부분류·금액·결제수단·메모]가 나란히 있어요. 항목 금액 = 그 달 거래 합계. */
const TX_COLS = 8, REP_COLS = 7, EXP_KINDS = ['고정비', '변동비'];
const splitSubs = v => str(v).split(/[,，、/]/).map(s => s.trim()).filter(Boolean);
const daysIn = (y, m) => new Date(y, m, 0).getDate();
function dayOf(v){
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 31 ? new Date(Math.round((v - 25569) * 864e5)).getUTCDate() : Math.round(v);
  const mm = /(\d{1,2})\D*$/.exec(String(v).trim()); return mm ? +mm[1] : null;
}
// 시트 배치 찾기: 구분별 표 머리글(h) → 세부분류·월 예산 열, 거래 내역·반복 거래는 각자 머리글 행을 찾아요.
// 옛 양식은 세 표가 한 머리글 행에 나란히, 새 양식은 오른쪽에 반복 거래(위) · 거래 내역(아래)이 세로로 있어요.
function ledgerCols(V, h){
  const r = {sub: -1, bud: -1, tx: -1, txH: -1, rep: -1, repH: -1, repEnd: undefined};
  const H0 = (V[h] || []).map(str);
  H0.forEach((x, j) => { if (j < 8 && x === '세부분류' && r.sub < 0) r.sub = j; if (j < 8 && x === '월 예산') r.bud = j; });
  for (let i = 0; i < V.length && (r.tx < 0 || r.rep < 0); i++){
    const H = (V[i] || []).map(str);
    H.forEach((x, j) => { if (x !== '일' || j < 6 || H[j + 1] !== '구분' || H[j + 2] !== '항목') return;
      if (H[j + 7] === 'ID'){ if (r.tx < 0){ r.tx = j; r.txH = i; } } else if (r.rep < 0){ r.rep = j; r.repH = i; } });
  }
  if (r.tx >= 0 && r.rep === r.tx && r.txH > r.repH) r.repEnd = r.txH - 1;   // 세로 배치: 반복 거래는 거래 내역 제목 행 전까지
  return r;
}
const leftW = C => Math.min(Math.max(6, C.sub + 1, C.bud + 1), C.tx);   // 왼쪽 표 너비 (숨긴 세부분류 열 포함, 거래 내역 앞까지)
const repCap = C => C.repEnd == null ? Infinity : C.repEnd - C.repH - 2;   // 반복 거래 칸 수 (거래 내역 위 빈 줄 하나는 남김)
function readTx(V, h, c, m){
  const out = [];
  for (let i = h + 1; i < V.length; i++){ const r = V[i] || [], g = k => r[c + k];
    const kind = str(g(1)), name = str(g(2)), amt = toNum(g(4)), id = str(g(7));
    if (!kind && !name && amt == null && !id) continue;
    if (!KINDS.includes(kind) || !name) continue;
    out.push({id: id || `S${m}-${i}`, d: Math.min(Math.max(dayOf(g(0)) || 1, 1), 31), kind, name, sub: str(g(3)), amt: amt ?? 0, pay: str(g(5)), memo: str(g(6)), skip: amt == null, row: i + 1});
  }
  return out;
}
function readReps(V, h, c, end = V.length){
  const out = [];
  for (let i = h + 1; i < Math.min(end, V.length); i++){ const r = V[i] || [], g = k => r[c + k];
    const kind = str(g(1)), name = str(g(2)); if (!KINDS.includes(kind) || !name) continue;
    out.push({day: Math.min(Math.max(dayOf(g(0)) || 1, 1), 31), kind, name, sub: str(g(3)), amt: toNum(g(4)), pay: str(g(5)), memo: str(g(6)), row: i + 1});
  }
  return out;
}
const txRow = t => [t.d, t.kind, t.name, t.sub || '', t.skip ? '' : t.amt, t.pay || '', t.memo || '', t.id];
const repRow = r => [r.day, r.kind, r.name, r.sub || '', r.amt ?? '', r.pay || '', r.memo || ''];
function recalcMonth(Y, m){
  if (!Y?.txMode) return;
  const T = (Y.tx?.[m] || []).filter(t => !t.skip), seen = new Set();
  for (const it of Y.budget[m] || []){
    const k = bKey(it); if (seen.has(k)){ it.amt = 0; it.filled = false; continue; } seen.add(k);
    const L = T.filter(t => t.kind === it.kind && t.name === it.name);
    it.amt = L.reduce((a, t) => a + t.amt, 0); it.filled = L.length > 0;
  }
}
function hash36(s){ let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); }
const repId = r => 'R' + hash36([r.kind, r.name, r.sub || '', r.memo || ''].join('|'));
const newTxId = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const txOf = (m, y = S.year) => { [m, y] = wrapYM(m, y); return S.years?.[y]?.txMode ? (S.years[y].tx?.[m] || []).filter(t => !t.skip) : null; };
const shortAmt = n => { const a = Math.abs(n); return a >= 1e5 ? Math.round(a / 1e4) + '만' : a >= 1e4 ? (+(a / 1e4).toFixed(1)) + '만' : a.toLocaleString('ko-KR'); };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const PAY_OPTS = ['신용카드', '체크카드', '현금'];
S.payOff = LS.get('payOff', []);   // 설정에서 끈 결제수단 (거래 입력 화면에서 숨김)
const payChips = (id, cur) => `<div class="elbl">결제수단</div><div class="echips" id="${id}">${[...PAY_OPTS.filter(p => !S.payOff.includes(p) || p === cur), ...(cur && !PAY_OPTS.includes(cur) ? [cur] : [])].map(p => `<button data-p="${esc(p)}"${p === cur ? ' class="on"' : ''}>${esc(p)}</button>`).join('')}</div>`;
const bindPay = (id, st) => document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => { st.pay = st.pay === b.dataset.p ? '' : b.dataset.p;
  document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x.dataset.p === st.pay)); });
const groupKey = t => t.sub || t.name;
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? a : b; };

// 반복 거래: 날짜가 된 것부터 그 달 거래 내역에 넣어요 (같은 반복은 ID로 한 번만)
function applyReps(){
  const now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1, cd = now.getDate(), ops = [];
  for (const y of yearsList()){
    const Y = S.years[y]; if (!Y?.txMode || y > cy || !canEdit(y)) continue;
    for (let m = 1; m <= 12; m++){
      if (y === cy && m > cm) break;
      for (const r of Y.reps?.[m] || []){
        if (r.amt == null || (y === cy && m === cm && r.day > cd)) continue;
        const id = repId(r); if ((Y.tx?.[m] || []).some(t => t.id === id)) continue;
        if (!(Y.budget[m] || []).some(i => i.kind === r.kind && i.name === r.name)) continue;
        ops.push({t: 'tx', y, m, act: 'set', tx: {id, d: Math.min(r.day, daysIn(y, m)), kind: r.kind, name: r.name, sub: r.sub, amt: r.amt, pay: r.pay, memo: r.memo || '반복', skip: false}});
      }
    }
  }
  if (ops.length){ commit(ops, true); toast(`반복 거래 ${ops.length}건을 넣었어요`); }
}

/* 가계부 탭 위쪽: 달력 / 통계 / 요약 */
S.bview = LS.get('bview', 'cal'); S.rview = LS.get('rview', 'm');
if (['stat', 'sum', 'year'].includes(S.bview)){ S.rview = S.bview === 'year' ? 'y' : 'm'; S.bview = 'rep'; LS.set('bview', 'rep'); LS.set('rview', S.rview); }   // 예전 보기 이름 정리
const effView = () => S.model?.txMode && ['cal', 'bud', 'rep'].includes(S.bview) ? S.bview : 'rep';
const rsegHtml = () => `<div class="rseg"><button data-rv="m"${S.rview !== 'y' ? ' class="on"' : ''}>월</button><button data-rv="y"${S.rview === 'y' ? ' class="on"' : ''}>연간</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-rv]'); if (!b) return; S.rview = b.dataset.rv; LS.set('rview', S.rview); render(); });
const bsegHtml = () => S.model?.txMode ? `<div class="bseg">${[['cal', '달력'], ['bud', '예산'], ['rep', '레포트']].map(([v, l]) => `<button data-bv="${v}"${effView() === v ? ' class="on"' : ''}>${l}</button>`).join('')}</div>` : '';
document.addEventListener('click', e => { const b = e.target.closest('[data-bv]'); if (!b) return; S.bview = b.dataset.bv; LS.set('bview', S.bview); render(); });

function selDay(y, m){
  const s = S.sel; if (s && s.y === y && s.m === m) return s.d;
  const now = new Date(); if (now.getFullYear() === y && now.getMonth() + 1 === m) return now.getDate();
  const T = txOf(m, y) || []; return T.length ? Math.max(...T.map(t => t.d)) : 1;
}
function txRowHtml(t, ed){
  const inc = t.kind === '수입';
  return `<div class="row${ed ? ' tap' : ''}" ${ed ? `data-tx="${esc(t.id)}" role="button" tabindex="0"` : ''}><div class="tico ${inc ? 'inc' : ''}">${esc((t.sub || t.name).slice(0, 1))}</div>
    <div class="n">${esc(t.memo && t.memo !== '반복' ? t.memo : (t.sub || t.name))}${t.id.startsWith('R') ? '<span class="rep">반복</span>' : ''}<small>${esc(t.name)}${t.sub ? ' › ' + esc(t.sub) : ''}${t.pay ? ' · ' + esc(t.pay) : ''}</small></div>
    <div class="a num ${inc ? 'inc' : 'exp'}">${inc ? '+' : '-'}${fmtWon(t.amt)}</div></div>`;
}
function viewCal(){
  const y = S.year, m = S.month.budget, Y = S.model, T = (Y.tx[m] || []).filter(t => !t.skip), b = bMonth(m), ed = canEdit();
  const n = daysIn(y, m), first = new Date(y, m - 1, 1).getDay(), d0 = selDay(y, m), now = new Date();
  const isToday = d => now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d;
  const fut = d => new Date(y, m - 1, d) > now;
  const per = {}; for (const t of T){ const p = per[t.d] = per[t.d] || {i: 0, e: 0, v: 0}; if (t.kind === '수입') p.i += t.amt; else { p.e += t.amt; if (t.kind === '변동비') p.v += t.amt; } }
  const bs = budState(y, m), hot = d => bs.dayBase > 0 && per[d] && per[d].v > bs.dayBase;   // 하루 변동비 예산보다 많이 쓴 날
  let cells = WD.map((w, i) => `<div class="w${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('') + '<div></div>'.repeat(first);
  for (let d = 1; d <= n; d++){ const p = per[d];
    cells += `<button class="d${d === d0 ? ' sel' : ''}${isToday(d) ? ' today' : ''}${fut(d) ? ' fut' : ''}" data-day="${d}"><span>${d}</span>${p && p.i ? `<small class="inc">+${shortAmt(p.i)}</small>` : ''}${p && p.e ? `<small class="exp${hot(d) ? ' hot' : ''}">-${shortAmt(p.e)}</small>` : ''}</button>`; }
  const dayT = T.filter(t => t.d === d0).sort((a, z) => (a.kind === '수입') - (z.kind === '수입') || z.amt - a.amt);
  const dSum = dayT.reduce((a, t) => a + (t.kind === '수입' ? t.amt : -t.amt), 0);
  const reps = (Y.reps[m] || []).length;
  $('#view').innerHTML = bsegHtml() + `
  <section class="card"><div class="sum3 num"><div>수입<b class="inc">${money(b.income)}</b></div><div>지출<b class="exp">${money(b.expense)}</b></div><div>일반 저축<b class="sav">${money(b.cash)}</b></div></div>${bs.total ? budStrip(bs) : ''}</section>
  <section class="card calcard"><div class="cal num">${cells}</div></section>
  <section class="card">
    <div class="dayhead"><b>${m}월 ${d0}일 ${WD[new Date(y, m - 1, d0).getDay()]}요일</b><span class="num">${dayT.length ? (dSum > 0 ? '+' : '') + fmtWon(dSum) + '원' : ''}</span></div>
    ${dayT.map(t => txRowHtml(t, ed)).join('') || `<p class="note" style="margin:6px 0">${ed ? '거래가 없어요. + 버튼으로 입력하세요.' : '거래가 없어요.'}</p>`}
  </section>
  ${ed ? `<div class="ltools"><button data-act="addRep">+ 반복 거래 추가</button><button data-act="cats">분류 관리</button></div>
  <button class="fab" data-act="addTx" aria-label="거래 추가">+</button><div style="height:64px"></div>` : `<p class="note" style="text-align:center">${esc(editNote(y))}</p>`}`;
  $('#view').querySelectorAll('[data-day]').forEach(el => el.onclick = () => { S.sel = {y, m, d: +el.dataset.day}; render(); });
}

/* ───────── 예산 ─────────
   예산 = 그 달 지출 항목(고정비·변동비)의 '월 예산' 합계. 오늘까지 적정선: 변동비는 날짜 비율, 고정비는 이미 낸 만큼. */
function withNote(base){ const f = S.saveNote; S.saveNote = null; const n = f ? f() : ''; return n ? `${base} · ${n}` : base; }
function budNote(y, m, kind, name){
  const it = findBudget(S.years[y], m, kind, name, 0); if (!it || !(it.bud > 0)) return '';
  const r = it.amt / it.bud;
  return r > 1 ? `${it.name} 예산을 ${money(it.amt - it.bud)} 넘었어요` : `${it.name} 예산 ${Math.round(r * 100)}% 썼어요 (남은 ${money(it.bud - it.amt)})`;
}
function budState(y, m){
  const items = (S.years[y]?.budget?.[m] || []).filter(i => EXP_KINDS.includes(i.kind));
  const nd = daysIn(y, m), now = new Date(), cur = now.getFullYear() === y && now.getMonth() + 1 === m, ended = new Date(y, m, 1) <= now;
  const day = cur ? now.getDate() : ended ? nd : 0, frac = day / nd, canProj = cur && day >= 3;
  const rows = items.filter(i => i.bud > 0).map(i => {
    const fixed = i.kind === '고정비', exp = fixed ? Math.min(i.amt, i.bud) : i.bud * frac;
    const proj = fixed ? Math.max(i.amt, i.bud) : canProj ? i.amt / frac : ended ? i.amt : Math.max(i.amt, i.bud);
    const st = i.amt > i.bud ? 'over' : fixed ? (i.amt >= i.bud ? 'done' : 'plan') : (cur && i.amt > exp * 1.1 && i.amt - exp >= 1e4) || i.amt / i.bud >= .85 ? 'warn' : cur && i.amt > exp ? 'fit' : 'ok';
    return {it: i, fixed, exp, proj, st};
  });
  const unb = items.filter(i => !(i.bud > 0) && i.amt > 0), unbAmt = unb.reduce((a, i) => a + i.amt, 0);
  const total = rows.reduce((a, r) => a + r.it.bud, 0), spent = rows.reduce((a, r) => a + r.it.amt, 0);   // 예산을 정한 항목만 비교
  const okLine = rows.reduce((a, r) => a + r.exp, 0);
  const proj = rows.reduce((a, r) => a + r.proj, 0);
  const fixedLeft = rows.filter(r => r.fixed).reduce((a, r) => a + Math.max(0, r.it.bud - r.it.amt), 0);
  const left = cur ? nd - day + 1 : 0, daily = left ? Math.max(0, total - spent - fixedLeft) / left : 0;
  const varBud = rows.filter(r => !r.fixed).reduce((a, r) => a + r.it.bud, 0);
  return {y, m, nd, day, frac, cur, ended, canProj, rows, unb, unbAmt, total, spent, okLine, proj, left, daily, dayBase: varBud / nd};
}
const bClass = r => r > 1 ? 'bf-over' : r >= .85 ? 'bf-warn' : '';   // 막대 색 (전역 .warn 과 겹치지 않게 bf- 접두어)
function budStrip(bs){
  const rem = bs.total - bs.spent, r = bs.spent / bs.total;
  return `<button class="bstrip" data-act="goBud"><div class="l"><span>${rem >= 0 ? `예산 <b>${money(rem)}</b> 남음` : `예산 <b class="up">${money(-rem)}</b> 넘음`}${bs.cur && bs.daily ? ` · 하루 ${money(bs.daily)}` : ''}</span><span class="num">${Math.round(r * 100)}% ›</span></div>
    <div class="btrack sm"><i class="${bClass(r)}" style="width:${Math.min(r, 1) * 100}%"></i>${bs.cur ? `<b class="bpace" style="left:${Math.min(bs.okLine / bs.total, 1) * 100}%"></b>` : ''}</div></button>`;
}
function viewBud(){
  const y = S.year, m = S.month.budget, bs = budState(y, m), ed = canEdit();
  let html = bsegHtml();
  if (!bs.total){
    $('#view').innerHTML = html + `<section class="card bempty"><b>${m}월 예산을 정해 보세요</b><p>항목마다 한 달에 쓸 금액을 정하면, 남은 돈과 하루에 쓸 수 있는 금액, 월말 예상 지출을 알려줘요.</p>
      ${ed ? `<button class="btn" data-act="budEdit">예산 정하기</button>` : `<p class="note">${esc(editNote(y))}</p>`}</section>`; return; }
  const rem = bs.total - bs.spent, r = bs.spent / bs.total;
  const tops = bs.rows.filter(x => !x.fixed && x.it.amt > x.exp).sort((a, z) => (z.it.amt - z.exp) - (a.it.amt - a.exp)).slice(0, 2).map(x => x.it.name);
  let alert = '';
  if (bs.canProj && bs.proj > bs.total) alert = `<div class="balert bad">이 속도면 월말에 <b>${money(bs.proj - bs.total)} 초과</b>해요.${tops.length ? ` ${tops.map(esc).join('·')}${josa(tops.at(-1), '을', '를')} 줄이면 맞출 수 있어요.` : ''}</div>`;
  else if (bs.cur && bs.spent <= bs.okLine + 1e4) alert = `<div class="balert good">${bs.okLine - bs.spent >= 1e4 ? `적정선보다 <b>${money(bs.okLine - bs.spent)}</b> 덜 썼어요` : '적정선에 맞게 쓰고 있어요'}. 이대로면 예산 안에서 끝나요.</div>`;
  else if (bs.ended) alert = rem >= 0 ? `<div class="balert good">예산보다 <b>${money(rem)}</b> 아꼈어요.</div>` : `<div class="balert bad">예산을 <b>${money(-rem)}</b> 넘었어요.</div>`;
  const g3 = bs.cur ? [['하루 권장', money(bs.daily)], ['오늘까지 적정', money(bs.okLine)], ['월말 예상', bs.canProj ? money(bs.proj) : '-', bs.canProj && bs.proj > bs.total ? 'up' : '']]
    : [['예산', money(bs.total)], ['쓴 돈', money(bs.spent)], [rem >= 0 ? '남은 돈' : '초과', money(Math.abs(rem)), rem < 0 ? 'up' : '']];
  html += `<section class="card bhero"><div class="lab">${bs.cur ? '이번 달' : `${m}월`} 예산 ${money(bs.total)} 중</div>
    <div class="big num">${rem >= 0 ? `${money(rem)} 남았어요` : `${money(-rem)} 넘었어요`}<em>${Math.round(r * 100)}% 사용</em></div>
    <div class="btrack"><i class="${bClass(r)}" style="width:${Math.min(r, 1) * 100}%"></i>${bs.cur ? `<b class="bpace" style="left:${Math.min(bs.okLine / bs.total, 1) * 100}%" data-l="적정선"></b>` : ''}</div>
    <div class="bmeta2"><span>${bs.unbAmt ? '예산 항목에서 ' : ''}쓴 돈 ${money(bs.spent)}</span><span>${bs.cur ? `남은 날 ${bs.left}일 (오늘 포함)` : bs.ended ? '지난 달' : '아직 시작 전'}</span></div>
    <div class="bg3 num">${g3.map(([k, v, c]) => `<div>${k}<b${c ? ` class="${c}"` : ''}>${v}</b></div>`).join('')}</div>${alert}</section>`;
  if (bs.unbAmt) html += `<section class="card bnob"><span>예산 없는 항목에서 <b>${money(bs.unbAmt)}</b> 썼어요<small>${bs.unb.map(i => esc(i.name)).join(' · ')}</small></span>${ed ? '<button data-act="budEdit">예산 정하기</button>' : ''}</section>`;
  const TAG = {ok: '여유', fit: '적정', warn: '주의', over: '초과', done: '완료', plan: '예정'};
  const rowHtml = x => { const i = x.it, rr = i.amt / i.bud, idx = (S.model.budget[m] || []).indexOf(i);
    let l = '', rt = '';
    if (x.st === 'over'){ const subs = {}; for (const t of (S.model.tx[m] || []).filter(t => !t.skip && t.kind === i.kind && t.name === i.name)) subs[t.sub || '기타'] = (subs[t.sub || '기타'] || 0) + t.amt;
      l = `<span class="up">${money(i.amt - i.bud)} 초과</span>`; rt = Object.entries(subs).sort((a, z) => z[1] - a[1]).slice(0, 2).map(([k, v]) => `${esc(k)} ${shortAmt(v)}`).join(' · '); }
    else if (x.fixed) l = x.st === 'done' ? '이번 달 냈어요' : `남은 ${money(i.bud - i.amt)}`;
    else { const d = i.amt - x.exp; l = bs.cur ? (Math.abs(d) < 1e4 ? '적정선에 맞게 쓰는 중' : d > 0 ? `적정선보다 ${money(d)} 더 씀` : `적정선보다 ${money(-d)} 덜 씀`) : `${Math.round(rr * 100)}% 사용`;
      rt = `남은 ${money(i.bud - i.amt)}${bs.cur && bs.left ? ` · 하루 ${money((i.bud - i.amt) / bs.left)}` : ''}`; }
    return `<div class="swrap"><button class="sdel" aria-label="${esc(i.name)} 예산 삭제">삭제</button><button class="bit" data-bi="${idx}"><div class="r1"><span class="nm">${esc(i.name)} <span class="btag t-${x.st}">${TAG[x.st]}</span></span><span class="am num"><b>${money(i.amt)}</b> / ${money(i.bud)}</span></div>
      <div class="btrack sm"><i class="${x.st === 'done' ? 'bf-done' : bClass(rr)}" style="width:${Math.min(rr, 1) * 100}%"></i>${bs.cur && !x.fixed ? `<b class="bpace" style="left:${bs.frac * 100}%"></b>` : ''}</div>
      <div class="bsub"><span>${l}</span><span>${rt}</span></div></button></div>`; };
  const grp = k => { const R = bs.rows.filter(x => x.it.kind === k); return R.length ? `<div class="bkind">${k}</div>` + R.sort((a, z) => z.it.bud - a.it.bud).map(rowHtml).join('') : ''; };
  const nAdd = budAddable(y, m).length;
  html += `<section class="card"><h3>항목별 예산 ${ed ? '<button class="bedit" data-act="budEdit">편집 ›</button>' : ''}</h3>${grp('변동비')}${grp('고정비')}
    ${ed && nAdd ? '<button class="badd" data-act="budAdd">+ 예산 항목 추가</button>' : ''}</section>`;
  $('#view').innerHTML = html;
  $('#view').querySelectorAll('.swrap').forEach(w => { const el = w.querySelector('[data-bi]'), it = (S.model.budget[m] || [])[+el.dataset.bi];
    el.onclick = () => openItemTx(m, +el.dataset.bi);
    if (ed) swipeDel(w, () => budDrop(y, m, it)); else w.querySelector('.sdel').remove(); });
}
// 예산 참고값: 지난달 지출 · 최근 3개월 평균 · 지난달 예산 · 반복 거래
function budRef(y, m, i){
  const prevIt = k => { const [pm, py] = wrapYM(m - k, y), P = S.years[py]; if (!P?.txMode) return null; const f = findBudget(P, pm, i.kind, i.name, 0); return f && bMonth(pm, py).has ? f : null; };
  const lm = prevIt(1), av = [1, 2, 3].map(prevIt).filter(Boolean);
  const reps = (S.years[y]?.reps?.[m] || []).filter(r => r.kind === i.kind && r.name === i.name && r.amt > 0), repAmt = reps.reduce((a, r) => a + r.amt, 0);
  return {last: lm ? lm.amt : null, avg: av.length ? av.reduce((a, f) => a + f.amt, 0) / av.length : null, avgN: av.length, pbud: lm?.bud ?? null, repAmt, repDays: reps.map(r => r.day)};
}
const budUp = v => v > 0 ? Math.ceil(v / 1e4) * 1e4 : null;
const budSuggest = (i, R) => i.kind === '고정비' && R.repAmt ? R.repAmt : budUp(R.avgN >= 2 ? R.avg : R.last) || R.pbud || null;
const budHint = (i, R) => [R.repAmt && i.kind === '고정비' ? `반복 · 매달 ${R.repDays.join('·')}일 ${shortAmt(R.repAmt)}` : '', R.last != null ? `지난달 ${shortAmt(R.last)}` : '', R.avgN >= 2 ? `${R.avgN}개월 평균 ${shortAmt(R.avg)}` : ''].filter(Boolean).join(' · ') || '지난 기록 없음';
const budAddable = (y, m) => (S.years[y]?.budget?.[m] || []).filter(i => EXP_KINDS.includes(i.kind) && !(i.bud > 0));
function budOps(y, m, i, v){   // 이번 달~12월에 같은 예산
  const ops = [];
  for (let mm = m; mm <= 12; mm++){ const f = findBudget(S.years[y], mm, i.kind, i.name, 0); if (f && (f.bud ?? null) !== v) ops.push({t: 'cat', y, m: mm, kind: i.kind, name: i.name, subs: [...(f.subs || [])], bud: v}); }
  return ops;
}
function budDrop(y, m, i){ const ops = budOps(y, m, i, null); if (!ops.length) return render(); commit(ops, true); toast(`${i.name} 예산을 지웠어요 · '+ 예산 항목 추가'로 다시 넣을 수 있어요`); }

// 손가락으로 왼쪽으로 밀면 삭제: 조금 밀면 '삭제' 버튼, 절반 넘게 밀면 바로 삭제
function swipeDel(wrap, onDel){
  const row = wrap.querySelector('.sdel').nextElementSibling, BTN = 84;
  let x0 = null, y0 = 0, dx = 0, mode = null, open = false, moved = false;
  const set = (x, anim) => { row.style.transition = anim ? '' : 'none'; row.style.transform = x ? `translateX(${x}px)` : ''; if (x) wrap.classList.add('sw'); else if (anim) setTimeout(() => { if (!open && x0 == null) wrap.classList.remove('sw'); }, 220); else wrap.classList.remove('sw'); };
  const close = () => { open = false; set(0, true); };
  row.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button) return; x0 = e.clientX; y0 = e.clientY; dx = open ? -BTN : 0; mode = null; moved = false; });
  row.addEventListener('pointermove', e => { if (x0 == null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!mode){ if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; mode = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'; if (mode === 'h'){ moved = true; try { row.setPointerCapture(e.pointerId); } catch(_){} } }
    if (mode !== 'h') return;
    dx = Math.min(0, (open ? -BTN : 0) + mx); set(dx); });
  const end = () => { if (x0 == null) return; x0 = null;
    if (mode === 'h'){ const W = wrap.clientWidth;
      if (dx < -W * 0.5){ set(-W, true); wrap.classList.add('gone'); setTimeout(onDel, 200); }
      else if (dx < -40){ open = true; set(-BTN, true); } else close(); }
    mode = null; };
  row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
  row.addEventListener('click', e => { if (moved || open){ e.stopImmediatePropagation(); e.preventDefault(); if (!moved) close(); moved = false; } }, true);
  wrap.querySelector('.sdel').onclick = () => { wrap.classList.add('gone'); set(-wrap.clientWidth, true); setTimeout(onDel, 200); };
}

// 예산 항목 하나 추가 (예산 탭 '+ 예산 항목 추가')
function openBudAdd(){
  const y = S.year, m = S.month.budget; if (!canEdit(y)) return toast(editNote(y));
  const L = budAddable(y, m); if (!L.length) return toast('모든 지출 항목에 예산이 있어요');
  let sel = null;
  const draw = () => {
    const R = sel ? budRef(y, m, sel) : null, sug = sel ? budSuggest(sel, R) : null;
    openEd(`<h4>예산 항목 추가 <button class="ex" id="edX">취소</button></h4><div style="height:6px"></div>
      ${['고정비', '변동비'].map(k => { const I = L.filter(i => i.kind === k); return I.length ? `<div class="elbl">${k}</div><div class="echips">${I.map(i => `<button data-n="${esc(i.name)}" data-k="${k}"${i === sel ? ' class="on"' : ''}>${esc(i.name)}</button>`).join('')}</div>` : ''; }).join('')}
      ${sel ? `<div class="elbl">${esc(sel.name)} 한 달 예산</div><div class="ewon"><input id="baAmt" inputmode="numeric" autocomplete="off" placeholder="금액" value="${sug ? fmtWon(sug) : ''}" autofocus><span>원</span></div>
        <div class="ehint">${esc(budHint(sel, R))}</div><button class="btn" id="edSave">추가</button>` : ''}`);
    $('#edX').onclick = closeEd;
    $('#ed').querySelectorAll('[data-n]').forEach(b => b.onclick = () => { sel = L.find(i => i.kind === b.dataset.k && i.name === b.dataset.n); draw(); });
    if (sel){ bindWon($('#baAmt'));
      $('#edSave').onclick = () => { const v = parseWon($('#baAmt').value); if (!(v > 0)) return toast('금액을 넣어 주세요');
        closeEd(); commit(budOps(y, m, sel, v), true); toast(`${sel.name} 예산 ${money(v)}을 추가했어요`); }; }
  };
  draw();
}

// 예산 편집: 예산이 있는 항목만 보여주고, 밀어서 빼고, 아래에서 다시 추가
function openBudEdit(){
  const y = S.year, m = S.month.budget, Y = S.years[y]; if (!canEdit(y)) return toast(editNote(y));
  const items = (Y.budget[m] || []).filter(i => EXP_KINDS.includes(i.kind));
  const ref = items.map(i => budRef(y, m, i));
  const ed = items.map((i, x) => { const rep = !(i.bud > 0) && i.kind === '고정비' && !!ref[x].repAmt, v = i.bud > 0 ? i.bud : rep ? ref[x].repAmt : null; return {v, rep, on: v > 0}; });
  const prevSpent = (() => { const [pm, py] = wrapYM(m - 1, y); return S.years[py]?.txMode && bMonth(pm, py).has ? bMonth(pm, py).expense : null; })();
  const fill = how => { items.forEach((i, x) => { const R = ref[x];
      if (i.kind === '고정비' && R.repAmt && how !== 'pbud'){ ed[x] = {v: R.repAmt, rep: true, on: true}; return; }
      const v = how === 'last' ? budUp(R.last) : how === 'avg' ? budUp(R.avg) : R.pbud;
      if (v > 0) ed[x] = {v, rep: false, on: true}; else if (how === 'pbud') ed[x] = {v: null, rep: false, on: false}; }); draw(); };
  const total = () => ed.reduce((a, e) => a + (e.on && e.v > 0 ? e.v : 0), 0);
  let focusX = null;
  const draw = () => {
    const sc = $('#ed').scrollTop, tot = total(), off = items.filter((_, x) => !ed[x].on);
    const has = k => ref.some(R => (k === 'pbud' ? R.pbud : R[k]) != null);
    openEd(`<h4>${m}월 예산 <button class="ex" id="edX">닫기</button></h4>
      <div class="btot"><div class="lab">지출 예산 합계 (항목 합계로 자동)</div><div class="v num" id="bdTot">${tot ? money(tot) : '0원'}</div>${prevSpent != null ? `<small>지난달 실제 지출 ${money(prevSpent)}</small>` : ''}</div>
      ${has('last') || has('pbud') ? `<div class="bqf"><span>빠르게 채우기</span>${has('last') ? '<button data-f="last">지난달 지출</button>' : ''}${ref.some(R => R.avgN >= 2) ? '<button data-f="avg">최근 3개월 평균</button>' : ''}${has('pbud') ? '<button data-f="pbud">지난달 예산 그대로</button>' : ''}</div>` : ''}
      ${['고정비', '변동비'].map(k => { const L = items.filter(i => i.kind === k && ed[items.indexOf(i)].on); return L.length ? `<div class="etitle" style="margin:12px 2px 6px">${k}${k === '고정비' ? ' <span class="muted" style="font-weight:500">· 반복 거래 금액이 기본값</span>' : ''}</div>` + L.map(i => { const x = items.indexOf(i), e = ed[x];
        return `<div class="swrap ber-w"><button class="sdel" aria-label="${esc(i.name)} 빼기">빼기</button><div class="ber"><div class="n"><b>${esc(i.name)}</b><small>${esc(budHint(i, ref[x]))}</small></div><input class="bin${e.rep ? ' rep' : ''}" data-x="${x}" inputmode="numeric" placeholder="금액" value="${e.v ? fmtWon(e.v) : ''}"></div></div>`; }).join('') : ''; }).join('')
        || '<p class="note" style="text-align:center;margin:18px 0">아직 예산을 정한 항목이 없어요. 위 버튼으로 채우거나 아래에서 항목을 추가하세요.</p>'}
      ${off.length ? `<div class="elbl" style="margin-top:14px">+ 예산 항목 추가</div><div class="echips">${off.map(i => `<button class="badd-c" data-x="${items.indexOf(i)}">+ ${esc(i.name)}</button>`).join('')}</div>` : ''}
      <p class="note">왼쪽으로 밀면 예산에서 빠져요. 저장하면 ${m < 12 ? `${m}월부터 12월까지` : '12월에'} 같은 예산이 적용돼요.</p>
      <div class="ebar"><div class="t">시트의 '월 예산' 칸에 저장돼요</div><button class="btn" id="edSave">저장</button></div>`, {tall: true});
    $('#ed').scrollTop = sc;
    const upd = () => { const t = total(); $('#bdTot').textContent = t ? money(t) : '0원'; };
    $('#ed').querySelectorAll('.bin').forEach(inp => bindWon(inp, v => { const x = +inp.dataset.x; ed[x] = {v: Number.isNaN(v) ? NaN : v, rep: false, on: true}; inp.classList.remove('rep'); upd(); }));
    $('#ed').querySelectorAll('.ber-w').forEach(w => { const x = +w.querySelector('.bin').dataset.x; swipeDel(w, () => { ed[x] = {v: null, rep: false, on: false}; draw(); }); });
    $('#ed').querySelectorAll('.badd-c').forEach(b => b.onclick = () => { const x = +b.dataset.x; ed[x] = {v: budSuggest(items[x], ref[x]), rep: false, on: true}; focusX = x; draw(); });
    if (focusX != null){ const f = $('#ed').querySelector(`.bin[data-x="${focusX}"]`); focusX = null; if (f){ f.scrollIntoView({block: 'center'}); f.focus(); } }
    $('#ed').querySelectorAll('[data-f]').forEach(b => b.onclick = () => fill(b.dataset.f));
    $('#edX').onclick = closeEd;
    $('#edSave').onclick = () => {
      if (ed.some(e => e.on && Number.isNaN(e.v))) return toast('예산은 숫자로 넣어 주세요');
      const ops = items.flatMap((i, x) => budOps(y, m, i, ed[x].on && ed[x].v > 0 ? ed[x].v : null));
      closeEd(); if (!ops.length) return toast('바뀐 내용이 없어요');
      S.bview = 'bud'; LS.set('bview', 'bud'); commit(ops);
    };
  };
  draw();
}

/* 통계 */
function statInto(host){
  const y = S.year, m = S.month.budget, Y = S.model, T = (Y.tx[m] || []).filter(t => !t.skip), now = new Date();
  const cur = now.getFullYear() === y && now.getMonth() + 1 === m, cutDay = cur ? now.getDate() : 31;
  const E = T.filter(t => EXP_KINDS.includes(t.kind)), PT = txOf(m - 1), PE = PT && PT.some(t => EXP_KINDS.includes(t.kind)) ? PT.filter(t => EXP_KINDS.includes(t.kind)) : null;
  let html = '';
  if (!E.length || !host) return;
  const tot = E.reduce((a, t) => a + t.amt, 0), by = {};
  for (const t of E){ const k = groupKey(t); (by[k] = by[k] || {n: k, item: t.name, a: 0, c: 0}).a += t.amt; by[k].c++; }
  const G = Object.values(by).sort((a, z) => z.a - a.a), top = G.slice(0, 7), rest = G.slice(7).reduce((a, g) => a + g.a, 0);
  if (rest) top.push({n: '그 외', a: rest});
  // 지난달 같은 날까지와 비교
  const pIn = PE ? PE.filter(t => t.d <= cutDay) : null, pTot = pIn ? pIn.reduce((a, t) => a + t.amt, 0) : null;
  const diff = pTot != null ? tot - pTot : null;
  html += `<section class="card"><h3>어디에 썼나 <small>지출 ${money(tot)} · ${E.length}건</small></h3>
    <div class="donut"><canvas id="cSub"></canvas><div class="center"><div><b class="num" style="font-size:18px">${money(tot)}</b><span>${m}월 지출</span></div></div></div>
    <div class="legend">${top.map((g, k) => `<div class="lg"><i class="dot" style="background:${PALETTE[k % PALETTE.length]}"></i><span class="n">${esc(g.n)}${g.item && g.item !== g.n ? ` <span class="muted" style="font-size:12px">${esc(g.item)}</span>` : ''}</span><span class="p num">${pctPlain(g.a / tot, 0)}</span><span class="a num">${money(g.a)}</span></div>`).join('')}</div></section>`;
  html += `<section class="card"><h3>누적 지출 ${diff != null ? `<small>지난달 ${cur ? '같은 날보다' : '보다'} <b class="${dir(diff)}">${signed(diff)}</b></small>` : ''}</h3><div class="chart" style="height:180px"><canvas id="cCum"></canvas></div></section>`;
  // 달라진 점
  const ins = [];
  if (diff != null && pTot > 0) ins.push(`${cur ? `오늘(${cutDay}일)까지` : '이번 달'} 지출이 지난달${cur ? ' 같은 날' : ''}보다 <b>${money(Math.abs(diff))} ${diff > 0 ? '많아요' : '적어요'}</b> (${pct(diff / pTot, 0)}).`);
  if (pIn && pIn.length){ const pb = {}; for (const t of pIn) pb[groupKey(t)] = (pb[groupKey(t)] || 0) + t.amt;
    const ch = [...new Set([...Object.keys(by), ...Object.keys(pb)])].map(k => ({k, d: (by[k]?.a || 0) - (pb[k] || 0), p: pb[k] || 0})).sort((a, z) => z.d - a.d);
    const up = ch[0], dn = ch.at(-1);
    if (up && up.d > 0) ins.push(`<b>${esc(up.k)}</b> 지출이 ${money(up.d)} 늘었어요${up.p ? ` (${pct(up.d / up.p, 0)})` : ' (지난달엔 없었어요)'}.`);
    if (dn && dn.d < 0) ins.push(`<b>${esc(dn.k)}</b>${josa(dn.k, '은', '는')} ${money(-dn.d)} 줄었어요.`); }
  const wd = Array(7).fill(0); for (const t of E) wd[new Date(y, m - 1, t.d).getDay()] += t.amt;
  const wmax = wd.indexOf(Math.max(...wd)); ins.push(`가장 많이 쓴 요일은 <b>${WD[wmax]}요일</b>이에요 (${money(wd[wmax])}).`);
  const big = [...E].sort((a, z) => z.amt - a.amt)[0]; ins.push(`가장 큰 지출은 ${big.d}일 <b>${esc(big.memo && big.memo !== '반복' ? big.memo : groupKey(big))}</b> ${money(big.amt)}이에요.`);
  html += `<section class="card"><h3>달라진 점</h3><ul class="ins">${ins.map(s => `<li>${s}</li>`).join('')}</ul></section>`;
  html += `<section class="card"><h3>큰 지출 TOP 5</h3>${[...E].sort((a, z) => z.amt - a.amt).slice(0, 5).map(t => txRowHtml(t, canEdit())).join('')}</section>`;
  host.innerHTML = html;
  donut('cSub', top.map(g => g.n), top.map(g => g.a), top.map((_, k) => PALETTE[k % PALETTE.length]));
  const n = daysIn(y, m), cum = arr => { const o = Array(32).fill(0); for (const t of arr) o[t.d] += t.amt; let s = 0; return Array.from({length: n}, (_, i) => (s += o[i + 1])); };
  const a = cum(E).map((v, i) => i + 1 <= cutDay ? v : null), ds = [{label: `${m}월`, data: a, borderColor: css('--up'), backgroundColor: css('--up'), borderWidth: 2.5, pointRadius: 0, tension: .25, spanGaps: false}];
  if (PE) ds.push({label: `${wrapYM(m - 1, y)[0]}월`, data: cum(PE), borderColor: css('--faint'), borderDash: [4, 3], borderWidth: 2, pointRadius: 0, tension: .25});
  mk('cCum', {type: 'line', data: {labels: Array.from({length: n}, (_, i) => i + 1), datasets: ds},
    options: {interaction: {mode: 'index', intersect: false}, plugins: {legend: {display: !!PE, position: 'bottom', labels: {boxWidth: 12, boxHeight: 2}}, tooltip: {...baseTip, ...tipWon, callbacks: {title: c => c[0].label + '일', label: tipWon.callbacks.label}}},
      scales: {x: {grid: {display: false}, border: {display: false}, ticks: {maxTicksLimit: 7, maxRotation: 0}}, y: scaleWon()}}});
}

/* 거래 입력 / 고치기 */
function itemsFor(y, m, inc){ return (S.years[y]?.budget?.[m] || []).filter(i => inc ? i.kind === '수입' : i.kind !== '수입'); }
function usage(y){ const c = {}; for (const L of Object.values(S.years[y]?.tx || {})) for (const t of L) if (!t.skip){ c[t.kind + '|' + t.name] = (c[t.kind + '|' + t.name] || 0) + 1; c['s|' + t.name + '|' + t.sub] = (c['s|' + t.name + '|' + t.sub] || 0) + 1; c['p|' + t.pay] = (c['p|' + t.pay] || 0) + 1; } return c; }
function editTx(id, presetDay){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  const m0 = S.month.budget, Y = S.years[y], old = id ? (Y.tx[m0] || []).find(t => t.id === id) : null;
  if (id && !old) return;
  const U = usage(y);
  const st = old ? {inc: old.kind === '수입', amt: old.amt, kind: old.kind, name: old.name, sub: old.sub, m: m0, d: old.d, pay: old.pay, memo: old.memo === '반복' ? '' : old.memo}
    : {inc: false, amt: null, kind: null, name: null, sub: '', m: m0, d: presetDay || selDay(y, m0), pay: '', memo: '', rep: false};
  const favPay = PAY_OPTS.filter(p => !S.payOff.includes(p)).sort((a, z) => (U['p|' + z] || 0) - (U['p|' + a] || 0)).find(p => U['p|' + p]) || '';
  if (!old) st.pay = favPay;
  const pad = n => String(n).padStart(2, '0');
  const draw = () => {
    const its = itemsFor(y, st.m, st.inc).slice().sort((a, z) => (U[z.kind + '|' + z.name] || 0) - (U[a.kind + '|' + a.name] || 0));
    if (!st.name || !its.some(i => i.kind === st.kind && i.name === st.name)){ const f = its[0]; st.kind = f?.kind; st.name = f?.name; st.sub = ''; }
    const it = its.find(i => i.kind === st.kind && i.name === st.name), subs = (it?.subs || []).slice().sort((a, z) => (U['s|' + st.name + '|' + z] || 0) - (U['s|' + st.name + '|' + a] || 0));
    if (st.sub && !subs.includes(st.sub)) subs.unshift(st.sub);
    const amtV = st.amtTxt ?? (st.amt ? fmtWon(st.amt) : '');
    openEd(`<h4>${old ? '거래 고치기' : '거래 추가'} <button class="ex" id="edX">취소</button></h4><div style="height:10px"></div>
      <div class="eseg" id="txKind"><button data-v="0"${st.inc ? '' : ' class="on"'}>지출</button><button data-v="1"${st.inc ? ' class="on"' : ''}>수입</button></div>
      <div class="ewon"><input id="txAmt" inputmode="numeric" autocomplete="off" placeholder="금액 (예: 12000 또는 1.2만)" value="${esc(amtV)}"${old ? '' : ' autofocus'}><span>원</span></div>
      <div class="ehint" id="txHint"></div>
      <div class="elbl">항목</div><div class="echips" id="txItem">${its.map(i => `<button data-k="${esc(i.kind + '|' + i.name)}"${i === it ? ' class="on"' : ''}>${esc(i.name)}</button>`).join('') || '<span class="note">항목이 없어요</span>'}</div>
      ${it && it.kind !== '수입' || subs.length ? `<div class="elbl">세부분류${it ? ' · ' + esc(it.name) : ''}</div><div class="echips" id="txSub">${subs.map(s => `<button data-s="${esc(s)}"${s === st.sub ? ' class="on"' : ''}>${esc(s)}</button>`).join('')}<button data-s="+" class="add">+ 추가</button></div>` : ''}
      ${st.inc ? '' : payChips('txPayC', st.pay)}
      <div class="erow2"><label>날짜<input type="date" id="txDate" min="${y}-01-01" max="${y}-12-31" value="${y}-${pad(st.m)}-${pad(st.d)}"></label></div>
      <input id="txMemo" class="ememo" maxlength="60" placeholder="메모 (예: 회사 근처 국밥)" value="${esc(st.memo)}">
      ${old ? '' : `<label class="echeck"><input type="checkbox" id="txRep"${st.rep ? ' checked' : ''}> 매달 반복 <span class="muted" id="txRepNote">(매달 ${st.d}일, ${st.m < 12 ? `${st.m}~12월` : '12월'})</span></label>`}
      <button class="btn" id="edSave">저장</button>${old ? '<button class="btn ghost danger" id="txDel">삭제</button>' : ''}`);
    const inp = $('#txAmt'), hint = v => $('#txHint').textContent = v == null ? '' : isNaN(v) ? '숫자만 넣어 주세요 (예: 1.2만)' : '= ' + fmtWon(v) + '원';
    bindWon(inp, hint); hint(parseWon(inp.value));
    const keep = () => { st.amtTxt = inp.value; st.amt = parseWon(inp.value); st.memo = $('#txMemo').value.trim(); if ($('#txRep')) st.rep = $('#txRep').checked;
      const dv = $('#txDate').value.split('-'); if (dv.length === 3 && +dv[0] === y){ st.m = +dv[1]; st.d = +dv[2]; } };
    bindPay('txPayC', st);
    $('#txKind').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); st.inc = b.dataset.v === '1'; st.name = null; st.pay = st.inc ? '' : (st.pay || favPay); draw(); });
    $('#txItem').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); const [k, ...n] = b.dataset.k.split('|'); st.kind = k; st.name = n.join('|'); st.sub = ''; draw(); });
    $('#txSub')?.querySelectorAll('button').forEach(b => b.onclick = () => { keep();
      if (b.dataset.s === '+'){ const s = (prompt(`${st.name}의 세부분류 이름`) || '').trim().replace(/,/g, ' '); if (!s) return; st.sub = s; st.newSub = s; }
      else st.sub = st.sub === b.dataset.s ? '' : b.dataset.s; draw(); });
    $('#txDate').onchange = () => { const pm = st.m; keep(); if (st.m !== pm) draw(); else if ($('#txRepNote')) $('#txRepNote').textContent = `(매달 ${st.d}일, ${st.m < 12 ? `${st.m}~12월` : '12월'})`; };
    $('#edX').onclick = closeEd;
    $('#edSave').onclick = () => { keep(); saveTx(); };
    if (old) $('#txDel').onclick = () => { if (!confirm('이 거래를 지울까요?')) return; closeEd();
      commit([old.id.startsWith('R') ? {t: 'tx', y, m: m0, act: 'set', tx: {...old, amt: 0, skip: true, memo: '건너뜀'}} : {t: 'tx', y, m: m0, act: 'del', tx: {id: old.id}}]); };
  };
  const saveTx = () => {
    if (st.amt == null || Number.isNaN(st.amt) || st.amt <= 0) return toast('금액을 넣어 주세요');
    if (!st.name) return toast('항목을 골라 주세요');
    if (!st.m || !st.d || st.d > daysIn(y, st.m)) return toast('날짜를 확인해 주세요');
    const ops = [], tx = {id: old ? old.id : newTxId(), d: st.d, kind: st.kind, name: st.name, sub: st.sub, amt: st.amt, pay: st.inc ? '' : st.pay, memo: st.memo, skip: false};
    if (st.newSub && st.sub === st.newSub) for (let mm = st.m; mm <= 12; mm++){ const it = findBudget(Y, mm, st.kind, st.name, 0);
      if (it && !(it.subs || []).includes(st.sub)) ops.push({t: 'cat', y, m: mm, kind: st.kind, name: st.name, subs: [...(it.subs || []), st.sub], bud: it.bud ?? null}); }
    if (st.rep){ const rep = {day: st.d, kind: st.kind, name: st.name, sub: st.sub, amt: st.amt, pay: st.inc ? '' : st.pay, memo: st.memo};
      tx.id = repId(rep); if (!tx.memo) tx.memo = '반복';
      for (let mm = st.m; mm <= 12; mm++){ const L = (Y.reps[mm] || []).filter(r => repId(r) !== tx.id); ops.push({t: 'reps', y, m: mm, reps: [...L, rep]}); } }
    if (old && st.m !== m0) ops.push({t: 'tx', y, m: m0, act: 'del', tx: {id: old.id}});
    ops.push({t: 'tx', y, m: st.m, act: 'set', tx});
    closeEd(); S.sel = {y, m: st.m, d: st.d}; if (st.m !== m0) S.month.budget = st.m;
    if (!st.inc) S.saveNote = () => budNote(y, st.m, st.kind, st.name);
    commit(ops);
  };
  draw();
}

/* 반복 거래 관리 */
function openReps(){
  const y = S.year, m = S.month.budget, Y = S.years[y]; if (!canEdit(y)) return toast(editNote(y));
  const L = Y.reps[m] || [];
  openEd(`<h4>반복 거래 <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${m}월 시트 기준 · 날짜가 되면 거래 내역에 자동으로 들어가요</div>
    ${KINDS.map(k => { const R = L.filter(r => r.kind === k); return R.length ? `<div class="ecard"><div class="etitle">${k}</div>${R.map(r => `<div class="row tap" data-ri="${L.indexOf(r)}"><div class="n">${esc(r.memo || r.sub || r.name)}<small>${esc(r.name)}${r.sub ? ' › ' + esc(r.sub) : ''} · 매달 ${r.day}일${r.pay ? ' · ' + esc(r.pay) : ''}</small></div><div class="a num">${r.amt == null ? '금액 없음' : fmtWon(r.amt)}</div></div>`).join('')}</div>` : ''; }).join('') || '<p class="note">아직 반복 거래가 없어요. 월급·관리비·통신비·적금처럼 매달 있는 거래를 등록해 두세요.</p>'}
    <button class="btn" id="rpAdd">+ 반복 거래 추가</button>`, {tall: L.length > 4});
  $('#edX').onclick = closeEd; $('#rpAdd').onclick = () => editRep(null);
  $('#ed').querySelectorAll('[data-ri]').forEach(el => el.onclick = () => editRep(+el.dataset.ri));
}
function editRep(ri, direct){
  const y = S.year, m = S.month.budget, Y = S.years[y], old = ri != null ? (Y.reps[m] || [])[ri] : null;
  const st = old ? {...old, inc: old.kind === '수입'} : {inc: false, day: 1, kind: null, name: null, sub: '', amt: null, pay: '', memo: ''};
  const draw = () => {
    const its = itemsFor(y, m, st.inc);
    if (!its.some(i => i.kind === st.kind && i.name === st.name)){ st.kind = its[0]?.kind; st.name = its[0]?.name; st.sub = ''; }
    const it = its.find(i => i.kind === st.kind && i.name === st.name), subs = [...(it?.subs || [])]; if (st.sub && !subs.includes(st.sub)) subs.unshift(st.sub);
    const amtV = st.amtTxt ?? (st.amt != null ? fmtWon(st.amt) : '');
    const nRep = (Y.reps[m] || []).length;
    openEd(`<h4>${old ? '반복 거래 고치기' : '반복 거래 추가'} <button class="ex" id="edX">취소</button></h4>
      ${!old && nRep ? `<button class="elink" id="rpList">등록된 반복 거래 ${nRep}개 보기 ›</button>` : '<div style="height:10px"></div>'}
      <div class="eseg" id="rpKind"><button data-v="0"${st.inc ? '' : ' class="on"'}>지출</button><button data-v="1"${st.inc ? ' class="on"' : ''}>수입</button></div>
      <div class="ewon"><input id="rpAmt" inputmode="numeric" autocomplete="off" placeholder="금액" value="${esc(amtV)}"><span>원</span></div><div class="ehint"></div>
      <div class="elbl">항목</div><div class="echips" id="rpItem">${its.map(i => `<button data-k="${esc(i.kind + '|' + i.name)}"${i === it ? ' class="on"' : ''}>${esc(i.name)}</button>`).join('')}</div>
      ${subs.length ? `<div class="elbl">세부분류</div><div class="echips" id="rpSub">${subs.map(s => `<button data-s="${esc(s)}"${s === st.sub ? ' class="on"' : ''}>${esc(s)}</button>`).join('')}</div>` : ''}
      ${st.inc ? '' : payChips('rpPayC', st.pay || '')}
      <div class="erow2"><label>매달 (일)<input id="rpDay" type="number" inputmode="numeric" min="1" max="31" value="${st.day}"></label></div>
      <input id="rpMemo" class="ememo" maxlength="60" placeholder="이름 (예: 넷플릭스, 적금)" value="${esc(st.memo || '')}">
      <button class="btn" id="edSave">저장</button>${old ? '<button class="btn ghost danger" id="rpDel">반복 그만하기</button>' : ''}`);
    bindWon($('#rpAmt'));
    const keep = () => { st.amtTxt = $('#rpAmt').value; st.amt = parseWon($('#rpAmt').value); st.day = Math.min(Math.max(+$('#rpDay').value || 1, 1), 31); st.memo = $('#rpMemo').value.trim(); };
    bindPay('rpPayC', st);
    $('#rpKind').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); st.inc = b.dataset.v === '1'; st.name = null; if (st.inc) st.pay = ''; draw(); });
    $('#rpItem').querySelectorAll('button').forEach(b => b.onclick = () => { keep(); const [k, ...n] = b.dataset.k.split('|'); st.kind = k; st.name = n.join('|'); st.sub = ''; draw(); });
    $('#rpSub')?.querySelectorAll('button').forEach(b => b.onclick = () => { keep(); st.sub = st.sub === b.dataset.s ? '' : b.dataset.s; draw(); });
    $('#edX').onclick = direct ? closeEd : openReps;
    if ($('#rpList')) $('#rpList').onclick = openReps;
    const months = () => Array.from({length: 13 - m}, (_, i) => m + i);
    const save = rep => { const oid = old ? repId(old) : null, ops = [];
      for (const mm of months()){ const L = (Y.reps[mm] || []).filter(r => repId(r) !== oid && (!rep || repId(r) !== repId(rep)));
        ops.push({t: 'reps', y, m: mm, reps: rep ? [...L, rep] : L}); }
      closeEd(); commit(ops); applyReps(); };
    $('#edSave').onclick = () => { keep(); if (st.amt == null || Number.isNaN(st.amt) || st.amt <= 0) return toast('금액을 넣어 주세요'); if (!st.name) return toast('항목을 골라 주세요');
      save({day: st.day, kind: st.kind, name: st.name, sub: st.sub, amt: st.amt, pay: st.inc ? '' : (st.pay || ''), memo: st.memo}); };
    if (old) $('#rpDel').onclick = () => { if (confirm('이 반복 거래를 그만할까요? 이미 들어간 거래는 그대로 있어요.')) save(null); };
  };
  draw();
}

/* 분류 · 예산 (그 달 시트의 세부분류·월 예산 칸) */
let catKinds = KINDS;   // 분류 관리에 보일 구분 (설정의 수입 항목 / 지출 항목)
function openCats(kinds){
  if (Array.isArray(kinds)) catKinds = kinds; else if (kinds === undefined) catKinds = KINDS;
  const y = S.year, m = S.month.budget, Y = S.years[y]; if (!canEdit(y)) return toast(editNote(y));
  const items = Y.budget[m] || [];
  const ed = items.map(i => ({subs: [...(i.subs || [])], bud: i.bud ?? null}));   // 저장 전 고친 내용
  const months = Array.from({length: 13 - m}, (_, i) => m + i);
  const draw = () => {
    const sc = $('#ed').scrollTop;
    openEd(`<h4>${catKinds.length === 1 ? '수입 항목' : catKinds.length === 2 ? '지출 항목' : '분류 관리'} <button class="ex" id="edX">닫기</button></h4>
      <div class="esub">${m < 12 ? `${m}~12월` : '12월'}에 적용돼요 · 항목 이름을 누르면 바꾸거나 지울 수 있어요</div>
      ${catKinds.map(k => { const its = items.filter(i => i.kind === k); return `<div class="ecard"><div class="etitle">${k}</div>${its.map(i => { const x = items.indexOf(i), e = ed[x];
        return `<div class="crow" data-k="${x}"><div class="n"><button class="cname">${esc(i.name)} <span aria-hidden="true">›</span></button></div>
          <div class="echips sm">${e.subs.map((s, j) => `<button class="csub" data-j="${j}">${esc(s)} <b aria-label="삭제">×</b></button>`).join('')}<button class="add cadd">+ 세부분류</button></div></div>`; }).join('')}
        <button class="eadd" data-kind="${k}">+ ${k} 항목 추가</button></div>`; }).join('')}
      <div class="ebar"><div class="t">세부분류는 시트에 저장돼요 · 예산은 예산 탭에서</div><button class="btn" id="edSave">저장</button></div>`, {tall: true});
    $('#ed').scrollTop = sc;
    $('#ed').querySelectorAll('.crow').forEach(r => { const x = +r.dataset.k, e = ed[x], it = items[x];
      r.querySelectorAll('.csub').forEach(b => b.onclick = () => { e.subs.splice(+b.dataset.j, 1); draw(); });
      r.querySelector('.cadd').onclick = () => { const v = (prompt(`${it.name}에 추가할 세부분류`) || '').trim().replace(/,/g, ' ');
        if (!v) return; if (e.subs.includes(v)) return toast('이미 있는 세부분류예요'); e.subs.push(v); draw(); };
      r.querySelector('.cname').onclick = () => itemMenu(it); });
    $('#edX').onclick = closeEd;
    $('#ed').querySelectorAll('.eadd').forEach(b => b.onclick = () => addBudgetItem(m, b.dataset.kind, true));
    $('#edSave').onclick = () => {
      const ops = [];
      items.forEach((it, x) => { const e = ed[x];
        if (e.subs.join(',') === (it.subs || []).join(',')) return;
        for (const mm of months){ const f = findBudget(Y, mm, it.kind, it.name, 0); if (f) ops.push({t: 'cat', y, m: mm, kind: it.kind, name: it.name, subs: [...e.subs], bud: f.bud ?? null}); } });
      closeEd(); if (ops.length) commit(ops); else toast('바뀐 내용이 없어요');
    };
  };
  draw();
}
// 항목 이름 바꾸기 · 지우기 (그 해 모든 달 시트에 적용, 거래가 있는 달은 지우지 않아요)
function itemMenu(it){
  const y = S.year, Y = S.years[y], m = S.month.budget;
  const hasTx = mm => (Y.tx?.[mm] || []).some(t => !t.skip && t.kind === it.kind && t.name === it.name);
  const txMonths = Array.from({length: 12}, (_, i) => i + 1).filter(hasTx);
  openEd(`<h4>${esc(it.name)} <button class="ex" id="edX">뒤로</button></h4>
    <div class="esub">${it.kind} · ${y}년 모든 달에 적용돼요${txMonths.length ? ` · 거래 있는 달: ${txMonths.join(', ')}월` : ''}</div>
    <input id="imName" class="ememo" maxlength="30" value="${esc(it.name)}" placeholder="항목 이름">
    <button class="btn" id="imRen">이름 바꾸기</button>
    <button class="btn ghost danger" id="imDel">항목 삭제</button>`);
  $('#edX').onclick = () => openCats(null);
  $('#imRen').onclick = () => { const to = $('#imName').value.trim().replace(/\|/g, ' ');
    if (!to || to === it.name) return toast('새 이름을 넣어 주세요');
    if (Object.values(Y.budget).some(L => L.some(i => i.kind === it.kind && i.name === to))) return toast(`'${to}' 항목이 이미 있어요`);
    const months = Array.from({length: 12}, (_, i) => i + 1).filter(mm => findBudget(Y, mm, it.kind, it.name, 0));
    commit([{t: 'renB', y, kind: it.kind, name: it.name, to, months}]); openCats(null); };
  $('#imDel').onclick = () => {
    const months = Array.from({length: 12}, (_, i) => i + 1).filter(mm => findBudget(Y, mm, it.kind, it.name, 0) && !hasTx(mm));
    if (!months.length) return toast('모든 달에 거래가 있어 지울 수 없어요. 거래를 다른 항목으로 옮겨 주세요');
    if (!confirm(`'${it.name}' 항목을 지울까요?${txMonths.length ? `\n거래가 있는 ${txMonths.join(', ')}월은 남겨 둬요.` : ''}`)) return;
    commit([{t: 'delB', y, kind: it.kind, name: it.name, months}]); openCats(null); };
}

/* 항목 하나: 이 달 거래 목록 */
function openItemTx(m, idx){
  const y = S.year, Y = S.years[y], it = (Y.budget[m] || [])[idx]; if (!it) return;
  const T = (Y.tx[m] || []).filter(t => !t.skip && t.kind === it.kind && t.name === it.name).sort((a, z) => a.d - z.d), ed = canEdit(y);
  const by = {}; for (const t of T) by[t.sub || '(세부분류 없음)'] = (by[t.sub || '(세부분류 없음)'] || 0) + t.amt;
  openEd(`<h4>${esc(it.name)} <button class="ex" id="edX">닫기</button></h4>
    <div class="esub">${y}년 ${m}월 · ${it.kind} · ${T.length}건 · ${money(it.amt)}${it.bud ? ` · 예산 ${money(it.bud)}` : ''}</div>
    ${Object.keys(by).length > 1 ? `<div class="ecard">${Object.entries(by).sort((a, z) => z[1] - a[1]).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><b class="num">${money(v)}</b></div>`).join('')}</div>` : ''}
    <div class="ecard">${T.map(t => `<div class="row${ed ? ' tap' : ''}" data-tx="${esc(t.id)}"><div class="n">${t.d}일 · ${esc(t.memo && t.memo !== '반복' ? t.memo : (t.sub || t.name))}<small>${esc(t.sub || '')}${t.pay ? ' · ' + esc(t.pay) : ''}</small></div><div class="a num">${fmtWon(t.amt)}</div></div>`).join('') || '<p class="note" style="margin:0">이 달 거래가 없어요</p>'}</div>
    ${ed ? `<input id="itMemo" class="ememo" maxlength="80" placeholder="이 달 메모 (선택)" value="${esc(it.memo)}"><button class="btn" id="itSave">메모 저장</button><button class="btn ghost" id="itCat">세부분류 관리</button>` : ''}`, {tall: T.length > 6});
  $('#edX').onclick = closeEd;
  $('#ed').querySelectorAll('[data-tx]').forEach(el => el.onclick = () => { closeEd(); editTx(el.dataset.tx); });
  if (ed){ $('#itCat').onclick = () => openCats([it.kind]);
    $('#itSave').onclick = () => { const v = $('#itMemo').value.trim(); closeEd(); if (v !== str(it.memo)) commit([{t: 'b', y, m, kind: it.kind, name: it.name, idx: occ(Y.budget[m], it, bKey), f: 'memo', v, o: str(it.memo)}]); }; }
}

/* ───────── 처음 시작 (온보딩) ─────────
   앱 소개 → 시작 방법(구글로 시작 / 앱만 사용 / 예시로 둘러보기) → 목표 금액 → (구글) 새 시트 만들기 또는 기존 시트 고르기 */
S.ob = LS.get('ob', {step: 'intro', path: null});
const saveOb = () => LS.set('ob', S.ob);
function viewOnboard(){
  document.body.classList.add('onboarding');
  const st = S.ob.step, el = $('#view');
  if (st === 'goal'){
    const cur = S.goal.target, opts = [5e8, 1e9, 2e9, 3e9];
    el.innerHTML = `<section class="ob">
      <div class="ob-step">2 / ${S.ob.path === 'google' ? 3 : 2}</div>
      <h2>목표 순자산을 정해 주세요</h2>
      <p class="ob-sub">목표 탭에서 달성 예상 시점과 계획 대비 진행을 보여줘요. 나중에 설정에서 바꿀 수 있어요.</p>
      <div class="ob-chips">${opts.map(v => `<button data-v="${v}"${v === cur ? ' class="on"' : ''}>${money(v)}</button>`).join('')}</div>
      <label class="field"><span>직접 입력 (억원)</span><input id="obGoal" type="number" inputmode="decimal" step="0.5" value="${cur / 1e8}"></label>
      <button class="btn" id="obNext">${S.ob.path === 'google' ? '다음' : '시작하기'}</button>
      <button class="btn ghost" id="obBack">뒤로</button></section>`;
    el.querySelectorAll('.ob-chips button').forEach(b => b.onclick = () => { $('#obGoal').value = +b.dataset.v / 1e8;
      el.querySelectorAll('.ob-chips button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#obBack').onclick = () => { S.ob = {step: 'intro', path: null}; saveOb(); render(); };
    $('#obNext').onclick = () => {
      const v = parseFloat($('#obGoal').value); if (!(v > 0)) return toast('목표 금액을 넣어 주세요');
      S.goal = {...S.goal, target: Math.round(v * 1e8), planYear: new Date().getFullYear()}; LS.set('goal', S.goal);
      if (S.ob.path === 'google'){ S.ob.step = 'google'; saveOb(); return render(); }
      startLocal();
    };
    return;
  }
  if (st === 'google'){
    el.innerHTML = `<section class="ob">
      <div class="ob-step">3 / 3</div>
      <h2>구글 시트를 연결해요</h2>
      <p class="ob-sub">가계부와 자산은 <b>내 구글 드라이브의 시트</b>에 저장돼요. 앱은 내가 고르거나 앱에서 만든 시트만 볼 수 있어요.</p>
      <button class="ob-card" id="obNew"><b>새 시트 만들기</b><span>처음이라면 추천해요. ${new Date().getFullYear()}년 빈 가계부·자산 시트를 드라이브에 만들어요.</span></button>
      <button class="ob-card" id="obPick"><b>이미 쓰던 시트 고르기</b><span>이 앱 양식으로 만든 시트가 있다면 골라 주세요.</span></button>
      <button class="btn ghost" id="obBack">뒤로</button></section>`;
    $('#obNew').onclick = () => gCreate(new Date().getFullYear());
    $('#obPick').onclick = () => gPick();
    $('#obBack').onclick = () => { S.ob.step = 'goal'; saveOb(); render(); };
    return;
  }
  el.innerHTML = `<section class="ob">
    <div class="ob-hero"><div class="ob-logo">₩</div><h2>자산관리</h2>
      <p class="ob-sub">가계부와 자산을 한곳에서 보고, 목표까지 얼마나 왔는지 확인해요.</p></div>
    <ul class="ob-list">
      <li><b>가계부</b><span>수입·지출과 저축률을 달마다 정리해요. 대출 원금 상환도 저축으로 계산해요.</span></li>
      <li><b>자산</b><span>계좌별 잔액으로 순자산과 변화를 그래프로 보여줘요.</span></li>
      <li><b>목표</b><span>지금 속도라면 목표에 언제 닿는지, 계획보다 앞서는지 알려줘요.</span></li>
    </ul>
    <button class="btn" id="obGoogle"><span class="gmark" aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>구글로 시작하기</button>
    <button class="btn alt" id="obLocal">앱만 사용하기</button>
    <button class="btn alt" id="obDemo">예시로 둘러보기</button></section>`;
  $('#obGoogle').onclick = () => { if (!gReady()) return toast('구글 연결 설정이 아직 없어요'); S.ob = {step: 'goal', path: 'google'}; saveOb(); render(); };
  $('#obLocal').onclick = () => { S.ob = {step: 'goal', path: 'local'}; saveOb(); render(); };
  $('#obDemo').onclick = () => loadDemo();
}
function finishOb(){ S.ob = {step: 'done', path: S.ob.path}; saveOb(); document.body.classList.remove('onboarding'); }
function restartOb(){
  if (S.meta.source === 'local' && yearsList().length && !confirm('이 기기에만 저장된 가계부·자산 데이터가 지워져요. 먼저 엑셀로 내보내기를 권해요. 계속할까요?')) return;
  S.years = {}; S.meta = {}; LS.set('years', {}); LS.set('meta', {}); setYear(null);
  S.ob = {step: 'intro', path: null}; saveOb(); closeSheet(); go('home');
}

/* ───────── 앱만 사용하기 (이 기기에 저장) ───────── */
// 새 연도 데이터: 전년도가 있으면 그 항목 구성을 그대로 쓰고(금액은 비움), 없으면 템플릿 항목으로 시작해요.
async function blankYear(y){
  const prev = S.years?.[y - 1] || S.years?.[Math.max(...yearsList().filter(v => v < y))];
  let M;
  if (prev){
    M = {year: y, prevDebt: null, budget: {}, assets: prev.assets.map(a => ({big: a.big, mid: a.mid, small: a.small, v: Array(12).fill(null)}))};
    const last = prev.budget[12]?.length ? prev.budget[12] : Object.values(prev.budget).filter(L => L.length).pop() || [];
    for (let m = 1; m <= 12; m++) M.budget[m] = last.map(i => ({kind: i.kind, name: i.name, amt: 0, memo: '', filled: false, subs: [...(i.subs || [])], bud: i.bud ?? null}));
    if (prev.txMode){ const lr = prev.reps?.[12] || []; Object.assign(M, {txMode: true, tx: {}, reps: {}});
      for (let m = 1; m <= 12; m++){ M.tx[m] = []; M.reps[m] = lr.map(r => ({...r})); } }
    if (S.years[y - 1]){ const d = aMonth(12, y - 1); if (d.has) M.prevDebt = d.debt; }
  } else {
    const r = await fetch('template.xlsx'); if (!r.ok) throw new Error('템플릿을 불러오지 못했어요');
    M = parseWorkbook(await r.arrayBuffer()); M.year = y; M.prevDebt = null;
  }
  return M;
}
async function startLocal(){
  try {
    const y = new Date().getFullYear(), M = await blankYear(y);
    finishOb(); setYears({[y]: M}, {source: 'local'}); S.bview = 'cal'; go('budget');
    toast('준비됐어요. 이번 달 가계부부터 입력해 보세요');
  } catch(e){ toast(e.message); }
}
async function addLocalYear(){
  const ys = yearsList(), next = ys.length ? Math.max(...ys) + 1 : new Date().getFullYear();
  const ans = prompt('추가할 연도', String(next)); if (ans == null) return;
  const y = parseInt(ans, 10); if (!(y >= 2000 && y <= 2100)) return toast('연도를 숫자로 넣어 주세요');
  if (S.years[y]) return toast(`${y}년은 이미 있어요`);
  const M = await blankYear(y); S.years[y] = M; LS.set('years', S.years); setYear(y); closeSheet(); render();
  toast(`${y}년을 추가했어요${y - 1 in S.years ? ' (전년도 항목 구성을 가져왔어요)' : ''}`);
}

/* ───────── 엑셀로 내보내기 (백업·다른 기기로 옮기기) ─────────
   앱이 다시 읽을 수 있는 형식(설정·1~12월·자산관리)으로 연도별 파일을 만들어요. 서식·수식·그래프는 없어요. */
function exportYear(y){
  const M = S.years[y]; if (!M) return;
  const wb = XLSX.utils.book_new();
  const st = [['기준 연도', y], ['전년 12월 말 부채', M.prevDebt ?? ''], [], ['이 파일은 자산관리 앱에서 내보낸 백업이에요. 앱 설정 탭 → "엑셀 파일 가져오기"로 다시 불러올 수 있어요.']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(st), '설정');
  for (let m = 1; m <= 12; m++){
    const rows = [[`${m}월 가계부`], [], ['구분(1차)', '항목(2차)', '금액', '메모']];
    if (!M.txMode){
      for (const i of M.budget[m] || []) rows.push([i.kind, i.name, i.filled ? i.amt : null, i.memo || null]);
      rows.push(['▲ 항목 추가 시 이 행 위에 행 삽입']);
    } else {   // 새 양식: 왼쪽 요약·달력·구분별 표, 오른쪽 반복 거래(위)·거래 내역(아래) — 값만 (수식 없음)
      const its = M.budget[m] || [], T = (M.tx[m] || []).slice().sort((a, z) => a.d - z.d), P = M.reps[m] || [];
      const put = (r, c, v) => { while (rows.length <= r) rows.push([]); const R = rows[r]; while (R.length < c) R.push(null); R[c] = v; };
      rows.length = 0; put(0, 0, `${y}년 ${m}월 가계부`);
      const b = bMonth(m, y), live = T.filter(t => !t.skip), bud = its.filter(i => i.kind !== '수입').reduce((a, i) => a + (i.bud || 0), 0);
      put(3, 0, '요약');
      [['총 수입', b.income], ['고정비', b.fixed], ['변동비', b.variable], ['총 지출', b.expense], ['일반 저축', b.cash], ['대출상환 저축', b.repay], ['저축 합계', b.saving]]
        .forEach(([k, v], j) => { put(4, j, k); put(5, j, v); });
      [['저축률', b.rate], ['지출 예산', bud || null], ['예산 남은 금액', bud ? bud - b.expense : null]].forEach(([k, v], j) => { put(6, j, k); put(7, j, v); });
      put(9, 0, '달력 · 날짜별 지출'); WD.forEach((w, k) => put(10, k, w));
      const off = new Date(y, m - 1, 1).getDay(), nd = daysIn(y, m);
      for (let d = 1; d <= nd; d++){ const i = off + d - 1, w = Math.floor(i / 7), k = i % 7;
        const v = live.filter(t => t.d === d && t.kind !== '수입').reduce((a, t) => a + t.amt, 0);
        put(11 + w * 2, k, d); put(12 + w * 2, k, v || null); }
      const T0 = 42; put(T0 - 2, 0, '항목별 합계');
      ['구분(1차)', '항목(2차)', '금액', '메모', '월 예산'].forEach((h, j) => put(T0 - 1, j, h)); put(T0 - 1, 7, '세부분류');
      its.forEach((it, i) => { [it.kind, it.name, it.amt, it.memo || null, it.bud ?? null].forEach((v, j) => put(T0 + i, j, v)); put(T0 + i, 7, (it.subs || []).join(', ') || null); });
      put(T0 + its.length, 0, '▲ 항목 추가 시 이 행 위에 행 삽입');
      const RC = 8, RH = 3, cap = Math.max(20, P.length), TH = RH + cap + 3;
      put(RH - 1, RC, '반복 거래 · 매달 이 날짜에 거래 내역으로 자동 입력');
      ['일', '구분', '항목', '세부분류', '금액', '결제수단', '메모'].forEach((h, j) => put(RH, RC + j, h));
      P.forEach((r, i) => repRow(r).forEach((v, j) => put(RH + 1 + i, RC + j, v === '' ? null : v)));
      put(TH - 1, RC, '거래 내역 · 앱에서 입력하면 아래로 쌓여요 (ID는 앱이 써요)');
      ['일', '구분', '항목', '세부분류', '금액', '결제수단', '메모', 'ID'].forEach((h, j) => put(TH, RC + j, h));
      T.forEach((t, i) => txRow(t).forEach((v, j) => put(TH + 1 + i, RC + j, v === '' ? null : v)));
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `${m}월`);
  }
  const ar = [['자산관리'], [], ['대분류', '중분류', '소분류', ...Array.from({length: 12}, (_, i) => `${i + 1}월`)]];
  for (const a of M.assets) ar.push([a.big, a.mid, a.small, ...a.v.map(v => v ?? null)]);
  ar.push(['▲ 항목 추가 시 이 행 위에 행 삽입']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ar), '자산관리');
  XLSX.writeFile(wb, `자산관리_${y}_백업.xlsx`);
}
function exportAll(){
  const ys = yearsList(); if (!ys.length) return toast('내보낼 데이터가 없어요');
  ys.forEach((y, i) => setTimeout(() => exportYear(y), i * 400));
  toast(`${ys.length}개 연도를 엑셀 파일로 내보냈어요`);
}

/* ───────── 시작 ───────── */
applyTheme();
['token','authState','clientId','fileRef'].forEach(k => LS.del(k));   // 이전 로그인 방식 흔적 정리
if (!S.years){ const m = LS.get('model', null); S.years = m ? {[m.year]: m} : {}; LS.set('years', S.years); LS.del('model'); }
if (S.ob.step !== 'done' && (S.gfiles.length || (S.model && S.meta.source !== 'demo'))) { S.ob.step = 'done'; saveOb(); }   // 기존 사용자
setYear(S.year);
render();
if (S.meta.source === 'local') applyReps();
const gPending = gReturn();
if (gPending === 'pick') gPick();
else if (gPending && gPending.startsWith('create:')) gCreate(+gPending.slice(7));
const stale = () => S.gfiles.length && Date.now() - (S.meta.syncedAt || 0) > 60 * 1000;
if (S.queue.length) flushQueue(false);   // 지난번에 못 쓴 입력부터 저장
if (gPending === 'sync' && S.gfiles.length) syncGoogle(true);
else if (!gPending && S.gfiles.length && (S.meta.source !== 'file' && S.meta.source !== 'demo' || !S.model) && stale()) syncNow(false);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.meta.source === 'google' && stale()) syncNow(false);
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
