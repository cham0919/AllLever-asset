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
  tab: (t => t === 'report' ? 'budget' : t)(LS.get('tab','home')),
  reportOpen: false,   // 가계부 안의 월말 레포트 화면
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
  goal: Object.assign({target:3e9, planRate:0.25, planSave:3e7, planYear:2025, planBase:null}, LS.get('goal', {})),
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

  const budget = {};
  for (let m=1; m<=12; m++){
    const R = rows(m+'월'); const items = [];
    if (R){
      let i = R.findIndex(r => str(r[0]).startsWith('구분'));
      if (i >= 0) for (i=i+1; i<R.length; i++){
        const r = R[i], k = str(r[0]);
        if (k.startsWith('▲')) break;
        if (!KINDS.includes(k)) continue;
        const name = str(r[1]), amt = toNum(r[2]);
        if (!name && amt==null) continue;
        items.push({kind:k, name: name || '(이름 없음)', amt: amt ?? 0, memo: str(r[3]), filled: amt!=null});
      }
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
  // 결산 시트: 1행 머리글(연월·작성일·제목·한 줄 요약·본문·상태), 한 달에 한 줄
  const reports = {};
  const RP = rows('결산');
  if (RP){
    const h = RP.findIndex(r => r.some(c => str(c) === '연월'));
    if (h >= 0){
      const col = name => RP[h].findIndex(c => str(c).replace(/\s/g,'') === name);
      const ix = {ym: col('연월'), date: col('작성일'), title: col('제목'), summary: col('한줄요약'), body: col('본문'), status: col('상태')};
      const ymOf = v => {
        if (typeof v === 'number'){ const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; }
        const m = /(\d{4})\D+(\d{1,2})/.exec(str(v)); return m ? `${m[1]}-${m[2].padStart(2,'0')}` : null;
      };
      const dateOf = v => typeof v === 'number' ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0,10) : str(v);
      for (let i = h + 1; i < RP.length; i++){
        const r = RP[i], ym = ymOf(r[ix.ym]); if (!ym) continue;
        const body = ix.body >= 0 ? str(r[ix.body]) : '', summary = ix.summary >= 0 ? str(r[ix.summary]) : '';
        if (!body && !summary) continue;
        reports[ym] = {ym, date: ix.date >= 0 ? dateOf(r[ix.date]) : '', title: ix.title >= 0 ? str(r[ix.title]) : '', summary, body,
                       status: ix.status >= 0 ? str(r[ix.status]) : ''};
      }
    }
  }
  return {year, budget, assets, prevDebt, reports};
}

