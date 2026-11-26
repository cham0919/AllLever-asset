const fs = require('fs');
const {fmt, sh, esc, TERMS, T, CSS} = require('./common.js');
const D = require('./data.js').base();
const IM = require('./data.js').improveMock()[0];
const NAME = {nps: '국민연금', pen: '연금저축·IRP', stock: '주식', cash: 'ISA·현금'};
const GN = ['주식', '연금저축·IRP', 'ISA·현금'], GC = ['var(--c-stock)', 'var(--c-pen)', 'var(--c-cash)'];
const has = (s, k) => s.src[k] >= 1e4;
const stockM = s => s.src.sell + s.src.div;

// 시기 카드 글
function tagOf(s, pv){
  if (!pv) return s.a0 < 65 ? '국민연금 받기 전' : '';
  if (s.short >= 1e4 && !(pv.short >= 1e4)) return '모아 둔 돈 다 씀';
  if (has(s, 'nps') && !has(pv, 'nps')) return '국민연금 시작';
  if (has(s, 'pen') && !has(pv, 'pen')) return '연금계좌 시작';
  if (!has(s, 'pen') && has(pv, 'pen')) return '연금계좌 다 씀';
  if (!has(s, 'cash') && has(pv, 'cash')) return '현금·ISA 다 씀';
  if (!(stockM(s) >= 1e4) && stockM(pv) >= 1e4) return '주식 다 팖';
  const yl = [0, 1, 2].map(k => { const t = [stockM(s), s.src.pen, s.src.cash][k] * 12; return s.b0[k] > 0 && t > 0 ? s.b0[k] / t : 99; });
  const k = yl.indexOf(Math.min(...yl));
  return yl[k] <= s.n + 1 ? GN[k] + ' 거의 다 씀' : '꺼내는 비중 바뀜';
}
function sayOf(s){
  const parts = [['nps', s.src.nps], ['cash', s.src.cash], ['stock', stockM(s)], ['pen', s.src.pen]].filter(x => x[1] >= 1e4).sort((a, b) => b[1] - a[1]);
  return `한 달 생활비를 ${parts.map(([k, v]) => `${NAME[k]} ${fmt(v)}`).join(', ')}${parts.length > 1 ? '으로' : '으로'} 채워요.`;
}
function whyOf(s, pv){
  let w;
  const tag = tagOf(s, pv);
  if (!pv) w = has(s, 'pen')
    ? `${T('IRP', '연금저축·IRP')}는 55세부터 1년에 1,500만원 안에서 꺼내면 세금이 3.3~5.5%로 낮아요. 그래서 처음부터 함께 써요. 나머지는 거의 불어나지 않는 현금·${T('ISA')}부터 쓰고, 그다음에 주식을 팔아요.`
    : `55세 전에는 ${T('IRP', '연금저축·IRP')}를 연금으로 받을 수 없어요. 그래서 거의 불어나지 않는 현금·${T('ISA')}부터 쓰고, 모자라면 주식을 팔아요.`;
  else if (tag === '모아 둔 돈 다 씀') w = '꺼내 쓸 돈을 다 써서 생활비가 모자라요. 계획 개선하기에서 이 나이를 늦추는 방법을 볼 수 있어요.';
  else if (tag === '국민연금 시작') w = `국민연금은 태어난 해에 따라 받는 나이가 정해져 있어요. 1985년생은 65세부터예요. 국민연금이 들어오는 만큼 다른 돈을 덜 꺼내요. 대신 국민연금의 절반이 ${T('건보료')} 계산에 들어가요.`;
  else if (tag === '현금·ISA 다 씀') w = `현금과 ISA를 다 썼어요. 이제 주식을 팔아 채워요. 주식은 판 돈 전체가 아니라 이익에만 ${T('양도세')}가 붙어요. 오래 갖고 있던 주식일수록 이익이 커서 세금도 늘어요.`;
  else if (tag === '주식 다 팖') w = `주식을 다 팔았어요. 이제 국민연금과 연금저축·IRP로만 지내요. 연금저축·IRP에서 1년에 1,500만원보다 많이 꺼내게 되어, 꺼낸 돈 전체에 세금이 더 붙어요. 연금저축·IRP 세금이 한 달 ${fmt(pv.tax.pensionAcct)}에서 ${fmt(s.tax.pensionAcct)}로 늘어요.`;
  else if (tag.endsWith('거의 다 씀')) {
    const k = GN.indexOf(tag.replace(' 거의 다 씀', ''));
    const up = [['pen', s.src.pen - pv.src.pen], ['stock', stockM(s) - stockM(pv)], ['cash', s.src.cash - pv.src.cash]].sort((a, b) => b[1] - a[1])[0];
    const before = {pen: pv.src.pen, stock: stockM(pv), cash: pv.src.cash}[up[0]], after = {pen: s.src.pen, stock: stockM(s), cash: s.src.cash}[up[0]];
    w = `남은 ${GN[k]}이 ${fmt(s.b0[k])}뿐이라 이 시기에 다 쓰게 돼요. 그만큼 ${NAME[up[0]]}에서 더 꺼내요(한 달 ${fmt(before)} → ${fmt(after)}).`;
  } else w = '꺼내는 곳의 비중이 조금 바뀌어요.';
  if (s.b1[1] > s.b0[1] * 1.03 && s.b0[1] > 0) w += ` 연금저축·IRP는 1년에 1,500만원 한도 안에서만 꺼내서, 꺼내는 돈보다 불어나는 돈이 커 오히려 늘어요.`;
  return w;
}
const ageTxt = s => s.a1 >= 100 ? `${s.a0}세부터` : `${s.a0}~${s.a1}세`;

