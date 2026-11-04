-- Bộ lọc 4.0: Cơ bản (gồm Thị trường) + Kỹ thuật.
-- Spec: IQX-Bo-Loc-SPEC.md v1.1 (§2.3, §5, §7, §9, §10). Dev notes: backend/docs/stock-filter/BO-LOC-4.0-DEV-NOTES.md.

-- 1. Kho nến ngày toàn thị trường (spec §9 bước 1: lọc Thị trường + Kỹ thuật trên toàn bộ mã bằng dữ liệu đã lưu,
--    không gọi nhà cung cấp từng mã khi chạy). Một dòng mỗi mã; `bars` là các mảng cột
--    {d: ["YYYY-MM-DD", ...], o: [], h: [], l: [], c: [], v: []} theo thứ tự tăng dần của ngày. Giá đã điều chỉnh,
--    đơn vị nghìn đồng (DNSE chart-api). Cả chuỗi được thay mới mỗi lần làm mới vì giá điều chỉnh đổi khi có quyền.
CREATE TABLE IF NOT EXISTS market_daily_bars (
  symbol varchar(10) PRIMARY KEY,
  bars jsonb NOT NULL CHECK (jsonb_typeof(bars) = 'object'),
  bar_count integer NOT NULL CHECK (bar_count >= 0),
  first_date date,
  last_date date,
  source varchar(40) NOT NULL,
  price_unit varchar(16) NOT NULL DEFAULT 'thousand_vnd',
  adjusted boolean NOT NULL DEFAULT true,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_market_daily_bars_last_date ON market_daily_bars (last_date);

COMMENT ON TABLE market_daily_bars IS
  'Last ~520 closed daily sessions per symbol (adjusted, thousand VND). Filled after the close by job market.daily-bars; read by the screener (Thị trường + Kỹ thuật).';

-- 2. Thuộc tính mã dùng để lọc phạm vi TRƯỚC khi gọi báo cáo (spec §2.3, §10 mục 4-5).
--    statement_template: mẫu báo cáo tài chính (thuong | nh | ck | bh), cùng hàm detectIndustry với cờ
--    `financial` của chỉ tiêu non_financial. shares_outstanding: number_of_shares_mkt_cap của VCI (Vốn hóa).
ALTER TABLE symbols
  ADD COLUMN IF NOT EXISTS statement_template varchar(8)
    CHECK (statement_template IS NULL OR statement_template IN ('thuong', 'nh', 'ck', 'bh')),
  ADD COLUMN IF NOT EXISTS statement_template_at timestamptz,
  ADD COLUMN IF NOT EXISTS shares_outstanding bigint
    CHECK (shares_outstanding IS NULL OR shares_outstanding > 0),
  ADD COLUMN IF NOT EXISTS shares_at timestamptz;

-- 3. Phiên T (phiên đã đóng cửa dùng cho Thị trường + Kỹ thuật) của lần chạy và của kết quả đã lưu (spec §5, §7).
--    Danh mục lưu `session_date` trong `scope`/`provenance` (jsonb) nên không cần cột riêng.
ALTER TABLE screener_runs ADD COLUMN IF NOT EXISTS session_date date;
ALTER TABLE result_snapshots ADD COLUMN IF NOT EXISTS session_date date;