/* ───────── 계산 ───────── */
// 자산 묶음은 모두 중분류 이름으로 정한다. 소분류(항목) 이름은 자유롭게 바꾸거나 추가해도 된다.
// 대분류(유동자산·비유동자산·부채)와 아래 중분류 이름은 시트와 같아야 한다.
const MIDS = {
  invest: ['투자', '퇴직금', '코인'],   // 홈 '금융투자'
  cash:   ['저축', '청약'],             // 홈 '현금'
  estate: ['부동산'],                   // 홈 '부동산'
  stock:  ['투자', '퇴직금'],           // 자산 탭 '주식 수익률' (중분류 '코인'은 제외)
};
const inMids = (mids, a) => a.big !== '부채' && mids.includes(a.mid);
const HOME_GROUPS = {
  invest: {label:'금융투자', note:'중분류 ' + MIDS.invest.join(' · '), match: a => inMids(MIDS.invest, a)},
  estate: {label:'부동산',   note:'중분류 ' + MIDS.estate.join(' · '), match: a => inMids(MIDS.estate, a)},
  cash:   {label:'현금',     note:'중분류 ' + MIDS.cash.join(' · '),   match: a => inMids(MIDS.cash, a)},
};
const RETURN_GROUPS = [
  {name:'주식',   label:'주식 수익률',   note:'중분류 ' + MIDS.stock.join(' + '),  match: a => inMids(MIDS.stock, a)},
  {name:'부동산', label:'부동산 수익률', note:'중분류 ' + MIDS.estate.join(' + '), match: a => inMids(MIDS.estate, a)},
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
// 연평균 수익률(CAGR): 값이 처음 0보다 컸던 달 → 현재
function cagr(pts, fn){
  const cur = pts.at(-1), v1 = fn(cur), st = pts.find(x => fn(x) > 0);
  if (!st || st === cur || v1 <= 0) return null;
  const n = monthsBetween(st, cur), v0 = fn(st);
  return {rate: Math.pow(v1 / v0, 12 / n) - 1, n, from: st, total: v1 / v0 - 1};
}
function viewHome(){
  const pts = assetPoints();
  if (!pts.length){ $('#view').innerHTML = `<div class="empty"><b>자산 데이터가 없어요</b>엑셀 '자산관리' 시트에 입력하면 홈에 표시돼요.</div>`; return; }
  const cur = pts.at(-1), G = HOME_GROUPS;
  const inv = grpSum(G.invest, cur), est = grpSum(G.estate, cur), cash = grpSum(G.cash, cur);
  const list = S.years[cur.y].assets;
  const loose = list.filter(a => a.big !== '부채' && !Object.values(G).some(g => g.match(a)));
  const looseSum = loose.reduce((s, a) => s + cur.val(a), 0);
  const rTotal = cagr(pts, x => x.total), rNet = cagr(pts, x => x.net),
        rInv = cagr(pts, x => grpSum(G.invest, x)), rEst = cagr(pts, x => grpSum(G.estate, x));
  const span = rTotal || rNet;
  const foot = (r) => r ? `<div class="f"><span>연평균</span><b class="num ${dir(r.rate)}">${pct(r.rate, 2)}</b></div>`
                        : `<div class="f"><span>연평균</span><span>-</span></div>`;
  const tot = Math.max(cur.total, 1);
  const prevX = pts.length > 1 ? pts.at(-2) : null;
  $('#view').innerHTML = `
  <section class="card hero">
    <div class="label">${cur.y}년 ${cur.m}월 말 순자산</div>
    <div class="big num">${money(cur.net)}</div>
    <div class="sub">${prevX ? `${prevX.y !== cur.y ? prevX.y + '년 ' : ''}${prevX.m}월 대비 <span class="${dir(cur.net - prevX.net)}">${signed(cur.net - prevX.net)}</span>` : '첫 기록이에요'}</div>
    <div class="sub" style="font-size:12px;margin-top:14px">총자산 구성</div>
    <div class="flow" style="margin-top:6px"><i style="width:${inv/tot*100}%;background:var(--accent)"></i><i style="width:${est/tot*100}%;background:var(--fixed)"></i><i style="width:${cash/tot*100}%;background:var(--saving)"></i>${looseSum?`<i style="width:${looseSum/tot*100}%;background:var(--faint)"></i>`:''}</div>
    <div class="flow-lg"><span>금융투자 ${pctPlain(inv/tot,0)}</span><span>부동산 ${pctPlain(est/tot,0)}</span><span>현금 ${pctPlain(cash/tot,0)}</span></div>
  </section>
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
  <p class="note" style="margin:0 4px 12px">${span ? `연평균 수익률: ${span.from.y}년 ${span.from.m}월 → ${cur.y}년 ${cur.m}월 (${span.n}개월) 잔액 기준 연환산${span.n < 12 ? ' · <b>1년 미만 기간이라 실제보다 크게 보일 수 있어요</b>' : ''}. 저축·추가 납입도 포함돼요.` : '연평균 수익률은 두 달 이상 기록이 쌓이면 표시돼요.'}
  현금비중은 순자산 대비예요.</p>`;
}

/* ───────── 화면: 결산 ───────── */
// 간단한 마크다운 → HTML (제목 ##, 목록 -, 굵게 **, 표 |). 먼저 HTML을 이스케이프해서 안전하게 표시
function md(src){
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = String(src || '').replace(/\r/g, '').split('\n'), out = [];
  let i = 0;
  while (i < lines.length){
    const ln = lines[i];
    if (!ln.trim()){ i++; continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(ln))){ const lv = Math.max(2, m[1].length); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); i++; continue; }
    if (/^\s*\|/.test(ln)){
      const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r.replace(/\|/g, ' | ').trim()) && !/^[\s|:-]+$/.test(r));
      const [head, ...rest] = body;
      out.push(`<table class="num"><thead><tr>${cells(head).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln)){
      const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])){ const l = lines[i++]; items.push({lv: l.match(/^\s*/)[0].length >= 2 ? 1 : 0, t: l.replace(/^\s*[-*]\s+/, '')}); }
      let h = '<ul>', open = false;
      items.forEach((it, k) => {
        if (it.lv === 1 && !open){ h = h.replace(/<\/li>$/, ''); h += '<ul>'; open = true; }
        if (it.lv === 0 && open){ h += '</ul></li>'; open = false; }
        h += `<li>${inline(it.t)}</li>`;
      });
      if (open) h += '</ul></li>';
      out.push(h + '</ul>'); continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*\||\s*[-*]\s+)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}
const allReports = () => Object.values(S.years || {}).flatMap(M => Object.values(M.reports || {})).sort((a, b) => b.ym.localeCompare(a.ym));
function viewReport(){
  const m = S.month.budget, y = S.year, b = bMonth(m, y), pb = bMonth(m - 1, y), yb = bMonth(m, y - 1);
  const ym = `${y}-${String(m).padStart(2,'0')}`;
  const rp = (S.years[y]?.reports || {})[ym];
  const A = analysis(m), c = A.c;
  const list = allReports();

  // 평소보다 많이/적게 쓴 항목: 직전 최대 6개월(입력된 달) 평균과 비교
  let unusual = [];
  if (b.has){
    const prevMonths = []; for (let k = 1; k <= 12 && prevMonths.length < 6; k++){ const x = bMonth(m - k, y); if (x.has) prevMonths.push(x); }
    if (prevMonths.length){
      const avgOf = name => prevMonths.reduce((s, x) => s + x.items.filter(i => i.name === name && i.kind !== '수입').reduce((a, i) => a + i.amt, 0), 0) / prevMonths.length;
      const names = [...new Set(b.items.filter(i => i.kind !== '수입').map(i => i.name))];
      unusual = names.map(n => { const cur = b.items.filter(i => i.name === n && i.kind !== '수입').reduce((a, i) => a + i.amt, 0), av = avgOf(n); return {n, cur, av, d: cur - av}; })
        .filter(x => Math.abs(x.d) >= Math.max(100000, Math.abs(x.av) * 0.2)).sort((p, q) => Math.abs(q.d) - Math.abs(p.d)).slice(0, 4);
      unusual.months = prevMonths.length;
    }
  }
  const row = (k, v, pv, yv) => `<span class="k">${k}</span><span class="v num">${money(v)}</span>
    <span class="d num">${pv != null ? `<span class="${dir(v - pv)}">${signed(v - pv)}</span>` : '<span class="muted">-</span>'}</span>`;
  const T = S.goal.target, prog = c.has ? c.net / T : null, pprog = A.prevOk ? A.p.net / T : null;

  $('#view').innerHTML = !b.has && !c.has && !rp ? `<div class="empty"><b>${m}월 결산할 데이터가 없어요</b>가계부나 자산을 입력하면 자동 결산이 표시돼요.</div>` : `
  <section class="card">
    <h3>${y}년 ${m}월 자동 결산 <small>앱 계산</small></h3>
    ${b.has ? `<div class="chg">
      <span class="k" style="font-size:12px">항목</span><span class="k" style="font-size:12px;text-align:right">${m}월</span><span class="k" style="font-size:12px;text-align:right">전월 대비</span>
      ${row('수입', b.income, pb.has ? pb.income : null)}
      ${row('지출', b.expense, pb.has ? pb.expense : null)}
      ${row('일반 저축', b.cash, pb.has ? pb.cash : null)}
      ${row('대출상환 저축', b.repay, pb.has ? pb.repay : null)}
      ${row('<b style="color:var(--ink)">저축 합계</b>', b.saving, pb.has ? pb.saving : null)}
      <span class="k">저축률</span><span class="v num">${pctPlain(b.rate)}</span><span class="d num">${pb.has ? `<span class="${dir(b.rate - pb.rate)}">${(b.rate - pb.rate >= 0 ? '+' : '') + ((b.rate - pb.rate) * 100).toFixed(1)}%p</span>` : '-'}</span>
    </div>
    ${yb.has ? `<p class="note">전년 동월(${y - 1}년 ${m}월) 대비 · 지출 <span class="${dir(b.expense - yb.expense)}">${signed(b.expense - yb.expense)}</span> · 저축 합계 <span class="${dir(b.saving - yb.saving)}">${signed(b.saving - yb.saving)}</span></p>` : ''}` : '<p class="note">이 달의 가계부가 아직 입력되지 않았어요.</p>'}
  </section>

  ${(() => { // 투자 성과: 홈의 금융투자 묶음 + 부동산, 전월 대비 (잔액 기준)
    if (!A.prevOk) return '';
    const list2 = S.years[y].assets, G = HOME_GROUPS;
    const grp = [['금융투자', list2.filter(G.invest.match)], ['부동산', list2.filter(G.estate.match)]].filter(g => g[1].length);
    const item = a => { const v = c.val(a), pv = A.p.val(a), d = v - pv;
      return `<div class="row sub-row"><div class="n">${esc(a.small)}</div><div class="a num">${money(v)}<span class="d ${dir(d)}">${d ? signed(d) + (pv ? ` (${pct(d / pv, 1)})` : '') : '변동 없음'}</span></div></div>`; };
    return `<section class="card"><h3>투자 성과 <small>전월 대비 · 잔액 기준</small></h3>
      ${grp.map(([n, its]) => { const v = its.reduce((s2, a) => s2 + c.val(a), 0), pv = its.reduce((s2, a) => s2 + A.p.val(a), 0), d = v - pv;
        return `<div class="group"><div class="gh"><span><span class="tag">${n}</span></span><span class="num" style="text-align:right">${money(v)}<span class="${dir(d)}" style="display:block;font-size:12px;font-weight:500">${d ? signed(d) + (pv ? ` (${pct(d / pv, 1)})` : '') : '변동 없음'}</span></span></div>${its.filter(a => c.val(a) || A.p.val(a)).map(item).join('')}</div>`; }).join('')}
      <p class="note">추가 매수·납입도 포함된 잔액 변화예요. 시황 해석은 아래 월간 레포트에 있어요.</p></section>`; })()}

  ${unusual.length ? `<section class="card"><h3>평소와 달랐던 지출 <small>직전 ${unusual.months}개월 평균 대비</small></h3>
    ${unusual.map(x => `<div class="row"><div class="n">${esc(x.n)}<span class="memo">평균 ${money(x.av)}</span></div><div class="a num">${money(x.cur)}<span class="d ${dir(x.d)}">${signed(x.d)}</span></div></div>`).join('')}
  </section>` : ''}

  ${c.has ? `<section class="card"><h3>순자산 변동 <small>${A.prevOk ? '전월 대비' : '전월 자산 없음'}</small></h3>
    <div class="big2 num ${A.prevOk ? dir(A.dNet) : ''}">${A.prevOk ? signed(A.dNet) : money(c.net)}</div>
    ${A.prevOk ? `<div class="flow" style="margin-top:12px">${A.saving > 0 ? `<i style="width:${Math.min(100, A.saving / Math.max(Math.abs(A.saving) + Math.abs(A.other), 1) * 100)}%;background:var(--saving)"></i>` : ''}<i style="width:${Math.min(100, Math.abs(A.other) / Math.max(Math.abs(A.saving) + Math.abs(A.other), 1) * 100)}%;background:${A.other >= 0 ? 'var(--accent)' : 'var(--expense)'}"></i></div>
    <div class="stats" style="margin-top:8px">
      <div class="stat"><div class="t"><i class="dot" style="background:var(--saving)"></i> 저축 합계</div><div class="v num">${signed(A.saving)}</div></div>
      <div class="stat"><div class="t"><i class="dot" style="background:var(--accent)"></i> 저축 외 변동</div><div class="v num ${dir(A.other)}">${signed(A.other)}</div><div class="h">투자손익 · 시세 (${A.rOther != null ? pct(A.rOther, 2) : '-'})</div></div>
      <div class="stat"><div class="t">월말 순자산</div><div class="v num">${money(c.net)}</div></div>
      <div class="stat"><div class="t">목표 ${T / 1e8}억 진척도</div><div class="v num">${pctPlain(prog, 1)}</div><div class="h">${pprog != null ? `전월 대비 ${((prog - pprog) * 100 >= 0 ? '+' : '') + ((prog - pprog) * 100).toFixed(2)}%p` : ''}</div></div>
    </div>` : ''}
  </section>` : ''}

  <section class="card">
    <h3>월간 레포트 ${rp ? `<span class="badge ${rp.status === '확정' ? 'final' : 'draft'}">${esc(rp.status || '초안')}</span>` : ''}</h3>
    ${rp ? `<div style="font-size:18px;font-weight:800;letter-spacing:-.02em">${esc(rp.title || ym + ' 결산')}</div>
      <div class="note" style="margin:2px 0 0">작성 ${esc(rp.date || '-')}</div>
      ${rp.summary ? `<div class="quote">${esc(rp.summary)}</div>` : ''}
      <div class="md">${md(rp.body)}</div>`
    : `<p class="note" style="margin:0">${y}년 ${m}월 레포트가 아직 없어요. 스프레드시트의 '결산' 시트에 레포트가 기록되면 여기에 표시돼요.</p>`}
  </section>

  <section class="card"><h3>지난 결산 <small>${list.length}개</small></h3>
    ${list.length ? list.map(r => `<button class="rep ${r.ym === ym ? 'on' : ''}" data-ym="${r.ym}"><div class="r1"><span>${esc(r.title || r.ym)}</span><span class="badge ${r.status === '확정' ? 'final' : 'draft'}">${esc(r.status || '초안')}</span></div>
      <div class="r2">${esc(r.summary)}</div></button>`).join('') : '<p class="note" style="margin:0">아직 기록된 레포트가 없어요.</p>'}
  </section>`;
  document.querySelectorAll('.rep').forEach(btn => btn.onclick = () => {
    const [yy, mm] = btn.dataset.ym.split('-').map(Number);
    if (!S.years[yy]) return toast(`${yy}년 파일이 등록되어 있지 않아요`);
    setYear(yy); S.month.budget = mm; window.scrollTo(0, 0); render();
  });
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
  const MS = [5e8, 10e8, 20e8].filter(v => v < T).concat([T]);
  const msRow = v => {
    const got = pts.find(x => x.net >= v);
    const pk = got ? null : proj.vals.findIndex(x => x >= v);
    let pi = null; for (let i = plan.start; i < plan.start + 12 * plan.ends.length; i++){ const pv = plan.at(i); if (pv != null && pv >= v){ pi = i; break; } }
    const right = got ? `<b>${got.y}년 ${got.m}월 달성</b>`
      : pk >= 0 ? `<b>예상 ${ymText(curI + pk)}</b><small>${durText(pk)} 후${pi != null ? ` · 계획 ${ymText(pi)}` : ''}</small>`
      : '<b>-</b>';
    return `<div class="ms ${got ? 'done' : ''}"><div class="ck">${got ? '✓' : ''}</div><div class="n">${v / 1e8}억</div><div class="r">${right}</div></div>`;
  };

  // FIRE: 금융자산(홈의 금융투자 + 현금) 전부 8% 배당 → 세후 75%
  const G = HOME_GROUPS, inv = grpSum(G.invest, cur), cash = grpSum(G.cash, cur), fin = inv + cash;
  // 원금 선택: 금융자산(부동산 제외) 또는 순자산 전체(부동산 매각·부채 상환 후 남는 돈)
  const useNet = S.fireBase === 'net', principal = useNet ? Math.max(cur.net, 0) : fin;
  const divYear = principal * 0.08 * 0.75, divMonth = divYear / 12, goalMonth = T * 0.08 * 0.75 / 12;
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

  <section class="card"><h3>FIRE · 배당 전환 시 <small>연 8% · 세후 75%</small></h3>
    <div class="seg" id="segFire" style="margin-bottom:14px"><button data-v="fin">금융자산</button><button data-v="net">순자산 전체</button></div>
    <div class="t" style="font-size:13px;color:var(--sub);font-weight:600">지금 ${useNet ? '순자산을 모두' : '금융자산을 모두'} 배당에 넣으면 매달</div>
    <div class="big2 num" style="color:var(--saving);margin-top:4px">${money(divMonth)}</div>
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="t">${useNet ? '순자산 원금' : '금융자산 원금'}</div><div class="v num">${money(principal)}</div>
        <div class="h">${useNet ? `총자산 ${money(cur.total)} − 부채 ${money(cur.debt)}` : `금융투자 ${money(inv)} + 현금 ${money(cash)}`}</div></div>
      <div class="stat"><div class="t">연 실수령 배당</div><div class="v num">${money(divYear)}</div><div class="h">원금 × 8% × 75%</div></div>
      <div class="stat"><div class="t">월 지출 대비</div><div class="v num">${cover != null ? pctPlain(cover, 0) : '-'}</div><div class="h">최근 평균 지출 ${money(inp.expense)}</div></div>
      <div class="stat"><div class="t">${T / 1e8}억 달성 시 월 배당</div><div class="v num">${money(goalMonth)}</div><div class="h">목표액 전부 배당 가정</div></div>
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
  const m = S.month.budget, b = bMonth(m), pb = bMonth(m-1);
  if (!b.has) return emptyMonth(m, '가계부');
  const ed = canEdit();
  const dExp = pb.has ? b.expense - pb.expense : null;
  const dSav = pb.has ? b.saving - pb.saving : null;
  const exItems = b.items.filter(i=>i.kind!=='수입' && i.amt>0).sort((x,y)=>y.amt-x.amt);
  const flowTot = Math.max(b.income, b.expense, 1);
  let html = `${ed ? `<div class="ebtnrow"><button class="btn" data-act="editBudget">✎ ${m}월 한꺼번에 입력</button></div>` : ''}
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
  </div>
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
  if (exItems.length) html += `
  <section class="card">
    <h3>지출 구성 <small>${exItems.length}개 항목</small></h3>
    <div class="donut"><canvas id="cExp"></canvas><div class="center"><div><b class="num" style="font-size:18px">${money(b.expense)}</b><span>총 지출</span></div></div></div>
    <div class="legend">${exItems.map((i,k)=>`
      <div class="lg"><i class="dot" style="background:${PALETTE[k%PALETTE.length]}"></i><span class="n">${esc(i.name)} <span class="muted" style="font-size:12px">${i.kind}</span></span><span class="p num">${pctPlain(i.amt/b.expense,0)}</span><span class="a num">${money(i.amt)}</span></div>`).join('')}</div>
  </section>`;
  html += `<section class="card"><h3>상세 내역${ed ? ' <small>항목을 누르면 고칠 수 있어요</small>' : ''}</h3>${KINDS.map(k=>{
    const its = b.items.filter(i=>i.kind===k); if (!its.length) return '';
    const tot = its.reduce((a,i)=>a+i.amt,0), color = k==='수입'?'--income':k==='고정비'?'--fixed':'--expense';
    const max = Math.max(...its.map(i=>Math.abs(i.amt)),1);
    const prevMap = {}; pb.items.filter(i=>i.kind===k).forEach(i=>prevMap[i.name]=(prevMap[i.name]||0)+i.amt);
    return `<div class="group"><div class="gh"><span><span class="tag">${k}</span></span><span class="num">${money(tot)}</span></div>
      ${its.map(i=>{ const d = pb.has && prevMap[i.name]!=null ? i.amt - prevMap[i.name] : null;
        const pend = S.queue.some(o => o.t === 'b' && o.y === S.year && o.m === m && o.kind === i.kind && o.name === i.name);
        return `<div class="row${ed ? ' tap' : ''}${i.filled ? '' : ' empty'}"${ed ? ` data-act="eb" data-k="${m}|${b.items.indexOf(i)}" role="button" tabindex="0"` : ''}><div class="n">${esc(i.name)}${pend ? '<span class="memo pend">저장 대기</span>' : i.memo?`<span class="memo">${esc(i.memo)}</span>`:''}
          <div class="bar"><i style="width:${Math.abs(i.amt)/max*100}%;background:var(${color})"></i></div></div>
          <div class="a num">${i.filled ? money(i.amt) : '입력 안 함'}${d && i.filled?`<span class="d ${dir(d)}">${signed(d)}</span>`:''}</div>${ed ? '<span class="pen" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span>' : ''}</div>`;}).join('')}
      ${ed ? `<button class="eadd" data-act="addB" data-kind="${k}">+ ${k} 항목 추가</button>` : ''}</div>`;
  }).join('')}</section>`;
  $('#view').innerHTML = html;
  donut('cFlow', ['고정비','변동비','일반 저축'], [b.fixed,b.variable,Math.max(b.cash,0)], [css('--fixed'),css('--expense'),css('--saving')]);
  if (exItems.length) donut('cExp', exItems.map(i=>i.name), exItems.map(i=>i.amt), exItems.map((_,k)=>PALETTE[k%PALETTE.length]));
}

