-- 상업용 미리 발급 카드: 관리자가 원하는 장수만큼 코드를 만들어 인쇄 → 차주는 동봉된 '등록 카드' QR로 등록
-- 묶음(발급 1회) 기록
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  label TEXT,                 -- 메모 (예: 라벨포스 1차 인쇄)
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- 어느 묶음으로 발급한 카드인지 (직접 만든 카드는 NULL), 차주가 등록을 마친 시각
ALTER TABLE plates ADD COLUMN batch_id TEXT;
ALTER TABLE plates ADD COLUMN activated_at INTEGER;
CREATE INDEX plates_batch ON plates(batch_id);
