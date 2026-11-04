-- Dashboard phân tích v2: mỗi ngành một thiết lập (spec §6.1).
-- Khoá bảng đổi từ (user_id) sang (user_id, nganh): nganh ∈ thuong | nh | ck | bh (doanh nghiệp sản
-- xuất, ngân hàng, chứng khoán, bảo hiểm). Idempotent: chạy lại không đổi gì.
-- Dòng hiện có là thiết lập của v1 (33 chỉ tiêu chung của một mã bất kỳ): chuyển sang 'thuong',
-- vì 33 chỉ tiêu ấy đúng là danh mục của ngành doanh nghiệp sản xuất (17 chung + 16 riêng).
-- Bảng chưa có khoá ngành thì thêm cột với DEFAULT 'thuong' để các dòng cũ nhận giá trị đó.
ALTER TABLE dashboard_settings
  ADD COLUMN IF NOT EXISTS nganh varchar(8) NOT NULL DEFAULT 'thuong';

ALTER TABLE dashboard_settings DROP CONSTRAINT IF EXISTS ck_dashboard_settings_nganh;
ALTER TABLE dashboard_settings
  ADD CONSTRAINT ck_dashboard_settings_nganh CHECK (nganh IN ('thuong', 'nh', 'ck', 'bh'));

-- Khoá chính (user_id, nganh). Chỉ tạo lại khi khoá hiện tại chưa gồm cột nganh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'dashboard_settings'::regclass
      AND c.contype = 'p'
      AND a.attname = 'nganh'
  ) THEN
    ALTER TABLE dashboard_settings DROP CONSTRAINT IF EXISTS pk_dashboard_settings;
    ALTER TABLE dashboard_settings
      ADD CONSTRAINT pk_dashboard_settings PRIMARY KEY (user_id, nganh);
  END IF;
END
$$;
