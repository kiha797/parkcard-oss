-- 차주가 '같은 사람'이 보낸 연락인지 알아볼 수 있게: 보낸 사람 구분값
-- (보낸 사람 휴대폰의 무작위 값을 카드별로 변환한 것 — 이름·번호·IP가 아님, 다른 카드와 연결 불가)
ALTER TABLE alerts ADD COLUMN sender TEXT;
