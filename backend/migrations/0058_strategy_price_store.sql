-- Bot và Chiến lược v2.0 (update 22-11) · Kho giá ngày dùng chung cho Backtest và Bot
-- (IQX-Bot-Chien-Luoc-SPEC v2.0 §2.1, PLAN-bot-strategy D2–D4, §5.1).
--
-- Bot và Backtest CHỈ đọc giá từ hai bảng này. Đây là lớp ngày của kho VN100 Flashback: cùng nguồn
-- (DNSE, giá đã điều chỉnh, nghìn đồng × 1000 → đồng nguyên), nhưng làm mới hằng ngày, có VNINDEX
-- (lịch phiên) và giữ mã đã rời VN100 khi Bot còn giữ. Các bảng fb_dataset_* của Flashback không đổi.
--
--   strategy_price_symbols  một dòng mỗi mã: nguồn, đơn vị, phạm vi ngày, series_rev/series_hash
--   strategy_price_bars     toàn bộ nến ngày đã điều chỉnh của mỗi mã; VNINDEX là một "mã" riêng
--
-- Làm mới: tải lại TOÀN BỘ chuỗi của mã (một lần gọi DNSE). Nến cũ khác đi (điều chỉnh giá) thì thay
-- cả chuỗi trong một giao dịch và tăng series_rev. Không bao giờ xoá một mã hay toàn bộ nến của mã.
-- Giá cổ phiếu là đồng nguyên (bigint). VNINDEX: điểm chỉ số ở cột close_idx numeric(12,2);
-- các cột giá bigint của dòng VNINDEX lưu điểm × 100 (làm tròn) để mọi dòng có đủ OHLC.
--
-- Additive and idempotent: IF NOT EXISTS everywhere; no existing table is touched.

CREATE TABLE IF NOT EXISTS strategy_price_symbols (
  symbol varchar(16) PRIMARY KEY,
  -- 'stock' | 'index'
  kind varchar(8) NOT NULL DEFAULT 'stock',
  -- e.g. 'DNSE:x1000:adjusted', 'DNSE:VNINDEX'
  source varchar(40) NOT NULL,
  price_unit varchar(8) NOT NULL DEFAULT 'VND',
  adjusted boolean NOT NULL DEFAULT true,
  first_date date,
  last_date date,
  bars_count integer NOT NULL DEFAULT 0,
  -- Bumped every time the stored series is replaced because an older bar changed (adjustment).
  series_rev integer NOT NULL DEFAULT 1,
  -- sha256 of the stored series (date, OHLCV) in canonical text form.
  series_hash char(64),
  refreshed_at timestamptz,
  -- Last refresh error (null after a successful refresh).
  last_error text,
  last_error_at timestamptz,
  CONSTRAINT ck_strategy_price_symbols_kind CHECK (kind IN ('stock', 'index')),
  CONSTRAINT ck_strategy_price_symbols_unit CHECK (price_unit IN ('VND', 'POINT')),
  CONSTRAINT ck_strategy_price_symbols_counts CHECK (bars_count >= 0 AND series_rev >= 1),
  CONSTRAINT ck_strategy_price_symbols_hash CHECK (series_hash IS NULL OR series_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS strategy_price_bars (
  symbol varchar(16) NOT NULL REFERENCES strategy_price_symbols(symbol) ON DELETE RESTRICT,
  date date NOT NULL,
  open bigint NOT NULL,
  high bigint NOT NULL,
  low bigint NOT NULL,
  close bigint NOT NULL,
  volume bigint NOT NULL,
  -- close × volume in VND (adjusted close; approximation of the matched value).
  value_vnd bigint NOT NULL DEFAULT 0,
  -- VNINDEX only: index points (the bigint price columns hold points × 100).
  close_idx numeric(12, 2),
  CONSTRAINT pk_strategy_price_bars PRIMARY KEY (symbol, date),
  CONSTRAINT ck_strategy_price_bars_prices CHECK (open > 0 AND high > 0 AND low > 0 AND close > 0),
  CONSTRAINT ck_strategy_price_bars_volume CHECK (volume >= 0 AND value_vnd >= 0)
);

CREATE INDEX IF NOT EXISTS ix_strategy_price_bars_date ON strategy_price_bars (date);

COMMENT ON TABLE strategy_price_symbols IS
  'Daily price store of Bot + Backtest (update 22-11, D2-D4): one row per symbol incl. VNINDEX; refreshed daily from DNSE adjusted series; never deleted.';
COMMENT ON TABLE strategy_price_bars IS
  'Full adjusted daily bars in integer VND (VNINDEX: points in close_idx, x100 in price columns). Bot and Backtest read only this; Flashback fb_dataset_* untouched.';
COMMENT ON COLUMN strategy_price_symbols.series_rev IS
  'Incremented when a refresh replaces the series because an older bar changed (price adjustment). Runs snapshot it.';
