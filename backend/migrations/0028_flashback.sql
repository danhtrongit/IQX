-- Flashback (IQX-Flashback-SPEC v1.1 + BoSung v1.2): game giao dịch trên dữ liệu quá khứ.
-- Additive and idempotent: no history column is dropped, no existing row is rewritten.
--
--   flashback_rounds       một đề (round): 252 nến khởi tạo + 120 nến biểu đồ, trạng thái vòng đời
--   flashback_entries      một lượt chơi của một tài khoản trong một đề (mỗi tài khoản 1 lượt/đề)
--   flashback_lots         các lô cổ phiếu đang giữ (T+2) của một lượt chơi
--   flashback_orders       các lệnh đã khớp của một lượt chơi
--   flashback_settings     tham số vận hành (spec v1.2 §9) và cờ tạm dừng
--   flashback_job_log      nhật ký từng bước của tác vụ mỗi phút + lịch sử cảnh báo
--   vn30_constituents      rổ VN30 hiện hành được ghi lại khi tạo đề
--
-- Cột chỉ server: rounds.symbol, rounds.start_date và ngày phiên thật nằm trong
-- warmup_bars/bars. API người chơi không bao giờ trả về chúng.

-- 1. Ledger xu: thêm hai kind của Flashback (phí tham gia và thưởng theo hạng).
-- Migration 0027 khai báo 8 kind; 0028 khai báo lại đủ 10 kind.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_kind;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (
    'lesson_first_completion', 'mascot_purchase', 'pet_purchase', 'pet_evolve',
    'premium_purchase', 'demo_deposit', 'demo_withdraw', 'adjustment',
    'flashback_fee', 'flashback_reward'));

-- 2. Đề (round). Mỗi đề có đúng 120 phiên trên biểu đồ: 60 phiên lịch sử + 60 phiên chơi.
--    252 phiên khởi tạo chỉ dùng cho chỉ báo và không vẽ lên biểu đồ.
CREATE TABLE IF NOT EXISTS flashback_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_no integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ready',
  -- chỉ server: mã thật và ngày thật của đề
  symbol varchar(16) NOT NULL,
  start_date date NOT NULL,
  -- [{d,o,h,l,c,v}, ...] ngày thật chỉ nằm ở server
  warmup_bars jsonb NOT NULL DEFAULT '[]'::jsonb,
  bars jsonb NOT NULL DEFAULT '[]'::jsonb,
  scheduled_open_at timestamptz NOT NULL,
  opens_at timestamptz,
  closes_at timestamptz,
  fallback_level smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_flashback_rounds_round_no UNIQUE (round_no),
  CONSTRAINT ck_flashback_rounds_status CHECK (status IN ('ready', 'open', 'closing', 'closed', 'paid')),
  CONSTRAINT ck_flashback_rounds_fallback_level CHECK (fallback_level BETWEEN 0 AND 3),
  CONSTRAINT ck_flashback_rounds_bars_array CHECK (jsonb_typeof(bars) = 'array'),
  CONSTRAINT ck_flashback_rounds_warmup_array CHECK (jsonb_typeof(warmup_bars) = 'array')
);
-- Tối đa một đề `open` và một đề `ready` (spec v1.2 §5.4).
CREATE UNIQUE INDEX IF NOT EXISTS uq_flashback_rounds_single_open
  ON flashback_rounds (status) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS uq_flashback_rounds_single_ready
  ON flashback_rounds (status) WHERE status = 'ready';
CREATE INDEX IF NOT EXISTS ix_flashback_rounds_round_no_desc ON flashback_rounds (round_no DESC);
CREATE INDEX IF NOT EXISTS ix_flashback_rounds_symbol ON flashback_rounds (symbol);

-- 3. Lượt chơi: mỗi tài khoản một lượt trên mỗi đề.
CREATE TABLE IF NOT EXISTS flashback_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES flashback_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  fee_xu integer NOT NULL DEFAULT 0,
  first_join boolean NOT NULL DEFAULT false,
  -- [{"id":"ma","params":{"period":20}}, ...] nhiều lần thêm cùng một chỉ báo
  indicator_params jsonb NOT NULL DEFAULT '[]'::jsonb,
  step integer NOT NULL DEFAULT 0,
  cash bigint NOT NULL DEFAULT 10000000,
  initial_cash bigint NOT NULL DEFAULT 10000000,
  finished_at timestamptz,
  final_nav bigint,
  pnl_pct numeric(20,10),
  max_drawdown numeric(20,10),
  rank integer,
  reward_xu integer NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'playing',
  CONSTRAINT uq_flashback_entries_round_user UNIQUE (round_id, user_id),
  CONSTRAINT ck_flashback_entries_status CHECK (status IN ('playing', 'finished')),
  CONSTRAINT ck_flashback_entries_step CHECK (step BETWEEN 0 AND 60),
  CONSTRAINT ck_flashback_entries_fee CHECK (fee_xu IN (0, 100)),
  CONSTRAINT ck_flashback_entries_cash CHECK (cash >= 0),
  CONSTRAINT ck_flashback_entries_indicator_params_array CHECK (jsonb_typeof(indicator_params) = 'array')
);
CREATE INDEX IF NOT EXISTS ix_flashback_entries_user ON flashback_entries (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS ix_flashback_entries_round ON flashback_entries (round_id);

-- 4. Lô cổ phiếu đang giữ. qty là số lượng còn lại của lô (giảm dần khi bán).
CREATE TABLE IF NOT EXISTS flashback_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES flashback_entries(id) ON DELETE CASCADE,
  qty integer NOT NULL,
  price bigint NOT NULL,
  step integer NOT NULL,
  sellable_step integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_flashback_lots_qty CHECK (qty >= 0),
  CONSTRAINT ck_flashback_lots_price CHECK (price > 0),
  CONSTRAINT ck_flashback_lots_step CHECK (step BETWEEN 0 AND 60),
  CONSTRAINT ck_flashback_lots_sellable_step CHECK (sellable_step BETWEEN 2 AND 62)
);
CREATE INDEX IF NOT EXISTS ix_flashback_lots_entry ON flashback_lots (entry_id, step, created_at);