// 흐름 그림 데이터(1년 기준)
const F = D.st.map(s => {
  const take = [stockM(s) * 12, s.src.pen * 12, s.src.cash * 12];
  const chg = s.b0.map((b, k) => (s.b1[k] - b) / s.n);
  const grow = chg.map((c, k) => s.b0[k] > 0 ? Math.max(0, c + take[k]) : 0);
  const tax = (Object.values(s.tax).reduce((a, b) => a + b, 0) - s.unpaid) * 12;
  return {take, grow, chg, b0: s.b0, nps: s.src.nps * 12, tax, net: s.net * 12, a0: s.a0, a1: s.a1};
});

// 시기별 자산 현황: 시작과 끝을 같은 눈금의 막대로
const BMAX = Math.max(...D.st.map(s => s.b0.reduce((a, b) => a + b, 0)), ...D.st.map(s => s.b1.reduce((a, b) => a + b, 0)));
const MIX = D.stockMix, STK_C = ['var(--c-stock)', 'color-mix(in srgb, var(--c-stock) 45%, var(--card))'];
const endLbl = s => s.a1 >= 100 ? '100세 끝' : (s.a1 + 1) + '세';
function stackBar(b){
  const tot = b.reduce((x, y) => x + y, 0);
  const seg = [[b[0], GC[0]], [b[1], GC[1]], [b[2], GC[2]]];
  return `<div class="sb"><div class="sbt">${seg.filter(x => x[0] > 0).map(([v, c]) => `<i style="width:${v / BMAX * 100}%;background:${c}"></i>`).join('')}</div><b class="num">${tot > 0 ? sh(tot) : '0'}</b></div>`;
}
function assetBox(s){
  const rows = [0, 1, 2].filter(k => s.b0[k] > 0 || s.b1[k] > 0);
  const rw = (name, c, a, b, sub) => { const d = b - a; return `<div class="ar${sub ? ' sub' : ''}"><span><i class="dot" style="background:${c}"></i>${name}</span><span class="num">${a > 0 ? sh(a) : '0'} → ${b > 0 ? sh(b) : '0'}</span><b class="num ${d < 0 ? 'neg' : 'pos'}">${Math.abs(d) < 1e4 ? '그대로' : (d > 0 ? '+' : '−') + sh(d)}</b></div>`; };
  return `<div class="sbs"><div class="sbr"><span>${s.a0}세</span>${stackBar(s.b0)}</div><div class="sbr"><span>${endLbl(s)}</span>${stackBar(s.b1)}</div></div>
      <div class="lgd2">${[0, 1, 2].filter(k => s.b0[k] > 0 || s.b1[k] > 0).map(k => `<span><i class="dot" style="background:${GC[k]}"></i>${['주식', '연금계좌', 'ISA·현금'][k]}</span>`).join('')}</div>
      <p>${s.n}년 동안 ${fmt(s.b0.reduce((a, b) => a + b, 0))}에서 ${s.b1.reduce((a, b) => a + b, 0) > 0 ? fmt(s.b1.reduce((a, b) => a + b, 0)) : '0원'}이 돼요.</p>`;
}
// 주식 계획: 배당주·성장주 비율, 배당으로 받는 돈과 파는 돈
function stockBox(s){
  return '';
  const div = s.src.div, sell = s.src.sell, tot = div + sell, dp = Math.round(div / tot * 100);
  return `<div class="box">
      <h4>주식에서 꺼내는 계획 <span class="u">한 달</span></h4>
      <div class="mixbar">${MIX.map((m, j) => `<i style="width:${m.share * 100}%;background:${STK_C[j]}"></i>`).join('')}</div>
      <div class="mixl">${MIX.map((m, j) => `<span><i class="dot" style="background:${STK_C[j]}"></i><b>${m.name} ${Math.round(m.share * 100)}%</b><small>${m.ex} · ${T('배당', '배당')} 연 ${(m.y * 100).toFixed(1)}% · ${sh(s.b0[0] * m.share)}</small></span>`).join('')}</div>
      <div class="rw"><span>배당으로 받는 돈</span><b class="num">${fmt(div)}</b></div>
      <div class="rw"><span>주식을 팔아서 쓰는 돈</span><b class="num">${fmt(sell)}</b></div>
      <div class="rw tot"><span>주식에서 한 달</span><b class="num">${fmt(tot)}</b></div>
      <div class="split"><i style="width:${div / tot * 100}%;background:${STK_C[0]}"></i><i style="width:${sell / tot * 100}%;background:${STK_C[1]}"></i></div>
      <p>${sell < 1e4 ? '배당만으로 충분해서 주식을 거의 팔지 않아요.' : `배당이 주식에서 쓰는 돈의 ${dp}%를 채우고, 나머지 ${fmt(sell)}은 주식을 팔아요. 팔 때는 배당주와 성장주를 갖고 있는 비율대로 팔아요.`}${div * 12 > 1e7 ? ` 배당이 1년에 1,000만원을 넘어서 건강보험료가 늘어요.` : ''}</p>
      <button type="button" class="mixgo">배당주 비중 바꿔 보기 ›</button>
    </div>`;
}

