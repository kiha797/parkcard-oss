-- 연락한 사람에게 진행 상황을 보여 주기 위해: 차주가 알림을 연 시각, '이동 완료'를 누른 시각
ALTER TABLE alerts ADD COLUMN seen_at INTEGER;
ALTER TABLE alerts ADD COLUMN done_at INTEGER;
