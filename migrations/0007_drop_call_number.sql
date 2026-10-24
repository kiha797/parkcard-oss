-- 전화 번호는 서버에 두지 않음: 차주 휴대폰에서 만든 QR의 # 뒷부분에만 들어감 (서버로 전송되지 않음)
ALTER TABLE plates DROP COLUMN call_number;