/* ───────── 화면: 월별추이 ───────── */
function viewTrend(){
  const ms = Array.from({length:12},(_,i)=>bMonth(i+1)), on = ms.filter(x=>x.has);
  if (!on.length) return emptyMonth(null, '가계부');
  const tot = k => on.reduce((a,x)=>a+x[k],0);
  const inc = tot('income'), exp = tot('expense'), sav = tot('saving'), cash = tot('cash'), rep = tot('repay');
  const nul = (x,k) => x.has ? x[k] : null;
  const cum = k => { let c = 0; return ms.map(x => { if (!x.has) return null; c += x[k]; return c; }); };
  const share = v => sav ? pctPlain(v/sav, 0) : '-';
  $('#view').innerHTML = `
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
  document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => { const m=+tr.dataset.m; if (!bMonth(m).has) return; S.month.budget = m; go('budget'); });
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
  ${ytd ? `<section class="card"><h3>1월 대비 현재 <small>1월 → ${L}월${L<TM?` · ${TM}월 미입력`:''}</small></h3>
    <div class="stats">${ytd.map(([n,a,b,note])=>`
      <div class="stat"><div class="t">${n}</div><div class="v num ${dir(b-a)}" style="font-size:22px">${a?pct((b-a)/Math.abs(a),2):'-'}</div>
        <div class="h" style="color:var(--sub)"><span class="${dir(b-a)}" style="white-space:nowrap">${signed(b-a)}</span> · <span style="white-space:nowrap">${money(a)}</span> → <span style="white-space:nowrap">${money(b)}</span></div>
        ${note?`<div class="h">${note}</div>`:''}</div>`).join('')}
    </div></section>` : ''}
  <section class="card"><h3>${m}월 자산 분석 <small>전월 대비</small></h3>
    ${A.prevOk ? `<div class="stats">
      <div class="stat"><div class="t">순자산 증감</div><div class="v num ${dir(A.dNet)}">${signed(A.dNet)}</div></div>
      <div class="stat"><div class="t">순자산 수익률</div><div class="v num ${dir(A.dNet)}">${A.rNet!=null?pct(A.rNet,2):'-'}</div><div class="h">순자산 증감 ÷ 전월 순자산</div></div>
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
  $('#view').innerHTML = !S.model ? `
    <div class="empty"><b>아직 불러온 데이터가 없어요</b>설정에서 구글 시트를 연결하거나<br>예시 데이터로 먼저 둘러보세요.
      <div style="margin-top:20px;max-width:320px;margin-inline:auto"><button class="btn" data-act="openSheet">설정 열기</button><button class="btn ghost" data-act="loadDemo">예시 데이터로 보기</button></div></div>`
    : `<div class="empty"><b>${m?m+'월 ':''}${what} 데이터가 없어요</b>${m && canEdit() ? '앱에서 바로 입력할 수 있어요.' : '시트의 ' + (what==='자산'?"'자산관리' 시트 "+(m||'')+"월 열":(m||'')+"월 시트") + '에 입력하면 여기에 표시돼요.'}
      ${m && canEdit() ? `<div style="margin-top:20px;max-width:320px;margin-inline:auto"><button class="btn" data-act="${what==='자산'?'editAsset':'editBudget'}">${m}월 ${what==='자산'?'잔액':'가계부'} 입력하기</button></div>` : ''}</div>`;
}

