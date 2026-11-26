const fs = require('fs');
const {fmt, sh, esc, TERMS, T, CSS} = require('./common.js');
const {base, improveMock} = require('./data.js');
const B = base(), M = improveMock();
const OPTN = {harvest: '해외주식 이익을 해마다 250만원만큼 정리', pensionEarly: '연금저축·IRP를 쓸 돈이 적어도 해마다 1,500만원까지 꺼내 두기', pensionLast: '연금저축·IRP를 마지막에 꺼내기', fillPension: '연금저축·IRP에 해마다 900만원까지 넣기', openIsa: 'ISA에 해마다 2,000만원까지 넣기'};
const HOW = {
  fillPension: ['증권사나 은행 앱에서 연금저축 계좌나 IRP를 만들어요.', '해마다 900만원까지 넣어요(연금저축 600만원 + IRP 300만원처럼 나눠도 돼요).', '넣은 돈의 13.2%(총급여 5,500만원 이하면 16.5%)를 연말정산에서 돌려받아요.', '55세부터 한 해 1,500만원 안에서 연금으로 꺼내면 세금이 3.3~5.5%예요.'],
  openIsa: ['증권사 앱에서 중개형 ISA를 만들어요.', '해마다 2,000만원까지 넣어요. 이익 200만원(서민형 400만원)까지 세금이 없어요.', '3년이 지나면 연금계좌로 옮겨요. 옮긴 돈의 10%(300만원까지)를 더 공제받아요.'],
  giftToSpouse: ['배우자에게 해외주식 절반을 증여해요(10년 동안 6억원까지 증여세 없음).', '두 사람이 따로 양도세 250만원 공제와 건보료 계산을 받아요.']
};
const TITLE = {fillPension: '연금저축·IRP 만들기', openIsa: 'ISA 만들기', giftToSpouse: '해외주식 절반을 배우자 이름으로'};
const ACC = a => a === 'IRP' ? '연금저축·IRP' : a;

function view(m, i){
  const newStrat = x => Object.keys(x.opt).filter(k => !m.baseOpt[k] && k !== x.id).map(k => OPTN[k]).filter(Boolean);
  const card = x => `<section class="card imp">
      <div class="ih"><b>${TITLE[x.id] || esc(x.title)}</b><span class="tag">새로 만들기</span></div>
      <div class="gain"><div><small>매달 더 쓸 수 있는 돈</small><b class="num">+${fmt(x.monthlyGain)}</b></div><div><small>${B.planAge}세에 더 남는 돈</small><b class="num">+${fmt(x.saving)}</b></div></div>
      <ol class="how">${(HOW[x.id] || []).map(h => `<li>${h}</li>`).join('')}</ol>
      ${newStrat(x).length ? `<p class="also">이 계좌가 생기면 전략도 함께 바뀌어요: ${newStrat(x).join(', ')}</p>` : ''}
    </section>`;
  return `<div class="ex" data-ex="${i}" ${i ? 'hidden' : ''}>
    <section class="card">
      <p class="lead">지금 가진 계좌로는<br><em>이미 가장 좋은 방법</em>으로 계산했어요</p>
      <div class="kv"><span>지금 가진 계좌</span><b>${m.accts.map(ACC).join(', ')}</b></div>
      <div class="kv"><span>쓰고 있는 방법<small>${Object.keys(m.baseOpt).map(k => OPTN[k]).join(' · ') || '기본 순서'}</small></span></div>
      <div class="kv hl"><span>최대로 쓰면</span><b class="num">한 달 ${fmt(m.baseMonthly)}</b></div>
      <p class="fine">여기서는 지금 없는 것을 새로 만들면 얼마나 좋아지는지 보여 드려요.</p>
    </section>
    ${m.list.length ? m.list.map(card).join('') : `<section class="card"><p class="lead" style="font-size:19px">새로 만들어서 더 좋아지는 계좌가 없어요</p><p class="fine">필요한 계좌를 이미 다 갖고 있어요.</p></section>`}
    ${m.combo ? `<section class="card imp both"><div class="ih"><b>둘 다 만들면</b></div>
      <div class="gain"><div><small>매달 더 쓸 수 있는 돈</small><b class="num">+${fmt(m.combo.monthlyGain)}</b></div><div><small>${B.planAge}세에 더 남는 돈</small><b class="num">+${fmt(m.combo.saving)}</b></div></div>
      <p class="also">저축은 ${[m.combo.opt.openIsa && 'ISA 2,000만원', m.combo.opt.fillPension && '연금저축·IRP 900만원'].filter(Boolean).join(' → ')} 순서로 먼저 채우고, 나머지는 지금 계좌에 넣어요.</p></section>` : ''}
  </div>`;
}

const page = `<title>계획 개선하기</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${CSS}
.seg{display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--line);margin:10px 0 0}.seg button{flex:1;min-width:0;height:40px;border:0;border-radius:9px;background:transparent;color:var(--sub);font-size:14px;font-weight:700;cursor:pointer}.seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.1)}
.seg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.lead{font-size:21px}
.kv{min-height:50px}.kv b{font-size:15px;white-space:normal;text-align:right}.kv small{font-size:14px;color:var(--ink);font-weight:600}
.imp .ih{display:flex;justify-content:space-between;align-items:center;gap:8px}.imp .ih b{font-size:19px}.tag{font-size:13px;font-weight:700;padding:4px 10px;border-radius:20px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.gain{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.gain div{background:var(--accent-soft);border-radius:14px;padding:12px}.gain small{display:block;font-size:13px;color:var(--sub)}.gain b{display:block;font-size:17px;white-space:nowrap;color:var(--accent);margin-top:4px}
.how{margin:0;padding-left:22px;font-size:16px;line-height:1.7}.how li{margin:4px 0}
.also{margin:12px 0 0;padding:12px 14px;border-radius:12px;background:var(--bg);font-size:15px;line-height:1.65}
.both{border:2px solid var(--accent)}
</style>
<div class="wrap">
<div class="bar"><span>‹ 결과</span><b>계획 개선하기</b><span></span></div>
<div class="note">시안이에요. 앱 계산 엔진으로 계산했어요. 두 예시를 바꿔 가며 보세요. 두 번째 예시는 같은 사람이 연금저축·IRP 없이 그 돈을 해외주식으로 갖고 있다고 가정했어요.
<div class="seg" role="group" aria-label="예시 고르기"><button type="button" data-i="0" class="on" aria-pressed="true">이 예시</button><button type="button" data-i="1" aria-pressed="false">IRP·ISA가 없다면</button></div></div>
${M.map(view).join('')}
<p class="fine">효과는 계좌마다 수익률을 같게 맞춰서 비교했어요. 2026년 세법 기준이고, 투자 추천이 아니에요.</p>
</div>
<script>
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.seg button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  document.querySelectorAll('.ex').forEach(e => e.hidden = e.dataset.ex !== b.dataset.i);
});
</script>`;
fs.writeFileSync(__dirname + '/retire-improve.html', page);
console.log('ok', page.length);
