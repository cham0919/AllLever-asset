# 로그인 유지 서버 설정 (처음 한 번)

앱이 구글 로그인을 계속 유지하도록 돕는 작은 서버예요. 코드는 `server/` 폴더에 있고, GitHub에 올리면 GitHub Actions가 Cloudflare Workers에 자동 배포해요.

**서버가 하는 일:** 구글 갱신 토큰을 암호화해서 보관하고, 앱이 요청할 때 1시간짜리 접근 토큰을 새로 받아 줘요.
**서버가 하지 않는 일:** 시트·가계부·자산 데이터를 읽거나 저장하지 않아요. 데이터는 앱이 구글에서 직접 받아요.

| 비밀 값 | 어디에 넣나 | 누가 |
|---|---|---|
| Cloudflare API 토큰 | GitHub 저장소 Secrets `CLOUDFLARE_API_TOKEN` | 직접 |
| Cloudflare 계정 ID | GitHub 저장소 Secrets `CLOUDFLARE_ACCOUNT_ID` | 직접 |
| 구글 클라이언트 보안 비밀 | GitHub 저장소 Secrets `GOOGLE_CLIENT_SECRET` | 직접 |
| 토큰 암호화 키 `ENC_KEY` | Cloudflare (자동 생성) | 배포 워크플로 |

비밀 값은 채팅이나 코드에 붙여넣지 말고, 아래 화면에 직접 넣어 주세요.

## 1. Cloudflare 가입과 workers.dev 주소

1. https://dash.cloudflare.com/sign-up 에서 무료로 가입하세요.
2. 왼쪽 메뉴 **Workers & Pages**를 한 번 열어 주세요. 처음 열면 `xxx.workers.dev` 하위 도메인을 정하라고 나와요. 원하는 이름(예: `alllever`)으로 정하세요.
3. 오른쪽(또는 계정 홈)의 **Account ID**를 복사해 두세요.

## 2. Cloudflare API 토큰

1. 오른쪽 위 프로필 → **My Profile → API Tokens → Create Token**을 누르세요.
2. **Edit Cloudflare Workers** 템플릿을 고르세요(Use template).
3. 권한에 **Account → D1 → Edit**를 하나 추가하세요.
4. Account Resources는 본인 계정, Zone Resources는 All zones(기본값)로 두세요.
5. Continue → Create Token을 누르고, 나온 토큰을 복사하세요. 다시 볼 수 없어요.

## 3. 구글 클라이언트 보안 비밀

1. Google Cloud Console → **Google 인증 플랫폼 → 클라이언트** → 앞에서 만든 웹 클라이언트를 여세요.
2. 오른쪽 **클라이언트 보안 비밀번호**를 복사하세요(`GOCSPX-…`).

## 4. GitHub 저장소 Secrets에 넣기

`AllLever-asset` 저장소 → **Settings → Secrets and variables → Actions → New repository secret**에서 3개를 추가하세요.

- `CLOUDFLARE_API_TOKEN`: 2번 토큰
- `CLOUDFLARE_ACCOUNT_ID`: 1번 Account ID
- `GOOGLE_CLIENT_SECRET`: 3번 값

## 5. 배포

저장소 **Actions → Deploy auth server → Run workflow**를 누르세요. 2~3분 뒤 초록색으로 끝나면, 실행 결과 화면 요약에 **서버 주소**와 **리디렉션 URI**가 나와요. 이 단계부터는 Claude가 실행·확인할 수 있어요.

## 6. 구글 클라이언트에 리디렉션 URI 추가

Google Cloud Console → 웹 클라이언트 → **승인된 리디렉션 URI**에 5번에서 나온 주소를 넣고 저장하세요.

```
https://alllever-asset-auth.<내 하위도메인>.workers.dev/auth/callback
```

## 7. 앱에 서버 주소 넣기

`index.html`의 `GOOGLE.authServer`에 서버 주소를 넣으면 끝이에요. 현재 값: `https://alllever-asset-auth.alllever.workers.dev` 이후 앱에서 "구글 계정 연결 해제" 후 다시 연결하면 로그인 유지 방식으로 바뀌어요.

## 8. 구글 동의 화면을 프로덕션으로

동의 화면이 "테스트" 상태면 갱신 토큰이 **7일 뒤 만료**돼서, 일주일마다 다시 로그인해야 해요.

1. Google 인증 플랫폼 → **브랜딩**에 홈페이지 `https://cham0919.github.io/AllLever-asset/`와 개인정보처리방침 `https://cham0919.github.io/AllLever-asset/privacy.html`을 넣으세요.
2. **대상 → 앱 게시**를 누르세요.

`drive.file`·`email`은 민감하지 않은 범위라 보안 평가(CASA)는 없어요. 다만 로그인 창에 앱 이름·로고를 보여주려면 구글의 브랜드 확인을 받아야 할 수 있어요. 이때는 승인된 도메인(`cham0919.github.io`) 소유 확인이 필요할 수 있어요.

## 보안 메모

- 갱신 토큰은 AES-GCM으로 암호화해서 저장하고, 키(`ENC_KEY`)는 Cloudflare 비밀 값에만 있어요.
- 기기에 저장되는 세션 값은 서버에 **해시로만** 저장돼요. DB가 유출돼도 세션 값을 알 수 없어요.
- 로그인 후 돌아갈 수 있는 앱 주소는 `server/wrangler.toml`의 `ALLOWED_RETURN`에 적힌 주소로만 제한돼요.
- 180일 동안 안 쓴 세션은 매일 자동으로 지워져요.
- IP당 요청 수를 제한해요: 로그인 시작·콜백 분당 20회, 토큰 발급·해제 분당 60회.
- 모든 응답에 `nosniff`, `no-referrer`, `X-Frame-Options: DENY` 헤더를 붙여요.
- 연결 해제 시 서버의 세션 삭제와 구글 권한 취소를 함께 해요.
