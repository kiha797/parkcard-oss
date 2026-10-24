-- 한 휴대폰(구독)이 카드 여러 장의 알림을 받을 수 있도록: 구독 고유 조건을 (카드, 구독)으로 변경
CREATE TABLE subscriptions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (code, endpoint)
);
INSERT INTO subscriptions_new (id, code, endpoint, p256dh, auth, device, created_at)
  SELECT id, code, endpoint, p256dh, auth, device, created_at FROM subscriptions;
DROP TABLE subscriptions;
ALTER TABLE subscriptions_new RENAME TO subscriptions;
CREATE INDEX subscriptions_code ON subscriptions(code);

-- 푸시 전송이 실패했을 때 이유 (푸시 서버 응답 코드·메시지)
ALTER TABLE alerts ADD COLUMN error TEXT;
