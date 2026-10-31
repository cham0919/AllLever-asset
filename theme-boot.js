// 화면을 그리기 전에 저장된 테마(시스템·라이트·다크)를 먼저 적용해서, 다크 모드에서 흰 화면이 잠깐 보이지 않게 해요.
(function(){
  var t = 'system';
  try { var v = localStorage.getItem('alv.theme'); if (v) t = JSON.parse(v); } catch(e){}
  var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  var c = dark ? '#0E1013' : '#F1F1EE', d = document.documentElement;
  d.setAttribute('data-theme', dark ? 'dark' : 'light');
  d.style.backgroundColor = dark ? '#15171B' : '#F9F9F6'; d.style.colorScheme = dark ? 'dark' : 'light';   // 가장 바깥 바탕 = 하단 바 색
  var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', c);
  // 앱(아이폰·안드로이드): 앱 잠금을 켰으면 화면을 그리기 전에 가려 둬요
  try { if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()){
    d.classList.add('native');
    var lk = JSON.parse(localStorage.getItem('alv.lock') || '{}'); if (lk && lk.on) d.classList.add('locked');
  } } catch(e){}
})();
