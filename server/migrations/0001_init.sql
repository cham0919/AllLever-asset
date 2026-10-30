-- 세션: 세션 값은 해시만 저장, 갱신 토큰은 AES-GCM으로 암호화해서 저장
CREATE TABLE IF NOT EXISTS sessions (
  sid_hash    TEXT PRIMARY KEY,
  email       TEXT,
  refresh_enc TEXT NOT NULL,
  created     INTEGER NOT NULL,
  last_used   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_last_used ON sessions(last_used);
-- 로그인 시작 ~ 구글에서 돌아올 때까지 잠깐 쓰는 값 (10분)
CREATE TABLE IF NOT EXISTS auth_state (
  state      TEXT PRIMARY KEY,
  return_url TEXT NOT NULL,
  created    INTEGER NOT NULL
);
