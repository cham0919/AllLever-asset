-- 세션 값 교체: 하루에 한 번 새 세션 값을 주고, 바로 전 값의 해시만 잠깐 기억해요.
-- 교체한 뒤 10분이 지나 옛 값이 다시 오면 누군가 값을 빼돌린 것으로 보고 세션을 지워요 (다시 로그인).
ALTER TABLE sessions ADD COLUMN prev_hash TEXT;
ALTER TABLE sessions ADD COLUMN rotated INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS sessions_prev ON sessions (prev_hash);
