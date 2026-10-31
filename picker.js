// 머니머슬 앱 전용: 앱이 시스템 브라우저 창(아이폰 ASWebAuthenticationSession / 안드로이드 Custom Tabs)으로 이 페이지를 열면
// 구글 선택 창(Picker)으로 시트를 고르고, 고른 시트의 id·이름만 앱 주소(com.alllever.asset://picked)로 돌려줘요.
// 앱 내부 화면에는 구글 로그인 상태가 없어서 선택 창이 열리지 않기 때문이에요. 돌아가는 주소는 고정이라 다른 곳으로 보낼 수 없어요.
(function(){
  var API_KEY = 'AIzaSyA737jtGTgXBmwvRO-DuAgPvxDMVWN3CZQ', APP_ID = '919106003112', BACK = 'com.alllever.asset://picked';
  var tok = new URLSearchParams(location.hash.slice(1)).get('t') || '';
  history.replaceState(null, '', location.pathname);   // 토큰을 주소창·방문 기록에 남기지 않아요
  var msg = document.getElementById('msg'), back = document.getElementById('back');
  function done(frag, text){ back.href = BACK + '#' + frag; msg.textContent = text; location.href = back.href; }
  if (!/^[\w.\-~+\/]{20,4096}$/.test(tok)){ msg.textContent = '머니머슬 앱에서 다시 열어 주세요.'; return; }
  var s = document.createElement('script'); s.src = 'https://apis.google.com/js/api.js';
  s.onerror = function(){ msg.textContent = '구글 선택 창을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'; };
  s.onload = function(){ gapi.load('picker', function(){
    var P = google.picker;
    var view = new P.DocsView(P.ViewId.SPREADSHEETS).setMode(P.DocsViewMode.LIST).setIncludeFolders(false);
    new P.PickerBuilder().setOAuthToken(tok).setDeveloperKey(API_KEY).setAppId(APP_ID).addView(view)
      .enableFeature(P.Feature.MULTISELECT_ENABLED).enableFeature(P.Feature.NAV_HIDDEN).setLocale('ko').setTitle('머니머슬에서 쓸 연도별 시트를 고르세요')
      .setCallback(function(d){
        var a = d[P.Response.ACTION];
        if (a === P.Action.PICKED){
          var docs = d[P.Response.DOCUMENTS].map(function(x){ return {id: x[P.Document.ID], name: x[P.Document.NAME], mime: x[P.Document.MIME_TYPE]}; });
          done('docs=' + encodeURIComponent(JSON.stringify(docs)), docs.length + '개 시트를 골랐어요. 앱으로 돌아가는 중이에요…');
        } else if (a === P.Action.CANCEL) done('cancel=1', '선택을 취소했어요.');
      }).build().setVisible(true);
    msg.textContent = '';
  }); };
  document.head.appendChild(s);
})();
