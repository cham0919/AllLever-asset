const fs = require('fs');
const {fmt, sh, esc, TERMS, T, CSS} = require('./common.js');
const {base, extras} = require('./data.js');
const B = base(), X = extras();
const start = B.start;
const pathOf = s => [{age: B.nowAge, v: start}].concat(s.path.filter(p => p.age <= 100));
const rates = X.rates.map(r => ({rate: r.rate, lastAge: r.lastAge, monthly: r.monthly, left100: r.left100, atL: r.atL, path: pathOf(r)}));
const shocks = X.shocks.map(s => ({key: s.key, name: s.name, lastAge: s.lastAge, monthly: s.monthly, left100: s.left100, path: pathOf(s)}));
const left = B.left100.reduce((a, b) => a + b, 0);

const page = `<title>은퇴 레포트 추가 기능</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${CSS}
.where{display:inline-block;font-size:13px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.18);margin-top:8px}
.seg{display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--chip);margin:0 0 14px}
.seg button{flex:1;min-width:0;height:40px;border:0;border-radius:9px;background:transparent;color:var(--sub);font-size:15px;font-weight:700;cursor:pointer}
.seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.1)}
.seg.col{flex-direction:column}.seg.col button{flex:none;text-align:left;padding:0 14px;height:46px}
.chart{width:100%;height:auto;display:block;margin:6px 0 2px}
.chart text{font-size:12px;fill:var(--sub);font-family:var(--f-body)}
.ans{font-size:20px;font-weight:800;line-height:1.5;margin:0 0 6px;text-wrap:balance}.ans em{font-style:normal;color:var(--accent)}.ans em.bad{color:var(--bad)}
.tbl{width:100%;border-collapse:collapse;margin-top:14px;font-size:15px}
.tbl th{font-size:13px;color:var(--sub);font-weight:600;text-align:right;padding:6px 4px;border-bottom:1px solid var(--line)}.tbl th:first-child,.tbl td:first-child{text-align:left}
.tbl td{text-align:right;padding:10px 4px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.tbl tr.on td{font-weight:800;color:var(--accent)}.tbl td.bad{color:var(--bad)}
.lg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;margin-top:6px}.lg i{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:4px}
.tip{background:var(--bg);border-radius:14px;padding:14px 16px;margin-top:14px;font-size:15px;line-height:1.7}.tip b{display:block;font-size:15px;margin-bottom:2px}
/* 공유 이미지 */
.shot{position:relative;max-width:100%;border-radius:18px;overflow:hidden;background:#4A5FC1;color:#fff;padding:22px 20px;display:flex;flex-direction:column;gap:12px}
.shot .brand{font-size:13px;font-weight:700;opacity:.85}.shot h3{margin:0;font-size:20px;line-height:1.4;text-wrap:balance}
.shot .kk{display:grid;grid-template-columns:1fr 1fr;gap:8px}.shot .kk div{background:rgba(255,255,255,.14);border-radius:12px;padding:10px 12px}.shot .kk small{display:block;font-size:12px;opacity:.85}.shot .kk b{font-size:17px}
.shot .tl{display:flex;flex-direction:column;gap:5px;font-size:13px;margin-top:auto}.shot .tl div{display:flex;gap:10px}.shot .tl b{width:42px;flex:none}
.shot .foot{font-size:11px;opacity:.75}
.hide .amt{filter:blur(0);color:transparent;text-shadow:none;background:rgba(255,255,255,.35);border-radius:5px}
.opt{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:56px;border-top:1px solid var(--line);font-size:16px}
.opt small{display:block;font-size:13px;color:var(--sub);margin-top:2px}
.sw{position:relative;width:52px;height:32px;flex:none;border:0;border-radius:16px;background:var(--line);cursor:pointer}.sw::after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
.sw[aria-checked="true"]{background:var(--accent)}.sw[aria-checked="true"]::after{transform:translateX(20px)}
.btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.btns button{height:52px;border:0;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer}.btns .p{background:var(--accent);color:#fff}.btns .s{background:var(--chip)}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;padding:12px 18px;border-radius:12px;background:var(--ink);color:var(--card);font-size:15px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 32px)}.toast.on{opacity:1}
.sw:focus-visible,.seg button:focus-visible,.btns button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
<div class="wrap">
<div class="bar"><span>‹ 뒤로</span><b>은퇴 계산 레포트</b><span></span></div>
<div class="note">시안이에요. 레포트에 새로 넣을 세 가지예요. 예시(1985년생, 55세 은퇴, 생활비 300만원)를 앱 계산 엔진으로 계산한 숫자예요. 주가 하락은 엔진에 "그 나이에 주식이 한 번 떨어지는 계산"을 더해서 구했어요.</div>
<div class="rep">
  <div class="sec"><small style="opacity:.85;font-size:15px">새로 1</small><h2>수익률이 달라지면</h2><p>미래 수익률은 아무도 몰라요. 그래서 한 가지 숫자 대신 범위로 보여 드려요.</p><span class="where">"100세에 남는 돈" 다음에 들어가요</span><p style="font-size:14px">8%처럼 많이 불어나는 선은 그래프 위로 넘어가서 20억까지만 그렸어요.</p></div>
  <section class="card">
    <div class="seg" role="group" aria-label="한 해 수익률">${rates.map((r, i) => `<button type="button" data-r="${i}">${Math.round(r.rate * 100)}%${r.rate === 0.06 ? '' : ''}</button>`).join('')}</div>
    <p class="ans" id="rAns"></p>
    <p class="fine" id="rSub" style="margin-top:0"></p>
    <svg class="chart" id="rChart" viewBox="0 0 320 190" role="img" aria-label="수익률별 자산 변화"></svg>
    <div class="lg"><span><i style="background:var(--accent)"></i>고른 수익률</span><span><i style="background:var(--faint)"></i>다른 수익률</span></div>
    <table class="tbl"><thead><tr><th>수익률</th><th>버티는 나이</th><th>최대로 쓰면<br>(한 달)</th></tr></thead>
      <tbody>${rates.map((r, i) => `<tr data-r="${i}"><td>연 ${Math.round(r.rate * 100)}%${r.rate === 0.06 ? ' (지금 계획)' : ''}</td><td class="${r.lastAge <= 95 ? 'bad' : ''}">${r.lastAge > 100 ? '100세 넘어' : r.lastAge + '세까지'}</td><td>${fmt(r.monthly)}</td></tr>`).join('')}</tbody></table>
    <p class="fine">수익률은 물가를 빼기 전 값이에요(물가 ${X.infl * 100}%). 최대로 쓰면은 ${B.planAge}세까지 바닥나지 않는 가장 큰 금액이에요.</p>
  </section>

  <div class="sec"><small style="opacity:.85;font-size:15px">새로 2</small><h2>은퇴하자마자 주가가 떨어지면</h2><p>똑같이 30% 떨어져도, 언제 떨어지느냐에 따라 결과가 크게 달라요. 이걸 ${T('순서', '순서 위험')}이라고 해요.</p><span class="where">"수익률이 달라지면" 다음에 들어가요</span></div>
  <section class="card">
    <div class="seg col" role="group" aria-label="주가가 떨어지는 때">${shocks.map((s, i) => `<button type="button" data-s="${i}">${esc(s.name)}</button>`).join('')}</div>
    <p class="ans" id="sAns"></p>
    <svg class="chart" id="sChart" viewBox="0 0 320 190" role="img" aria-label="주가 하락 시점별 자산 변화"></svg>
    <div class="lg">${shocks.map((s, i) => `<span><i style="background:${['var(--c-put)', 'var(--bad)', 'var(--c-stock)'][i]}"></i>${esc(s.name)}</span>`).join('')}</div>
    <table class="tbl"><thead><tr><th>언제 떨어지나</th><th>버티는 나이</th><th>최대로 쓰면<br>(한 달)</th></tr></thead>
      <tbody>${shocks.map((s, i) => `<tr data-s="${i}"><td>${esc(s.name)}</td><td class="${s.lastAge <= 95 ? 'bad' : ''}">${s.lastAge > 100 ? '100세 넘어' : s.lastAge + '세까지'}</td><td>${fmt(s.monthly)}</td></tr>`).join('')}</tbody></table>
    <div class="tip"><b>왜 은퇴 직후가 더 위험할까요</b>은퇴 직후에는 생활비를 꺼내려고 떨어진 주식을 싸게 팔아야 해요. 싸게 판 주식은 나중에 주가가 회복돼도 돌아오지 않아요. 75세쯤에는 이미 국민연금이 들어오고 꺼내는 돈이 적어서 영향이 작아요.</div>
    <div class="tip"><b>많이 쓰는 대비 방법</b>· 생활비 2~3년치를 현금으로 따로 두고, 주가가 떨어진 해에는 현금에서 먼저 꺼내기<br>· 떨어진 해에는 생활비를 조금 줄이기<br>계획 개선하기에서 이 방법들을 넣었을 때 얼마나 달라지는지 함께 보여 드릴 수 있어요.</div>
  </section>

  <div class="sec"><small style="opacity:.85;font-size:15px">새로 3</small><h2>이미지로 저장해 가족에게 보여 주기</h2><p>레포트 맨 위 오른쪽 "저장" 버튼을 누르면 이 화면이 나와요.</p><span class="where">레포트 상단 버튼</span></div>
  <section class="card">
    <div class="shot" id="shot">
      <div class="brand">머니머슬 · 은퇴 계산 레포트</div>
      <h3>${B.R}세에 은퇴해서 매달 <span class="amt">${fmt(B.spend)}</span>씩 ${B.lastAge > 100 ? '100세 넘어서' : B.lastAge + '세'}까지 쓸 수 있어요</h3>
      <div class="kk">
        <div><small>은퇴할 때 모이는 돈</small><b class="amt">${sh(B.atL)}원</b></div>
        <div><small>100세에 남는 돈</small><b class="amt">${sh(left)}원</b></div>
        <div><small>최대로 쓰면 (한 달)</small><b class="amt">${fmt(B.maxMonthly)}</b></div>
        <div><small>국민연금 시작</small><b>65세</b></div>
      </div>
      <div class="tl"><div><b>${B.nowAge}세</b><span>지금, 모으기 시작</span></div><div><b>${B.R}세</b><span>은퇴 · 현금·ISA와 연금계좌부터</span></div><div><b>57세</b><span>주식을 팔아 채우기 시작</span></div><div><b>65세</b><span>국민연금이 더해져요</span></div><div><b>97세</b><span>연금계좌와 국민연금으로</span></div></div>
      <div class="foot">현재 물가 기준 · 2026년 세법 기준 계산 · 투자 추천이 아니에요</div>
    </div>
    <div class="opt" style="margin-top:14px"><span>금액 가리기<small>나이와 순서만 보여 주고 금액은 가려요</small></span><button type="button" class="sw" id="swHide" role="switch" aria-checked="false" aria-label="금액 가리기"></button></div>
    <div class="opt"><span>들어가지 않는 정보<small>이름, 계좌 이름, 증권사, 계좌별 금액은 이미지에 넣지 않아요. 이미지는 휴대폰 안에서 만들고 서버로 보내지 않아요.</small></span></div>
    <div class="btns"><button type="button" class="s" data-toast="사진첩에 저장돼요 (시안이라 실제로 저장되지 않아요)">이미지로 저장</button><button type="button" class="p" data-toast="카카오톡·문자로 보낼 수 있어요 (시안이라 실제로 보내지 않아요)">공유하기</button></div>
  </section>
</div>
</div>
<div class="toast" id="toast" role="status"></div>
<div class="dim" id="dim"></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="shT"><h3 id="shT"></h3><p id="shP"></p><button type="button" id="shX">닫기</button></div>
<script>
const TERMS = ${JSON.stringify(TERMS)};
const RATES = ${JSON.stringify(rates)};
const SHOCKS = ${JSON.stringify(shocks)};
const NOW = ${B.nowAge}, RET = ${B.R};
${fs.readFileSync(__dirname + '/client-extras.js', 'utf8')}
</script>`;
fs.writeFileSync(__dirname + '/retire-extras.html', page);
console.log('ok', page.length);
