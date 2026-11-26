// 두 시안이 함께 쓰는 색·글꼴·용어 풀이
const MAN = 1e4;
const fmt = v => { const neg = v < 0; v = Math.round(Math.abs(v) / MAN); if (v === 0) return '1만원 미만'; const e = Math.floor(v / 1e4), m = v % 1e4; return (neg ? '−' : '') + (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + '원'; };
const sh = v => { v = Math.abs(v) / MAN; return v >= 1e4 ? (Math.round(v / 1e3) / 10) + '억' : Math.round(v).toLocaleString('ko-KR') + '만'; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

const TERMS = {
  'ISA': ['ISA(개인종합자산관리계좌)', '예금·주식·펀드를 한 계좌에 담는 절세 계좌예요. 3년 이상 두면 이익 200만원(서민형 400만원)까지 세금이 없고, 넘는 부분은 9.9%만 내요.'],
  'IRP': ['연금저축·IRP', '노후 연금을 모으는 계좌예요. 넣을 때 세금을 돌려받고, 55세부터 1년에 1,500만원 안에서 연금으로 꺼내면 세금이 3.3~5.5%로 낮아요. 그 전에 깨면 16.5%를 내요.'],
  '양도세': ['양도세(해외주식)', '해외주식을 팔아 남긴 이익에 붙는 세금이에요. 판 돈 전체가 아니라 이익에만 붙고, 1년 이익 250만원까지는 없어요. 넘는 부분의 22%를 내요.'],
  '건보료': ['건강보험료', '은퇴하면 직장 대신 지역가입자로 내요. 집(재산)과 국민연금의 절반, 1년에 1,000만원을 넘는 이자·배당이 계산에 들어가요.'],
  '물가': ['현재 물가 기준', '미래 금액을 지금 돈의 가치로 바꿔서 보여 줘요. 예를 들어 30년 뒤 300만원은 지금 돈으로 약 165만원이에요. 그래서 이 레포트의 300만원은 "지금 300만원으로 사는 만큼"이라는 뜻이에요.'],
  '배당': ['배당', '갖고 있는 주식의 회사가 이익을 나눠 주는 돈이에요. 주식을 팔지 않아도 들어와요.'],
  '순서': ['순서 위험', '같은 평균 수익률이라도, 돈을 꺼내 쓰기 시작할 때 주가가 떨어지면 싸게 팔아야 해서 돈이 훨씬 빨리 줄어드는 위험이에요.'],
};
const T = (key, label) => `<button type="button" class="term" data-t="${key}">${esc(label || key)}</button>`;

const CSS = `
:root{
  --bg:#F1F1EE; --card:#F9F9F6; --ink:#1E2027; --sub:#62656C; --faint:#A3A6AB; --line:#E3E3DD; --chip:#EBEBE6;
  --accent:#4A5FC1; --accent-soft:#E6E9F7; --bad:#D9363E; --bad-soft:#FFEBEE;
  --c-stock:#F08A3C; --c-pen:#2A9D74; --c-cash:#8E9196; --c-nps:#7C5CFC; --c-live:#4A5FC1;
  --c-put:#5B6470; --c-grow:#B9BFC8; --repbg:#4A5FC1;
  --f-body:'Pretendard','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#0E1013; --card:#1A1D22; --ink:#ECEEF1; --sub:#A7AEB8; --faint:#5E6670; --line:#2A2E35; --chip:#23272E;
  --accent:#7D8EE8; --accent-soft:#232A47; --bad:#FF6B6F; --bad-soft:#3A1A1F;
  --c-stock:#FDA15A; --c-pen:#2FC48D; --c-cash:#8F959C; --c-nps:#9B86FF; --c-live:#7D8EE8;
  --c-put:#8A93A0; --c-grow:#47505B; --repbg:#28316B; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0E1013; --card:#1A1D22; --ink:#ECEEF1; --sub:#A7AEB8; --faint:#5E6670; --line:#2A2E35; --chip:#23272E;
  --accent:#7D8EE8; --accent-soft:#232A47; --bad:#FF6B6F; --bad-soft:#3A1A1F;
  --c-stock:#FDA15A; --c-pen:#2FC48D; --c-cash:#8F959C; --c-nps:#9B86FF; --c-live:#7D8EE8;
  --c-put:#8A93A0; --c-grow:#47505B; --repbg:#28316B; color-scheme:dark}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-body);-webkit-text-size-adjust:100%}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}
button{font:inherit;color:inherit}
.wrap{max-width:440px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:0 40px}
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:6;display:flex;align-items:center;justify-content:space-between;height:52px;margin:0 -16px;padding:0 16px;background:var(--bg)}
.bar b{font-size:17px}.bar span{width:52px;color:var(--accent);font-size:15px}
.note{margin:8px 0 12px;padding:12px 14px;border-radius:12px;background:var(--chip);font-size:13px;line-height:1.6;color:var(--sub)}
.num{font-variant-numeric:tabular-nums}
.rep{margin:0 -16px;padding:6px 16px 32px;background:var(--repbg);color:#fff;border-radius:0}
.rhead{padding:14px 6px 18px}.rhead small{display:block;font-size:15px;opacity:.88}.rhead h1{margin:6px 0 0;font-size:28px;line-height:1.35;letter-spacing:-.02em;text-wrap:balance}
.sec{padding:22px 6px 10px}.sec h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.01em}.sec p{margin:6px 0 0;font-size:15px;line-height:1.6;opacity:.9}
.card{background:var(--card);color:var(--ink);border-radius:22px;padding:22px 18px;margin-bottom:14px}
.lead{font-size:22px;font-weight:800;line-height:1.5;letter-spacing:-.02em;margin:0 0 14px;text-wrap:balance}
.lead em{font-style:normal;color:var(--accent)}
.kv{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:54px;padding:0 14px;border-radius:14px;background:var(--bg);margin-top:8px;font-size:16px}
.kv b{font-size:17px;white-space:nowrap}.kv.hl{background:var(--accent-soft)}.kv.hl b{color:var(--accent)}
.kv small{display:block;font-size:13px;color:var(--sub);margin-top:2px;line-height:1.4}
.kv > span{min-width:0}
.fine{font-size:14px;line-height:1.6;color:var(--sub);margin:12px 2px 0}
.term{border:0;background:none;padding:0;color:inherit;text-decoration:underline dotted;text-underline-offset:3px;text-decoration-thickness:1.5px;cursor:help}
.term:focus-visible,.jump:focus-visible,.seg button:focus-visible,details summary:focus-visible,.again:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
/* 용어 풀이 시트 */
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:30;padding:20px max(20px,env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) max(20px,env(safe-area-inset-left,0px));background:var(--card);color:var(--ink);border-radius:20px 20px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.18);transform:translateY(110%);transition:transform .25s,visibility .25s}
.sheet{visibility:hidden}.sheet.on{transform:none;visibility:visible}.sheet h3{margin:0 0 8px;font-size:18px}.sheet p{margin:0;font-size:16px;line-height:1.7}
.sheet button{margin-top:16px;width:100%;height:50px;border:0;border-radius:14px;background:var(--accent);color:#fff;font-size:16px;font-weight:700}
.dim{position:fixed;inset:0;z-index:29;background:rgba(0,0,0,.35);opacity:0;pointer-events:none;transition:opacity .25s}.dim.on{opacity:1;pointer-events:auto}
@media (prefers-reduced-motion: reduce){.sheet,.dim{transition:none}}
`;
module.exports = {MAN, fmt, sh, esc, TERMS, T, CSS};
