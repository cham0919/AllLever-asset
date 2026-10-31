-- 로그인 시작한 기기만 결과를 받을 수 있게: 앱이 만든 일회용 확인값(nonce)을 함께 보관했다가 돌려줘요
ALTER TABLE auth_state ADD COLUMN nonce TEXT;