// 내 전략 한눈에: 최적 계산이 고른 방법을 계좌별로 한 번 훑기
function strategyHtml(){
  const O = D.strat.opt, infl = a => Math.pow(1 + D.infl, a - D.nowAge), capReal = a => 15e6 / infl(a);
  const penSt = D.st.find(s => s.src.pen >= 1e4), npsSt = D.st.find(s => s.src.nps >= 1e4);
  const overSt = D.st.find(s => s.src.pen >= 1e4 && s.tax.pensionAcct / s.src.pen > 0.06);
  const cashEnd = D.st.find((s, i) => i > 0 && s.src.cash < 1e4 && D.st[i - 1].src.cash >= 1e4);
  const divMax = D.div.reduce((m, x) => { const n = x.div * infl(x.a); return n > m.n ? {n, a: x.a} : m; }, {n: 0, a: 0});
  const divOver = D.div.filter(x => x.div * infl(x.a) > 1e7);
  const has = k => D.accts.some(a => a.includes(k));
  const eff = k => '';
  const rows = [];
  rows.push(['var(--c-live)', '꺼내 쓰는 순서', '현금 → 주식, 연금은 55세부터 함께',
    `거의 불어나지 않는 현금부터 쓰고, 그다음 해외주식을 팔아요. ${T('IRP', '연금저축·IRP')}는 세금이 낮은 한도 안에서 55세부터 함께 꺼내요.`]);
  if (penSt) rows.push(['var(--c-pen)', '연금저축·IRP', `${penSt.a0}세부터 · 1년에 1,500만원까지`,
    `55세 전에 꺼내면 16.5%, 55세부터 1년에 1,500만원 안에서 연금으로 꺼내면 3.3~5.5%만 내요. 1,500만원은 물가가 올라도 그대로라, 지금 돈으로 치면 ${penSt.a0}세에 약 ${fmt(capReal(penSt.a0))}, 80세에 약 ${fmt(capReal(80))}이에요.` +
    (overSt ? ` 다른 돈을 다 쓴 ${overSt.a0}세부터는 한도를 넘겨 꺼내고, 그 해에는 세금이 더 붙어요.` : '') + eff('pensionEarly') + eff('pensionLast')]);
  if (has('해외주식')) rows.push(['var(--c-stock)', '해외주식', O.harvest ? '해마다 이익 250만원만큼 정리' : '모자라는 만큼 팔기',
    (O.harvest ? `${T('양도세')}는 1년 이익 250만원까지 없어요. 그래서 해마다 이익 250만원만큼 팔았다가 바로 다시 사요. 이익을 세금 없이 정리해 두면, 나중에 팔 때 세금이 줄어요.` : `판 돈 전체가 아니라 이익에만 ${T('양도세')} 22%가 붙고, 1년 이익 250만원까지는 없어요.`) + eff('harvest')]);
  if (has('해외주식')) rows.push(['var(--c-stock)', '배당', divOver.length ? '1,000만원 넘는 해 있음' : '1년에 1,000만원 아래',
    divOver.length ? `배당이 1년에 1,000만원을 넘는 해(${divOver[0].a}~${divOver.at(-1).a}세)에는 배당 전부가 ${T('건보료')} 계산에 들어가요. 결과 화면의 주식 전략에서 배당주 비중을 바꿔 볼 수 있어요.`
      : `배당은 가장 많은 해(${divMax.a}세)에도 약 ${fmt(divMax.n)}이라 1,000만원 아래예요. 그래서 ${T('건보료')} 계산에 들어가지 않아요.`]);
  if (has('현금')) rows.push(['var(--c-cash)', '현금', cashEnd ? `${D.R}~${cashEnd.a0 - 1}세에 먼저 쓰기` : '먼저 쓰기', '현금은 거의 불어나지 않아서 먼저 써요. 그동안 주식과 연금계좌는 더 불어나요.']);
  if (npsSt) rows.push(['var(--c-nps)', '국민연금', `${npsSt.a0}세부터`, '1985년생은 65세부터 받아요. 들어오는 만큼 다른 돈을 덜 꺼내요.']);
  rows.push(['var(--c-put)', '은퇴 전', `저축 해마다 ${fmt(D.annualSaving)}`,
    (O.fillPension ? `연금저축·IRP에 해마다 900만원을 먼저 넣어 세금을 돌려받고, ` : '') + (O.openIsa ? `ISA에 해마다 2,000만원까지 넣고 3년마다 연금계좌로 옮겨요. ` : '') +
    `${O.fillPension || O.openIsa ? '나머지는' : '저축은'} 지금 계좌 비율대로 나눠 넣어요. 은퇴할 때 남은 빚 ${fmt(D.debtPaid)}은 한 번에 갚아요.`]);
  const im = IM.list[0];
  return `<div class="sec"><h2>내 전략 한눈에</h2></div>
  <section class="card strat">${rows.map(([c, t, w, b]) => `<div class="sg"><i style="background:${c}"></i><div><div class="sgh"><b>${t}</b><span>${w}</span></div><p>${b}</p></div></div>`).join('')}
  </section>`;
}
const stageHtml = D.st.map((s, i) => {
  const pv = D.st[i - 1], f = F[i], tag = tagOf(s, pv);
  const G = f.grow.reduce((a, b) => a + b, 0), Tk = f.take.reduce((a, b) => a + b, 0), C = f.chg.reduce((a, b) => a + b, 0);
  const t0 = s.b0.reduce((a, b) => a + b, 0), t1 = s.b1.reduce((a, b) => a + b, 0);
  const grossM = s.src.nps + s.src.pen + s.src.div + s.src.sell + s.src.cash, taxM = Object.values(s.tax).reduce((a, b) => a + b, 0) - s.unpaid;
  const srcRows = [['nps', s.src.nps, 'var(--c-nps)'], ['cash', s.src.cash, 'var(--c-cash)'], ['div', s.src.div, 'var(--c-stock)'], ['sell', s.src.sell, 'var(--c-stock)'], ['pen', s.src.pen, 'var(--c-pen)']].filter(x => x[1] >= 5e3);
  const SN = {nps: '국민연금', cash: 'ISA·현금', div: '주식 배당', sell: '주식 팔아서', pen: '연금저축·IRP'};
  const TN = {pensionAcct: '연금저축·IRP 세금', income: '국민연금·금융소득 세금', foreignDivTax: '해외 배당 세금', stock: '해외주식 양도세', isa: 'ISA 세금', health: '건강보험료', house: '집 보유세'};
  const max = Math.max(G, Tk, 1);
  return `
  <section class="card stage" id="s-${s.a0}">
    <div class="st-h"><h3>${ageTxt(s)}</h3>${tag ? `<span class="chip">${esc(tag)}</span>` : ''}</div>
    <p class="say">${sayOf(s)}</p>
    <div class="why"><b>${pv ? '왜 바뀌나요' : '왜 이렇게 쓰나요'}</b><p>${whyOf(s, pv)}</p></div>
    <div class="unit"><span>1년 기준</span></div>
    <div class="mk-flow" data-i="${i}"></div>
    <div class="box">
      <h4>1년에 자산은 <span class="u">1년</span></h4>
      <div class="rw"><span>불어나는 돈</span><b class="num">+${fmt(G)}</b></div>
      <div class="rw"><span>꺼내 쓰는 돈</span><b class="num">−${fmt(Tk)}</b></div>
      <div class="rw tot"><span>자산 변화</span><b class="num ${C < 0 ? 'neg' : ''}">${C >= 0 ? '+' : '−'}${fmt(Math.abs(C))}</b></div>
      ${f.nps >= 1e4 ? `<div class="rw ext"><span>국민연금은 자산 밖에서 따로 들어와요</span><b class="num">+${fmt(f.nps)}</b></div>` : ''}
      <p>${C >= 0 ? `불어나는 돈 안에서 꺼내 쓰니까 자산이 줄지 않아요.` : G < 1e5 ? `이 시기 돈은 거의 불어나지 않아서 꺼내는 만큼 줄어요.` : `불어나는 돈보다 ${fmt(-C)} 더 꺼내 써서, 그만큼 모아 둔 돈이 줄어요.`}</p>
      ${assetBox(s)}
    </div>
    <div class="box">
      <h4>한 달 생활비 <span class="u">한 달</span></h4>
      ${srcRows.map(([k, v, c]) => `<div class="rw"><span><i class="dot" style="background:${k === 'sell' ? 'color-mix(in srgb, var(--c-stock) 45%, var(--card))' : c}"></i>${SN[k]}에서</span><b class="num">${fmt(v)}</b></div>`).join('')}
      <div class="rw tot"><span>꺼내는 돈</span><b class="num">${fmt(grossM)}</b></div>
      <div class="rw"><span>세금·${T('건보료')}</span><b class="num neg">−${fmt(taxM)}</b></div>
      <div class="net"><span>손에 남는 돈</span><b class="num">${fmt(s.net)}</b></div>
      ${s.short >= 1e4 ? `<div class="rw"><span>모자라는 돈</span><b class="num neg">${fmt(s.short)}</b></div>` : ''}
    </div>
    ${stockBox(s)}
  </section>`;
}).join('');