/* ───────── 라우팅 ───────── */
const TITLES = {home:'홈', budget:'가계부', trend:'월별추이', asset:'자산', analysis:'분석'};
function render(){
  killCharts();
  const inReport = S.tab === 'budget' && S.reportOpen;
  $('#title').innerHTML = (inReport ? '월말 레포트' : TITLES[S.tab]) + (S.meta.source==='demo' ? '<span class="demo-badge">예시</span>' : '');
  $('#backBtn').hidden = !inReport;
  $('#repBtn').hidden = !(S.tab === 'budget' && !inReport && S.model);
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab===S.tab));
  const key = S.tab==='asset' ? 'asset' : 'budget';
  const step = $('#stepper'); step.style.display = (S.model && S.tab !== 'home' && S.tab !== 'analysis') ? 'flex' : 'none';
  if (S.model){
    const fn = key==='asset' ? aMonth : bMonth;
    if (S.month[key]==null) S.month[key] = lastWith(fn);
    $('#selY').innerHTML = yearsList().map(y => `<option value="${y}"${y===S.year?' selected':''}>${y}년</option>`).join('');
    const trend = S.tab==='trend';
    $('#selMWrap').style.display = trend ? 'none' : '';
    if (!trend) $('#selM').innerHTML = Array.from({length:12}, (_,i) => i+1).map(m =>
      `<option value="${m}"${m===S.month[key]?' selected':''}>${m}월${fn(m).has?'':' · 미입력'}</option>`).join('');
    $('#prevM').disabled = !canShift(-1); $('#nextM').disabled = !canShift(1);
    $('#prevM').setAttribute('aria-label', trend ? '이전 연도' : '이전 달'); $('#nextM').setAttribute('aria-label', trend ? '다음 연도' : '다음 달');
  }
  updateStatus();
  if (S.model){   // 이 달 레포트가 있으면 버튼에 빨간 점
    const m = S.month.budget, ym = `${S.year}-${String(m).padStart(2,'0')}`;
    $('#repDot').hidden = !(S.years[S.year]?.reports || {})[ym];
  }
  if (!S.model) return emptyMonth(null, '');
  if (inReport) return viewReport();
  ({home:viewHome, budget:viewBudget, trend:viewTrend, asset:viewAsset, analysis:viewAnalysis})[S.tab]();
}
function go(tab){ S.tab = tab; S.reportOpen = false; LS.set('tab', tab); window.scrollTo(0,0); render(); }
$('#repBtn').onclick = () => { S.reportOpen = true; window.scrollTo(0,0); render(); };
$('#backBtn').onclick = () => { S.reportOpen = false; window.scrollTo(0,0); render(); };
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
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
  if (S.tab==='trend') return adjYear(n) != null;
  const key = S.tab==='asset'?'asset':'budget', m = S.month[key] + n;
  return (m >= 1 && m <= 12) || adjYear(n) != null;
}
function shift(n){
  if (!S.model || !canShift(n)) return;
  if (S.tab==='trend'){ setYear(adjYear(n)); return render(); }
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
  const save = () => {
    const n = id => { const v = $(id).value.trim(); return v === '' ? null : +v; };
    S.goal = {target: (n('#gTarget') || 30) * 1e8, planRate: (n('#gRate') ?? 25) / 100, planSave: (n('#gSave') ?? 3000) * 1e4,
              planYear: n('#gYear') || 2025, planBase: n('#gBase') == null ? null : n('#gBase') * 1e4};
    LS.set('goal', S.goal); S.sim = null; if (S.tab === 'analysis') render();
  };
  ['#gTarget','#gRate','#gSave','#gYear','#gBase'].forEach(id => $(id).onchange = save);
}
function syncSheet(){
  goalFields();
  seg('#segTheme', S.theme, v => { S.theme=v; LS.set('theme',v); applyTheme(); syncSheet(); render(); });
  seg('#segUnit', S.unit, v => { S.unit=v; LS.set('unit',v); syncSheet(); render(); });
  const ys = yearsList().slice().reverse().join(', ');
  $('#sSource').textContent = !S.model ? '없음' : S.meta.source==='google' ? `구글 시트 · ${ys}년` : S.meta.source==='file' ? `기기 파일 · ${ys}년` : `예시 데이터 · ${ys}년`;
  renderG();
  $('#sSync').textContent = S.meta.syncedAt ? fmtTime(S.meta.syncedAt) : '-';
}
function openSheet(){ syncSheet(); $('#sheet').classList.add('on'); $('#scrim').classList.add('on'); }
function closeSheet(){
  $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on');
}
$('#setBtn').onclick = openSheet; $('#closeSheet').onclick = closeSheet; $('#scrim').onclick = closeSheet;
$('#btnSync').onclick = () => { $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); syncNow(true); };
$('#btnDemo').onclick = () => { closeSheet(); loadDemo(); };
$('#btnFile').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = async e => { const f = e.target.files[0]; if (!f) return; closeSheet();
  try { const md = parseWorkbook(await f.arrayBuffer());
    const ys = S.meta.source === 'file' ? {...S.years} : {}; ys[md.year] = md;   // 기기 파일끼리는 연도별로 합침
    setYears(ys, {source:'file', name:f.name}); setYear(md.year); render(); toast(`${md.year}년 파일을 불러왔어요`); }
  catch(err){ toast('파일을 읽지 못했어요: ' + err.message); } e.target.value=''; };
