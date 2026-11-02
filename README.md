# 머니머슬 - 가계부, 자산관리

구글 시트와 연동되는 가계부·자산관리 앱이에요. 아이폰 앱(Capacitor)과 웹 버전이 같은 코드를 써요.

- 홈페이지: https://alllever.app
- 개인정보 처리방침: https://alllever.app/privacy.html · 고객 지원: https://alllever.app/support.html
- 웹 버전: https://cham0919.github.io/AllLever-asset/

## 구조

| 위치 | 내용 |
|---|---|
| `index.html`, `js/*.js` | 앱 화면 (번들러 없이 순서대로 불러와요. 순서는 `index.html` 아래쪽) |
| `vendor/` | Chart.js, SheetJS(엑셀, 필요할 때만 불러옴), Capacitor 브리지 |
| `ios/`, `android/` | 앱 껍데기와 직접 만든 플러그인 (`ios/App/App/WebAuthPlugin.swift`) |
| `server/` | 로그인 유지 서버 + alllever.app 페이지 (Cloudflare Worker, D1) → [SERVER_SETUP.md](SERVER_SETUP.md) |
| `template.xlsx`, `tools/build_template.py` | 새 시트 템플릿과 만드는 스크립트 |
| `demo.xlsx`, `demo2025.xlsx` | "예시로 둘러보기" 데이터 |

## 데이터

- **구글로 시작**: 사용자 구글 드라이브의 시트가 원본이에요. 앱은 `drive.file` 권한으로 앱이 만들거나 사용자가 고른 시트만 읽고 써요.
- **앱만 사용하기**: 기기에만 저장해요. 앱에서는 화면 저장 공간(localStorage)과 함께 앱 전용 폴더 파일(`Library/moneymuscle-data.json`)에도 써 두고, 화면 저장 공간이 비면 파일에서 되살려요.
- 가계부·자산 데이터는 서버로 보내지 않아요. 서버는 구글 로그인 유지(이메일, 암호화된 갱신 토큰)만 맡아요.

## 배포

- 버전: `package.json`의 `version`과 `sw.js`의 `SHELL` 이름을 함께 올려요.
- 아이폰: GitHub Actions `ios-testflight.yml`을 실행하면 TestFlight에 올라가요 (빌드 번호 = 실행 번호 + 100).
- 서버·홈페이지: `server/` 또는 안내 페이지가 바뀌면 `deploy-auth.yml`이 자동으로 배포해요.
- 웹 버전: `main`에 올리면 GitHub Pages가 바로 반영해요.

진행 상황은 [ROADMAP.md](ROADMAP.md), 구글 설정은 [GOOGLE_SETUP.md](GOOGLE_SETUP.md)를 보세요.
