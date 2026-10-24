-- 카드 삭제는 바로 지우지 않고 표시만 (30일 동안 관리자 화면에서 복구 가능, 그 뒤 매일 정리 작업이 완전 삭제)
ALTER TABLE plates ADD COLUMN deleted_at INTEGER;
CREATE INDEX plates_deleted ON plates(deleted_at);
