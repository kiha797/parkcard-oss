-- 차량 표시 이름을 '차량 번호 뒷 4자리(숫자)'로 변경: 숫자 4자리가 아닌 기존 값은 비움
UPDATE plates SET nickname = NULL WHERE nickname IS NOT NULL AND nickname NOT GLOB '[0-9][0-9][0-9][0-9]';
