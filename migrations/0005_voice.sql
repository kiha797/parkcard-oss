-- 차주 알림 소리: 1 = 받은 메시지를 음성으로 읽기, 0 = 딩동댕 소리
ALTER TABLE plates ADD COLUMN voice INTEGER NOT NULL DEFAULT 0;
