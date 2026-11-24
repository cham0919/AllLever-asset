-- 함께 쓰기: 시트 고르기 요청과 로그인 요청을 구분해요 (서로의 돌아오는 주소에서 쓰지 못하게)
ALTER TABLE auth_state ADD COLUMN kind TEXT;
