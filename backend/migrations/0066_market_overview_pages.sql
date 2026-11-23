-- Toàn cảnh thị trường (market-overview): trang tùy biến theo tài khoản,
-- tùy chọn trang đang xem và lịch sử thanh khoản theo phút để so sánh phiên trước / TB20.
-- Idempotent: chạy lại không thay đổi cấu trúc hiện có.

CREATE TABLE IF NOT EXISTS market_overview_pages (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
  sort_order INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  items JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(items) = 'array' AND octet_length(items::text) <= 131072),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_overview_pages_user_order
  ON market_overview_pages (user_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS market_overview_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_active_page_id TEXT NOT NULL DEFAULT 'thi-truong',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_overview_liquidity_history (
  session_date DATE NOT NULL,
  exchange TEXT NOT NULL DEFAULT 'HOSE',
  points JSONB NOT NULL CHECK (jsonb_typeof(points) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_date, exchange)
);

CREATE INDEX IF NOT EXISTS idx_market_overview_liquidity_history_exchange_date
  ON market_overview_liquidity_history (exchange, session_date DESC);