// 모으기 그래프(5년마다 눈금, 처음·끝 금액)
const gmax = Math.max(...D.grow.map(g => g.bal));
const growHtml = `<div class="gch"><div class="gtop"><span class="num">${sh(D.grow[0].bal)}</span><span class="num" id="gEnd" data-v="${D.grow.at(-1).bal}" data-v0="${D.grow[0].bal}">${sh(D.grow.at(-1).bal)}</span></div>
  <div class="gbars">${D.grow.map(g => { const put = Math.min(g.put, g.bal); const g0 = D.grow[0]; return `<div title="${g.age}세"><i class="gr" data-h="${(g.bal - put) / gmax * 150}" data-h0="${(g0.bal - Math.min(g0.put, g0.bal)) / gmax * 150}" style="height:${(g.bal - put) / gmax * 150}px"></i><i class="pt" data-h="${put / gmax * 150}" data-h0="${Math.min(g0.put, g0.bal) / gmax * 150}" style="height:${put / gmax * 150}px"></i></div>`; }).join('')}</div>
  <div class="gax">${D.grow.map(g => `<span>${g.age === D.nowAge || g.age % 5 === 0 ? g.age + '세' : ''}</span>`).join('')}</div>
  <div class="lgd"><span><i style="background:var(--c-put)"></i>넣은 돈</span><span><i style="background:var(--c-grow)"></i>불어난 몫</span></div></div>`;
