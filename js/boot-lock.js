// 앱 잠금을 켠 경우: 화면 코드를 모두 불러오기 전에 Face ID부터 바로 띄워요 (잠금 해제를 기다리는 시간 줄이기)
// vendor/capacitor.js 바로 다음에 불러와요. 결과는 js/native.js의 unlock()이 이어받아요.
(function(){
  try {
    var d = document.documentElement;
    if (!d.classList.contains('locked') || !window.capacitorExports || !window.capacitorExports.registerPlugin) return;
    var bio = window.capacitorExports.registerPlugin('Biometric');
    window.__bootPlugins = {Biometric: bio};
    window.__bootUnlock = bio.authenticate({reason: '머니머슬 잠금 해제'})
      .then(function(){ d.classList.remove('locked'); return {ok: true}; }, function(e){ return {ok: false, code: e && e.code}; });
  } catch(e){}
})();
