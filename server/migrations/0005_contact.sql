-- 문의하기: 하루 전체 문의 건수만 세요 (장난 방지). 누가 보냈는지·내용은 저장하지 않아요. 7일 지나면 지워요.
CREATE TABLE IF NOT EXISTS contact_daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
