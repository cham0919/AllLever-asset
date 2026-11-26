(function(){
  // 용어 풀이
  const sheet = document.getElementById('sheet'), dim = document.getElementById('dim');
  let lastBtn = null;
  const closeSheet = () => { sheet.classList.remove('on'); dim.classList.remove('on'); if (lastBtn) lastBtn.focus(); };
  document.addEventListener('click', e => {
    const b = e.target.closest('.term'); if (!b) return;
    const t = TERMS[b.dataset.t]; if (!t) return;
    lastBtn = b; document.getElementById('shT').textContent = t[0]; document.getElementById('shP').textContent = t[1];
    sheet.classList.add('on'); dim.classList.add('on'); document.getElementById('shX').focus();
  });
  document.getElementById('shX').onclick = closeSheet; dim.onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('on')) closeSheet(); });
  // 한눈에 보기 → 시기로 이동
  document.querySelectorAll('.jump[data-to]').forEach(b => b.onclick = () => { const el = document.getElementById(b.dataset.to); if (el) el.scrollIntoView({behavior: still ? 'auto' : 'smooth', block: 'start'}); });

  // 돈의 흐름 그림(1년 기준)
  const MAN = 1e4, cl = t => Math.max(0, Math.min(1, t)), ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, lerp = (a, b, t) => a + (b - a) * t;
  const fmt = v => { v = Math.round(Math.abs(v) / MAN); if (!v) return '1만원 미만'; const e = Math.floor(v / 1e4), m = v % 1e4; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + '원'; };
  const sh = v => { v = Math.abs(v) / MAN; return v >= 1e4 ? (Math.round(v / 1e3) / 10) + '억' : Math.round(v).toLocaleString('ko-KR') + '만'; };
  const COL = ['var(--c-stock)', 'var(--c-pen)', 'var(--c-cash)'], NAME = ['주식', '연금계좌', 'ISA·현금'];
  const X = [0, 62, 124], CW = 52, LX = 226, LW = 64, FLOOR = 210, BASE = 60, MINLEFT = 22;
  const maxGross = Math.max(...FLOWS.map(f => f.take.reduce((a, b) => a + b, 0) + f.nps), 1), K = 140 / maxGross;
  const still = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

  function build(el, f){
    const g = f.grow.map(v => Math.min(70, v * K)), h = f.take.map(v => v * K), has = f.b0.map(b => b > 0);
    // 꺼낸 뒤에도 원금이 남아 보이게: 막대는 늘 ${MINLEFT}px 이상 남겨요
    const base = h.map((x, k) => Math.min(150, Math.max(BASE, x - g[k] + MINLEFT)));
    const items = []; let stack = 0;
    if (f.nps * K >= 1) { items.push({k: 'nps', h: f.nps * K, y1: FLOOR - f.nps * K, amt: f.nps}); stack += f.nps * K; }
    [0, 1, 2].forEach(k => { if (has[k] && h[k] >= 1) { items.push({k, h: h[k], y1: FLOOR - stack - h[k], amt: f.take[k]}); stack += h[k]; } });
    const gross = stack, taxH = Math.min(gross, f.tax * K);
    const G = f.grow.reduce((a, b) => a + b, 0), T = f.take.reduce((a, b) => a + b, 0);
    el.innerHTML = `<div class="mk-track"><div class="mk-pin">
      <div class="mk-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="mk-cap" aria-live="polite">
        <span data-ph="0">1년 동안 자산이 불어나요<br><b>모두 +${fmt(G)}</b></span>
        <span data-ph="1">생활비로 쓸 만큼 꺼내요<br><b>자산에서 ${fmt(T)}</b>${f.nps >= MAN ? ` <small>+ 국민연금 ${sh(f.nps)}</small>` : ''}</span>
        <span data-ph="2">꺼낸 돈에서<br><b style="color:var(--bad)">세금·건보료 ${fmt(f.tax)}이 빠져요</b></span>
        <span data-ph="3">손에 남는 생활비<br><b style="color:var(--accent)">1년 ${fmt(f.net)} (매달 ${fmt(f.net / 12)})</b></span>
      </div>
      <div class="mk-stage" role="img" aria-label="1년에 자산이 ${fmt(G)} 불어나고, ${fmt(T)}을 꺼내 세금 ${fmt(f.tax)}을 내고 ${fmt(f.net)}이 생활비로 남아요">
        <div class="mk-floor"></div>
        <i class="mk-slot" style="left:${LX - 2}px;width:${LW + 4}px;top:${FLOOR - gross - 2}px;height:${gross + 2}px"></i>
        ${[0, 1, 2].map(k => `<i class="mk-col ${has[k] ? '' : 'none'}" data-k="${k}" style="left:${X[k]}px;width:${CW}px;background:${COL[k]}"><em>≈</em></i>
          <i class="mk-gap" data-k="${k}" style="left:${X[k]}px;width:${CW}px;border-color:${COL[k]}"></i>
          <i class="mk-base" data-k="${k}" style="left:${X[k] - 4}px;width:${CW + 8}px;top:${FLOOR - base[k] - 1}px"></i>
          <span class="mk-net" data-k="${k}" style="left:${X[k] - 14}px;width:${CW + 28}px"></span>
          <span class="mk-up" data-k="${k}" style="left:${X[k] - 12}px;width:${CW + 24}px">${has[k] && f.grow[k] >= MAN * 10 ? '+' + sh(f.grow[k]) : ''}</span>
          <div class="mk-lab" style="left:${X[k] - 9}px;width:${CW + 18}px"><b>${NAME[k]}</b><span class="av" data-k="${k}">${has[k] ? sh(f.b0[k]) : '없음'}</span></div>`).join('')}
        <i class="mk-lv" style="left:${LX}px;width:${LW}px;top:${FLOOR}px;height:0"></i>
        ${items.map((it, i) => `<i class="mk-chunk" data-i="${i}"></i><span class="mk-cl" data-i="${i}">${sh(it.amt)}</span>`).join('')}
        ${f.nps >= MAN ? `<span class="mk-npsl" style="left:${LX - 20}px;width:${LW + 40}px;top:${FLOOR - f.nps * K - 64}px">국민연금</span>` : ''}
        <i class="mk-tax" style="left:${LX}px;width:${LW}px;top:${FLOOR - gross}px;height:${taxH}px"></i>
        <span class="mk-taxl" style="top:${Math.max(0, FLOOR - gross - 30)}px">−${sh(f.tax)} 세금·건보료</span>
        <span class="mk-arrow" aria-hidden="true">→</span>
        <div class="mk-lab" style="left:${LX - 10}px;width:${LW + 20}px"><b>생활비</b><span class="lvs">1년</span></div>
      </div>
      <button type="button" class="again">다시 보기</button>
    </div></div>`;
    el._g = {f, g, h, has, base, items, gross, taxH};
  }
  function draw(el, p){
    const {g, h, has, base, items, gross, taxH, f} = el._g;
    const t1 = ease(cl(p / .3)), t2 = cl((p - .3) / .35), t3 = ease(cl((p - .65) / .2));
    const ph = p < .3 ? 0 : p < .65 ? 1 : p < .88 ? 2 : 3;
    el.querySelectorAll('.mk-cap > span').forEach(c => c.classList.toggle('on', +c.dataset.ph === ph));
    el.querySelectorAll('.mk-dots i').forEach((d, i) => d.classList.toggle('on', i <= ph));
    const N = items.length, st = N > 1 ? Math.min(.22, .6 / (N - 1)) : 0;
    const prog = items.map((it, i) => ease(cl((t2 - i * st) / (1 - (N - 1) * st))));
    [0, 1, 2].forEach(k => {
      const bar = el.querySelector(`.mk-col[data-k="${k}"]`), ii = items.findIndex(it => it.k === k), off = ii >= 0 && prog[ii] > 0;
      const ht = has[k] ? base[k] + g[k] * t1 - (off ? h[k] : 0) : 4;
      bar.style.top = (FLOOR - ht) + 'px'; bar.style.height = ht + 'px';
      el.querySelector(`.mk-base[data-k="${k}"]`).style.opacity = has[k] && t1 > 0 ? 1 : 0;
      // 꺼낸 뒤: 원금보다 줄면 줄어든 만큼 빈 자리, 늘면 점선 위로 늘어난 만큼
      const pq = ii >= 0 ? prog[ii] : 0, net = f.grow[k] - f.take[k], gap = el.querySelector(`.mk-gap[data-k="${k}"]`), nl = el.querySelector(`.mk-net[data-k="${k}"]`);
      const after = base[k] + g[k] - (ii >= 0 ? h[k] : 0);
      if (has[k] && off && after < base[k] - .5) { gap.style.top = (FLOOR - base[k]) + 'px'; gap.style.height = (base[k] - after) + 'px'; gap.style.opacity = pq; }
      else gap.style.opacity = 0;
      if (has[k] && (off || (ii < 0 && t2 > 0)) && Math.abs(net) >= MAN) {
        nl.textContent = (net < 0 ? '−' : '+') + sh(net); nl.className = 'mk-net ' + (net < 0 ? 'dn' : 'upn');
        nl.style.top = (FLOOR - Math.max(base[k], ht) - 20) + 'px'; nl.style.opacity = ii < 0 ? cl(t2 * 3) : pq;
      } else nl.style.opacity = 0;
      const pk = ii >= 0 ? prog[ii] : 0, av = el.querySelector(`.av[data-k="${k}"]`);
      if (has[k]) av.textContent = sh(f.b0[k] + f.grow[k] * t1 - f.take[k] * pk);
      const up = el.querySelector(`.mk-up[data-k="${k}"]`); up.style.top = (FLOOR - base[k] - g[k] * t1 - 20) + 'px'; up.style.opacity = off ? 0 : t1;
    });
    let landed = 0;
    items.forEach((it, i) => {
      const c = el.querySelector(`.mk-chunk[data-i="${i}"]`), q = prog[i], lb = el.querySelector(`.mk-cl[data-i="${i}"]`);
      if (q >= 1) { landed += it.h; c.style.opacity = 0; lb.style.opacity = 0; return; }
      const isN = it.k === 'nps';
      const x0 = isN ? LX : X[it.k], w0 = isN ? LW : CW, y0 = isN ? it.y1 - 44 : FLOOR - base[it.k] - g[it.k];
      const x = lerp(x0, LX, q), y = lerp(y0, it.y1, q) - (isN ? 0 : 34 * Math.sin(Math.PI * q)), w = lerp(w0, LW, q);
      const m = cl((q - .5) / .45) * 100, from = isN ? 'var(--c-nps)' : COL[it.k];
      c.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${it.h}px;opacity:${q > 0 ? (isN ? cl(q * 3) : 1) : 0};border-radius:${(1 - q) * 4}px;background:color-mix(in srgb, var(--c-live) ${m}%, ${from})`;
      const inside = it.h >= 18;
      lb.style.cssText = `left:${x - 10}px;width:${w + 20}px;top:${inside ? y + it.h / 2 - 9 : y - 19}px;color:${inside ? '#fff' : 'var(--ink)'};opacity:${q > 0 ? 1 - cl((q - .8) * 5) : 0}`;
    });
    const n = el.querySelector('.mk-npsl'); if (n) n.style.opacity = items[0] && items[0].k === 'nps' ? cl(prog[0] * 4) * (1 - cl((prog[0] - .75) * 4)) : 0;
    const lvH = Math.max(0, landed - (t3 > 0 ? taxH : 0)), lv = el.querySelector('.mk-lv');
    lv.style.top = (FLOOR - lvH) + 'px'; lv.style.height = lvH + 'px';
    const tx = el.querySelector('.mk-tax'), a = cl(t3 / .35), b = cl((t3 - .35) / .65);
    tx.style.opacity = t3 > 0 ? 1 - b : 0; tx.style.background = `color-mix(in srgb, var(--bad) ${a * 100}%, var(--c-live))`; tx.style.transform = `translate(${b * 14}px,${-b * 26}px)`;
    el.querySelector('.mk-taxl').style.opacity = cl((t3 - .3) / .3);
    const lvAmt = items.reduce((t, it, i) => t + it.amt * prog[i], 0) - f.tax * t3;
    el.querySelector('.lvs').textContent = lvAmt >= MAN ? '1년 ' + sh(lvAmt) : '1년';
  }

  let mode = 'play'; try { mode = localStorage.getItem('rtMode') || 'play'; } catch (e) {}
  const flows = [...document.querySelectorAll('.mk-flow')];
  flows.forEach(el => { build(el, FLOWS[+el.dataset.i]); draw(el, still ? 1 : 0); el.querySelector('.again').onclick = () => play(el); });
  const TL = [[0, .3, 1500], [.3, .3, 900], [.3, .65, 2600], [.65, .65, 800], [.65, .88, 1400], [.88, .88, 400], [.88, 1, 500]];
  const TOTAL = TL.reduce((s, x) => s + x[2], 0);
  function play(el){
    if (still) return;
    cancelAnimationFrame(el._raf); el._played = true; el.querySelector('.again').classList.remove('show');
    const t0 = performance.now();
    const step = now => { let t = now - t0, p = 1; for (const [a, b, d] of TL) { if (t < d) { p = a + (b - a) * (t / d); break; } t -= d; }
      draw(el, p); if (now - t0 < TOTAL) el._raf = requestAnimationFrame(step); else { draw(el, 1); if (mode === 'play') el.querySelector('.again').classList.add('show'); } };
    el._raf = requestAnimationFrame(step);
  }
  function layout(){
    const vh = innerHeight;
    flows.forEach(el => { const tr = el.querySelector('.mk-track'), pin = el.querySelector('.mk-pin');
      el.classList.toggle('scroll', mode === 'scroll' && !still);
      if (mode === 'scroll' && !still) { const ph = pin.offsetHeight; pin.style.top = Math.max(60, (vh - ph) / 2) + 'px'; tr.style.height = (ph + vh * 1.1) + 'px'; }
      else { pin.style.top = ''; tr.style.height = ''; } });
  }
  function onScroll(){
    if (still) return;
    const vh = innerHeight;
    flows.forEach(el => {
      const tr = el.querySelector('.mk-track'), pin = el.querySelector('.mk-pin'), r = tr.getBoundingClientRect();
      if (mode === 'scroll') draw(el, cl(((parseFloat(pin.style.top) || 0) - r.top) / (r.height - pin.offsetHeight)));
      else { const pr = pin.getBoundingClientRect();
        if (pr.top > vh) { if (el._played) { cancelAnimationFrame(el._raf); el._played = false; el.querySelector('.again').classList.remove('show'); draw(el, 0); } }
        else if (!el._played && pr.top + pr.height / 2 < vh * .62 && pr.bottom > 0) play(el); }
    });
  }
  function setMode(m){
    mode = m; try { localStorage.setItem('rtMode', m); } catch (e) {}
    document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    flows.forEach(el => { cancelAnimationFrame(el._raf); el._played = false; el.querySelector('.again').classList.remove('show'); draw(el, still ? 1 : 0); });
    layout(); onScroll();
  }
  document.querySelectorAll('.mode button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  let raf = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; onScroll(); }); }, {passive: true});
  addEventListener('resize', () => { layout(); onScroll(); });
  setMode(mode === 'scroll' ? 'scroll' : 'play');
})();

// 은퇴할 때까지 모으기: 처음엔 모든 막대가 첫 막대 높이 → 왼쪽부터 하나씩 자라요
(function(){
  const box = document.querySelector('.gbars'); if (!box) return;
  const bars = [...box.children], end = document.getElementById('gEnd');
  const still2 = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const shv = v => { v = Math.abs(v) / 1e4; return v >= 1e4 ? (Math.round(v / 1e3) / 10) + '억' : Math.round(v).toLocaleString('ko-KR') + '만'; };
  let raf = 0, played = false;
  const set = t => {   // t: 0~1, 막대 i는 차례대로 자람
    const n = bars.length, per = 1 / n;
    let shown = +end.dataset.v0;
    bars.forEach((b, i) => { const q = Math.max(0, Math.min(1, (t - i * per * .8) / (per * 2.2))), e = q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
      b.querySelectorAll('i').forEach(x => x.style.height = (+x.dataset.h0 + (+x.dataset.h - +x.dataset.h0) * e) + 'px');
      if (q > 0) shown = +end.dataset.v0 + (+end.dataset.v - +end.dataset.v0) * (i / (n - 1)) * 1; });
    end.textContent = shv(t >= 1 ? +end.dataset.v : shown);
  };
  const play = () => { played = true; const t0 = performance.now(), D = 2600;
    const step = now => { const t = Math.min(1, (now - t0) / D); set(t); if (t < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); };
  if (still2) { set(1); return; }
  set(0);
  const check = () => { const r = box.getBoundingClientRect(), vh = innerHeight;
    if (!played && r.top < vh * .75 && r.bottom > 0) play();
    else if (played && r.top > vh) { cancelAnimationFrame(raf); played = false; set(0); } };
  addEventListener('scroll', check, {passive: true}); check();
})();
