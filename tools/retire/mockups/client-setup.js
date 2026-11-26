(function(){
  const $ = id => document.getElementById(id);
  const NOW = 2026;
  const won = v => { v = Math.round(v); const e = Math.floor(v / 1e4), m = v % 1e4; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + (e || m ? '원' : '0원'); };   // v: 만원
  const num = s => { const v = parseFloat(String(s).replace(/[^\d.]/g, '')); return isNaN(v) ? null : v; };
  const WHO = {me: '나', sp: '배우자'};
  // 예시: 가계부·자산 탭에서 미리 채운 값
  const LEDGER = {spend: 298, saving: 2980};
  const S = {couple: null, by: {me: null, sp: null}, ra: 55, spend: 300, sal: {me: null, sp: null},
    sev: {me: {m: null, amt: null, yrs: null, unk: true}, sp: {m: null, amt: null, yrs: null, unk: true}},
    nps: null, npsAmt: {me: null, sp: null}, npsY: {me: null, sp: null}, npsStart: {m: 'normal', y: 1},
    inc: {me: null, sp: null}, biz: {me: null, sp: null}, ptab: 'me',
    work: null, wk: {me: {on: null, amt: null, to: 65, kind: '근로'}, sp: {on: null, amt: null, to: 65, kind: '근로'}},
    saving: 3000,
    acc: [{n: '생활비 통장', k: '현금', v: 1980}, {n: '파킹통장', k: '현금', v: 1220}, {n: '비상금', k: '현금', v: 820}, {n: '증권 CMA', k: null, v: 1180},
      {n: '미래에셋 해외주식', k: '해외주식', v: 7860}, {n: '키움 해외주식', k: '해외주식', v: 3040}, {n: '퇴직연금 IRP', k: 'IRP', v: 4070}, {n: '개인 IRP', k: 'IRP', v: 2555}, {n: '청약통장', k: '현금', v: 500}, {n: '주식 예수금', k: '현금', v: 60}],
    saveMode: null, saveShare: {}, newHold: {}, editNew: null,
    invest: null, hold: [{nm: '', w: 100, r: 6, d: 1.5}], accHold: {}, editAcc: null,
    house: null, houses: [{pub: null, use: 'live', rent: null, dep: null, since: null, reg: false}], region: '대도시', dependent: null};
  const KINDS = ['현금', '해외주식', '국내주식', '국내상장 해외ETF', 'ISA', '연금저축', 'IRP', '빼기'];
  const TAXABLE = k => ['해외주식', '국내주식', '국내상장 해외ETF'].includes(k);   // 배당을 받을 때마다 세금이 붙는 계좌
  const SHELTER = k => ['ISA', '연금저축', 'IRP'].includes(k);                     // 계좌 안에서는 배당·이익에 세금이 없는 계좌
  const PENSION = k => ['연금저축', 'IRP'].includes(k);
  const invAcc = () => S.acc.filter(a => TAXABLE(a.k) || SHELTER(a.k));
  const people = () => S.couple ? ['me', 'sp'] : ['me'];
  let openAcc = -1, cur = 0, back2review = false, baseLabel = '다음';

  const SCREENS = {
    intro: {
      html: () => `<h1 class="q">은퇴 후에 매달 얼마를<br>쓸 수 있을지 계산해 볼게요</h1>
        <div class="intro"><div><em>1</em><span>질문에 하나씩 답하면 돼요. 5분쯤 걸려요.</span></div><div><em>2</em><span>가계부와 자산 탭 숫자로 미리 채워 둘게요.</span></div><div><em>3</em><span>입력한 내용은 이 휴대폰에만 저장돼요.</span></div></div>`,
      next: '시작하기', ok: () => true},
    who: {
      html: () => `<h1 class="q">누구와 함께<br>은퇴를 계획할까요?</h1>
        <div class="opts">${opt('c0', S.couple === false, '혼자', '나 혼자 기준으로 계산해요')}${opt('c1', S.couple === true, '배우자와 함께', '세금은 사람마다 따로, 건강보험료는 가구로 계산해요')}</div>`,
      bind: () => { on('c0', () => { S.couple = false; go(1); }); on('c1', () => { S.couple = true; go(1); }); }, ok: () => S.couple != null},
    birth: {
      html: () => `<h1 class="q">${S.couple ? '두 분은 언제<br>태어났나요?' : '언제 태어났나요?'}</h1>
        ${S.couple ? '<div class="flab">나</div>' : '<div class="field"></div>'}${big('by_me', S.by.me, '년', '1985')}
        ${S.couple ? `<div class="flab">배우자</div>${big('by_sp', S.by.sp, '년', '1987')}` : ''}<div class="err" id="err" hidden></div>`,
      bind: () => { inp('by_me', v => S.by.me = v); if (S.couple) inp('by_sp', v => S.by.sp = v); },
      ok: () => okYear(S.by.me) && (!S.couple || okYear(S.by.sp)),
      err: () => (S.by.me && !okYear(S.by.me)) || (S.couple && S.by.sp && !okYear(S.by.sp)) ? `1930년부터 ${NOW - 15}년 사이로 적어 주세요` : ''},
    retire: {
      html: () => `<h1 class="q">몇 살에<br>은퇴하고 싶나요?</h1>
        <div class="stepper"><button type="button" id="dn" aria-label="한 살 줄이기">−</button><b><span id="raV">${S.ra}</span><small>세</small></b><button type="button" id="up" aria-label="한 살 늘리기">+</button></div>
        <div class="chips">${[50, 55, 60, 65].map(a => `<button type="button" data-a="${a}" class="${S.ra === a ? 'on' : ''}">${a}세</button>`).join('')}</div>
        <p class="hint" id="raH"></p>`,
      bind: () => { const upd = () => { $('raV').textContent = S.ra; document.querySelectorAll('[data-a]').forEach(b => b.classList.toggle('on', +b.dataset.a === S.ra));
          const y = S.by.me + S.ra, left = y - NOW; $('raH').innerHTML = left > 0 ? `<b>${y}년</b>, 지금부터 <b>${left}년 뒤</b>예요.${S.couple ? ' 두 분이 같은 해에 은퇴한다고 계산해요.' : ''}` : '이미 은퇴할 나이예요. 지금부터 꺼내 쓴다고 계산해요.'; };
        on('dn', () => { S.ra = Math.max(30, S.ra - 1); upd(); }); on('up', () => { S.ra = Math.min(80, S.ra + 1); upd(); });
        document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { S.ra = +b.dataset.a; upd(); }); upd(); },
      ok: () => true},
    spend: {
      html: () => `<h1 class="q">은퇴 후 한 달에<br>얼마를 쓰고 싶나요?</h1><div class="field">${big('spend', S.spend, '만원')}</div>
        <div class="chips">${[200, 250, 300, 400].map(v => `<button type="button" data-v="${v}" class="${S.spend === v ? 'on' : ''}">${v}만원</button>`).join('')}</div>
        <p class="hint">가계부 최근 6개월 평균 지출은 <b>${LEDGER.spend}만원</b>이에요. 세금과 건강보험료를 낸 뒤 쓰는 돈을, 지금 돈의 가치로 적어 주세요.</p>`,
      bind: () => { inp('spend', v => S.spend = v); chipsTo('spend', v => S.spend = v); }, ok: () => S.spend > 0},
    salary: {
      html: () => { const w = curP(), k = S.inc[w];
        return `<h1 class="q">${S.couple ? '두 분은 지금<br>어떻게 돈을 버나요?' : '지금 어떻게<br>돈을 버나요?'}</h1><p class="qs">회사원과 사업자는 연금저축·IRP로 돌려받는 세금, ISA 서민형 기준이 달라요.</p>
        ${ptabs(incDone)}
        ${seg('ik', [['wage', '월급'], ['biz', '사업·프리랜서'], ['both', '둘 다'], ['none', '벌지 않아요']], k)}
        ${k === 'wage' || k === 'both' ? `<div class="flab">1년 연봉 (세금 떼기 전)</div>${big('sal_' + w, S.sal[w] || null, '만원', w === 'me' ? '6000' : '4000')}` : ''}
        ${k === 'biz' || k === 'both' ? `<div class="flab">1년 순수입</div>${big('biz_' + w, S.biz[w], '만원', '5000')}<p class="hint">매출에서 재료비·가게 임대료·인건비 같은 경비를 뺀 돈이에요. 종합소득세 신고서의 <b>소득금액</b>과 같아요.</p>` : ''}
        ${k === 'none' ? '<p class="hint">연금저축·IRP에 넣어도 돌려받을 세금이 없다고 계산해요.</p>' : ''}
        <div class="err" id="err" hidden></div>`; },
      bind: () => { const w = curP(); bindTabs();
        bindSeg('ik', v => { S.inc[w] = v; if (v === 'biz' || v === 'none') S.sal[w] = 0; if (v === 'wage' || v === 'none') S.biz[w] = null; if ((v === 'wage' || v === 'both') && S.sal[w] === 0) S.sal[w] = null; render(); });
        inp('sal_' + w, v => S.sal[w] = v); inp('biz_' + w, v => S.biz[w] = v); },

      ok: () => people().every(incDone)},
    severance: {
      html: () => `<h1 class="q">회사에서<br>퇴직금을 받나요?</h1><p class="qs">퇴직금은 IRP로 받아 연금으로 나눠 받는다고 계산해요. 그러면 퇴직소득세를 30%(10년차까지)~50%(21년차부터) 덜 내요.</p>
        ${earners().map(w => { const q = S.sev[w]; return `<div class="hc">${S.couple ? `<div class="hch"><b>${WHO[w]}</b></div>` : ''}<div class="chips" style="margin-top:8px">${[['yes', '받아요'], ['dc', '이미 퇴직연금에 쌓여요'], ['no', '안 받아요']].map(([v, t]) => `<button type="button" data-sv="${w}" data-v="${v}" class="${q.m === v ? 'on' : ''}">${t}</button>`).join('')}</div>
          ${q.m === 'yes' ? `${mini('sy_' + w, q.yrs, '년', '지금 회사에서 일한 기간')}
            ${q.unk ? '' : mini('sa_' + w, q.amt, '만원', '지금 그만두면 받을 퇴직금')}
            <div class="chips" style="margin-top:8px"><button type="button" data-su="${w}" class="${q.unk ? '' : 'on'}">정확한 금액을 알아요</button></div>
            <p class="hint" id="sh_${w}">${sevHint(w)}</p>` : ''}${q.m === 'dc' ? '<p class="hint">자산에서 퇴직연금 계좌로 확인할게요.</p>' : ''}</div>`; }).join('')}
        <p class="hint">퇴직금은 1년 일할 때마다 한 달 치 평균 월급만큼 쌓여서, 앞에서 넣은 연봉으로 계산해요. 회사 인사팀이나 퇴직연금 앱에서 본 금액이 있으면 "정확한 금액을 알아요"를 눌러 넣어 주세요.</p>`,
      bind: () => { document.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { S.sev[b.dataset.sv].m = b.dataset.v; render(); });
        document.querySelectorAll('[data-su]').forEach(b => b.onclick = () => { const q = S.sev[b.dataset.su]; q.unk = !q.unk; render(); });
        earners().forEach(w => { const u = () => { const el = $('sh_' + w); if (el) el.innerHTML = sevHint(w); };
          inp('sa_' + w, v => { S.sev[w].amt = v; u(); }); inp('sy_' + w, v => { S.sev[w].yrs = v; u(); }); }); },
      ok: () => earners().every(w => { const q = S.sev[w]; return q.m && (q.m !== 'yes' || ((q.unk || q.amt > 0) && q.yrs != null)); })},
    nps: {
      html: () => `<h1 class="q">국민연금 예상액을<br>알고 있나요?</h1>
        <div class="opts">${opt('n0', S.nps === 'know', '알아요', '국민연금공단 「내 연금 알아보기」에서 본 금액')}${opt('n1', S.nps === 'auto', '잘 몰라요', '연봉과 낸 기간으로 대신 계산해요')}</div>
        ${S.nps === 'know' ? people().map(w => `<div class="flab">${S.couple ? WHO[w] + ' · ' : ''}한 달 예상액</div>${big('na_' + w, S.npsAmt[w], '만원', w === 'me' ? '130' : '90')}`).join('') : ''}`,
      bind: () => { on('n0', () => { S.nps = 'know'; render(); }); on('n1', () => { S.nps = 'auto'; go(1); });
        if (S.nps === 'know') people().forEach(w => inp('na_' + w, v => S.npsAmt[w] = v)); },
      ok: () => S.nps === 'auto' || (S.nps === 'know' && people().every(w => S.npsAmt[w] != null))},
    npsYears: {
      html: () => { const def = by => Math.max(10, Math.min(40, (S.by.me + S.ra) - by - 27));
        people().forEach(w => { if (S.npsY[w] == null) S.npsY[w] = def(S.by[w]); });
        const st = w => `<div class="stepper" style="margin-top:${S.couple ? 8 : 36}px"><button type="button" data-dn="${w}" aria-label="1년 줄이기">−</button><b><span id="ny_${w}">${S.npsY[w]}</span><small>년</small></b><button type="button" data-up="${w}" aria-label="1년 늘리기">+</button></div>`;
        return `<h1 class="q">국민연금을 은퇴할 때까지<br>모두 몇 년 내게 되나요?</h1>
        ${S.couple ? people().map(w => `<div class="flab">${WHO[w]}</div>${st(w)}`).join('') : st('me')}
        <p class="hint">지금까지 낸 기간과 은퇴까지 남은 기간을 더한 거예요. 10년보다 적으면 연금으로 받을 수 없어요.</p>`; },
      bind: () => { document.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { const w = b.dataset.dn; S.npsY[w] = Math.max(0, S.npsY[w] - 1); $('ny_' + w).textContent = S.npsY[w]; });
        document.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const w = b.dataset.up; S.npsY[w] = Math.min(45, S.npsY[w] + 1); $('ny_' + w).textContent = S.npsY[w]; }); },
      ok: () => true},
    npsStart: {
      html: () => { const q = S.npsStart, pct = q.m === 'early' ? -6 * q.y : q.m === 'late' ? 7.2 * q.y : 0;
        return `<h1 class="q">국민연금을<br>언제부터 받을까요?</h1><p class="qs">${S.by.me}년생은 <b style="color:var(--ink)">65세</b>부터 받아요. 최대 5년 앞당기거나 미룰 수 있어요.</p>
        <div class="opts">${opt('ns0', q.m === 'normal', '65세부터', '정해진 나이에 받아요')}${opt('ns1', q.m === 'early', '일찍 받기', '1년 앞당길 때마다 6%씩 줄어요')}${opt('ns2', q.m === 'late', '늦게 받기', '1년 미룰 때마다 7.2%씩 늘어요')}</div>
        ${q.m !== 'normal' ? `<div class="stepper"><button type="button" id="dn" aria-label="1년 줄이기">−</button><b><span>${q.y}</span><small>년 ${q.m === 'early' ? '앞당겨' : '미뤄'}</small></b><button type="button" id="up" aria-label="1년 늘리기">+</button></div>
          <p class="hint"><b>${65 + (q.m === 'early' ? -q.y : q.y)}세</b>부터 받고, 금액은 <b>${pct > 0 ? '+' : ''}${Math.round(pct * 10) / 10}%</b>가 돼요.</p>` : ''}`; },
      bind: () => { on('ns0', () => { S.npsStart.m = 'normal'; go(1); }); on('ns1', () => { S.npsStart.m = 'early'; render(); }); on('ns2', () => { S.npsStart.m = 'late'; render(); });
        on('dn', () => { S.npsStart.y = Math.max(1, S.npsStart.y - 1); render(); }); on('up', () => { S.npsStart.y = Math.min(5, S.npsStart.y + 1); render(); }); },
      ok: () => true},
    work: {
      html: () => `<h1 class="q">은퇴한 뒤에도<br>버는 돈이 있나요?</h1><p class="qs">국민연금이 줄 수 있고, 건강보험료와 세금이 달라져요.</p>
        <div class="opts">${opt('w0', S.work === false, '없어요', '')}${opt('w1', S.work === true, '있어요', '파트타임, 프리랜서, 작은 사업 등')}</div>
        ${S.work ? (() => { const w = curP(), q = S.wk[w];
          return `<div style="margin-top:24px">${ptabs(workDone)}</div>
          ${seg('wk', [...(S.couple ? [['none', '없어요']] : []), ['근로', '월급'], ['사업·프리랜서', '사업·프리랜서']], q.on == null ? null : q.on ? q.kind : 'none')}
          ${q.on ? `<div class="mis">${mini('wa_' + w, q.amt, '만원', q.kind === '근로' ? '한 달 월급(세전)' : '한 달 순수입')}${mini('wt_' + w, q.to, '세', '몇 살까지')}</div>
          <p class="hint">${q.kind === '근로' ? '세금 떼기 전 월급이에요.' : '매출에서 재료비·가게 임대료·인건비 같은 경비를 뺀 돈이에요. 종합소득세 신고서의 <b>소득금액</b>과 같아요. 3.3% 떼고 받는 프리랜서라면 받은 돈에서 일에 쓴 돈을 빼 주세요.'}</p>` : ''}`; })() : ''}
        <div class="err" id="err" hidden></div>`,
      bind: () => { on('w0', () => { S.work = false; go(1); }); on('w1', () => { S.work = true; if (!S.couple) S.wk.me.on = true; render(); });
        if (!S.work) return; const w = curP(); bindTabs();
        bindSeg('wk', v => { if (v === 'none') S.wk[w].on = false; else { S.wk[w].on = true; S.wk[w].kind = v; } render(); });
        inp('wa_' + w, v => S.wk[w].amt = v); inp('wt_' + w, v => S.wk[w].to = v); },
      err: () => { if (!S.work) return ''; const w = people().find(w => S.wk[w].on && S.wk[w].amt > 0 && S.wk[w].to != null && S.wk[w].to <= raOf(w));
        if (w) return `${S.couple ? WHO[w] + ': ' : ''}몇 살까지는 은퇴 나이(${raOf(w)}세)보다 커야 해요`;
        return ''; },
      ok: () => S.work === false || (S.work && people().some(w => S.wk[w].on) && people().every(workDone))},
    saving: {
      html: () => `<h1 class="q">은퇴 전까지 1년에<br>얼마씩 모으나요?</h1><div class="field">${big('sav', S.saving, '만원')}</div>
        <div class="chips">${[1200, 2400, 3000, 5000].map(v => `<button type="button" data-v="${v}" class="${S.saving === v ? 'on' : ''}">${won(v)}</button>`).join('')}</div>
        <p class="hint">가계부 최근 12개월 저축은 <b>${won(LEDGER.saving)}</b>이에요.</p>`,
      bind: () => { inp('sav', v => S.saving = v); chipsTo('sav', v => S.saving = v); }, ok: () => S.saving != null},
    acc: {
      html: () => { const tot = S.acc.filter(a => a.k !== '빼기').reduce((t, a) => t + a.v, 0), need = S.acc.filter(a => !a.k).length;
        return `<h1 class="q">이 자산으로<br>계산할게요</h1><p class="qs">자산 탭 최근 잔액이에요. 모두 <b style="color:var(--ink)">${won(tot)}</b>${need ? `. <b style="color:var(--bad)">${need}개</b>는 종류를 골라 주세요.` : '.'}</p>
        <div class="acc">${S.acc.map((a, i) => `<div class="ac"><span><b>${a.n}</b><small>${won(a.v)}</small></span><button type="button" data-i="${i}" class="${a.k ? '' : 'need'}">${a.k || '종류 고르기'} ⌄</button></div>
          ${openAcc === i ? `<div class="kinds">${KINDS.map(k => `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>` : ''}`).join('')}</div>
        <p class="hint">계좌 종류마다 세금이 달라요. 차처럼 꺼내 쓰지 않는 것은 "빼기"를 고르세요.</p>`; },
      bind: () => { document.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { openAcc = openAcc === +b.dataset.i ? -1 : +b.dataset.i; render(); });
        document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { S.acc[openAcc].k = b.dataset.k; openAcc = -1; render(); }); },
      ok: () => S.acc.every(a => a.k), next: '이대로 좋아요'},
    owner: {
      html: () => `<h1 class="q">누구 이름으로 된<br>계좌인가요?</h1><p class="qs">세금은 사람마다 따로 매겨져서 명의가 중요해요. 해외주식 이익 250만원 공제, 연금 1년 1,500만원 한도, 금융소득 2,000만원 기준이 한 사람마다 있어요.</p>
        <div class="acc">${S.acc.filter(a => a.k !== '빼기').map(a => { const i = S.acc.indexOf(a), joint = a.k === '현금';
          return `<div class="hc"><div class="hch"><b>${a.n}</b><span class="hint" style="margin:0">${a.k} · ${won(a.v)}</span></div><div class="chips" style="margin-top:8px">${(joint ? ['나', '배우자', '공동명의'] : ['나', '배우자']).map(o => `<button type="button" data-own="${i}" data-o="${o}" class="${(a.o || '나') === o ? 'on' : ''}">${o}</button>`).join('')}</div>
            ${a.o === '공동명의' ? `<div class="mis">${mini('js' + i, a.js ?? 50, '%', '내 몫')}<div class="mi ro"><span>배우자 몫</span><span class="miv"><b>${100 - (a.js ?? 50)}</b><em>%</em></span></div></div>` : ''}</div>`; }).join('')}</div>
        <p class="hint">주식·ISA·연금 계좌는 한 사람 이름으로 계산해요. 공동명의 예금은 이자를 몫대로 나눠 각자의 금융소득으로 계산해요.</p>`,
      bind: () => { document.querySelectorAll('[data-own]').forEach(b => b.onclick = () => { const x = S.acc[+b.dataset.own]; x.o = b.dataset.o; if (x.o === '공동명의' && x.js == null) x.js = 50; render(); });
        S.acc.forEach((a, i) => inp('js' + i, v => { a.js = v == null ? null : Math.min(100, v); })); },
      ok: () => S.acc.every(a => a.o !== '공동명의' || (a.js != null && a.js >= 0 && a.js <= 100)), next: '이대로 좋아요'},
    pensionSrc: {
      html: () => `<h1 class="q">연금 계좌에 이런 돈이<br>들어 있나요?</h1><p class="qs">꺼낼 때 붙는 세금이 돈마다 달라요. 없으면 비워 두세요.</p>
        <div class="acc">${S.acc.filter(a => PENSION(a.k)).map(a => { const i = S.acc.indexOf(a), rest = a.v - (a.sv || 0) - (a.nd || 0);
          return `<div class="hc"><div class="hch"><b>${a.n}</b><span class="hint" style="margin:0">${won(a.v)}</span></div>
            ${a.pu ? '' : `<div class="mis">${mini('sv' + i, a.sv, '만원', '퇴직금')}${mini('st' + i, a.st, '만원', '이연퇴직소득세')}</div>
            ${mini('nd' + i, a.nd, '만원', '세액공제 받지 않고 넣은 돈')}
            <div id="sy${i}">${syHtml(a, i)}</div>`}
            <div class="chips" style="margin-top:8px"><button type="button" data-pu="${i}" class="${a.pu ? 'on' : ''}">모르겠어요</button></div>
            ${a.pu ? '<p class="hint">전부 세액공제 받은 돈으로 보고 계산해요. 보통 세금이 실제보다 조금 많이 나와서, 결과에 "추정"으로 표시해요.</p>' : `<p class="hint ${rest < 0 ? 'bad' : ''}" id="rest${i}">${rest < 0 ? '잔액보다 많아요. 다시 확인해 주세요.' : `나머지 <b>${won(rest)}</b>은 세액공제 받은 돈과 불어난 몫으로 계산해요.`}</p>`}</div>`; }).join('')}</div>
        <div class="tax3"><div><b>세액공제 안 받은 돈</b><span>꺼낼 때 세금 없어요</span></div><div><b>퇴직금</b><span>퇴직소득세의 70%만(10년차까지), 11년차부터 60%, 21년차부터 50%</span></div><div><b>나머지</b><span>1년 1,500만원까지 3.3~5.5%, 넘으면 16.5% 또는 종합과세 중 적은 쪽</span></div></div>
        <p class="hint">이연퇴직소득세는 IRP 앱이나 퇴직소득 원천징수영수증에서 볼 수 있어요.</p>`,
      bind: () => { document.querySelectorAll('[data-pu]').forEach(b => b.onclick = () => { const a = S.acc[+b.dataset.pu]; a.pu = !a.pu; render(); });
        S.acc.forEach((a, i) => { if (!PENSION(a.k) || a.pu) return; const upd = () => { const el = $('rest' + i), rest = a.v - (a.sv || 0) - (a.nd || 0); el.classList.toggle('bad', rest < 0); el.innerHTML = rest < 0 ? '잔액보다 많아요. 다시 확인해 주세요.' : `나머지 <b>${won(rest)}</b>은 세액공제 받은 돈과 불어난 몫으로 계산해요.`; };
        const sy = () => { $('sy' + i).innerHTML = syHtml(a, i); inp('sy' + i + 'v', v => a.sy = v); };
        inp('sv' + i, v => { a.sv = v; upd(); sy(); }); inp('st' + i, v => { a.st = v; sy(); }); inp('sy' + i + 'v', v => a.sy = v); inp('nd' + i, v => { a.nd = v; upd(); }); }); },
      ok: () => S.acc.filter(a => PENSION(a.k)).every(a => a.pu || a.v - (a.sv || 0) - (a.nd || 0) >= 0)},
    basis: {
      html: () => `<h1 class="q">넣은 원금은<br>얼마인가요?</h1><p class="qs">판 돈에서 원금을 뺀 이익에만 세금이 붙어요.</p>
        <div class="acc">${S.acc.filter(a => basisAcc(a)).map(a => { const i = S.acc.indexOf(a);
          return `<div class="hc"><div class="hch"><b>${a.n}</b><span class="hint" style="margin:0">${a.k} · 지금 ${won(a.v)}</span></div>
            ${a.bu ? '' : mini('bs' + i, a.bs, '만원', '넣은 원금')}<div class="chips" style="margin-top:8px"><button type="button" data-bu="${i}" class="${a.bu ? 'on' : ''}">모르겠어요</button></div>
            ${a.bu ? '<p class="hint">잔액을 원금으로 보고 계산해요. 세금이 실제보다 적게 나올 수 있어서 결과에 "추정"으로 표시해요.</p>' : ''}</div>`; }).join('')}</div>
        <p class="hint">국내 상장 주식은 조금 가진 사람이면 팔아도 세금이 없어서 묻지 않아요.</p>`,
      bind: () => { S.acc.forEach((a, i) => inp('bs' + i, v => a.bs = v)); document.querySelectorAll('[data-bu]').forEach(b => b.onclick = () => { const a = S.acc[+b.dataset.bu]; a.bu = !a.bu; render(); }); },
      ok: () => S.acc.filter(a => basisAcc(a)).every(a => a.bu || a.bs != null)},
    invest: {
      html: () => `<h1 class="q">계좌의 수익률과 배당률은<br>어떻게 넣을까요?</h1><p class="qs">투자 계좌 ${invAcc().length}개, ${won(invAcc().reduce((t, a) => t + a.v, 0))}이 있어요.</p>
        <div class="opts">${opt('iv2', S.invest === 'def', '잘 모르겠어요 · 기본값으로', '아래 값으로 계산하고, 나중에 설정에서 바꿀 수 있어요')}
        ${S.invest === 'def' || true ? `<div class="defv"><div><span>일반 증권 계좌</span><b>수익률 6% · 배당 1.5%</b></div><div><span>ISA</span><b>수익률 6%</b></div><div><span>연금저축·IRP</span><b>수익률 4.5%</b></div></div>` : ''}
        ${opt('iv0', S.invest === 'all', '모든 계좌를 같게', '한 번만 넣어요. 확인 화면에서 계좌별로 고칠 수 있어요')}${opt('iv1', S.invest === 'per', '계좌마다 넣기', '계좌마다 갖고 있는 것이 다를 때')}</div>`,
      bind: () => { on('iv2', () => { S.invest = 'def'; go(1); }); on('iv0', () => { S.invest = 'all'; go(1); }); on('iv1', () => { S.invest = 'per'; go(1); }); }, ok: () => !!S.invest},
    investAll: {
      html: () => holdHtml('갖고 있는 것을<br>나눠서 알려 주세요', '모든 투자 계좌에 똑같이 넣어요. 하나만 있으면 한 줄만 쓰면 돼요.', S.hold, 'g', true),
      bind: () => holdBind(S.hold, 'g'), ok: () => holdOk(S.hold)},
    investPer: {
      html: () => `<h1 class="q">계좌마다 수익률과<br>배당률을 알려 주세요</h1><p class="qs">계좌를 눌러 넣어요.</p>
        <div class="acc">${invAcc().map(a => { const i = S.acc.indexOf(a), H = accH(i), m = holdSum(H);
          return `<button type="button" class="ab" data-ed="${i}"><span><b>${a.n}</b><small>${a.k} · ${won(a.v)}</small><small>${SHELTER(a.k) ? `수익률 ${m.r}%` : `${H.length > 1 ? H.length + '개로 나눔 · ' : ''}수익률 약 ${m.r}% · 배당 약 ${m.d}%`}</small></span><i>바꾸기 ›</i></button>`; }).join('')}</div>`,
      bind: () => document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { S.editAcc = +b.dataset.ed; render(); scrollTo(0, 0); }),
      ok: () => invAcc().every(a => holdOk(accH(S.acc.indexOf(a))))},
    holdEdit: {
      html: () => { const a = S.acc[S.editAcc];
        if (SHELTER(a.k)) return `<h1 class="q">${a.n}의<br>1년 평균 수익률은?</h1><p class="qs">${won(a.v)} · ${a.k}</p><div class="field">${big('sh', accH(S.editAcc)[0].r, '%', '6')}</div>
          <p class="hint">${a.k} 안에서는 배당을 받아도, 팔아서 이익이 나도 그때 세금이 없어요. 그래서 배당이든 오른 값이든 합친 수익률만 있으면 돼요.</p>`;
        return holdHtml(`${a.n}에는<br>무엇이 있나요?`, `${won(a.v)} · ${a.k}`, accH(S.editAcc), 'a', false); },
      bind: () => { const a = S.acc[S.editAcc]; if (SHELTER(a.k)) inp('sh', v => accH(S.editAcc)[0].r = v); else holdBind(accH(S.editAcc), 'a'); },
      ok: () => { const a = S.acc[S.editAcc]; return SHELTER(a.k) ? accH(S.editAcc)[0].r != null : holdOk(accH(S.editAcc)); }, next: '확인'},
    saveTo: {
      html: () => { const d = defSplit();
        return `<h1 class="q">매년 모으는 ${won(S.saving)}은<br>어느 계좌에 넣나요?</h1><p class="qs">계좌마다 세금이 달라서, 어디에 넣느냐에 따라 은퇴 후 쓸 수 있는 돈이 달라져요.</p>
        <div class="opts">${opt('sv0', S.saveMode === 'def', '잘 모르겠어요 · 지금 투자 계좌 비율대로', '현금 통장에는 넣지 않는다고 보고 계산해요')}
        <div class="defv">${d.map(x => `<div><span>${x.a.n}</span><b>${won(x.v)} · ${x.p}%</b></div>`).join('')}</div>
        ${opt('sv1', S.saveMode === 'set', '직접 나누기', '계좌마다 넣는 비율을 정해요')}</div>`; },
      bind: () => { on('sv0', () => { S.saveMode = 'def'; go(1); }); on('sv1', () => { S.saveMode = 'set'; go(1); }); }, ok: () => !!S.saveMode},
    saveSplit: {
      html: () => `<h1 class="q">계좌마다 몇 %씩<br>넣나요?</h1><p class="qs">1년 ${won(S.saving)} 기준이에요. 넣지 않는 계좌는 비워 두세요.</p>
        <div class="acc">${saveRows().map(r => `<div class="sr"><span><b>${r.n}</b><small id="ssw${r.id}">${r.k} · ${S.saveShare[r.id] > 0 ? '1년에 ' + won(S.saving * S.saveShare[r.id] / 100) : '넣지 않음'}</small></span>
            <label class="mi sp"><span class="miv"><input id="ss${r.id}" inputmode="decimal" autocomplete="off" value="${S.saveShare[r.id] ?? ''}" aria-label="${r.n} 넣는 비율"><em>%</em></span></label></div>
            <div id="ssl${r.id}">${limitHint(r.k, S.saveShare[r.id])}</div>`).join('')}</div>
        <div class="hsum ${shareSum() === 100 ? '' : 'bad'}" id="sssum">${shareTxt()}</div>`,
      bind: () => saveRows().forEach(r => inp('ss' + r.id, v => { S.saveShare[r.id] = v;
        $('ssw' + r.id).textContent = r.k + ' · ' + (v > 0 ? '1년에 ' + won(S.saving * v / 100) : '넣지 않음'); $('ssl' + r.id).innerHTML = limitHint(r.k, v);
        const el = $('sssum'); el.innerHTML = shareTxt(); el.classList.toggle('bad', shareSum() !== 100); })),
      ok: () => shareSum() === 100},
    saveBuy: {
      html: () => `<h1 class="q">새로 넣는 돈으로<br>무엇을 사나요?</h1><p class="qs">지금 갖고 있는 것과 다르게 산다면 바꿔 주세요.</p>
        <div class="acc">${buyAcc().map(a => { const i = S.acc.indexOf(a), H = S.newHold[i], m = H ? holdSum(H) : null;
          return `<button type="button" class="ab" data-nb="${i}"><span><b>${a.n}</b><small>1년에 ${won(saveOf(i))} 넣음</small><small>${H ? (SHELTER(a.k) ? `새 돈: 수익률 ${m.r}%` : `새 돈: ${H.length > 1 ? H.length + '개로 나눔 · ' : ''}수익률 약 ${m.r}% · 배당 약 ${m.d}%`) : '지금과 같은 비중으로 사요'}</small></span><i>${H ? '바꾸기 ›' : '다르게 사기 ›'}</i></button>`; }).join('')}</div>
        <p class="hint">잘 모르겠으면 그대로 다음을 누르세요. 지금 갖고 있는 비중대로 산다고 계산해요.</p>`,
      bind: () => document.querySelectorAll('[data-nb]').forEach(b => b.onclick = () => { const i = +b.dataset.nb; if (!S.newHold[i]) S.newHold[i] = JSON.parse(JSON.stringify(accH(i))); S.editNew = i; render(); scrollTo(0, 0); }),
      ok: () => true},
    newEdit: {
      html: () => { const i = S.editNew, a = S.acc[i], H = S.newHold[i];
        if (SHELTER(a.k)) return `<h1 class="q">${a.n}에 새로 넣는 돈의<br>1년 평균 수익률은?</h1><p class="qs">1년에 ${won(saveOf(i))} · ${a.k}</p><div class="field">${big('nsh', H[0].r, '%', '6')}</div>
          <p class="hint">지금 있는 돈은 그대로 두고, 새로 넣는 돈만 이 수익률로 계산해요.</p><button type="button" class="skip" id="nreset">지금과 같게 되돌리기</button>`;
        return holdHtml(`${a.n}에 새로 넣는 돈으로<br>무엇을 사나요?`, `1년에 ${won(saveOf(i))} · ${a.k}`, H, 'n', false) + '<button type="button" class="skip" id="nreset">지금과 같게 되돌리기</button>'; },
      bind: () => { const i = S.editNew, a = S.acc[i]; if (SHELTER(a.k)) inp('nsh', v => S.newHold[i][0].r = v); else holdBind(S.newHold[i], 'n');
        on('nreset', () => { delete S.newHold[i]; S.editNew = null; render(); scrollTo(0, 0); }); },
      ok: () => { const i = S.editNew, a = S.acc[i]; return SHELTER(a.k) ? S.newHold[i][0].r != null : holdOk(S.newHold[i]); }, next: '확인'},
    house: {
      html: () => `<h1 class="q">집이 있나요?</h1><p class="qs">건강보험료·세금·기초연금을 계산하는 데 써요. 세를 주고 있다면 받는 월세도 생활비에 보태요.</p>
        <div class="opts">${opt('h0', S.house === false, '없어요', '')}${opt('h1', S.house === true, '있어요', '')}</div>`,
      bind: () => { on('h0', () => { S.house = false; go(1); }); on('h1', () => { S.house = true; go(1); }); }, ok: () => S.house != null},
    houseDetail: {
      html: () => `<h1 class="q">어떤 집인가요?</h1><p class="qs">집마다 알려 주세요. 여러 채면 "+ 집 추가"를 눌러요.</p>
        <div class="acc">${S.houses.map((h, i) => `<div class="hc"><div class="hch"><b>${i ? '집 ' + (i + 1) : '첫 번째 집'}</b>${i ? `<button type="button" class="hdel" data-del="${i}">빼기</button>` : ''}</div>
            <div class="mis">${mini('hp' + i, h.pub, '만원', '공시가격')}${mini('hs' + i, h.since, '년', '취득 연도 (모르면 비움)')}</div>
            ${S.couple ? `<div class="flab2">명의</div><div class="chips" style="margin-top:4px">${['나', '배우자', '공동명의'].map(o => `<button type="button" data-ho="${i}" data-v="${o}" class="${(h.o || '나') === o ? 'on' : ''}">${o}</button>`).join('')}</div>
              ${h.o === '공동명의' ? `<div class="mis">${mini('hj' + i, h.js ?? 50, '%', '내 지분')}<div class="mi ro"><span>배우자 지분</span><span class="miv"><b>${100 - (h.js ?? 50)}</b><em>%</em></span></div></div>` : ''}` : ''}
            <div class="flab2">쓰임</div><div class="chips" style="margin-top:4px">${[['live', '내가 사는 집'], ['rent', '세 준 집'], ['empty', '비어 있는 집']].map(([v, t]) => `<button type="button" data-hu="${i}" data-v="${v}" class="${h.use === v ? 'on' : ''}">${t}</button>`).join('')}</div>
            ${h.use === 'rent' ? `<div class="mis">${mini('hr' + i, h.rent, '만원', '한 달 월세')}${mini('hd' + i, h.dep, '만원', '보증금')}</div>
              <div class="chips"><button type="button" data-hreg="${i}" class="${h.reg ? 'on' : ''}">주택임대사업자로 등록했어요</button></div>
              <div class="flab2">1년 경비</div>${h.expU === false ? mini('hx' + i, h.exp, '만원', '관리비·수선비·중개수수료·대출이자 등') : ''}
              <div class="chips" style="margin-top:8px"><button type="button" data-hxu="${i}" class="${h.expU !== false ? 'on' : ''}">모르겠어요</button></div>
              <p class="hint">${h.expU !== false ? '재산세만 경비로 보고 계산해요. 세금이 실제보다 많이 나올 수 있어서 결과에 "추정"으로 표시해요. ' : ''}월세가 1년 2,000만원 이하면 법에서 정한 경비율(50%, 등록 60%)로도 계산해 보고 세금이 적은 쪽을 골라요.</p>` : ''}</div>`).join('')}
          <button type="button" class="hadd" id="hadd">+ 집 추가</button></div>
        <div class="err" id="err" hidden></div>
        <p class="hint">취득 연도는 오래 가진 1주택의 종부세 공제에 써요(모르면 비워 두세요. 올해 취득한 것으로 보고 보수적으로 계산해요). 지분은 사람마다 매기는 종부세와 월세 소득에, 임대사업자 등록은 월세 세금의 필요경비·공제에 써요.</p>`,
      bind: () => { S.houses.forEach((h, i) => { inp('hp' + i, v => h.pub = v); inp('hs' + i, v => h.since = v); inp('hr' + i, v => h.rent = v); inp('hd' + i, v => h.dep = v); inp('hx' + i, v => h.exp = v); inp('hj' + i, v => h.js = v == null ? null : Math.min(100, v)); });
        document.querySelectorAll('[data-hu]').forEach(b => b.onclick = () => { S.houses[+b.dataset.hu].use = b.dataset.v; render(); });
        document.querySelectorAll('[data-ho]').forEach(b => b.onclick = () => { const h = S.houses[+b.dataset.ho]; h.o = b.dataset.v; if (h.o === '공동명의' && h.js == null) h.js = 50; render(); });
        document.querySelectorAll('[data-hxu]').forEach(b => b.onclick = () => { const h = S.houses[+b.dataset.hxu]; h.expU = h.expU === false; render(); });
        document.querySelectorAll('[data-hreg]').forEach(b => b.onclick = () => { const h = S.houses[+b.dataset.hreg]; h.reg = !h.reg; render(); });
        document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.houses.splice(+b.dataset.del, 1); render(); });
        on('hadd', () => { S.houses.push({pub: null, use: 'rent', rent: null, dep: null, since: null, reg: false}); render(); }); },
      ok: () => S.houses.length && S.houses.every(h => houseMiss(h) === ''),
      err: () => { const i = S.houses.findIndex(h => houseMiss(h)); return i >= 0 && S.houses.some(h => h.pub > 0) ? `${i ? '집 ' + (i + 1) : '첫 번째 집'}: ${houseMiss(S.houses[i])}` : ''; }},
    region: {
      html: () => `<h1 class="q">어디에 사나요?</h1><p class="qs">기초연금을 받을 수 있는지 계산하는 데 써요.</p>
        <div class="opts">${['대도시', '중소도시', '농어촌'].map((r, i) => opt('rg' + i, S.region === r, r, ['특별시·광역시의 구, 특례시', '도의 시, 세종시', '도의 군'][i])).join('')}</div>`,
      bind: () => ['대도시', '중소도시', '농어촌'].forEach((r, i) => on('rg' + i, () => { S.region = r; go(1); })), ok: () => !!S.region},
    dependent: {
      html: () => `<h1 class="q">은퇴 후 직장에 다니는<br>자녀나 가족이 있나요?</h1><p class="qs">그 가족의 건강보험 피부양자가 되면 건강보험료를 내지 않아요.</p>
        <div class="opts">${opt('dp0', S.dependent === 'yes', '있어요', '피부양자가 될 수 있는 해에는 건강보험료를 0원으로 계산해요')}${opt('dp1', S.dependent === 'no', '없어요', '지역가입자로 건강보험료를 내요')}</div>
        <p class="hint">피부양자는 소득(1년 2,000만원 이하)과 재산 조건이 있어요. 해마다 계산해서 조건에 맞는 해만 반영해요.</p>`,
      bind: () => { on('dp0', () => { S.dependent = 'yes'; go(1); }); on('dp1', () => { S.dependent = 'no'; go(1); }); }, ok: () => !!S.dependent},
    review: {
      html: () => { const tot = S.acc.filter(a => a.k !== '빼기').reduce((t, a) => t + a.v, 0), P = people();
        const L = [['who', `${S.couple ? '배우자와 함께' : '혼자'} · <b>${S.by.me}년생</b>${S.couple ? `, 배우자 ${S.by.sp}년생` : ''}`],
          ['retire', `<b>${S.ra}세</b>에 은퇴해요 (${S.by.me + S.ra}년)`],
          ['spend', `은퇴 후 한 달 <b>${won(S.spend)}</b>을 써요`],
          ['salary', P.map(w => `${S.couple ? WHO[w] + ' ' : ''}${[S.sal[w] ? `연봉 <b>${won(S.sal[w])}</b>` : '', S.biz[w] ? `사업 순수입 <b>${won(S.biz[w])}</b>` : ''].filter(Boolean).join(' + ') || '버는 돈 없음'}`).join(' · ')],
          ...(earners().length ? [['severance', earners().map(w => `${S.couple ? WHO[w] + ' ' : ''}퇴직금 ${S.sev[w].m === 'yes' ? `은퇴할 때 약 <b>${won(sevAt(w).amt)}</b>${S.sev[w].unk ? ' (연봉으로 계산)' : ''}` : S.sev[w].m === 'dc' ? '퇴직연금에 쌓임' : '없음'}`).join(' · ')]] : []),
          ['nps', S.nps === 'know' ? `국민연금 한 달 <b>${won(S.npsAmt.me)}</b>${S.couple ? ` · 배우자 ${won(S.npsAmt.sp)}` : ''}` : `국민연금은 <b>${S.npsY.me}년</b>${S.couple ? `·배우자 ${S.npsY.sp}년` : ''} 낸 것으로 대신 계산해요`],
          ['npsStart', S.npsStart.m === 'normal' ? '국민연금은 <b>65세</b>부터' : `국민연금은 <b>${65 + (S.npsStart.m === 'early' ? -S.npsStart.y : S.npsStart.y)}세</b>부터 (${S.npsStart.m === 'early' ? '일찍' : '늦게'})`],
          ['work', S.work ? people().filter(w => S.wk[w].on).map(w => `${S.couple ? WHO[w] + ' ' : ''}한 달 <b>${won(S.wk[w].amt)}</b> ${S.wk[w].kind === '근로' ? '월급' : '순수입'} (${S.wk[w].to}세까지)`).join(' · ') : '은퇴 후 버는 돈 없음'],
          ['saving', `은퇴 전까지 1년에 <b>${won(S.saving)}</b>씩 모아요`],
          ['acc', `자산 <b>${won(tot)}</b> (${S.acc.filter(a => a.k !== '빼기').length}개)`],
          ...(S.couple ? [['owner', `배우자 명의 <b>${S.acc.filter(a => a.o === '배우자').length}개</b> · 공동명의 ${S.acc.filter(a => a.o === '공동명의').length}개`]] : []),
          ...(S.acc.some(a => PENSION(a.k)) ? [['pensionSrc', S.acc.some(a => PENSION(a.k) && a.pu) ? `연금 계좌 돈 나누기 <b style="color:var(--bad)">${S.acc.filter(a => PENSION(a.k) && a.pu).length}개 모름</b> (추정)` : `연금 계좌 안 퇴직금 <b>${won(S.acc.reduce((t, a) => t + (a.sv || 0), 0))}</b> · 세액공제 안 받은 돈 ${won(S.acc.reduce((t, a) => t + (a.nd || 0), 0))}`]] : []),
          ...(S.acc.some(basisAcc) ? [['basis', `넣은 원금 ${S.acc.filter(basisAcc).every(a => !a.bu) ? '<b>모두 입력</b>' : `<b style="color:var(--bad)">${S.acc.filter(a => basisAcc(a) && a.bu).length}개 모름</b> (추정)`}`]] : []),
          ['invest', S.invest === 'def' ? '투자 계좌는 <b>기본값</b>으로 (주식 6%·배당 1.5%, ISA 6%, 연금 4.5%)' : S.invest === 'all' ? `모든 투자 계좌 수익률 약 <b>${holdSum(S.hold).r}%</b> · 배당 약 <b>${holdSum(S.hold).d}%</b>` : `투자 계좌 <b>${invAcc().length}개</b>를 따로 넣었어요`],
          ...(flow().includes('saveTo') ? [['saveTo', `매년 저축은 ${S.saveMode === 'set' ? `<b>직접 나눠서</b> (${saveRows().filter(r => S.saveShare[r.id] > 0).length}곳)` : '<b>투자 계좌 비율대로</b>'}${Object.keys(S.newHold).length ? ` · 새 돈 <b>${Object.keys(S.newHold).length}개</b> 계좌는 다르게 사기` : ''}`]] : []),
          ['house', S.house ? `집 <b>${S.houses.length}채</b> · 공시가격 합계 ${won(S.houses.reduce((t, h) => t + (h.pub || 0), 0))}${S.houses.some(h => h.use === 'rent') ? ` · 월세 <b>${won(S.houses.reduce((t, h) => t + (h.use === 'rent' ? h.rent || 0 : 0), 0))}</b>` : ''}` : '집 없음'],
          ['region', `사는 곳 <b>${S.region}</b>`],
          ['dependent', S.dependent === 'yes' ? '조건이 맞으면 <b>가족의 피부양자</b>로 계산해요' : '건강보험은 <b>지역가입자</b>로 계산해요']];
        return `<h1 class="q">이대로 계산할까요?</h1><p class="qs">고칠 것이 있으면 눌러서 바꿀 수 있어요.</p>
        <div class="sum">${L.map(([k, t]) => `<button type="button" class="sline" data-go="${k}"><span>${t}</span><i>고치기</i></button>`).join('')}</div>
        <details class="asm"><summary>계산 가정 · 기본값</summary>
          <div class="rw"><span>물가</span><b>1년에 2%</b></div><div class="rw"><span>현금 이자</span><b>1년에 2%</b></div><div class="rw"><span>몇 살까지 계획할까요</span><b>95세</b></div>
          <div class="rw"><span>저축이 늘어나는 정도</span><b>물가만큼</b></div><div class="rw"><span>집값이 오르는 정도</span><b>물가만큼</b></div>
          <p>세법은 2026년 기준이에요. 계산한 뒤 결과 화면의 "설정 바꾸기"에서 바꿀 수 있어요.</p></details>`; },
      bind: () => document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { back2review = true; S.ptab = 'me'; cur = flow().indexOf(b.dataset.go); render(); scrollTo(0, 0); }),
      ok: () => true, next: '계산하기'}
  };
  // 은퇴할 때 퇴직금(지금 돈) = 지금 받을 금액 ÷ 지금까지 일한 해 × 은퇴할 때까지 일한 해. 모르면 연봉 ÷ 12 × 은퇴할 때까지 일한 해
  const sevAt = w => { const q = S.sev[w], left = Math.max(0, S.by.me + S.ra - NOW), tot = (q.yrs || 0) + left;
    return {tot, amt: q.unk || !(q.amt > 0) ? (S.sal[w] || 0) / 12 * tot : q.yrs > 0 ? q.amt / q.yrs * tot : q.amt}; };
  const sevHint = w => { const q = S.sev[w]; if (q.yrs == null || (!q.unk && !(q.amt > 0))) return '은퇴할 때까지 지금 회사에 다닌다고 보고, 은퇴할 때 받을 금액으로 늘려 계산해요.';
    const x = sevAt(w); return `연봉 ${won(S.sal[w])} 기준, 은퇴할 때(${x.tot}년 일한 때) 약 <b>${won(x.amt)}</b>을 받는다고 계산해요. 지금 돈 기준이에요${q.unk ? '' : ' · 넣은 금액으로 계산'}.`; };
  const earners = () => people().filter(w => S.sal[w] > 0 && S.by[w] + S.ra > NOW);
  // 저축 나누기: 모르겠어요 = 현금 뺀 투자 계좌 잔액 비율(투자 계좌가 없으면 현금)
  const saveAcc = () => S.acc.filter(a => a.k && a.k !== '빼기');
  const cashAcc = () => saveAcc().filter(a => a.k === '현금');
  // 나누기 줄: 투자 계좌는 하나씩, 현금 통장은 어디에 넣든 같으니 한 줄로
  const saveRows = () => [...invAcc().map(a => ({id: S.acc.indexOf(a), n: a.n, k: a.k})), ...(cashAcc().length ? [{id: 'cash', n: '현금 통장', k: `현금 ${cashAcc().length}개`}] : [])];
  const defSplit = () => { const inv = invAcc(), base = inv.length ? inv : cashAcc(), t = base.reduce((q, a) => q + a.v, 0) || 1;
    return base.map(a => ({a, v: S.saving * a.v / t, p: Math.round(a.v / t * 100)})); };
  const saveOf = i => S.saveMode === 'set' ? S.saving * (S.saveShare[i] || 0) / 100 : (defSplit().find(x => x.a === S.acc[i]) || {v: 0}).v;
  const buyAcc = () => invAcc().filter(a => saveOf(S.acc.indexOf(a)) > 0);
  const shareSum = () => saveRows().reduce((q, r) => q + (S.saveShare[r.id] || 0), 0);
  const shareTxt = () => shareSum() === 100 ? '합계 <b>100%</b>' : `합계가 <b>${shareSum()}%</b>예요. 100%가 되게 맞춰 주세요.`;
  const limitHint = (k, v) => { const y = S.saving * (v || 0) / 100;
    if (k === 'ISA' && y > 2000) return '<p class="hint bad">ISA는 1년에 2,000만원까지 넣을 수 있어요. 넘는 돈은 현금으로 계산해요.</p>';
    if (PENSION(k) && y > 900) return '<p class="hint">연금저축·IRP는 합쳐서 1년 900만원까지 세금을 돌려받아요. 넘게 넣은 돈은 돌려받지 못하지만, 꺼낼 때 그 돈에는 세금이 없어요.</p>';
    return ''; };
  // 이연퇴직소득세를 모를 때: 연봉이 있으면 퇴직금 ÷ (연봉 ÷ 12)로 근속 연수를 추정, 없으면 직접(기본 10년)
  const syHtml = (a, i) => { if (!(a.sv > 0) || a.st != null) return ''; const sal = S.sal[a.o === '배우자' ? 'sp' : 'me'] || 0;
    if (sal > 0) { const y = Math.min(40, Math.max(1, Math.round(a.sv / (sal / 12)))); return `<p class="hint">이연퇴직소득세를 비워 두면 퇴직금 ÷ 월급(연봉 ÷ 12)으로 <b>약 ${y}년</b> 일했다고 보고 추정해요.</p>`; }
    return `${mini('sy' + i + 'v', a.sy, '년', '그 퇴직금을 받을 때 일한 기간')}<p class="hint">이연퇴직소득세를 모르면 일한 기간으로 추정해요. 비워 두면 10년으로 계산해요.</p>`; };
  const houseMiss = h => !(h.pub > 0) ? '공시가격을 넣어 주세요' : h.since != null && !(h.since >= 1950 && h.since <= NOW) ? `취득 연도는 1950~${NOW}년으로 넣어 주세요` : h.use === 'rent' && h.rent == null ? '한 달 월세를 넣어 주세요(전세면 0)' : h.o === '공동명의' && h.js == null ? '내 지분을 넣어 주세요' : '';
  // 사람 탭(부부일 때) — 화면이 바뀌면 '나' 탭부터
  const curP = () => S.couple ? S.ptab : 'me';
  const ptabs = done => S.couple ? `<div class="ptabs" role="tablist">${people().map(w => `<button type="button" role="tab" data-pt="${w}" aria-selected="${curP() === w}" class="${curP() === w ? 'on' : ''}">${WHO[w]}${done(w) ? ' <i>✓</i>' : ''}</button>`).join('')}</div>` : '';
  const bindTabs = () => document.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { S.ptab = b.dataset.pt; render(); });
  // 한 줄 선택(세그먼트): 사람 탭과 모양을 달리해 단계가 구분되게
  const seg = (id, items, val) => `<div class="seg${items.length > 3 ? ' g2' : ''}" role="radiogroup">${items.map(([v, t]) => `<button type="button" role="radio" aria-checked="${val === v}" data-sg="${id}" data-v="${v}" class="${val === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const bindSeg = (id, f) => document.querySelectorAll(`[data-sg="${id}"]`).forEach(b => b.onclick = () => f(b.dataset.v));
  const incDone = w => { const k = S.inc[w]; return k === 'none' || (k === 'wage' && S.sal[w] > 0) || (k === 'biz' && S.biz[w] > 0) || (k === 'both' && S.sal[w] > 0 && S.biz[w] > 0); };
  const workDone = w => { const q = S.wk[w]; return q.on === false || (q.amt > 0 && q.to > raOf(w)); };
  const raOf = w => w === 'sp' && S.by.sp ? S.ra + (S.by.me - S.by.sp) : S.ra;
  const basisAcc = a => ['해외주식', '국내상장 해외ETF', 'ISA'].includes(a.k);
  const accH = i => S.accHold[i] || (S.accHold[i] = SHELTER(S.acc[i].k) ? [{nm: '', w: 100, r: 6, d: 0}] : [{nm: '', w: 100, r: 6, d: 1.5}]);
  // 한 화면의 답에 따라 새로 나오는 화면들
  const CHILD = {who: ['birth', 'salary'], salary: ['severance'], nps: ['npsYears'], acc: ['owner', 'pensionSrc', 'basis', 'invest'], invest: ['investAll', 'investPer'],
    saving: ['saveTo'], saveTo: ['saveSplit', 'saveBuy'], saveSplit: ['saveBuy'], house: ['houseDetail']};
  const flow = () => ['intro', 'who', 'birth', 'retire', 'spend', 'salary', ...(earners().length ? ['severance'] : []), 'nps', ...(S.nps === 'auto' ? ['npsYears'] : []), 'npsStart', 'work', 'saving',
    'acc', ...(S.couple ? ['owner'] : []), ...(S.acc.some(a => PENSION(a.k)) ? ['pensionSrc'] : []), ...(S.acc.some(basisAcc) ? ['basis'] : []),
    ...(invAcc().length ? ['invest', ...(S.invest === 'all' ? ['investAll'] : S.invest === 'per' ? ['investPer'] : [])] : []),
    ...(S.saving > 0 && S.by.me + S.ra > NOW ? ['saveTo', ...(S.saveMode === 'set' ? ['saveSplit'] : []), ...(buyAcc().length ? ['saveBuy'] : [])] : []),
    'house', ...(S.house ? ['houseDetail'] : []), 'region', 'dependent', 'review'];
  // 갖고 있는 것을 나눠 넣기: 줄마다 이름(선택)·비중·1년 수익률(배당 포함)·배당률
  const holdSum = H => { const w = H.reduce((t, h) => t + (h.w || 0), 0), f = k => Math.round(H.reduce((t, h) => t + (h.w || 0) * (h[k] || 0), 0) / (w || 1) * 10) / 10; return {w, r: f('r'), d: f('d')}; };
  const holdOk = H => H.length && H.every(h => h.w > 0 && h.r != null && h.d != null) && holdSum(H).w === 100;
  const hsumTxt = H => { const m = holdSum(H); return m.w === 100 ? `합쳐서 1년 수익률 약 <b>${m.r}%</b> · 배당 약 <b>${m.d}%</b>` : `비중 합계가 <b>${m.w}%</b>예요. 100%가 되게 맞춰 주세요.`; };
  function holdHtml(q, qs, H, p, all){
    const over = H.filter(h => h.d != null && h.r != null && h.d > h.r);
    return `<h1 class="q">${q}</h1><p class="qs">${qs}</p>
      <div class="acc">${H.map((h, i) => `<div class="hc"><div class="hch"><input class="nm" id="${p}n${i}" value="${h.nm || ''}" placeholder="이름 (선택) 예: QQQ" aria-label="이름">${H.length > 1 ? `<button type="button" class="hdel" data-hx="${i}">빼기</button>` : ''}</div>
        <div class="mis3">${mini(p + 'w' + i, h.w, '%', '비중')}${mini(p + 'r' + i, h.r, '%', '1년 수익률')}${mini(p + 'd' + i, h.d, '%', '배당률')}</div></div>`).join('')}
      <button type="button" class="hadd" id="hadd">+ 나눠서 더 넣기</button></div>
      <div class="hsum ${holdSum(H).w === 100 ? '' : 'bad'}" id="${p}sum">${hsumTxt(H)}</div>
      ${over.length ? '<p class="hint">배당률이 수익률보다 높은 줄은 배당을 받는 만큼 값이 해마다 줄어든다고 계산해요.</p>' : ''}
      <p class="hint">수익률은 배당을 포함한 1년 평균이에요.${all ? ' 배당률은 일반 증권 계좌에만 써요. 연금저축·IRP·ISA 안에서는 배당에 그때 세금이 없어서 수익률만 써요.' : ''}</p>`;
  }
  function holdBind(H, p){
    H.forEach((h, i) => { ['w', 'r', 'd'].forEach(k => inp(p + k + i, v => { h[k] = v; const el = $(p + 'sum'); if (el) { el.innerHTML = hsumTxt(H); el.classList.toggle('bad', holdSum(H).w !== 100); } }));
      const n = $(p + 'n' + i); if (n) n.oninput = () => h.nm = n.value; });
    document.querySelectorAll('[data-hx]').forEach(b => b.onclick = () => { H.splice(+b.dataset.hx, 1); render(); });
    on('hadd', () => { const left = Math.max(0, 100 - holdSum(H).w); H.push({nm: '', w: left || null, r: null, d: null}); render(); });
  }
  const okYear = y => y >= 1930 && y <= NOW - 15;
  const opt = (id, on, t, d) => `<button type="button" class="opt ${on ? 'on' : ''}" id="${id}" aria-pressed="${on}"><span><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span><i></i></button>`;
  const big = (id, v, unit, ph) => `<label class="big"><input id="${id}" inputmode="${unit === '%' ? 'decimal' : 'numeric'}" autocomplete="off" value="${v ?? ''}" placeholder="${ph ?? ''}" aria-label="${unit}"><em>${unit}</em></label>${unit === '만원' ? `<div class="conv" id="${id}_c">${v >= 1000 ? '= ' + won(v) : ''}</div>` : ''}`;
  const mini = (id, v, unit, label) => `<label class="mi"><span>${label}</span><span class="miv"><input id="${id}" inputmode="${unit === '%' ? 'decimal' : 'numeric'}" autocomplete="off" value="${v ?? ''}"><em>${unit}</em></span>${unit === '만원' ? `<small id="${id}_c">${v >= 1000 ? '= ' + won(v) : ''}</small>` : ''}</label>`;
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  const inp = (id, set) => { const el = $(id); if (!el) return; el.oninput = () => { const v = num(el.value); set(v); const c = $(id + '_c'); if (c) c.textContent = v >= 1000 ? '= ' + won(v) : ''; check(); }; el.onkeydown = e => { if (e.key === 'Enter') $('next').click(); }; };
  const chipsTo = (id, set) => document.querySelectorAll('.chips [data-v]').forEach(b => b.onclick = () => { set(+b.dataset.v); $(id).value = b.dataset.v; { const c = $(id + '_c'); if (c) c.textContent = +b.dataset.v >= 1000 ? '= ' + won(+b.dataset.v) : ''; } document.querySelectorAll('.chips [data-v]').forEach(x => x.classList.toggle('on', x === b)); check(); });
  const curKey = () => { const k = flow()[cur]; return k === 'investPer' && S.editAcc != null ? 'holdEdit' : k === 'saveBuy' && S.editNew != null ? 'newEdit' : k; };
  const TABDONE = {salary: w => incDone(w), work: w => !S.work || workDone(w)};
  const tabNext = () => { const f = TABDONE[curKey()]; if (!S.couple || !f || (curKey() === 'work' && !S.work) || !f(curP())) return null; return people().find(w => w !== curP() && !f(w)) || null; };
  function check(){
    const sc = SCREENS[curKey()];
    const tn = tabNext(); $('next').disabled = !sc.ok() && !tn;
    if (tn) $('next').textContent = `다음: ${WHO[tn]}`; else if ($('next').textContent.startsWith('다음: ')) $('next').textContent = baseLabel;
    const er = $('err'); if (er && sc.err) { const m = sc.err(); er.hidden = !m; er.textContent = m; }
  }
  function render(){
    const F = flow(), key = curKey(), sc = SCREENS[key];
    const m = $('main'); m.innerHTML = `<div class="screen">${sc.html()}</div>`;
    $('bar').style.width = (cur / (F.length - 1) * 100) + '%';
    $('cnt').textContent = cur && key !== 'review' ? `${cur}/${F.length - 2}` : '';
    $('back').hidden = cur === 0;
    baseLabel = $('next').textContent = back2review && key !== 'review' && key !== 'holdEdit' && key !== 'newEdit' && !F.slice(cur + 1, F.indexOf('review')).some(k => (CHILD[key] || []).includes(k) || !SCREENS[k].ok()) ? '확인' : sc.next || '다음';
    $('skip').hidden = true;
    if (sc.bind) sc.bind();
    check();

    const first = m.querySelector('.big input'); if (first && !first.value) setTimeout(() => first.focus({preventScroll: true}), 60);
  }
  function go(d){
    const F = flow();
    if (d > 0 && back2review && F[cur] !== 'review') {
      // 확인 화면에서 고치다가 답이 바뀌면, 그 답에 딸린 화면(예: 집 있어요 → 어떤 집인가요)과 아직 비어 있는 화면을 이어서 보여 준다
      const from = F[cur], ri = F.indexOf('review');
      let n = -1;
      for (let j = cur + 1; j < ri; j++) { const k = F[j]; if ((CHILD[from] || []).includes(k) || !SCREENS[k].ok()) { n = j; break; } }
      if (n >= 0) cur = n; else { back2review = false; cur = ri; }
    }
    else cur = Math.max(0, Math.min(F.length - 1, cur + d));
    S.ptab = 'me'; render(); scrollTo(0, 0);
  }
  $('next').onclick = () => {
    if ($('next').disabled) return;
    if (curKey() === 'holdEdit') { S.editAcc = null; render(); scrollTo(0, 0); return; }
    if (curKey() === 'newEdit') { S.editNew = null; render(); scrollTo(0, 0); return; }
    if (flow()[cur] === 'review') { const t = $('toast'); t.textContent = '계산을 마치면 은퇴 계산 레포트가 열려요 (시안)'; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); return; }
    const t = tabNext(); if (t) { S.ptab = t; render(); scrollTo(0, 0); return; }
    go(1);
  };
  $('back').onclick = () => { if (curKey() === 'holdEdit') { S.editAcc = null; render(); return; } if (curKey() === 'newEdit') { S.editNew = null; render(); return; } back2review = false; go(-1); };
  // 입력칸 밖을 누르면 자판을 내려요(아래 버튼이 가려지지 않게)
  document.addEventListener('pointerdown', e => { const a = document.activeElement; if (a && a.tagName === 'INPUT' && !e.target.closest('input, label')) a.blur(); });
  window.__jump = (k, f) => { if (f) f(S); cur = flow().indexOf(k); render(); };   // 시안 확인용
  render();
})();
