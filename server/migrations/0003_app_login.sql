-- 아이폰·안드로이드 앱 로그인: 앱이 만든 확인값의 해시(code_challenge)를 보관하고,
-- 로그인이 끝나면 세션 대신 일회용 코드를 앱 주소로 돌려줘요. 앱은 자기만 아는 값(verifier)과 함께 코드를 세션으로 바꿔요.
ALTER TABLE auth_state ADD COLUMN cc TEXT;
CREATE TABLE IF NOT EXISTS app_codes (
  code_hash TEXT PRIMARY KEY,   -- 일회용 코드의 해시 (코드 자체는 저장하지 않아요)
  sid_enc   TEXT NOT NULL,      -- 세션 값 (암호화)
  email     TEXT,
  cc        TEXT NOT NULL,      -- code_challenge = base64url(SHA-256(verifier))
  created   INTEGER NOT NULL
);
