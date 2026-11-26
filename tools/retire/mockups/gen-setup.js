const fs = require('fs');
const {CSS} = require('./common.js');

const page = `<title>은퇴 설계 시작하기</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${CSS}
html,body{height:100%}
.app{max-width:440px;margin:0 auto;min-height:100%;display:flex;flex-direction:column;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.top{display:flex;align-items:center;gap:12px;height:52px}
.back{width:40px;height:40px;margin-left:-10px;border:0;background:none;font-size:26px;color:var(--ink);cursor:pointer}.back[hidden]{display:block!important;visibility:hidden}
.prog{flex:1;height:4px;border-radius:2px;background:var(--line);overflow:hidden}.prog i{display:block;height:100%;background:var(--accent);transition:width .3s}
.cnt{font-size:13px;color:var(--sub);font-variant-numeric:tabular-nums;width:36px;text-align:right}
.body{flex:1;padding:28px 0 24px}
.q{margin:0;font-size:26px;line-height:1.38;font-weight:800;letter-spacing:-.025em;text-wrap:balance}
.qs{margin:10px 0 0;font-size:16px;line-height:1.6;color:var(--sub)}
.field{margin-top:36px}
.big{display:flex;align-items:baseline;gap:8px;border-bottom:2px solid var(--line);padding-bottom:8px;transition:border-color .2s}.big:focus-within{border-color:var(--accent)}
.big input{flex:1;min-width:0;border:0;background:none;outline:none;font:inherit;font-size:34px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;padding:0}
.big input::placeholder{color:var(--faint)}.big em{font-style:normal;font-size:22px;font-weight:700;color:var(--sub)}
.flab{font-size:15px;font-weight:700;color:var(--sub);margin:22px 0 6px}
.hint{margin-top:10px;font-size:15px;color:var(--sub);line-height:1.6}.hint b{color:var(--ink)}
.err{margin-top:10px;font-size:15px;font-weight:700;color:var(--bad)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.chips button{height:44px;padding:0 16px;border:1px solid var(--line);border-radius:22px;background:var(--card);font-size:16px;font-weight:700;color:var(--ink);cursor:pointer}.chips button.on{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
.stepper{display:flex;align-items:center;justify-content:space-between;margin-top:36px}
.stepper button{width:64px;height:64px;border:0;border-radius:50%;background:var(--chip);font-size:30px;color:var(--ink);cursor:pointer}
.stepper b{font-size:52px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.stepper b small{font-size:24px;font-weight:700;color:var(--sub);margin-left:4px}
.opts{display:flex;flex-direction:column;gap:10px;margin-top:32px}
.opt{display:flex;align-items:center;gap:14px;width:100%;padding:20px 18px;border:2px solid transparent;border-radius:18px;background:var(--card);text-align:left;cursor:pointer}
.opt.on{border-color:var(--accent);background:var(--accent-soft)}.opt b{display:block;font-size:18px}.opt small{display:block;font-size:15px;color:var(--sub);margin-top:4px;line-height:1.5}.opt span{flex:1;min-width:0}
.opt i{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid var(--line)}.opt.on i{border:7px solid var(--accent)}
.acc{margin-top:28px;display:flex;flex-direction:column}
.ac{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:1px solid var(--line)}
.ac span{flex:1;min-width:0}.ac b{display:block;font-size:17px}.ac small{display:block;font-size:14px;color:var(--sub);margin-top:2px}
.ac button{flex:none;height:36px;padding:0 12px;border:0;border-radius:18px;background:var(--chip);font-size:14px;font-weight:700;color:var(--ink);cursor:pointer}
.ac button.need{background:var(--bad-soft);color:var(--bad)}
.kinds{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0 16px;border-bottom:1px solid var(--line)}.kinds button{height:40px;padding:0 14px;border:1px solid var(--line);border-radius:20px;background:var(--card);font-size:15px;cursor:pointer}
.sum{margin-top:24px;display:flex;flex-direction:column;gap:10px}
.sline{display:flex;align-items:center;gap:12px;width:100%;padding:18px;border:0;border-radius:16px;background:var(--card);text-align:left;font-size:17px;line-height:1.5;cursor:pointer}.sline span{flex:1;min-width:0}.sline b{color:var(--accent)}.sline i{font-style:normal;font-size:14px;font-weight:700;color:var(--sub)}
details.asm{margin-top:14px;border-radius:16px;background:var(--card);padding:0 18px}details.asm summary{min-height:56px;display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:700;cursor:pointer;list-style:none}details.asm summary::-webkit-details-marker{display:none}details.asm summary::after{content:"⌄";color:var(--faint)}details.asm[open] summary::after{content:"⌃"}
.asm .rw{display:flex;justify-content:space-between;min-height:44px;align-items:center;border-top:1px solid var(--line);font-size:16px}.asm .rw b{font-weight:700}.asm p{font-size:14px;color:var(--sub);line-height:1.6;margin:8px 0 14px}
.intro{display:flex;flex-direction:column;gap:14px;margin-top:32px}.intro div{display:flex;gap:14px;align-items:flex-start;font-size:17px;line-height:1.55}.intro em{flex:none;width:32px;height:32px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-style:normal;font-weight:800;display:flex;align-items:center;justify-content:center}
.foot{position:sticky;bottom:0;padding:12px 0 calc(16px + env(safe-area-inset-bottom,0px));background:linear-gradient(transparent,var(--bg) 24%)}
.next{width:100%;height:58px;border:0;border-radius:16px;background:var(--accent);color:#fff;font-size:18px;font-weight:800;cursor:pointer}.next:disabled{background:var(--chip);color:var(--faint);cursor:default}
.mis{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:10px}.mi{display:block;min-width:0;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line)}.mi:focus-within{border-color:var(--accent)}.mi > span:first-child{display:block;font-size:13px;color:var(--sub);font-weight:700}
.miv{display:flex;align-items:baseline;gap:4px}.miv input{flex:1;min-width:0;width:100%;border:0;background:none;outline:none;font:inherit;font-size:20px;font-weight:800;color:var(--ink);padding:2px 0}.mi small{display:block;min-height:18px;font-size:13px;font-weight:700;color:var(--accent)}.miv em{font-style:normal;color:var(--sub);font-size:15px}
.acc > .mi{margin-top:10px}.hc{padding:14px 0 16px;border-bottom:1px solid var(--line)}.hc .mi{margin-top:8px}.hch{display:flex;justify-content:space-between;align-items:center}.hch b{font-size:17px}.hdel{border:0;background:none;color:var(--bad);font-size:14px;font-weight:700;cursor:pointer}
.hadd{margin-top:12px;height:48px;border:1px dashed var(--faint);border-radius:14px;background:none;font-size:16px;font-weight:700;color:var(--accent);cursor:pointer}
.mixw{padding:14px 16px;border-radius:16px;background:var(--card);border:1px solid var(--line)}.mixh{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:15px}.mixh b{color:var(--accent)}
.rng{width:100%;margin:14px 0 6px;accent-color:var(--accent)}.mixbar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:color-mix(in srgb, var(--c-stock) 40%, var(--card))}.mixbar i{display:block;background:var(--c-stock)}
.mis3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.ex{font-size:13px;font-weight:600;color:var(--sub)}
.kinds2{padding:14px 0 4px}.kinds2 > span{font-size:14px;font-weight:700;color:var(--sub)}
.hsum{margin-top:14px;padding:14px 16px;border-radius:14px;background:var(--accent-soft);font-size:16px;line-height:1.5}.hsum b{color:var(--accent)}.hsum.bad{background:var(--bad-soft);color:var(--bad)}.hsum.bad b{color:var(--bad)}
.ab{display:flex;align-items:center;gap:12px;width:100%;padding:16px 0;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;cursor:pointer}.ab span{flex:1;min-width:0}.ab b{display:block;font-size:17px}.ab small{display:block;font-size:14px;color:var(--sub);margin-top:3px}.ab i{font-style:normal;font-size:14px;font-weight:700;color:var(--accent)}
.chips button.on::before{content:"✓ "}
.nm{flex:1;min-width:0;border:0;border-bottom:1px dashed var(--line);background:none;font:inherit;font-size:16px;font-weight:700;color:var(--ink);padding:4px 0;outline:none}.nm:focus{border-bottom-color:var(--accent)}.nm::placeholder{color:var(--faint);font-weight:500}
.flab2{font-size:14px;font-weight:700;color:var(--sub);margin-top:12px}
.mi.ro{background:var(--chip);border-color:transparent}.mi.ro .miv b{font-size:20px;font-weight:800;padding:2px 0;flex:1}
.hint.bad{color:var(--bad);font-weight:700}
.tax3{margin-top:18px;display:flex;flex-direction:column;gap:8px}.tax3 div{padding:12px 14px;border-radius:12px;background:var(--card)}.tax3 b{display:block;font-size:15px}.tax3 span{display:block;font-size:14px;color:var(--sub);margin-top:2px;line-height:1.5}
.defv{margin:-2px 0 4px;padding:12px 16px;border-radius:14px;background:var(--chip);display:flex;flex-direction:column;gap:6px}.defv div{display:flex;justify-content:space-between;gap:8px;font-size:14px}.defv span{color:var(--sub)}.defv b{font-weight:700}
.skip[hidden]{display:none}.conv{min-height:22px;margin-top:6px;font-size:16px;font-weight:700;color:var(--accent)}.skip{display:block;margin:10px auto 0;border:0;background:none;color:var(--sub);font-size:15px;cursor:pointer}
.back:focus-visible,.next:focus-visible,.opt:focus-visible,.chips button:focus-visible,.stepper button:focus-visible,.ac button:focus-visible,.sline:focus-visible,.kinds button:focus-visible,.skip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.screen{animation:in .28s ease}@keyframes in{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.screen{animation:none}.prog i{transition:none}}
.sr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.sr span{flex:1;min-width:0}.sr b{display:block;font-size:17px}.sr small{display:block;font-size:14px;color:var(--sub);margin-top:2px}.mi.sp{flex:none;width:104px;padding:8px 12px}.mi.sp > .miv{display:flex}
.ptabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-top:24px}.ptabs button{flex:1;height:48px;border:0;border-bottom:3px solid transparent;margin-bottom:-1px;background:none;font-size:17px;font-weight:700;color:var(--sub);cursor:pointer}.ptabs button.on{color:var(--ink);border-bottom-color:var(--ink)}.ptabs i{font-style:normal;color:var(--accent)}
.seg{display:flex;gap:4px;margin-top:18px;padding:4px;border-radius:14px;background:var(--chip)}.seg button{flex:1;min-width:0;height:44px;border:0;border-radius:10px;background:none;font-size:15px;font-weight:700;color:var(--sub);cursor:pointer;padding:0 4px;word-break:keep-all}.seg.g2{display:grid;grid-template-columns:1fr 1fr}.seg button.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.ptabs button:focus-visible,.seg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.toast{position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;padding:12px 18px;border-radius:12px;background:var(--ink);color:var(--card);font-size:15px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 32px)}.toast.on{opacity:1}
</style>
<div class="app">
  <div class="top"><button type="button" class="back" id="back" aria-label="뒤로">‹</button><div class="prog" aria-hidden="true"><i id="bar"></i></div><span class="cnt" id="cnt"></span></div>
  <main class="body" id="main"></main>
  <div class="foot"><button type="button" class="next" id="next">다음</button><button type="button" class="skip" id="skip" hidden></button></div>
</div>
<div class="toast" id="toast" role="status"></div>
<script>
${fs.readFileSync(__dirname + '/client-setup.js', 'utf8')}
</script>`;
fs.writeFileSync(__dirname + '/retire-setup.html', page);
console.log('ok', page.length);