-- 5. Lệnh đã khớp. amount = qty * price, fee = 0,15%, tax = 0,1% (chỉ khi bán).
CREATE TABLE IF NOT EXISTS flashback_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES flashback_entries(id) ON DELETE CASCADE,
  side varchar(8) NOT NULL,
  qty integer NOT NULL,
  price bigint NOT NULL,
  step integer NOT NULL,
  amount bigint NOT NULL,
  fee bigint NOT NULL,
  tax bigint NOT NULL,
  idempotency_key varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_flashback_orders_side CHECK (side IN ('buy', 'sell')),
  CONSTRAINT ck_flashback_orders_qty CHECK (qty > 0),
  CONSTRAINT ck_flashback_orders_price CHECK (price > 0),
  CONSTRAINT ck_flashback_orders_step CHECK (step BETWEEN 0 AND 60),
  CONSTRAINT ck_flashback_orders_amount CHECK (amount >= 0),
  CONSTRAINT ck_flashback_orders_fee CHECK (fee >= 0),
  CONSTRAINT ck_flashback_orders_tax CHECK (tax >= 0)
);
CREATE INDEX IF NOT EXISTS ix_flashback_orders_entry ON flashback_orders (entry_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_flashback_orders_idempotency
  ON flashback_orders (entry_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 6. Tham số vận hành (spec v1.2 §9) và cờ tạm dừng.
CREATE TABLE IF NOT EXISTS flashback_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO flashback_settings (key, value) VALUES
  ('config', '{
     "round_duration_hours": 48,
     "change_hour_utc7": 20,
     "rounds_before_symbol_repeat": 10,
     "earliest_start_date": "2012-01-01",
     "min_months_ago": 12,
     "warmup_sessions": 252,
     "history_sessions": 60,
     "play_sessions": 60,
     "min_liquidity_vnd": 10000000000,
     "min_daily_volatility": 0.01,
     "max_start_attempts": 200
   }'::jsonb),
  ('paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 7. Nhật ký tác vụ: mỗi bước một dòng; cảnh báo dùng step = 'alert'.
CREATE TABLE IF NOT EXISTS flashback_job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  step varchar(32) NOT NULL,
  round_id uuid REFERENCES flashback_rounds(id) ON DELETE SET NULL,
  -- Mức độ cảnh báo (spec v1.2 §6.1): high = Cao, medium = Trung bình, low = Thấp.
  -- NULL cho các dòng nhật ký thường (b1..b5, reveal).
  level varchar(8),
  result text,
  error text,
  CONSTRAINT ck_flashback_job_log_level CHECK (level IS NULL OR level IN ('high', 'medium', 'low'))
);
CREATE INDEX IF NOT EXISTS ix_flashback_job_log_run_at ON flashback_job_log (run_at DESC);
CREATE INDEX IF NOT EXISTS ix_flashback_job_log_step ON flashback_job_log (step, run_at DESC);

-- 8. Rổ VN30 hiện hành tại lúc tạo đề.
-- Giới hạn: nguồn chỉ cung cấp rổ HIỆN HÀNH, không có lịch sử quá khứ. Vì vậy bảng này chỉ
-- ghi được các kỳ từ lúc Flashback bắt đầu chạy; các đề cũ hơn không có lịch sử rổ.
CREATE TABLE IF NOT EXISTS vn30_constituents (
  symbol varchar(16) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  CONSTRAINT pk_vn30_constituents PRIMARY KEY (symbol, effective_from)
);
CREATE INDEX IF NOT EXISTS ix_vn30_constituents_effective
  ON vn30_constituents (effective_from DESC, symbol);

COMMENT ON TABLE flashback_rounds IS 'Đề Flashback: 252 nến khởi tạo + 120 nến biểu đồ; symbol và start_date chỉ ở server.';
COMMENT ON COLUMN flashback_rounds.fallback_level IS '0 = không nới; 1-3 = mức nới §6.3 của spec v1.2.';
COMMENT ON TABLE flashback_entries IS 'Một lượt chơi của một tài khoản trong một đề (UNIQUE round_id, user_id).';
COMMENT ON TABLE flashback_lots IS 'Lô cổ phiếu đang giữ của một lượt chơi; qty là số lượng còn lại.';
COMMENT ON TABLE flashback_settings IS 'Tham số §9 của spec v1.2 và cờ paused (tạm dừng mở đề mới).';
COMMENT ON TABLE flashback_job_log IS 'Nhật ký từng bước của tác vụ Flashback và lịch sử cảnh báo.';
COMMENT ON TABLE vn30_constituents IS 'Rổ VN30 hiện hành được ghi khi tạo đề; nguồn không có lịch sử quá khứ.';
