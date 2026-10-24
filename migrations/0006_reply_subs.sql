-- 연락한 사람이 '응답 오면 휴대폰 알림으로 받기'를 허용한 경우의 푸시 구독 (연락 1건 단위, 하루 뒤 삭제)
CREATE TABLE reply_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (alert_id, endpoint)
);
CREATE INDEX reply_subs_alert ON reply_subs(alert_id);
