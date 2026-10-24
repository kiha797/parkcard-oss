-- 차주가 원할 때만 넣는 전화 연결 번호 (본인 번호 또는 050 안심번호). 비어 있으면 전화 버튼 없음
ALTER TABLE plates ADD COLUMN call_number TEXT;
