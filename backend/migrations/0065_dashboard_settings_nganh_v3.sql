-- Dashboard phân tích v3 (spec v3 §1.3, §6): 9 ngành thay cho 4.
-- nganh ∈ thuong | nh | ck | bh | bds | dk | bl | dien | vl (thêm bất động sản, dầu khí, bán lẻ và
-- tiêu dùng, điện và tiện ích, vật liệu cơ bản). Chỉ nới CHECK, không đụng dữ liệu: tập tên chỉ
-- tiêu của 4 ngành cũ ở v3 trùng đúng v2, 5 ngành mới chưa có dòng (PLAN-dashboard-v3 D9).
-- Cột varchar(8) đủ cho mọi mã ngành. Tương thích ngược với code v2, nên chạy trước khi đổi code.
-- Idempotent: chạy lại không đổi gì.
ALTER TABLE dashboard_settings DROP CONSTRAINT IF EXISTS ck_dashboard_settings_nganh;
ALTER TABLE dashboard_settings
  ADD CONSTRAINT ck_dashboard_settings_nganh
  CHECK (nganh IN ('thuong', 'nh', 'ck', 'bh', 'bds', 'dk', 'bl', 'dien', 'vl'));
