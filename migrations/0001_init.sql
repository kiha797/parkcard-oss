-- 번호판(카드) 1장 = 1행. 개인정보(전화번호 등)는 저장하지 않음
CREATE TABLE plates (
  code TEXT PRIMARY KEY,             -- 출력물에 인쇄되는 6자리 코드
  manage_token TEXT NOT NULL UNIQUE, -- 차주만 아는 관리 링크 열쇠
  nickname TEXT,
  quiet_start INTEGER,
  quiet_end INTEGER,
  created_at INTEGER NOT NULL
);

-- 차주 기기의 푸시 구독 (기기 여러 대 가능)
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_code ON subscriptions(code);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  urgent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sent', -- sent | ack | failed
  ack_text TEXT,
  created_at INTEGER NOT NULL,
  ack_at INTEGER
);
CREATE INDEX alerts_code ON alerts(code, created_at);

-- 전송 횟수 제한용 기록 (IP는 해시로만 저장)
CREATE TABLE hits (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX hits_key ON hits(key, at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
