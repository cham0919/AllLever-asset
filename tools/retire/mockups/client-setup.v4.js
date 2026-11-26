(function(){
  const $ = id => document.getElementById(id);
  const NOW = 2026;
  const won = v => { v = Math.round(v); const e = Math.floor(v / 1e4), m = v % 1e4; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + '원'; };   // v: 만원
  const num = s => { const v = parseFloat(String(s).replace(/[^\d.]/g, '')); return isNaN(v) ? null : v; };
  // 예시: 가계부·자산 탭에서 미리 채운 값
  const LEDGER = {spend: 298, saving: 2980};
  const S = {couple: null, by: {me: null, sp: null}, ra: 55, spend: 300, sal: {me: null, sp: null}, nps: null, npsAmt: {me: null, sp: null}, npsY: {me: null, sp: null}, mixW: 30, hold: [{t: '레버리지', ex: 'QLD 같은', w: 50, r: 10, d: 0}, {t: '커버드콜', ex: 'JEPI·QYLD 같은', w: 50, r: 6, d: 12}], accHold: {}, editAcc: null, saving: 3000,
    acc: [{n: '생활비 통장', k: '현금', v: 1980}, {n: '파킹통장', k: '현금', v: 1220}, {n: '비상금', k: '현금', v: 820}, {n: '증권 CMA', k: null, v: 1180},
      {n: '미래에셋 해외주식', k: '해외주식', v: 7860}, {n: '키움 해외주식', k: '해외주식', v: 3040}, {n: '퇴직연금 IRP', k: 'IRP', v: 4070}, {n: '개인 IRP', k: 'IRP', v: 2555}, {n: '청약통장', k: '현금', v: 500}, {n: '주식 예수금', k: '현금', v: 60}],
    stock: null, stockPer: {}, sRet: null, sDiv: null, house: null, houses: [{pub: null, use: 'live', rent: null, dep: null}], region: '대도시'};
  const KINDS = ['현금', '해외주식', '국내주식', 'ISA', '연금저축', 'IRP', '빼기'];
  let openAcc = -1, cur = 0, back2review = false;

  const SCREENS = {
    intro: {
      html: () => `<h1 class="q">은퇴 후에 매달 얼마를<br>쓸 수 있을지 계산해 볼게요</h1>
        <div class="intro"><div><em>1</em><span>질문에 하나씩 답하면 돼요. 2분쯤 걸려요.</span></div><div><em>2</em><span>가계부와 자산 탭 숫자로 미리 채워 둘게요.</span></div><div><em>3</em><span>입력한 내용은 이 휴대폰에만 저장돼요.</span></div></div>`,
      next: '시작하기', ok: () => true},
    who: {
      html: () => `<h1 class="q">누구와 함께<br>은퇴를 계획할까요?</h1>
        <div class="opts">${opt('c0', S.couple === false, '혼자', '나 혼자 기준으로 계산해요')}${opt('c1', S.couple === true, '배우자와 함께', '두 사람의 국민연금과 세금을 함께 계산해요')}</div>`,
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
        <p class="hint">가계부 최근 6개월 평균 지출은 <b>${LEDGER.spend}만원</b>이에요. 지금 돈의 가치로 적어 주세요.</p>`,
      bind: () => { inp('spend', v => S.spend = v); chipsTo('spend', v => S.spend = v); }, ok: () => S.spend > 0},
    salary: {
      html: () => S.couple ? `<h1 class="q">두 분은 지금 1년에<br>얼마를 버나요?</h1><p class="qs">세금 떼기 전 연봉이에요. 연금저축·IRP로 돌려받는 세금과 국민연금을 계산하는 데 써요.</p>
        ${['me', 'sp'].map(w => `<div class="flab">${w === 'me' ? '나' : '배우자'}</div>${big('sal_' + w, S.sal[w], '만원', w === 'me' ? '6000' : '4000')}<div class="chips" style="margin-top:8px"><button type="button" data-nos="${w}" class="${S.sal[w] === 0 ? 'on' : ''}">벌지 않아요</button></div>`).join('')}`
        : `<h1 class="q">지금 1년에<br>얼마를 버나요?</h1><p class="qs">세금 떼기 전 연봉이에요. 연금저축·IRP로 돌려받는 세금과 국민연금을 계산하는 데 써요.</p>
        <div class="field">${big('sal_me', S.sal.me, '만원', '6000')}</div>`,
      bind: () => { inp('sal_me', v => S.sal.me = v); if (S.couple) inp('sal_sp', v => S.sal.sp = v);
        document.querySelectorAll('[data-nos]').forEach(b => b.onclick = () => { S.sal[b.dataset.nos] = 0; render(); }); },
      ok: () => S.sal.me != null && (!S.couple || S.sal.sp != null),
      skip: () => S.couple ? '' : '연봉이 없어요', onSkip: () => { S.sal.me = 0; }},
    nps: {
      html: () => `<h1 class="q">국민연금 예상액을<br>알고 있나요?</h1>
        <div class="opts">${opt('n0', S.nps === 'know', '알아요', '국민연금공단 「내 연금 알아보기」에서 본 금액')}${opt('n1', S.nps === 'auto', '잘 몰라요', '연봉과 낸 기간으로 대신 계산해요')}</div>
        ${S.nps === 'know' ? `${S.couple ? '<div class="flab">나 · 한 달</div>' : '<div class="flab">한 달 예상액</div>'}${big('na_me', S.npsAmt.me, '만원', '130')}${S.couple ? `<div class="flab">배우자 · 한 달</div>${big('na_sp', S.npsAmt.sp, '만원', '90')}` : ''}
          <p class="hint">받기 시작하는 나이는 태어난 해로 정해져요. ${S.by.me}년생은 <b>65세</b>부터예요.</p>` : ''}`,
      bind: () => { on('n0', () => { S.nps = 'know'; render(); setTimeout(() => $('na_me') && $('na_me').focus(), 50); }); on('n1', () => { S.nps = 'auto'; go(1); });
        if (S.nps === 'know') { inp('na_me', v => S.npsAmt.me = v); if (S.couple) inp('na_sp', v => S.npsAmt.sp = v); } },
      ok: () => S.nps === 'auto' || (S.nps === 'know' && S.npsAmt.me != null && (!S.couple || S.npsAmt.sp != null))},
    npsYears: {
      html: () => { const def = by => Math.max(10, Math.min(40, (S.by.me + S.ra) - by - 27));
        if (S.npsY.me == null) S.npsY.me = def(S.by.me); if (S.couple && S.npsY.sp == null) S.npsY.sp = def(S.by.sp);
        const st = w => `<div class="stepper" style="margin-top:${S.couple ? 8 : 36}px"><button type="button" data-dn="${w}" aria-label="1년 줄이기">−</button><b><span id="ny_${w}">${S.npsY[w]}</span><small>년</small></b><button type="button" data-up="${w}" aria-label="1년 늘리기">+</button></div>`;
        return `<h1 class="q">국민연금을 은퇴할 때까지<br>모두 몇 년 내게 되나요?</h1>
        ${S.couple ? `<div class="flab">나</div>${st('me')}<div class="flab">배우자</div>${st('sp')}` : st('me')}
        <p class="hint">지금까지 낸 기간과 은퇴까지 남은 기간을 더한 거예요. 10년보다 적으면 연금으로 받을 수 없어요.</p>`; },
      bind: () => { document.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { const w = b.dataset.dn; S.npsY[w] = Math.max(0, S.npsY[w] - 1); $('ny_' + w).textContent = S.npsY[w]; });
        document.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const w = b.dataset.up; S.npsY[w] = Math.min(45, S.npsY[w] + 1); $('ny_' + w).textContent = S.npsY[w]; }); },
      ok: () => true},
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
        <p class="hint">차처럼 꺼내 쓰지 않는 것은 "빼기"를 고르세요. 집은 다음에 따로 물어볼게요.</p>`; },
      bind: () => { document.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { openAcc = openAcc === +b.dataset.i ? -1 : +b.dataset.i; render(); });
        document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { S.acc[openAcc].k = b.dataset.k; openAcc = -1; render(); }); },
      ok: () => S.acc.every(a => a.k), next: '이대로 좋아요'},
    owner: {
      html: () => `<h1 class="q">누구 이름으로 된<br>계좌인가요?</h1><p class="qs">세금은 사람마다 따로 매겨져서 명의가 중요해요. 해외주식 이익 250만원 공제, 연금 1년 1,500만원 한도는 한 사람마다 있어요.</p>
        <div class="acc">${S.acc.filter(a => a.k !== '빼기').map(a => { const i = S.acc.indexOf(a), solo = /IRP|연금저축|ISA/.test(a.k);
          return `<div class="ac"><span><b>${a.n}</b><small>${a.k} · ${won(a.v)}</small></span></div><div class="chips" style="margin:0 0 12px">${(solo ? ['나', '배우자'] : ['나', '배우자', '공동']).map(o => `<button type="button" data-own="${i}" data-o="${o}" class="${(a.o || '나') === o ? 'on' : ''}">${o}</button>`).join('')}</div>`; }).join('')}</div>
        <p class="hint">연금저축·IRP·ISA는 한 사람 이름으로만 만들 수 있어요.</p>`,
      bind: () => document.querySelectorAll('[data-own]').forEach(b => b.onclick = () => { S.acc[+b.dataset.own].o = b.dataset.o; render(); }),
      ok: () => true, next: '이대로 좋아요'},
    stock: {
      html: () => { const st = S.acc.filter(a => /주식/.test(a.k || ''));
        return `<h1 class="q">은퇴 후 주식은<br>어떻게 쓸 건가요?</h1><p class="qs">주식 ${won(st.reduce((t, a) => t + a.v, 0))}이 있어요.</p>
        <div class="opts">${opt('s0', S.stock === 0, '성장주 위주 · 팔아서 쓰기', '배당이 적은 주식이에요. 예: QQQ · 배당 연 0.6%')}${opt('s1', S.stock === 1, '배당주 위주 · 배당 받으며 쓰기', '배당이 많은 주식이에요. 예: SCHD · 배당 연 3.5%')}
        ${opt('s2', S.stock === 2, '여러 종류를 섞어서 갖고 있어요', '종류마다 비중·수익률·배당률을 넣어요. 예: QLD 반, 커버드콜 반')}${opt('s3', S.stock === 3, '계좌마다 달라요', '계좌마다 따로 넣어요')}</div>`; },
      bind: () => [[0, 's0'], [1, 's1'], [2, 's2'], [3, 's3']].forEach(([v, id]) => on(id, () => { S.stock = v; go(1); })),
      ok: () => S.stock != null},
    stockMix: {
      html: () => holdHtml('주식을 어떻게<br>나눠 갖고 있나요?', '주식 전체 기준이에요.', S.hold, 'g'),
      bind: () => holdBind(S.hold, 'g'), ok: () => holdOk(S.hold)},
    stockPer: {
      html: () => { const st = S.acc.filter(a => /주식/.test(a.k || ''));
        return `<h1 class="q">계좌마다 어떤 주식을<br>갖고 있나요?</h1><p class="qs">계좌를 눌러 바꿔요.</p>
        <div class="acc">${st.map(a => { const i = S.acc.indexOf(a), H = S.accHold[i] || (S.accHold[i] = [{...PRE[0], w: 100}]), m = holdSum(H);
          return `<button type="button" class="ab" data-ed="${i}"><span><b>${a.n}</b><small>${H.map(h => `${h.t} ${h.w}%`).join(' · ')}</small><small>수익률 약 ${m.r}% · 배당 약 ${m.d}%</small></span><i>바꾸기 ›</i></button>`; }).join('')}</div>`; },
      bind: () => document.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { S.editAcc = +b.dataset.ed; render(); }),
      ok: () => S.acc.filter(a => /주식/.test(a.k || '')).every(a => holdOk(S.accHold[S.acc.indexOf(a)] || []))},
    holdEdit: {
      html: () => holdHtml(`${S.acc[S.editAcc].n}에는<br>어떤 주식이 있나요?`, `${won(S.acc[S.editAcc].v)}이 있어요.`, S.accHold[S.editAcc], 'a'),
      bind: () => holdBind(S.accHold[S.editAcc], 'a'), ok: () => holdOk(S.accHold[S.editAcc]), next: '확인'},
    house: {
      html: () => `<h1 class="q">집이 있나요?</h1><p class="qs">건강보험료·세금·기초연금을 계산하는 데 써요. 세를 주고 있다면 받는 월세도 생활비에 보태요.</p>
        <div class="opts">${opt('h0', S.house === false, '없어요', '')}${opt('h1', S.house === true, '있어요', '')}</div>`,
      bind: () => { on('h0', () => { S.house = false; go(1); }); on('h1', () => { S.house = true; go(1); }); },
      ok: () => S.house != null},
    houseDetail: {
      html: () => `<h1 class="q">어떤 집인가요?</h1><p class="qs">집마다 알려 주세요. 여러 채면 "+ 집 추가"를 눌러요.</p>
        <div class="acc">${S.houses.map((h, i) => `<div class="hc"><div class="hch"><b>${i ? '집 ' + (i + 1) : '첫 번째 집'}</b>${i ? `<button type="button" class="hdel" data-del="${i}">빼기</button>` : ''}</div>
            ${mini('hp' + i, h.pub, '만원', '공시가격')}
            ${S.couple ? `<div class="chips" style="margin-top:10px">${['나', '배우자', '공동명의'].map(o => `<button type="button" data-ho="${i}" data-v="${o}" class="${(h.o || '나') === o ? 'on' : ''}">${o}</button>`).join('')}</div>` : ''}
            <div class="chips" style="margin-top:10px">${[['live', '내가 사는 집'], ['rent', '세 준 집'], ['empty', '비어 있는 집']].map(([v, t]) => `<button type="button" data-hu="${i}" data-v="${v}" class="${h.use === v ? 'on' : ''}">${t}</button>`).join('')}</div>
            ${h.use === 'rent' ? `<div class="mis">${mini('hr' + i, h.rent, '만원', '한 달 월세')}${mini('hd' + i, h.dep, '만원', '보증금')}</div>` : ''}</div>`).join('')}
          <button type="button" class="hadd" id="hadd">+ 집 추가</button></div>
        <p class="hint">자산 탭에 적은 집 가격은 <b>6억 5,500만원</b>이에요. 공시가격은 보통 이보다 낮아요.</p>`,
      bind: () => { S.houses.forEach((h, i) => { inp('hp' + i, v => h.pub = v); inp('hr' + i, v => h.rent = v); inp('hd' + i, v => h.dep = v); });
        document.querySelectorAll('[data-hu]').forEach(b => b.onclick = () => { S.houses[+b.dataset.hu].use = b.dataset.v; render(); });
        document.querySelectorAll('[data-ho]').forEach(b => b.onclick = () => { S.houses[+b.dataset.ho].o = b.dataset.v; render(); });
        document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { S.houses.splice(+b.dataset.del, 1); render(); });
        on('hadd', () => { S.houses.push({pub: null, use: 'rent', rent: null, dep: null}); render(); }); },
      ok: () => S.houses.length && S.houses.every(h => h.pub > 0 && (h.use !== 'rent' || h.rent != null))},
    region: {
      html: () => `<h1 class="q">어디에 사나요?</h1><p class="qs">기초연금을 받을 수 있는지 계산하는 데 써요.</p>
        <div class="opts">${['대도시', '중소도시', '농어촌'].map((r, i) => opt('rg' + i, S.region === r, r, ['특별시·광역시의 구, 특례시', '도의 시, 세종시', '도의 군'][i])).join('')}</div>`,
      bind: () => ['대도시', '중소도시', '농어촌'].forEach((r, i) => on('rg' + i, () => { S.region = r; go(1); })), ok: () => !!S.region},
    review: {
      html: () => { const tot = S.acc.filter(a => a.k !== '빼기').reduce((t, a) => t + a.v, 0);
        const L = [['who', `${S.couple ? '배우자와 함께' : '혼자'} · <b>${S.by.me}년생</b>${S.couple ? `, 배우자 ${S.by.sp}년생` : ''}`],
          ['retire', `<b>${S.ra}세</b>에 은퇴해요 (${S.by.me + S.ra}년)`],
          ['spend', `은퇴 후 한 달 <b>${won(S.spend)}</b>을 써요`],
          ['salary', (S.couple ? ['me', 'sp'] : ['me']).map(w => `${S.couple ? (w === 'me' ? '나' : '배우자') + ' ' : ''}${S.sal[w] ? `연봉 <b>${won(S.sal[w])}</b>` : '연봉 없음'}`).join(' · ')],
          ['nps', S.nps === 'know' ? `국민연금 한 달 <b>${won(S.npsAmt.me)}</b>${S.couple ? ` · 배우자 ${won(S.npsAmt.sp)}` : ''}` : `국민연금은 <b>${S.npsY.me}년</b>${S.couple ? `·배우자 ${S.npsY.sp}년` : ''} 낸 것으로 대신 계산해요`],
          ['saving', `은퇴 전까지 1년에 <b>${won(S.saving)}</b>씩 모아요`],
          ['acc', `자산 <b>${won(tot)}</b> (${S.acc.filter(a => a.k !== '빼기').length}개)`],
          ...(S.couple ? [['owner', `배우자 명의 <b>${S.acc.filter(a => a.o === '배우자').length}개</b> · 공동 ${S.acc.filter(a => a.o === '공동').length}개`]] : []),
          ['stock', S.stock === 2 ? `주식은 ${S.hold.map(h => `${h.t} <b>${h.w}%</b>`).join(' · ')} (수익률 약 ${holdSum(S.hold).r}%, 배당 약 ${holdSum(S.hold).d}%)` : `주식은 <b>${['성장주 위주', '배당주 위주', '', '계좌마다 다르게'][S.stock]}</b>`],
          ['region', `사는 곳 <b>${S.region}</b>`],
          ['house', S.house ? `집 <b>${S.houses.length}채</b> · 공시가격 합계 ${won(S.houses.reduce((t, h) => t + (h.pub || 0), 0))}${S.houses.some(h => h.use === 'rent') ? ` · 월세 <b>${won(S.houses.reduce((t, h) => t + (h.use === 'rent' ? h.rent || 0 : 0), 0))}</b>` : ''}` : '집 없음']];
        return `<h1 class="q">이대로 계산할까요?</h1><p class="qs">고칠 것이 있으면 눌러서 바꿀 수 있어요.</p>
        <div class="sum">${L.map(([k, t]) => `<button type="button" class="sline" data-go="${k}"><span>${t}</span><i>고치기</i></button>`).join('')}</div>
        <details class="asm"><summary>계산 가정 · 기본값</summary>
          <div class="rw"><span>물가</span><b>1년에 2%</b></div><div class="rw"><span>수익률</span><b>1년에 6%</b></div><div class="rw"><span>몇 살까지 계획할까요</span><b>95세</b></div>
          <div class="rw"><span>저축이 늘어나는 정도</span><b>물가만큼</b></div><div class="rw"><span>집값이 오르는 정도</span><b>물가만큼</b></div>
          <p>수익률은 목표 탭의 계획 수익률이에요. 계산한 뒤 결과 화면의 "설정 바꾸기"에서 바꿀 수 있어요.</p></details>`; },
      bind: () => document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { back2review = true; cur = flow().indexOf(b.dataset.go); render(); }),
      ok: () => true, next: '계산하기'}
  };
  // 주식 구성: 종류마다 비중·수익률·배당률. 종류 버튼은 값을 미리 채워 주는 예시일 뿐(바꿀 수 있음)
  const PRE = [{t: '성장주', ex: 'QQQ 같은', r: 6, d: 0.6}, {t: '배당주', ex: 'SCHD 같은', r: 6, d: 3.5}, {t: '커버드콜', ex: 'JEPI·QYLD 같은', r: 6, d: 10}, {t: '레버리지', ex: 'QLD 같은', r: 6, d: 0}, {t: '직접 입력', ex: '', r: null, d: null}];
  const holdSum = H => { const w = H.reduce((t, h) => t + (h.w || 0), 0) || 1, f = k => Math.round(H.reduce((t, h) => t + (h.w || 0) * (h[k] || 0), 0) / w * 10) / 10; return {w: H.reduce((t, h) => t + (h.w || 0), 0), r: f('r'), d: f('d')}; };
  const holdOk = H => H.length && H.every(h => h.w > 0 && h.r != null && h.d != null) && holdSum(H).w === 100;
  function holdHtml(q, qs, H, p){
    const m = holdSum(H), over = H.filter(h => h.d != null && h.r != null && h.d > h.r);
    return `<h1 class="q">${q}</h1><p class="qs">${qs}</p>
      <div class="acc">${H.map((h, i) => `<div class="hc"><div class="hch"><b>${h.t}${h.ex ? ` <small class="ex">${h.ex}</small>` : ''}</b>${H.length > 1 ? `<button type="button" class="hdel" data-hx="${i}">빼기</button>` : ''}</div>
        <div class="mis3">${mini(p + 'w' + i, h.w, '%', '비중')}${mini(p + 'r' + i, h.r, '%', '1년 수익률')}${mini(p + 'd' + i, h.d, '%', '배당률')}</div></div>`).join('')}
      <div class="kinds2"><span>종류 더하기</span><div class="chips" style="margin-top:6px">${PRE.map((x, k) => `<button type="button" data-add="${k}">+ ${x.t}</button>`).join('')}</div></div></div>
      <div class="hsum ${m.w === 100 ? '' : 'bad'}" id="${p}sum">${hsumTxt(H)}</div>
      ${over.length ? `<p class="hint">배당률이 수익률보다 높은 종류(${over.map(h => h.t).join(', ')})는 배당을 받는 만큼 주가가 해마다 줄어든다고 계산해요.</p>` : ''}
      <p class="hint">수익률은 배당을 포함한 1년 평균이에요. 종류 이름 옆 예시 값은 미리 채워 둔 것이라, 갖고 있는 상품 값으로 바꿔 주세요.</p>`;
  }
  const hsumTxt = H => { const m = holdSum(H); return m.w === 100 ? `합쳐서 1년 수익률 약 <b>${m.r}%</b> · 배당 약 <b>${m.d}%</b>` : `비중 합계가 <b>${m.w}%</b>예요. 100%가 되게 맞춰 주세요.`; };
  function holdBind(H, p){
    H.forEach((h, i) => ['w', 'r', 'd'].forEach(k => inp(p + k + i, v => { h[k] = v; const el = $(p + 'sum'); if (el) { el.innerHTML = hsumTxt(H); el.classList.toggle('bad', holdSum(H).w !== 100); } })));
    document.querySelectorAll('[data-hx]').forEach(b => b.onclick = () => { H.splice(+b.dataset.hx, 1); render(); });
    document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const x = PRE[+b.dataset.add], left = Math.max(0, 100 - holdSum(H).w); H.push({...x, w: left || null}); render(); });
  }
  const flow = () => ['intro', 'who', 'birth', 'retire', 'spend', 'salary', 'nps', ...(S.nps === 'auto' ? ['npsYears'] : []), 'saving', 'acc', ...(S.couple ? ['owner'] : []), 'stock', ...(S.stock === 2 ? ['stockMix'] : S.stock === 3 ? ['stockPer'] : []), 'house', ...(S.house ? ['houseDetail'] : []), 'region', 'review'];
  const okYear = y => y >= 1930 && y <= NOW - 15;
  const ck = on => on ? '✓ ' : '';
  const opt = (id, on, t, d) => `<button type="button" class="opt ${on ? 'on' : ''}" id="${id}" aria-pressed="${on}"><span><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span><i></i></button>`;
  const big = (id, v, unit, ph) => `<label class="big"><input id="${id}" inputmode="numeric" autocomplete="off" value="${v ?? ''}" placeholder="${ph ?? ''}" aria-label="${unit}"><em>${unit}</em></label>${unit === '만원' ? `<div class="conv" id="${id}_c">${v >= 1000 ? '= ' + won(v) : ''}</div>` : ''}`;
  const mini = (id, v, unit, label) => `<label class="mi"><span>${label}</span><span class="miv"><input id="${id}" inputmode="decimal" autocomplete="off" value="${v ?? ''}"><em>${unit}</em></span>${unit === '만원' ? `<small id="${id}_c">${v >= 1000 ? '= ' + won(v) : ''}</small>` : ''}</label>`;
  const blend = w => (Math.round((0.6 + (3.5 - 0.6) * w / 100) * 10) / 10).toFixed(1);
  const mixUI = (id, w) => `<div class="mixw"><div class="mixh"><span>배당주 <b id="${id}_w">${w}%</b> · 성장주 <b id="${id}_g">${100 - w}%</b></span><span>배당률 약 <b id="${id}_y">${blend(w)}%</b></span></div><input type="range" class="rng" id="${id}" min="0" max="100" step="10" value="${w}" aria-label="배당주 비중"><div class="mixbar"><i id="${id}_b" style="width:${w}%"></i></div></div>`;
  const slide = (id, set) => { const el = $(id); if (!el) return; el.oninput = () => { const w = +el.value; set(w); $(id + '_w').textContent = w + '%'; $(id + '_g').textContent = (100 - w) + '%'; $(id + '_y').textContent = blend(w) + '%'; $(id + '_b').style.width = w + '%'; }; };
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  const inp = (id, set) => { const el = $(id); if (!el) return; el.oninput = () => { const v = num(el.value); set(v); const c = $(id + '_c'); if (c) c.textContent = v >= 1000 ? '= ' + won(v) : ''; check(); }; el.onkeydown = e => { if (e.key === 'Enter') $('next').click(); }; };
  const chipsTo = (id, set) => document.querySelectorAll('.chips [data-v]').forEach(b => b.onclick = () => { set(+b.dataset.v); $(id).value = b.dataset.v; { const c = $(id + '_c'); if (c) c.textContent = +b.dataset.v >= 1000 ? '= ' + won(+b.dataset.v) : ''; } document.querySelectorAll('.chips [data-v]').forEach(x => x.classList.toggle('on', x === b)); check(); });
  const curKey = () => { const k = flow()[cur]; return k === 'stockPer' && S.editAcc != null ? 'holdEdit' : k; };
  function check(){
    const sc = SCREENS[curKey()];
    $('next').disabled = !sc.ok();
    const er = $('err'); if (er && sc.err) { const m = sc.err(); er.hidden = !m; er.textContent = m; }
  }
  function render(){
    const F = flow(), key = curKey(), sc = SCREENS[key];
    const m = $('main'); m.innerHTML = `<div class="screen">${sc.html()}</div>`;
    $('bar').style.width = (cur / (F.length - 1) * 100) + '%';
    $('cnt').textContent = cur && key !== 'review' ? `${cur}/${F.length - 2}` : '';
    $('back').hidden = cur === 0;
    $('next').textContent = back2review && key !== 'review' ? '확인' : sc.next || '다음';
    const skT = typeof sc.skip === 'function' ? sc.skip() : sc.skip; const sk = $('skip'); sk.hidden = !skT; if (skT) { sk.textContent = skT; sk.onclick = () => { sc.onSkip(); go(1); }; }
    if (sc.bind) sc.bind();
    check();
    const first = m.querySelector('input'); if (first && !first.value) setTimeout(() => first.focus({preventScroll: true}), 60);
  }
  function go(d){
    const F = flow();
    if (d > 0 && back2review && F[cur] !== 'review') { back2review = false; cur = F.indexOf('review'); }
    else cur = Math.max(0, Math.min(F.length - 1, cur + d));
    render(); scrollTo(0, 0);
  }
  $('next').onclick = () => {
    if ($('next').disabled) return;
    if (curKey() === 'holdEdit') { S.editAcc = null; render(); scrollTo(0, 0); return; }
    if (flow()[cur] === 'review') { const t = $('toast'); t.textContent = '계산을 마치면 은퇴 계산 레포트가 열려요 (시안)'; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); return; }
    go(1);
  };
  $('back').onclick = () => { if (curKey() === 'holdEdit') { S.editAcc = null; render(); return; } back2review = false; go(-1); };
  render();
})();
