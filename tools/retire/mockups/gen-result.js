const fs = require('fs');
const {fmt, sh, TERMS, T, CSS} = require('./common.js');
const {base, result} = require('./data.js');
const B = base(), SC = result();
const ACT = SC.findIndex(s => s.actual);
const slim = SC.map(s => ({share: s.share, actual: s.actual, lastAge: s.lastAge, maxMonthly: s.maxMonthly, atL: s.atL, left100: s.left100,
  st: s.st.map(x => ({a0: x.a0, a1: x.a1, n: x.n, src: x.src, tax: x.tax, unpaid: x.unpaid, net: x.net, short: x.short})),
  yearly: s.yearly.map(y => ({a: y.age, g: y.g.map(v => Math.round(v))}))}));

const page = `<title>은퇴 설계 결과</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${CSS}
.wrap{padding-bottom:48px}
.repbtn{display:flex;align-items:center;gap:12px;width:100%;margin:4px 0 12px;padding:16px 18px;border:0;border-radius:18px;background:var(--accent);color:#fff;text-align:left;cursor:pointer}
.repbtn span{flex:1}.repbtn b{display:block;font-size:17px}.repbtn small{display:block;font-size:14px;opacity:.9;margin-top:3px;line-height:1.5}.repbtn i{font-style:normal;font-size:22px}
.card{border-radius:20px}
.h2{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 4px}.h2 h2{margin:0;font-size:19px}.h2 small{font-size:13px;color:var(--sub)}
.hint{font-size:14px;color:var(--sub);margin:0 0 10px}
.hero small.k{font-size:15px;color:var(--sub)}.hero .big{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.35;margin:4px 0 14px}.hero .big em{font-style:normal;color:var(--accent)}.hero .big em.bad{color:var(--bad)}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.tiles div{background:var(--bg);border-radius:14px;padding:12px 10px}.tiles small{display:block;font-size:13px;color:var(--sub);line-height:1.35}.tiles b{display:block;font-size:17px;margin-top:6px;white-space:nowrap}
.tiles div.hl{background:var(--accent-soft)}.tiles div.hl b{color:var(--accent)}
svg.ch{display:block;width:100%;height:auto;touch-action:pan-y;cursor:pointer}svg.ch text{font-size:11px;fill:var(--sub);font-family:var(--f-body)}
.rng{width:100%;margin:6px 0 2px;accent-color:var(--accent)}
.sel{margin-top:10px;padding:14px 16px;border-radius:14px;background:var(--bg)}
.sel .t{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.sel .t b{font-size:20px}.sel .t span{font-size:14px;color:var(--sub)}
.sel .tot{font-size:24px;font-weight:800;margin:4px 0 8px}
.rw{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:36px;font-size:16px}.rw b{white-space:nowrap}.rw.sub{min-height:28px;font-size:14px;color:var(--sub);padding-left:18px}.rw.sub b{font-weight:600}
.neg{color:var(--bad)}.dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}
.chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin:0 0 12px;scrollbar-width:none}.chips::-webkit-scrollbar{display:none}
.chips button{flex:none;height:38px;padding:0 14px;border:1px solid var(--line);border-radius:19px;background:var(--card);font-size:15px;font-weight:700;color:var(--sub);cursor:pointer}
.chips button.on{background:var(--ink);border-color:var(--ink);color:var(--card)}
.stack{display:flex;height:18px;border-radius:5px;overflow:hidden;margin:4px 0 10px}.stack i{display:block;height:100%}
.net{display:flex;justify-content:space-between;align-items:center;min-height:52px;margin-top:6px;padding:0 14px;border-radius:12px;background:var(--accent-soft);font-size:16px;font-weight:800}.net b{font-size:21px;color:var(--accent)}
details{border-top:1px solid var(--line);margin-top:4px}summary{display:flex;justify-content:space-between;align-items:center;min-height:44px;font-size:16px;cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}summary b{color:var(--bad)}summary span::after{content:" ⌄";color:var(--faint)}details[open] summary span::after{content:" ⌃"}
.seg{display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--chip);margin:4px 0 12px}.seg button{flex:1;min-width:0;height:44px;border:0;border-radius:9px;background:transparent;color:var(--sub);font-size:15px;font-weight:700;line-height:1.2;cursor:pointer}.seg button small{display:block;font-size:11px;font-weight:600}.seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.1)}
.mix{display:flex;height:14px;border-radius:5px;overflow:hidden}.mix i{display:block;height:100%}
.mixl{display:flex;justify-content:space-between;font-size:14px;color:var(--sub);margin:6px 0 10px}
.tbl{width:100%;border-collapse:collapse;font-size:15px;margin-top:4px}.tbl th{font-size:13px;color:var(--sub);font-weight:600;text-align:right;padding:6px 2px;border-bottom:1px solid var(--line)}.tbl th:first-child,.tbl td:first-child{text-align:left}.tbl td{text-align:right;padding:10px 2px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;white-space:nowrap}
.cmpx{margin-top:12px;padding:14px 16px;border-radius:14px;background:var(--bg);font-size:15px;line-height:1.65}.cmpx b{font-size:16px}
.save{width:100%;height:50px;margin-top:12px;border:0;border-radius:14px;background:var(--accent);color:#fff;font-size:16px;font-weight:700;cursor:pointer}.save:disabled{background:var(--chip);color:var(--faint);cursor:default}
.tx{display:flex;flex-direction:column;gap:8px;margin-top:6px}.tx div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;font-size:15px}.tx i{grid-column:1 / -1;display:block;height:8px;border-radius:4px;background:var(--bad);opacity:.75}
.links{display:flex;flex-direction:column}.links button{display:flex;justify-content:space-between;align-items:center;min-height:56px;border:0;border-top:1px solid var(--line);background:none;font-size:16px;font-weight:700;text-align:left;cursor:pointer}.links button:first-child{border-top:0}.links small{display:block;font-size:13px;font-weight:400;color:var(--sub);margin-top:2px}.links i{font-style:normal;color:var(--faint);font-size:20px}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;padding:12px 18px;border-radius:12px;background:var(--ink);color:var(--card);font-size:15px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 32px)}.toast.on{opacity:1}
.repbtn:focus-visible,.chips button:focus-visible,.seg button:focus-visible,.save:focus-visible,.links button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
<div class="wrap">
<div class="bar"><span>‹ 분석</span><b>은퇴 설계</b><span style="text-align:right">설정</span></div>
<button type="button" class="repbtn" data-toast="은퇴 계산 레포트가 열려요"><span><b>은퇴 계산 레포트</b></span><i>›</i></button>

<section class="card hero">
  <small class="k">${B.R}세 은퇴 · 매달 ${fmt(B.spend)} 쓰기</small>
  <p class="big" id="hBig"></p>
  <div class="tiles"><div><small>은퇴할 때</small><b class="num" id="hAt"></b></div><div><small>100세에 남는 돈</small><b class="num" id="hLeft"></b></div><div class="hl"><small>최대로 쓰면 한 달</small><b class="num" id="hMax"></b></div></div>
  <p class="fine">${T('물가', '현재 물가 기준')} · 집 제외</p>
</section>

<section class="card">
  <div class="h2"><h2>나이별 자산</h2><small>집 제외</small></div>
  <p class="hint">그래프를 누르거나 막대를 밀어서 나이를 골라 보세요.</p>
  <svg class="ch" id="ach" viewBox="0 0 320 190" role="img" aria-label="나이별 자산 그래프"></svg>
  <input class="rng" id="age" type="range" min="${B.nowAge}" max="100" step="1" value="${B.R}" aria-label="나이 고르기">
  <div class="sel" aria-live="polite">
    <div class="t"><b id="sAge"></b><span id="sPhase"></span></div>
    <div class="tot num" id="sTot"></div>
    <div id="sRows"></div>
    <p class="fine" id="sSay" style="margin-top:8px"></p>
  </div>
</section>

<section class="card">
  <div class="h2"><h2>매달 꺼내 쓰는 곳</h2><small>한 달 평균</small></div>
  <div class="chips" id="chips" role="group" aria-label="시기 고르기"></div>
  <div class="stack" id="mStack"></div>
  <div id="mRows"></div>
  <details id="mTax"><summary><span>세금·${'건보료'}</span><b class="num" id="mTaxT"></b></summary><div id="mTaxRows"></div></details>
  <div class="net"><span>손에 남는 돈</span><b class="num" id="mNet"></b></div>
</section>

<section class="card">
  <div class="h2"><h2>주식 전략</h2><small>해외주식</small></div>
  <p class="hint">배당주를 얼마나 갖고 있을지 골라 보세요. 결과 화면 전체가 다시 계산돼요.</p>
  <div class="seg" id="mixSeg" role="group" aria-label="배당주 비중">${SC.map((s, i) => `<button type="button" data-i="${i}">${Math.round(s.share * 100)}%${s.actual ? '<small>지금</small>' : ''}</button>`).join('')}</div>
  <div class="mix" id="mixBar"></div>
  <div class="mixl"><span id="mixA"></span><span id="mixB"></span></div>
  <table class="tbl"><thead><tr><th>나이</th><th>배당</th><th>판 돈</th><th>${T('건보료')}</th></tr></thead><tbody id="stkT"></tbody></table>
  <p class="fine" style="margin-top:8px">한 달 평균이에요. 팔 때는 배당주와 성장주를 갖고 있는 비율대로 팔아요.</p>
  <div class="cmpx" id="cmpx"></div>
  <button type="button" class="save" id="save" disabled>이 비중으로 바꾸기</button>
</section>

<section class="card">
  <div class="h2"><h2>은퇴 후 내는 세금·건보료</h2><small>100세까지 합계</small></div>
  <p class="big num" id="txTot" style="font-size:24px;font-weight:800;margin:6px 0 4px"></p>
  <div class="tx" id="txRows"></div>
</section>

<section class="card links">
  <button type="button" data-toast="나이별 숫자 표가 열려요"><span>계산 내역</span><i>›</i></button>
  <button type="button" data-toast="계획 개선하기가 열려요"><span>계획 개선하기</span><i>›</i></button>
  <button type="button" data-toast="설정 화면이 열려요"><span>설정 바꾸기</span><i>›</i></button>
</section>
</div>
<div class="toast" id="toast" role="status"></div>
<div class="dim" id="dim"></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="shT"><h3 id="shT"></h3><p id="shP"></p><button type="button" id="shX">닫기</button></div>
<script>
const TERMS = ${JSON.stringify(TERMS)};
const SC = ${JSON.stringify(slim)};
const ACT = ${ACT}, NOW = ${B.nowAge}, RET = ${B.R}, SPEND = ${B.spend};
${fs.readFileSync(__dirname + '/client-result.js', 'utf8')}
</script>`;
fs.writeFileSync(__dirname + '/retire-result.html', page);
console.log('ok', page.length);