$('#syncBtn').onclick = () => S.gfiles.length ? syncNow(true) : openSheet();

/* ───────── 데이터 반영 ───────── */
function setYears(years, meta, keepView){
  const y = S.year, keep = {...S.month};
  if (meta.source === 'google' && S.queue?.length) reapplyQueue(years);   // 아직 시트에 못 쓴 입력은 유지
  S.years = years; S.meta = {...meta, syncedAt: Date.now()};
  LS.set('years', years); LS.set('meta', S.meta);
  S.year = null; setYear(keepView && years[y] ? y : defaultYear());
  if (keepView && S.year === y) S.month = keep;
  render();
  if ($('#sheet').classList.contains('on')) syncSheet();
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
  if (q && S.model){ $('#status').innerHTML = `<span class="pend">${flushing ? '저장 중…' : navigator.onLine ? '저장 대기 ' + q + '건' : '저장 대기 ' + q + '건 · 연결되면 시트에 저장해요'}</span>`; return; }
  $('#status').textContent = !S.model ? '' : S.meta.source==='google' ? `업데이트 ${fmtTime(S.meta.syncedAt)}${yearsList().length > 1 ? ` · ${yearsList().length}개 연도` : ''}` :
    S.meta.source==='file' ? `기기 파일 · ${fmtTime(S.meta.syncedAt)}` : '예시 데이터로 보는 중';
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
async function gPick(){
  if (!gReady()) return toast('개발자 설정이 필요해요');
  try {
    const tok = await gToken(true, 'pick'); if (!S.guser) await gWhoAmI(tok);
    if (!$('#sheet').classList.contains('on')) openSheet();
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
async function gCreate(year){
  if (!gReady()) return toast('개발자 설정이 필요해요');
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
    toast(`'${f.name}' 시트를 만들었어요`);
    await syncGoogle(true);
  } catch(e){ toast('시트를 만들지 못했어요: ' + e.message); }
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
    for (const r of res){
      if (r.m){ if (next[r.m.year]) dup.push(r.m.year); next[r.m.year] = r.m; r.f.year = r.m.year; }
      else fail.push(r);
    }
    for (const r of fail){ const y = r.f.year; if (y && old[y] && !next[y]) next[y] = old[y]; }   // 실패한 연도는 이전 데이터 유지
    gSave(); renderG();
    if (!res.some(r => r.m)){   // 하나도 못 받았으면 기존 데이터·동기화 시각을 그대로 둬요
      toast(fail.some(r => r.e.auth) ? '구글 로그인이 만료됐어요. 새로고침 버튼을 눌러 다시 로그인해 주세요' : '불러오기 실패: ' + fail[0].e.message); return; }
    setYears(next, {source: 'google'}, S.meta.source === 'google');
    if (dup.length) toast(`${[...new Set(dup)].join(', ')}년 시트가 여러 개예요. 기준 연도를 확인해 주세요`);
    else if (fail.length) toast(`${fail.length}개 시트를 불러오지 못했어요: ${fail[0].e.message}`);
    else if (interactive) toast('최신 데이터로 업데이트했어요');
  } finally { gSyncing = false; $('#syncBtn').classList.remove('spin'); }
}
function syncNow(interactive){ if (S.gfiles.length) return syncGoogle(interactive); if (interactive){ toast('설정에서 구글 시트를 연결하세요'); openSheet(); } }
$('#gPick').onclick = gPick; $('#gCreate').onclick = gCreate; $('#gOut').onclick = gSignOut;

// 화면 안 버튼 동작 (CSP 때문에 onclick 속성 대신 위임)
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'openSheet') openSheet(); else if (a === 'loadDemo') loadDemo();
  else if (a === 'editBudget') editBudgetMonth(S.month.budget); else if (a === 'editAsset') editAssetMonth(S.month.asset);
  else if (a === 'eb'){ const [m, k] = b.dataset.k.split('|').map(Number), L = S.years[S.year].budget[m], it = L[k]; editBudgetItem(m, it.kind, it.name, occ(L, it, bKey)); }
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
const canEdit = (y = S.year) => S.meta.source === 'google' && !!gfileOf(y) && (gfileOf(y).mime || MIME_SHEET) === MIME_SHEET;
const editNote = y => S.meta.source !== 'google' ? '구글 시트를 연결하면 앱에서 입력할 수 있어요'
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
      if (!L.some(i => i.kind === op.kind && i.name === op.name)) L.push({kind: op.kind, name: op.name, amt: 0, memo: '', filled: false}); } }
  else if (op.t === 'addA'){ if (!findAsset(Y, op.big, op.mid, op.small)) Y.assets.push({big: op.big, mid: op.mid, small: op.small, v: Array(12).fill(null)}); }
}
function reapplyQueue(years){ for (const op of S.queue) applyOp(years, op); }

