(function(){
  const $ = id => document.getElementById(id);
  const fmt = v => { const n = v < 0; v = Math.round(Math.abs(v) / 1e4); if (!v) return '0원'; const e = Math.floor(v / 1e4), m = v % 1e4; return (n ? '−' : '') + (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + '원'; };
  const sh = v => { const n = v < 0; v = Math.abs(v) / 1e4; return (n ? '−' : '') + (v >= 1e4 ? (Math.round(v / 1e3) / 10) + '억' : Math.round(v).toLocaleString('ko-KR') + '만'); };
  const sgn = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v)).replace('−', '');
  const GC = ['var(--c-stock)', 'var(--c-pen)', 'var(--c-cash)'], GN = ['주식', '연금계좌', 'ISA·현금'];
  const STK2 = 'color-mix(in srgb, var(--c-stock) 45%, var(--card))';
  const SRC = [['nps', '국민연금', 'var(--c-nps)'], ['cash', 'ISA·현금', 'var(--c-cash)'], ['div', '주식 배당', 'var(--c-stock)'], ['sell', '주식 판 돈', STK2], ['pen', '연금저축·IRP', 'var(--c-pen)']];
  const TN = {pensionAcct: '연금저축·IRP 세금', income: '국민연금·금융소득 세금', foreignDivTax: '해외 배당 세금', stock: '해외주식 양도세', isa: 'ISA 세금', health: '건강보험료', house: '집 보유세'};
  let cur = ACT, age = RET, si = 0;
  const S = () => SC[cur];
  const stageOf = a => S().st.findIndex(s => a >= s.a0 && a <= s.a1);

  // 용어 풀이 · 알림
  const sheet = $('sheet'), dim = $('dim'); let lastBtn = null;
  const closeSheet = () => { sheet.classList.remove('on'); dim.classList.remove('on'); if (lastBtn) lastBtn.focus(); };
  document.addEventListener('click', e => { const b = e.target.closest('.term'); if (!b) return; e.preventDefault(); const t = TERMS[b.dataset.t]; if (!t) return; lastBtn = b; $('shT').textContent = t[0]; $('shP').textContent = t[1]; sheet.classList.add('on'); dim.classList.add('on'); $('shX').focus(); });
  $('shX').onclick = closeSheet; dim.onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('on')) closeSheet(); });
  let tt = 0; const toast = m => { $('toast').textContent = m + ' (시안)'; $('toast').classList.add('on'); clearTimeout(tt); tt = setTimeout(() => $('toast').classList.remove('on'), 2000); };
  document.querySelectorAll('[data-toast]').forEach(b => b.onclick = () => toast(b.dataset.toast));

  // 요약
  function hero(){
    const s = S(), left = s.left100.reduce((a, b) => a + b, 0);
    $('hBig').innerHTML = s.lastAge > 100 ? '<em>100세 넘어서</em>까지<br>쓸 수 있어요' : `<em class="bad">${s.lastAge}세</em>에<br>생활비가 모자라요`;
    $('hAt').textContent = sh(s.atL); $('hLeft').textContent = sh(left); $('hMax').textContent = fmt(s.maxMonthly);
  }

  // 나이별 자산(쌓은 면 그래프)
  const W = 320, H = 190, L = 32, R = 8, Tp = 8, Bt = 22;
  const YMAX = Math.max(...SC.flatMap(s => s.yearly.map(y => y.g[0] + y.g[1] + y.g[2])));
  const STEP = YMAX > 8e8 ? 2e8 : 1e8, TOP = Math.ceil(YMAX / STEP) * STEP;
  const x = a => L + (a - NOW) / (100 - NOW) * (W - L - R), y = v => Tp + (1 - v / TOP) * (H - Tp - Bt);
  function chart(){
    const Y = S().yearly; let g = '';
    for (let v = 0; v <= TOP + 1; v += STEP) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v) + 4}" text-anchor="end">${v ? v / 1e8 + '억' : '0'}</text>`;
    const acc = Y.map(() => 0);
    [0, 1, 2].forEach(k => {
      const lo = acc.slice(); Y.forEach((p, i) => acc[i] += p.g[k]);
      const d = Y.map((p, i) => (i ? 'L' : 'M') + x(p.a).toFixed(1) + ' ' + y(acc[i]).toFixed(1)).join(' ') + ' ' + Y.map((p, i) => 'L' + x(Y[Y.length - 1 - i].a).toFixed(1) + ' ' + y(lo[Y.length - 1 - i]).toFixed(1)).join(' ') + 'Z';
      g += `<path d="${d}" fill="${GC[k]}" opacity=".9"/>`;
    });
    [NOW, RET, 65, 80, 100].forEach(a => g += `<text x="${x(a)}" y="${H - 6}" text-anchor="${a === 100 ? 'end' : a === NOW ? 'start' : 'middle'}">${a}세</text>`);
    g += `<line x1="${x(RET)}" x2="${x(RET)}" y1="${Tp}" y2="${H - Bt}" stroke="var(--ink)" stroke-dasharray="3 3" opacity=".5"/><text x="${x(RET) + 4}" y="${Tp + 10}">은퇴</text>`;
    const p = Y.find(q => q.a === age) || Y.at(-1), tot = p.g[0] + p.g[1] + p.g[2];
    g += `<line x1="${x(age)}" x2="${x(age)}" y1="${Tp}" y2="${H - Bt}" stroke="var(--ink)" stroke-width="1.5"/><circle cx="${x(age)}" cy="${y(tot)}" r="5" fill="var(--card)" stroke="var(--ink)" stroke-width="2"/>`;
    $('ach').innerHTML = g;
  }
  function pick(){
    const Y = S().yearly, p = Y.find(q => q.a === age) || Y.at(-1), prev = Y.find(q => q.a === age - 1), tot = p.g[0] + p.g[1] + p.g[2];
    $('sAge').textContent = age + '세'; $('sTot').textContent = fmt(tot);
    const k = stageOf(age), st = S().st[k];
    $('sPhase').textContent = age < RET ? '은퇴 전 · 모으는 시기' : st ? `은퇴 후 · ${st.a1 >= 100 ? st.a0 + '세부터' : st.a0 + '~' + st.a1 + '세'} 시기` : '';
    const mix = S().share;
    $('sRows').innerHTML = [0, 1, 2].filter(k => p.g[k] > 5e3 || (prev && prev.g[k] > 5e3)).map(k => `<div class="rw"><span><i class="dot" style="background:${GC[k]}"></i>${GN[k]}</span><b class="num">${fmt(p.g[k])}</b></div>` +
      (k === 0 && p.g[0] > 5e3 ? `<div class="rw sub"><span><i class="dot" style="background:var(--c-stock)"></i>배당주 ${Math.round(mix * 100)}%</span><b class="num">${fmt(p.g[0] * mix)}</b></div><div class="rw sub"><span><i class="dot" style="background:${STK2}"></i>성장주 ${Math.round((1 - mix) * 100)}%</span><b class="num">${fmt(p.g[0] * (1 - mix))}</b></div>` : '')).join('') +
      (prev ? `<div class="rw" style="border-top:1px solid var(--line);margin-top:4px"><span>1년 전보다</span><b class="num ${tot < prev.g.reduce((a, b) => a + b, 0) ? 'neg' : ''}">${sgn(tot - prev.g.reduce((a, b) => a + b, 0))}</b></div>` : '');
    $('sSay').textContent = age < RET ? '해마다 저축하고 불어나면서 늘어나요. 은퇴하는 해에 남은 빚을 갚아요.' : st ? sayOf(st) : '';
    $('age').value = age;
  }
  function sayOf(s){
    const parts = [['국민연금', s.src.nps], ['ISA·현금', s.src.cash], ['주식', s.src.div + s.src.sell], ['연금저축·IRP', s.src.pen]].filter(x => x[1] >= 1e4).sort((a, b) => b[1] - a[1]);
    return `이 시기에는 한 달 생활비를 ${parts.map(([n, v]) => `${n} ${fmt(v)}`).join(', ')}으로 채워요.`;
  }
  const ach = $('ach');
  const ageAt = e => { const r = ach.getBoundingClientRect(), px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width * W; return Math.max(NOW, Math.min(100, Math.round(NOW + (px - L) / (W - L - R) * (100 - NOW)))); };
  let drag = false;
  ach.addEventListener('pointerdown', e => { drag = true; setAge(ageAt(e)); });
  addEventListener('pointermove', e => { if (drag) setAge(ageAt(e)); });
  addEventListener('pointerup', () => drag = false);
  $('age').addEventListener('input', e => setAge(+e.target.value));
  function setAge(a){ age = a; const k = stageOf(a); if (k >= 0 && k !== si) { si = k; monthly(); } chart(); pick(); }

  // 매달 꺼내 쓰는 곳
  function chips(){
    $('chips').innerHTML = S().st.map((s, i) => `<button type="button" data-i="${i}" aria-pressed="${i === si}" class="${i === si ? 'on' : ''}">${s.a1 >= 100 ? s.a0 + '세~' : s.a0 + '~' + s.a1 + '세'}</button>`).join('');
    $('chips').querySelectorAll('button').forEach(b => b.onclick = () => { si = +b.dataset.i; age = S().st[si].a0; monthly(); chart(); pick(); });
  }
  function monthly(){
    chips();
    const s = S().st[si], gross = SRC.reduce((t, [k]) => t + s.src[k], 0), tax = Object.values(s.tax).reduce((a, b) => a + b, 0) - s.unpaid;
    const rows = SRC.filter(([k]) => s.src[k] >= 5e3);
    $('mStack').innerHTML = rows.map(([k, , c]) => `<i style="width:${s.src[k] / gross * 100}%;background:${c}"></i>`).join('');
    $('mRows').innerHTML = rows.map(([k, n, c]) => `<div class="rw"><span><i class="dot" style="background:${c}"></i>${n}</span><b class="num">${fmt(s.src[k])}</b></div>`).join('') + `<div class="rw" style="border-top:1px solid var(--line);margin-top:4px;font-weight:800"><span>꺼내는 돈</span><b class="num">${fmt(gross)}</b></div>`;
    $('mTaxT').textContent = '−' + fmt(tax);
    $('mTaxRows').innerHTML = Object.entries(s.tax).filter(([, v]) => v >= 5e3).map(([k, v]) => `<div class="rw sub"><span>${TN[k]}</span><b class="num neg">−${fmt(v)}</b></div>`).join('');
    $('mNet').textContent = fmt(s.net);
  }

  // 주식 전략
  function stock(){
    const s = S(), a = SC[ACT];
    document.querySelectorAll('#mixSeg button').forEach(b => { const on = +b.dataset.i === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('mixBar').innerHTML = `<i style="width:${s.share * 100}%;background:var(--c-stock)"></i><i style="width:${(1 - s.share) * 100}%;background:${STK2}"></i>`;
    $('mixA').textContent = `배당주 ${Math.round(s.share * 100)}% · 배당 연 3.5%`; $('mixB').textContent = `성장주 ${Math.round((1 - s.share) * 100)}% · 0.6%`;
    $('stkT').innerHTML = s.st.map(x => `<tr><td>${x.a1 >= 100 ? x.a0 + '세~' : x.a0 + '~' + x.a1 + '세'}</td><td>${x.src.div >= 1e4 ? sh(x.src.div) : '–'}</td><td>${x.src.sell >= 1e4 ? sh(x.src.sell) : '–'}</td><td>${sh(x.tax.health)}</td></tr>`).join('');
    const avgH = z => { const n = z.st.reduce((t, x) => t + x.n, 0); return z.st.reduce((t, x) => t + x.tax.health * x.n, 0) / n; };
    const L1 = s.left100.reduce((p, q) => p + q, 0), L0 = a.left100.reduce((p, q) => p + q, 0);
    $('cmpx').innerHTML = cur === ACT ? '<b>지금 설정이에요.</b><br>다른 비중을 눌러 결과가 어떻게 달라지는지 비교해 보세요.'
      : `<b>지금(${Math.round(a.share * 100)}%)과 비교하면</b><br>100세에 남는 돈 <b class="${L1 < L0 ? 'neg' : ''}">${sgn(L1 - L0)}</b><br>최대로 쓰면 한 달 <b class="${s.maxMonthly < a.maxMonthly ? 'neg' : ''}">${sgn(s.maxMonthly - a.maxMonthly)}</b><br>건강보험료 한 달 평균 <b class="${avgH(s) > avgH(a) ? 'neg' : ''}">${sgn(avgH(s) - avgH(a))}</b>` +
        (s.share > a.share ? '<br><span style="color:var(--sub)">배당을 많이 받으면 팔 일은 줄지만, 배당에는 해마다 세금이 붙고 건강보험료 계산에도 들어가요.</span>' : '<br><span style="color:var(--sub)">배당이 적으면 주식을 더 팔지만, 판 돈은 이익에만 세금이 붙고 건강보험료에 들어가지 않아요.</span>');
    $('save').disabled = cur === ACT;
  }
  document.querySelectorAll('#mixSeg button').forEach(b => b.onclick = () => { cur = +b.dataset.i; si = Math.max(0, stageOf(age)); renderAll(); });
  $('save').onclick = () => toast('주식 설정이 이 비중으로 바뀌어요');

  // 세금 합계
  function taxes(){
    const sum = {}; S().st.forEach(x => Object.entries(x.tax).forEach(([k, v]) => sum[k] = (sum[k] || 0) + v * 12 * x.n));
    const rows = Object.entries(sum).filter(([, v]) => v >= 1e5).sort((a, b) => b[1] - a[1]), tot = rows.reduce((t, r) => t + r[1], 0), mx = rows[0] ? rows[0][1] : 1;
    $('txTot').textContent = fmt(tot);
    $('txRows').innerHTML = rows.map(([k, v]) => `<div><span>${TN[k]}</span><b class="num">${fmt(v)}</b><i style="width:${v / mx * 100}%"></i></div>`).join('');
  }
  function renderAll(){ hero(); chart(); pick(); monthly(); stock(); taxes(); }
  si = Math.max(0, stageOf(age)); renderAll();
})();
