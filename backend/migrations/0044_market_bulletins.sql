-- Bản tin thị trường v4 (spec IQX-Ban-Tin-SPEC.md v4, §6).
-- Additive only. Không đụng bảng của bản tin Trước phiên / Giữa phiên / Cuối phiên cũ (market_reports...).

-- 1. Nến ngày của chỉ số (VN-Index) từ DNSE. Kho market_daily_bars chỉ chứa cổ phiếu nên chỉ số có bảng riêng.
--    Điểm chỉ số, khối lượng là số cổ phiếu khớp. Giữ ~520 phiên (job tự dọn).
CREATE TABLE IF NOT EXISTS market_index_bars (
  symbol varchar(12) NOT NULL,
  trade_date date NOT NULL,
  open numeric(14, 4) NOT NULL,
  high numeric(14, 4) NOT NULL,
  low numeric(14, 4) NOT NULL,
  close numeric(14, 4) NOT NULL,
  volume numeric(20, 0) NOT NULL,
  source varchar(24) NOT NULL DEFAULT 'DNSE',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, trade_date)
);

-- 2. Mỗi phiên một bản ghi bản tin (spec §6 market_bulletins).
CREATE TABLE IF NOT EXISTS market_bulletins (
  trade_date date PRIMARY KEY,
  status varchar(10) NOT NULL DEFAULT 'draft'
    CONSTRAINT ck_market_bulletins_status CHECK (status IN ('draft', 'public', 'unpublic')),
  -- Giờ dữ liệu phiên chốt (VN-Index đủ nến và số liệu thị trường đã tính); null = chưa chốt.
  data_ready_at timestamptz,
  -- Giá trị giao dịch, độ rộng của HOSE: tính một lần từ market_daily_bars khi chốt.
  market_stats jsonb,
  trend text NOT NULL DEFAULT '' CONSTRAINT ck_market_bulletins_trend CHECK (char_length(trend) <= 420),
  momentum text NOT NULL DEFAULT '' CONSTRAINT ck_market_bulletins_momentum CHECK (char_length(momentum) <= 420),
  liquidity text NOT NULL DEFAULT '' CONSTRAINT ck_market_bulletins_liquidity CHECK (char_length(liquidity) <= 420),
  -- { r1, r2, s1, s2, pa, pt, na, nt }: số điểm hoặc null.
  levels jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT ck_market_bulletins_levels CHECK (jsonb_typeof(levels) = 'object'),
  checks jsonb,
  -- Số bản PDF đã tạo; bản đang trên web (null khi chưa Public hoặc đã gỡ).
  revision integer NOT NULL DEFAULT 0 CONSTRAINT ck_market_bulletins_revision CHECK (revision >= 0),
  published_revision integer,
  published_summary jsonb,
  published_hash char(64),
  slots_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  edited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  history jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT ck_market_bulletins_history CHECK (jsonb_typeof(history) = 'array'),
  CONSTRAINT ck_market_bulletins_public_revision CHECK (status <> 'public' OR published_revision IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_market_bulletins_status_date ON market_bulletins (status, trade_date DESC);

-- 3. Hai file PDF mỗi lần Public (spec §3.6). File lưu trong cơ sở dữ liệu: ghi cùng giao dịch với trạng thái nên
--    "lỗi giữa chừng thì giữ nguyên trạng thái cũ" đúng theo cấu trúc. Phục vụ qua API công khai, cache bất biến theo
--    revision (đường dẫn đổi mỗi lần Public lại). Xoá theo bản tin khi quá 6 tháng.
CREATE TABLE IF NOT EXISTS market_bulletin_files (
  trade_date date NOT NULL REFERENCES market_bulletins(trade_date) ON DELETE CASCADE,
  variant varchar(8) NOT NULL CONSTRAINT ck_market_bulletin_files_variant CHECK (variant IN ('desktop', 'mobile')),
  revision integer NOT NULL CONSTRAINT ck_market_bulletin_files_revision CHECK (revision >= 1),
  file_name varchar(120) NOT NULL,
  sha256 char(64) NOT NULL CONSTRAINT ck_market_bulletin_files_sha CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size integer NOT NULL CONSTRAINT ck_market_bulletin_files_size CHECK (byte_size > 0),
  page_count smallint NOT NULL CONSTRAINT ck_market_bulletin_files_pages CHECK (page_count > 0),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, variant, revision)
);

-- 4. Ba ô bộ lọc mỗi phiên: bản chụp lúc đẩy (spec §4.4), không tính lại về sau.
CREATE TABLE IF NOT EXISTS market_bulletin_slots (
  trade_date date NOT NULL REFERENCES market_bulletins(trade_date) ON DELETE CASCADE,
  slot smallint NOT NULL CONSTRAINT ck_market_bulletin_slots_slot CHECK (slot BETWEEN 1 AND 3),
  display_name varchar(60) NOT NULL CONSTRAINT ck_market_bulletin_slots_name CHECK (length(btrim(display_name)) > 0),
  filter_id uuid,
  filter_version integer,
  result_id uuid,
  passed_count integer NOT NULL CONSTRAINT ck_market_bulletin_slots_passed CHECK (passed_count >= 0),
  -- Toàn bộ SlotSnapshot (điều kiện, mã đã chọn kèm giá, biểu đồ của mã GTGD lớn nhất).
  snapshot jsonb NOT NULL CONSTRAINT ck_market_bulletin_slots_snapshot CHECK (jsonb_typeof(snapshot) = 'object'),
  pushed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  pushed_at timestamptz NOT NULL DEFAULT now(),
  -- Mỗi lần đẩy lại ghi một dòng {at, by, result_id, filter_version, picks[]}.
  history jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT ck_market_bulletin_slots_history CHECK (jsonb_typeof(history) = 'array'),
  PRIMARY KEY (trade_date, slot)
);
-- Tên hiển thị mặc định = tên đã dùng lần trước ở ô đó.
CREATE INDEX IF NOT EXISTS ix_market_bulletin_slots_slot_date ON market_bulletin_slots (slot, trade_date DESC);

-- 5. Theo dõi: mỗi dòng một lần đề xuất (spec §5.3, §6). Mỗi mã tối đa một dòng đang theo dõi.
CREATE TABLE IF NOT EXISTS market_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol varchar(10) NOT NULL,
  slot smallint NOT NULL CONSTRAINT ck_market_tracking_slot CHECK (slot BETWEEN 1 AND 3),
  first_trade_date date NOT NULL,
  -- Giá đóng cửa ngày đề xuất theo chuỗi giá đã điều chỉnh (nghìn đồng); làm mới mỗi phiên theo chuỗi hiện tại.
  entry_price_adj numeric(18, 4) NOT NULL CONSTRAINT ck_market_tracking_entry CHECK (entry_price_adj > 0),
  -- Bản tin đã thêm dòng này (để gỡ bản tin thì bỏ đúng các dòng của nó). Không có khoá ngoại: bản tin hết hạn 6 tháng
  -- bị xoá nhưng dòng theo dõi vẫn được giữ để tra cứu.
  source_trade_date date NOT NULL,
  exit_trade_date date,
  exit_reason varchar(16) CONSTRAINT ck_market_tracking_reason CHECK (exit_reason IS NULL OR exit_reason IN ('20_sessions', 'stop_7', 'unpublished')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_market_tracking_exit_pair CHECK ((exit_trade_date IS NULL) = (exit_reason IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_market_tracking_active_symbol
  ON market_tracking (symbol) WHERE exit_trade_date IS NULL;
CREATE INDEX IF NOT EXISTS ix_market_tracking_source ON market_tracking (source_trade_date);

COMMENT ON TABLE market_bulletins IS 'Bản tin thị trường v4: một dòng mỗi phiên, bản nháp do hệ thống tạo khi dữ liệu phiên chốt.';
COMMENT ON TABLE market_tracking IS 'Theo dõi mã của bản tin Public: tối đa 20 phiên, dừng lỗ khi đóng cửa <= 93% giá ngày đề xuất.';