// 화면에 바로 반영하고 대기열에 넣은 뒤 저장 시도
function commit(ops){
  if (!ops.length) return;
  for (const op of ops){ op.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); op.fileId = gfileOf(op.y)?.id; applyOp(S.years, op); S.queue.push(op); }
  saveQueue(); LS.set('years', S.years); render();
  flushQueue(true);
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
async function writeCells(fileId, data, tok){
  if (!data.length) return;
  await gFetch(`https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values:batchUpdate`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({valueInputOption: 'RAW', data})}, tok);
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
    for (const op of S.queue.filter(o => o.t === 'addB' || o.t === 'addA')){
      if (op.t === 'addB'){
        for (const m of op.months){
          const title = m + '월', [V] = await readRanges(op.fileId, [`${qs(title)}!A1:D400`], tok), L = locateBudget(V);
          if (!L || !L.marker) throw new Error(`${title} 시트에서 '▲' 행을 찾지 못했어요`);
          if (L.rows.some(r => r.kind === op.kind && r.name === op.name)) continue;
          await insertRow(op.fileId, title, L.marker, tok);
          await writeCells(op.fileId, [{range: `${qs(title)}!A${L.marker}:B${L.marker}`, values: [[op.kind, op.name]]}], tok);
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
    // 2) 값 쓰기: 파일·시트별로 한 번 읽고, 이름으로 칸을 찾아 비교 후 쓰기
    const byFile = {}; for (const op of S.queue) (byFile[op.fileId] = byFile[op.fileId] || []).push(op);
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
    else if (saved && interactive) toast(`구글 시트에 저장했어요${saved > 1 ? ` (${saved}건)` : ''}`);
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
function openEd(html, opt = {}){
  const el = $('#ed'); el.className = 'sheet ed on' + (opt.tall ? ' tall' : ''); el.innerHTML = '<div class="grab"></div>' + html;
  $('#edScrim').classList.add('on'); $('#edScrim').onclick = opt.noClose ? null : closeEd;
  const f = el.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 60);
}
function closeEd(){ $('#ed').classList.remove('on'); $('#edScrim').classList.remove('on'); }
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
function addBudgetItem(m, kind){
  const y = S.year; if (!canEdit(y)) return toast(editNote(y));
  openEd(`<h4>${kind} 항목 추가 <button class="ex" id="edX">취소</button></h4>
    <div class="esub">${y}년 ${m}월 시트의 ${kind} 맨 아래(합계에 포함되는 위치)에 추가돼요</div>
    <input id="adName" class="ememo" maxlength="30" placeholder="항목 이름 (예: 넷플릭스, 보험료)" autofocus>
    <label class="echeck"><input type="checkbox" id="adAfter" checked> ${m < 12 ? `${m + 1}~12월 시트에도 추가` : '이 달에만 추가'}</label>
    <button class="btn" id="edSave">추가</button>`);
  if (m === 12) $('#adAfter').closest('label').hidden = true;
  $('#edX').onclick = closeEd;
  $('#edSave').onclick = () => {
    const name = $('#adName').value.trim(); if (!name) return toast('항목 이름을 넣어 주세요');
    if ((S.years[y].budget[m] || []).some(i => i.kind === kind && i.name === name)) return toast('같은 이름의 항목이 이미 있어요');
    const months = $('#adAfter').checked ? Array.from({length: 13 - m}, (_, i) => m + i) : [m];
    closeEd(); commit([{t: 'addB', y, kind, name, months}]);
    setTimeout(() => editBudgetItem(m, kind, name, 0), 50);
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

/* ───────── 시작 ───────── */
applyTheme();
['token','authState','clientId','fileRef'].forEach(k => LS.del(k));   // 이전 로그인 방식 흔적 정리
if (!S.years){ const m = LS.get('model', null); S.years = m ? {[m.year]: m} : {}; LS.set('years', S.years); LS.del('model'); }
setYear(S.year);
render();
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
