# vendor/

앱이 쓰는 외부 라이브러리 사본이에요. Actions → Vendor libraries 워크플로가 공식 배포처에서 받아 넣었어요.

| 파일 | 버전 | 출처 | SHA-256 |
|---|---|---|---|
| xlsx.full.min.js | 0.20.3 | https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz | cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41 |
| chart.umd.min.js | 4.5.1 | npm chart.js@4.5.1 | 48444a82d4edcb5bec0f1965faacdde18d9c17db3063d042abada2f705c9f54a |

- `capacitor.js`: @capacitor/core 8.6.0 (MIT). 앱(아이폰·안드로이드)에서 네이티브 기능을 부를 때 써요. `cp node_modules/@capacitor/core/dist/capacitor.js vendor/`로 갱신해요.