const grew = D.preDebt - D.start - D.savedReal - D.refundReal;

// 한눈에 보기
const tl = [[D.nowAge, '지금', `${fmt(D.start)}으로 시작해요.`, null], [D.R, '은퇴', `빚을 갚고 ${fmt(D.atL)}으로 매달 ${fmt(D.spend)}씩 쓰기 시작해요.`, 's-' + D.R]];
D.st.slice(1).forEach((s, i) => tl.push([s.a0, tagOf(s, D.st[i]), sayOf(s), 's-' + s.a0]));
tl.push([100, D.lastAge > 100 ? '100세' : D.lastAge + '세', D.lastAge > 100 ? `${fmt(D.left100.reduce((a, b) => a + b, 0))}이 남아요.` : '생활비가 모자라기 시작해요.', 's-left']);
const left = D.left100.reduce((a, b) => a + b, 0);

const page = `<title>은퇴 계산 레포트</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${CSS}
.mode{display:flex;gap:2px;margin-top:10px;padding:3px;border-radius:10px;background:var(--line)}
.mode button{flex:1;height:36px;border:0;border-radius:8px;background:transparent;color:var(--sub);font-size:14px;font-weight:700}
.mode button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.tl{display:flex;flex-direction:column}
.jump{position:relative;display:grid;grid-template-columns:16px 50px 1fr 16px;gap:10px;align-items:start;width:100%;padding:14px 0;border:0;border-top:1px solid var(--line);background:none;text-align:left;cursor:pointer}
.jump:first-child{border-top:0}.jump > b{font-size:17px;color:var(--accent)}.jump strong{display:block;font-size:16px}.jump small{display:block;font-size:14px;line-height:1.55;color:var(--sub);margin-top:3px}.jump i{font-style:normal;color:var(--faint);font-size:20px;align-self:center}
.jump::before{content:"";position:absolute;left:7px;top:0;bottom:0;width:2px;background:var(--accent-soft)}.jump:first-child::before{top:25px}.jump:last-child::before{bottom:calc(100% - 25px)}
.dt{position:relative;z-index:1;width:16px;height:16px;margin-top:4px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--card)}.jump:first-child .dt,.jump:last-child .dt{background:var(--card);border:3px solid var(--accent);box-sizing:border-box}
.jump{border-top:0}.jump.nolink{cursor:default}.jump.nolink i{visibility:hidden}
.gch{margin:4px 0 6px}.gtop{display:flex;justify-content:space-between;font-size:14px;font-weight:800;color:var(--sub)}
.gbars{display:flex;align-items:flex-end;gap:3px;height:154px;margin-top:4px;border-bottom:1px solid var(--line)}
.gbars > div{flex:1 1 0;min-width:0;display:flex;flex-direction:column;justify-content:flex-end}.gbars i{display:block}.gbars .gr{background:var(--c-grow);border-radius:3px 3px 0 0}.gbars .pt{background:var(--c-put)}
.gax{display:flex;gap:3px;margin-top:6px}.gax span{flex:1 1 0;min-width:0;font-size:13px;color:var(--sub);white-space:nowrap;overflow:visible;text-align:center}
.lgd{display:flex;gap:16px;font-size:14px;margin-top:10px}.lgd i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.kv.minus b{color:var(--bad)}
.chg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 6px 12px;font-size:16px;font-weight:800}.chg span{font-size:14px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.18)}
.stage{scroll-margin-top:64px}
.st-h{display:flex;align-items:center;justify-content:space-between;gap:10px}.st-h h3{margin:0;font-size:24px;letter-spacing:-.02em}
.chip{font-size:14px;font-weight:700;padding:5px 10px;border-radius:20px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.say{font-size:17px;font-weight:700;line-height:1.6;margin:10px 0 12px}
.why{background:var(--bg);border-radius:14px;padding:14px 16px;margin-bottom:16px}.why b{font-size:15px;color:var(--accent)}.why p{margin:4px 0 0;font-size:16px;line-height:1.7}
.unit{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;color:var(--sub);padding-top:14px;border-top:1px solid var(--line)}.unit span,.u{font-size:13px;font-weight:800;padding:2px 8px;border-radius:6px;background:var(--ink);color:var(--card)}
.box{margin-top:12px;padding:16px;border-radius:16px;background:var(--bg)}
.box h4{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:17px}
.rw{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:38px;font-size:16px}.rw b{white-space:nowrap}.rw .neg,.neg{color:var(--bad)}
.rw.tot{border-top:1px solid var(--line);margin-top:4px;padding-top:6px;font-weight:800;font-size:17px}
.rw.ext{font-size:14px;color:var(--sub);min-height:30px}.rw.ext span{min-width:0}.rw.ext b{font-weight:700}
.box p{margin:8px 0 0;font-size:15px;line-height:1.65;color:var(--sub)}
.cmp{display:flex;flex-direction:column;gap:7px;margin:8px 0 8px}.cmp div{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--sub)}.cmp span{width:76px;flex:none;white-space:nowrap}.cmp i{display:block;height:12px;border-radius:3px;max-width:calc(100% - 84px)}
.sbs{display:flex;flex-direction:column;gap:8px;margin:8px 0 10px}.sbr{display:grid;grid-template-columns:64px 1fr;align-items:center;gap:8px;font-size:14px;color:var(--sub)}
.sb{display:flex;align-items:center;gap:8px;min-width:0}.sb b{font-size:14px;color:var(--ink);white-space:nowrap}.sbt{flex:1;display:flex;height:22px;border-radius:5px;overflow:hidden;background:var(--line);min-width:0}.sbt i{display:block;height:100%}
.ars{border-top:1px solid var(--line);padding-top:4px}.ar{display:grid;grid-template-columns:minmax(0,1fr) auto 70px;gap:8px;align-items:center;min-height:38px;font-size:15px}.ar > span{white-space:nowrap}.ar > span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis}.ar b{text-align:right;font-size:15px}.ar .pos{color:var(--ink)}
.ar.sub{min-height:30px;font-size:14px;color:var(--sub);padding-left:18px}.ar.sub b{font-size:14px;font-weight:600}
.mixbar,.split{display:flex;height:16px;border-radius:5px;overflow:hidden;margin:10px 0 8px}.mixbar i,.split i{display:block;height:100%}.split{height:10px;margin:4px 0 0}
.mixl{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}.mixl span{font-size:15px}.mixl small{display:block;font-size:13px;color:var(--sub);margin-left:18px}
.lgd2{display:flex;gap:14px;font-size:14px;color:var(--sub);margin-bottom:4px}.strat{display:flex;flex-direction:column;gap:0}.sg{display:grid;grid-template-columns:6px 1fr;gap:14px;padding:16px 0;border-top:1px solid var(--line)}.sg:first-child{border-top:0;padding-top:2px}
.sg > i{display:block;border-radius:3px}.sgh{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}.sgh b{font-size:17px}.sgh span{font-size:15px;font-weight:700;color:var(--accent)}
.sg p{margin:6px 0 0;font-size:16px;line-height:1.7}.sg .eff{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:8px;background:var(--accent-soft);color:var(--accent);font-size:14px;font-weight:700}
.sgnext{margin-top:6px;padding:14px 16px;border-radius:14px;background:var(--bg);font-size:15px;line-height:1.65}.sgnext b{color:var(--accent)}
.mixgo{margin-top:10px;border:0;background:none;padding:6px 0;color:var(--accent);font-size:15px;font-weight:700;cursor:pointer}
.move{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line);font-size:16px}.move span{color:var(--sub);margin-right:2px}.move i{font-style:normal;color:var(--faint)}.move small{font-size:14px;color:var(--sub)}
.net{display:flex;justify-content:space-between;align-items:center;min-height:54px;margin-top:6px;padding:0 14px;border-radius:12px;background:var(--accent-soft);font-size:17px;font-weight:800}.net b{font-size:22px;color:var(--accent)}
details{margin-top:10px;border-top:1px solid var(--line)}summary{min-height:46px;display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:700;color:var(--accent);cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}summary::after{content:"⌄";font-size:18px;transition:transform .2s}details[open] summary::after{transform:rotate(180deg)}
.dl{padding:6px 0;border-top:1px dashed var(--line)}.dl .rw{font-size:15px;min-height:34px}.dlh{font-size:14px;color:var(--sub);margin:4px 0}
.dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px}
.left{display:flex;flex-direction:column;gap:2px}
.go{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;cursor:pointer}.go span{flex:1}.go b{font-size:18px}.go small{display:block;font-size:15px;color:var(--sub);margin-top:4px}.go i{font-style:normal;font-size:22px;color:var(--faint)}
.rnote{padding:16px 18px;border-radius:16px;background:rgba(255,255,255,.12);font-size:15px;line-height:1.7}.rnote b{font-size:16px}
/* 흐름 그림 */
.mk-flow{margin-top:8px}.mk-track{position:relative}.mk-pin{padding:8px 0 4px;background:var(--card)}.mk-flow.scroll .mk-pin{position:sticky}
.mk-dots{display:flex;gap:6px;margin:2px 0 8px}.mk-dots i{width:22px;height:4px;border-radius:2px;background:var(--line)}.mk-dots i.on{background:var(--accent)}
.mk-cap{position:relative;height:56px;font-size:16px;line-height:1.55}.mk-cap > span{position:absolute;inset:0;opacity:0;transition:opacity .25s}.mk-cap > span.on{opacity:1}.mk-cap b{font-weight:800}.mk-cap small{font-size:14px;color:var(--sub)}
.mk-stage{position:relative;width:300px;max-width:100%;height:276px;margin:0 auto}
.mk-col,.mk-chunk,.mk-lv,.mk-tax{position:absolute;display:block}
.mk-col{border-radius:6px 6px 0 0}.mk-col .gl{position:absolute;left:0;right:0;border-top:2px dashed rgba(255,255,255,.8)}
.mk-col em{position:absolute;left:0;right:0;bottom:8px;text-align:center;color:rgba(255,255,255,.9);font-style:normal;font-size:13px;letter-spacing:2px}
.mk-col.none{background:var(--chip)!important}.mk-col.none em{display:none}
.mk-chunk{opacity:0;will-change:transform}.mk-lv{background:var(--c-live);border-radius:6px 6px 0 0}.mk-tax{background:var(--bad);border-radius:6px 6px 0 0;opacity:0}
.mk-slot{position:absolute;border:2px dashed var(--line);border-bottom:0;border-radius:8px 8px 0 0}
.mk-up{position:absolute;text-align:center;font-size:13px;font-weight:800;opacity:0;white-space:nowrap;color:var(--ink)}
.mk-taxl{position:absolute;right:0;text-align:right;font-size:13px;font-weight:800;color:var(--bad);opacity:0;white-space:nowrap}
.mk-base{position:absolute;height:0;border-top:2px dashed var(--ink);opacity:0;z-index:2}
.mk-gap{position:absolute;border:2px dashed;border-bottom:0;border-top:0;background:repeating-linear-gradient(135deg,transparent 0 5px,var(--line) 5px 7px);opacity:0}
.mk-net{position:absolute;text-align:center;font-size:13px;font-weight:800;white-space:nowrap;opacity:0}.mk-net.dn{color:var(--bad)}.mk-net.upn{color:var(--ink)}
.mk-cl{position:absolute;text-align:center;font-size:12px;font-weight:800;white-space:nowrap;opacity:0;pointer-events:none}.mk-npsl{position:absolute;text-align:center;font-size:13px;font-weight:800;color:var(--c-nps);opacity:0;white-space:nowrap}
.mk-lab{position:absolute;top:214px;text-align:center;line-height:1.35}.mk-lab b{display:block;font-size:13px}.mk-lab span{display:block;font-size:13px;color:var(--sub)}
.mk-arrow{position:absolute;top:110px;left:190px;font-size:22px;color:var(--faint)}.mk-floor{position:absolute;left:0;right:0;top:210px;border-top:1px solid var(--line)}
.again{display:block;margin:2px auto 0;height:40px;padding:0 18px;border:0;border-radius:20px;background:var(--bg);color:var(--accent);font-size:15px;font-weight:700;visibility:hidden;cursor:pointer}.again.show{visibility:visible}
</style>
<div class="wrap">
<div class="bar"><span>‹ 뒤로</span><b>은퇴 계산 레포트</b><span></span></div>
<div class="note">시안이에요. 예시(1985년생, 55세 은퇴, 생활비 300만원)를 앱과 같은 계산 엔진으로 계산했어요. 지금 가진 계좌 안에서 가장 좋은 방법으로 계산했어요. 밑줄 친 말을 누르면 뜻이 나와요.
<div class="mode" role="group" aria-label="그림이 움직이는 방식"><button type="button" data-m="play">도착하면 재생</button><button type="button" data-m="scroll">스크롤로 움직이기</button></div></div>
<div class="rep">
  <div class="rhead"><small>지금 ${D.nowAge}세 · ${D.R}세 은퇴 · 2026년 세법 기준</small><h1>내 은퇴 계획</h1></div>
  <section class="card">
    <p class="lead">${D.R}세에 은퇴하면<br>매달 <em>${fmt(D.spend)}</em>씩<br><em>${D.lastAge > 100 ? '100세 넘어서' : D.lastAge + '세'}</em>까지 쓸 수 있어요</p>
    <div class="kv"><span>은퇴할 때 모이는 돈<small>남은 빚 ${fmt(D.debtPaid)}을 갚은 뒤</small></span><b class="num">${fmt(D.atL)}</b></div>
    <div class="kv"><span>매달 쓰는 돈<small>세금·건보료를 내고 손에 남는 돈</small></span><b class="num">${fmt(D.spend)}</b></div>
    <div class="kv"><span>100세에 남는 돈<small>연금저축·IRP에 남아요 · 세금 내기 전</small></span><b class="num">${fmt(left)}</b></div>
    <div class="kv hl"><span>최대로 쓰면<small>${D.planAge}세까지 바닥나지 않는 가장 큰 금액</small></span><b class="num">한 달 ${fmt(D.maxMonthly)}</b></div>
    <p class="fine">모든 금액은 ${T('물가', '현재 물가 기준')}이에요. 집 ${fmt(D.house)}은 빼고 계산했어요.</p>
  </section>
${strategyHtml()}
  <div class="sec"><h2>한눈에 보기</h2></div>
  <section class="card tl">${tl.map(t => t[3] ? `<button type="button" class="jump" data-to="${t[3]}"><em class="dt"></em><b>${t[0]}세</b><span><strong>${esc(t[1])}</strong><small>${t[2]}</small></span><i>›</i></button>` : `<div class="jump nolink"><em class="dt"></em><b>${t[0]}세</b><span><strong>${esc(t[1])}</strong><small>${t[2]}</small></span><i></i></div>`).join('')}</section>
  <div class="sec"><small style="opacity:.85;font-size:15px">1</small><h2>은퇴할 때까지 모으기</h2></div>
  <section class="card">
    <p class="lead">해마다 ${fmt(D.annualSaving)}씩 모으고, 물가를 빼고 1년에 약 ${(Math.round(D.realRet * 1000) / 10)}%씩 불어나요</p>
    ${growHtml}
    <div class="kv"><span>지금 자산</span><b class="num">${fmt(D.start)}</b></div>
    <div class="kv"><span>+ ${D.R - D.nowAge}년 동안 저축</span><b class="num">${fmt(D.savedReal)}</b></div>
    <div class="kv"><span>+ 돌려받은 세금<small>연금저축·IRP에 넣어 돌려받은 돈</small></span><b class="num">${fmt(D.refundReal)}</b></div>
    <div class="kv"><span>+ 불어난 몫</span><b class="num">${fmt(grew)}</b></div>
    <div class="kv minus"><span>− 남은 빚 갚기<small>은퇴할 때 모은 돈으로 한 번에</small></span><b class="num">−${fmt(D.debtPaid)}</b></div>
    <div class="kv hl"><span><b style="color:inherit">= 은퇴할 때</b></span><b class="num">${fmt(D.atL)}</b></div>
    <p class="fine">수익률 ${D.ret * 100}%에서 물가 ${D.infl * 100}%를 빼고 계산했어요. 빚은 해마다 갚다가 은퇴할 때 남은 만큼 한 번에 갚는다고 봤어요.</p>
  </section>
  <div class="sec"><small style="opacity:.85;font-size:15px">2</small><h2>은퇴 후, 시기마다 꺼내 쓰는 돈</h2></div>
  ${stageHtml}
  <div class="sec" id="s-left"><small style="opacity:.85;font-size:15px">3</small><h2>100세에 남는 돈</h2></div>
  <section class="card">
    <p class="lead">${D.lastAge > 100 ? `100세가 되어도<br><em>${fmt(left)}</em>이 남아요` : `${D.lastAge}세에 바닥나요`}</p>
    <div class="left">${[0, 1, 2].filter(k => D.left100[k] >= 1e4).map(k => `<div class="rw"><span><i class="dot" style="background:${GC[k]}"></i>${GN[k]}</span><b class="num">${fmt(D.left100[k])}</b></div>`).join('')}</div>
    <p class="fine">연금저축·IRP는 1년에 1,500만원 한도 안에서 천천히 꺼내서 마지막까지 남아요. 세금을 내기 전 금액이라, 한꺼번에 찾으면 세금이 붙어요.<br>이 돈을 살면서 더 쓰고 싶다면 매달 최대 ${fmt(D.maxMonthly)}까지 쓸 수 있어요.</p>
  </section>
  <button type="button" class="card go"><span><b>결과 화면에서 자세히 보기</b><small>나이별 자산, 주식 전략, 세금을 보고 바꿀 수 있어요</small></span><i>›</i></button>
  <div class="rnote"><b>알아 두세요</b><br>· 수익률 ${D.ret * 100}%, 물가 ${D.infl * 100}%로 계산했어요. 실제 수익률은 해마다 달라요.<br>· 2026년 세법으로 계산했어요. 세법이 바뀌면 금액도 달라져요.<br>· 계산 결과일 뿐 투자 추천이 아니에요.</div>
</div>
</div>
<div class="dim" id="dim"></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="shT"><h3 id="shT"></h3><p id="shP"></p><button type="button" id="shX">닫기</button></div>
<script>
const TERMS = ${JSON.stringify(TERMS)};
const FLOWS = ${JSON.stringify(F)};
${fs.readFileSync(__dirname + '/client.js', 'utf8')}
</script>`;
fs.writeFileSync(__dirname + '/retire-report.html', page);
console.log('ok', page.length);
