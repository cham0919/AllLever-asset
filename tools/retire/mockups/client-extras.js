(function(){
  const fmt = v => { v = Math.round(Math.abs(v) / 1e4); if (!v) return '0원'; const e = Math.floor(v / 1e4), m = v % 1e4; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + '원'; };
  const still = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  // 용어 풀이
  const sheet = document.getElementById('sheet'), dim = document.getElementById('dim'); let lastBtn = null;
  const closeSheet = () => { sheet.classList.remove('on'); dim.classList.remove('on'); if (lastBtn) lastBtn.focus(); };
  document.addEventListener('click', e => { const b = e.target.closest('.term'); if (!b) return; const t = TERMS[b.dataset.t]; if (!t) return;
    lastBtn = b; document.getElementById('shT').textContent = t[0]; document.getElementById('shP').textContent = t[1]; sheet.classList.add('on'); dim.classList.add('on'); document.getElementById('shX').focus(); });
  document.getElementById('shX').onclick = closeSheet; dim.onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('on')) closeSheet(); });

  // 선 그래프(41세~100세, 현재 물가 기준 자산)
  const W = 320, H = 190, L = 34, R = 10, Tp = 10, Bt = 24, A0 = NOW, A1 = 100;
  function chart(svg, series, sel, colors){
    const max = Math.max(...series.flatMap(s => s.path.map(p => p.v)), 1);
    const cap = Math.min(max, 20e8), step = cap > 12e8 ? 5e8 : cap > 8e8 ? 4e8 : 2e8, top = Math.ceil(cap / step) * step;
    const x = a => L + (a - A0) / (A1 - A0) * (W - L - R), y = v => Tp + (1 - v / top) * (H - Tp - Bt);
    let g = `<defs><clipPath id="c${svg.id}"><rect x="${L}" y="${Tp - 2}" width="${W - L - R + 2}" height="${H - Tp - Bt + 2}"/></clipPath></defs>`;
    for (let v = 0; v <= top + 1; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v ? v / 1e8 + '억' : '0'}</text>`;
    [A0, RET, 65, 80, 100].forEach(a => { g += `<text x="${x(a)}" y="${H - 6}" text-anchor="${a === 100 ? 'end' : 'middle'}">${a}세</text>`; });
    g += `<line x1="${x(RET)}" x2="${x(RET)}" y1="${Tp}" y2="${H - Bt}" stroke="var(--faint)" stroke-dasharray="3 3"/><text x="${x(RET) + 4}" y="${Tp + 10}" style="font-size:11px">은퇴</text>`;
    const order = series.map((s, i) => i).sort((a, b) => (a === sel) - (b === sel));
    order.forEach(i => { const s = series[i], on = i === sel;
      const d = s.path.map((p, k) => (k ? 'L' : 'M') + x(p.age).toFixed(1) + ' ' + y(Math.max(0, p.v)).toFixed(1)).join(' ');
      g += `<path clip-path="url(#c${svg.id})" d="${d}" fill="none" stroke="${colors ? colors[i] : on ? 'var(--accent)' : 'var(--faint)'}" stroke-width="${on ? 3 : 1.6}" stroke-linejoin="round" stroke-linecap="round" opacity="${on || colors ? 1 : .7}"/>`;
      if (on) { const end0 = s.lastAge <= 100 ? s.path.find(p => p.age >= s.lastAge) || s.path.at(-1) : s.path.at(-1);
        const end = end0; if (end.v <= top) g += `<circle cx="${x(end.age)}" cy="${y(Math.max(0, end.v))}" r="4.5" fill="${colors ? colors[i] : 'var(--accent)'}" stroke="var(--card)" stroke-width="2"/>`; }
    });
    svg.innerHTML = g;
  }
  const say = s => s.lastAge > 100 ? `<em>100세 넘어서</em>까지 쓸 수 있어요` : `<em class="bad">${s.lastAge}세</em>에 생활비가 모자라기 시작해요`;

  // 수익률
  const rBtns = document.querySelectorAll('[data-r]');
  function setRate(i){
    const r = RATES[i];
    rBtns.forEach(b => { const on = +b.dataset.r === i; b.classList.toggle('on', on); if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', on); });
    document.getElementById('rAns').innerHTML = `수익률이 연 ${Math.round(r.rate * 100)}%면 매달 300만원씩 ${say(r)}`;
    document.getElementById('rSub').textContent = r.lastAge > 100 ? `100세에 ${fmt(r.left100)}이 남고, 최대로 쓰면 한 달 ${fmt(r.monthly)}까지 쓸 수 있어요.` : `생활비를 한 달 ${fmt(r.monthly)}로 줄이면 ${95}세까지 버틸 수 있어요.`;
    chart(document.getElementById('rChart'), RATES, i);
  }
  document.querySelectorAll('button[data-r]').forEach(b => b.onclick = () => setRate(+b.dataset.r));
  setRate(RATES.findIndex(r => Math.abs(r.rate - .06) < 1e-9));

  // 주가 하락
  const SC = ['var(--c-put)', 'var(--bad)', 'var(--c-stock)'];
  function setShock(i){
    const s = SHOCKS[i];
    document.querySelectorAll('[data-s]').forEach(b => { const on = +b.dataset.s === i; b.classList.toggle('on', on); if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', on); });
    document.getElementById('sAns').innerHTML = (i === 0 ? '주가가 떨어지지 않으면 ' : `${s.name.replace(' −30%', '이 30% 떨어지면')} `) + say(s);
    chart(document.getElementById('sChart'), SHOCKS, i, SC);
  }
  document.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => setShock(+b.dataset.s));
  setShock(1);

  // 공유 이미지
  const sw = document.getElementById('swHide'), shot = document.getElementById('shot');
  sw.onclick = () => { const on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', on); shot.classList.toggle('hide', on); };
  const toast = document.getElementById('toast'); let tt = 0;
  document.querySelectorAll('[data-toast]').forEach(b => b.onclick = () => { toast.textContent = b.dataset.toast; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), 2200); });
})();
