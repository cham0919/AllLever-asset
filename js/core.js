// 저장소 · 포맷 · 엑셀 파싱 · 계산 · 차트
// (app.js를 나눈 파일이에요. index.html의 순서대로 불러와 같은 전역 범위를 써요)
'use strict';
/* ───────── 저장소 ───────── */
// 개인용 앱(asset-app)과 같은 도메인(github.io)에서 열려도 저장소가 섞이지 않게 접두어를 따로 써요
const LSP = 'alv.';
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(LSP+k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(LSP+k, JSON.stringify(v)); return true; }catch(e){ storageFail(k); return false; } },
  del(k){ try{ localStorage.removeItem(LSP+k); }catch(e){} }
};
// 기기 저장 공간이 꽉 차는 등으로 저장에 실패하면 알려요 (가계부·자산·저장 대기 데이터일 때만, 같은 안내는 10초에 한 번)
let storageWarnAt = 0;
function storageFail(k){
  if (!['years', 'queue', 'meta', 'model'].includes(k) || Date.now() - storageWarnAt < 10000) return;
  storageWarnAt = Date.now();
  setTimeout(() => { try { toast('기기 저장 공간이 부족해 저장하지 못했어요. 설정 › 백업 파일 만들기로 먼저 백업해 주세요'); } catch(e){} }, 0);
}
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
  goal: Object.assign({target:1e9, planRate:0.06, planSave:2.4e7, planYear:new Date().getFullYear(), planBase:null, divRate:0.04}, LS.get('goal', {})),
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
// 아이폰·안드로이드 앱(Capacitor) 안에서 실행 중인지
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
// 앱의 네이티브 기능(로그인 창·Face ID·알림 등)을 부르는 창구. vendor/capacitor.js(@capacitor/core)의 registerPlugin을 써요
const nativePlugins = {};
const nativePlugin = name => {
  if (!NATIVE) return null;
  const reg = window.capacitorExports?.registerPlugin; if (!reg) return null;
  return nativePlugins[name] || (nativePlugins[name] = window.capacitorExports[name] || reg(name));   // SystemBars 등 core에 이미 있는 건 그대로
};
const DIV_NET = 1 - 0.154;   // 배당소득세 15.4%를 뗀 비율
const PALETTE = ['#4A5FC1','#2A9D74','#F59E0B','#8B5CF6','#F04452','#06B6D4','#EC4899','#84CC16','#F97316','#6366F1','#14B8A6','#A855F7'];

/* ───────── 엑셀 파싱 (값은 앱에서 직접 계산) ───────── */
const KINDS = ['수입','고정비','변동비','저축'], BIGS = ['유동자산','비유동자산','부채'];
const toNum = v => { if (v==null || v==='') return null; if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = String(v).replace(/[,원\s]/g,''); if (t==='' || t==='-') return null; const n = Number(t); return isFinite(n) ? n : null; };
const str = v => v==null ? '' : String(v).trim();

function parseWorkbook(buf){
  const wb = XLSX.read(buf, {type:'array'});
  const rows = name => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, raw:true, defval:null}) : null;
  let year = null;
  const st = rows('설정');
  if (st) for (const r of st){
    const lab = c => str(c).replace(/\s/g,'');
    const i = r.findIndex(c => lab(c) === '기준연도'); if (i >= 0 && year == null) year = toNum(r[i+1]);
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
  const Y = {year, budget, assets};
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
// 직접 만든 중분류(또는 이름을 바꾼 중분류)가 홈의 어느 묶음에 들어갈지: 사용자가 정한 값 → 기본 중분류 이름 순서로 정해요
const HOME_KEYS = {invest: '금융투자', cash: '현금', estate: '부동산'};
let MID_HOME = LS.get('midHome', {});   // {'유동자산|주식': 'invest', …} (이 기기에 저장)
function setMidHome(big, mid, g){ if (g) MID_HOME[big + '|' + mid] = g; else delete MID_HOME[big + '|' + mid]; LS.set('midHome', MID_HOME); }
function homeGroupOf(a){
  if (a.big === '부채') return null;
  const g = MID_HOME[a.big + '|' + a.mid]; if (g && HOME_KEYS[g]) return g;
  for (const k of Object.keys(HOME_KEYS)) if (MIDS[k].includes(a.mid)) return k;
  return null;
}
const HOME_GROUPS = {
  invest: {label:'금융투자', note:'중분류 ' + MIDS.invest.join(' · '), match: a => homeGroupOf(a) === 'invest'},
  estate: {label:'부동산',   note:'중분류 ' + MIDS.estate.join(' · '), match: a => homeGroupOf(a) === 'estate'},
  cash:   {label:'현금',     note:'중분류 ' + MIDS.cash.join(' · '),   match: a => homeGroupOf(a) === 'cash'},
};
const RETURN_GROUPS = [
  {name:'주식',   label:'주식 계좌 증가율', note:'중분류 ' + MIDS.stock.join(' + ') + ' · 추가 납입 포함',  match: a => homeGroupOf(a) === 'invest' && a.mid !== '코인'},
  {name:'부동산', label:'부동산 평가액 변화', note:'중분류 ' + MIDS.estate.join(' + '), match: a => homeGroupOf(a) === 'estate'},
];
const inGroup = (g, a) => g.match(a);

function wrapYM(m, y){ if (m < 1) return [m + 12, y - 1]; if (m > 12) return [m - 12, y + 1]; return [m, y]; }
function bMonth(m, y = S.year){
  [m, y] = wrapYM(m, y);
  const items = (S.years?.[y]?.budget?.[m]) || [];
  const sum = k => items.filter(i=>i.kind===k).reduce((a,i)=>a+i.amt,0);
  const income = sum('수입'), fixed = sum('고정비'), variable = sum('변동비'), expense = fixed + variable;
  const has = items.some(i => i.filled && i.amt !== 0);
  const save = sum('저축'), left = income - expense - save;   // 저축 = 가계부에 '저축'으로 입력한 금액, 남은 돈 = 수입 − 지출 − 저축
  return {m, y, items, has, income, fixed, variable, expense, save, left, saving: save, rate: income ? save/income : 0};
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
    r.saving = b.has ? b.save : null;
    r.other = r.dNet - (r.saving || 0);   // 저축 외 자산 변동 (투자손익 · 시세 등)
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
