-- Dashboard phân tích: thiết lập biểu đồ theo tài khoản, lưu trên server (spec §6).
-- Idempotent. Mã đang xem KHÔNG nằm trong thiết lập: mã là trạng thái chung của trang (spec §1.2).
-- `charts` là mảng tên chỉ tiêu (33 chỉ tiêu của spec §8), `nks` là số kỳ riêng từng biểu đồ
-- { "ROE": { "q": 20, "y": 5 } }; chỉ lưu chỗ khác mặc định 5.
CREATE TABLE IF NOT EXISTS dashboard_settings (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  charts     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  per        varchar(8)  NOT NULL DEFAULT 'q',
  nks        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  revision   integer     NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_dashboard_settings PRIMARY KEY (user_id),
  CONSTRAINT ck_dashboard_settings_per CHECK (per IN ('q', 'y')),
  CONSTRAINT ck_dashboard_settings_charts CHECK (jsonb_typeof(charts) = 'array'),
  CONSTRAINT ck_dashboard_settings_nks CHECK (jsonb_typeof(nks) = 'object'),
  CONSTRAINT ck_dashboard_settings_revision CHECK (revision >= 1),
  CONSTRAINT ck_dashboard_settings_size CHECK (
    octet_length(charts::text) + octet_length(nks::text) <= 65536)
);
