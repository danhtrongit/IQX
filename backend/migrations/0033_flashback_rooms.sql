-- Flashback v2 · Phòng chơi (IQX-Flashback-SPEC v2, docs/flashback-v2-rooms).
-- Additive and idempotent: the v1.x tables (flashback_rounds, flashback_entries, ...) and their
-- data are kept untouched; they simply stop receiving new rounds.
--
--   fb_rooms          a room created by a user: 6-digit code unique among open rooms, settings
--   fb_room_members   who is in a room (left_at IS NULL = still inside); one open room per account
--   fb_matches        one game of a room: server-only symbol and dates, shared bars, clock, pot
--   fb_entries        one player in one match: step, cash, NAV per step, final result and xu won
--   fb_lots           T+2 share lots of an entry (like flashback_lots)
--   fb_orders         filled orders of an entry (like flashback_orders)
--
-- Server-only columns: fb_matches.symbol, start_date, end_date, price_source and the real dates
-- inside warmup_bars/bars. Player APIs only return them after the match has ended.

-- 1. Xu ledger (coin_ledger): stake, win and refund of a room match (spec §8).
--    0028 declared 10 kinds; 0033 declares them again plus the 3 new ones.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_kind;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (
    'lesson_first_completion', 'mascot_purchase', 'pet_purchase', 'pet_evolve',
    'premium_purchase', 'demo_deposit', 'demo_withdraw', 'adjustment',
    'flashback_fee', 'flashback_reward',
    'flashback_stake', 'flashback_win', 'flashback_refund'));

-- Sign of delta: same rules as 0027 plus stake < 0, win/refund > 0. Kinds without a rule
-- (adjustment, flashback_fee, flashback_reward) stay unconstrained as before.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_delta_sign;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_delta_sign CHECK (
    (kind = 'lesson_first_completion' AND delta > 0)
    OR (kind = 'demo_deposit' AND delta > 0)
    OR (kind IN ('mascot_purchase', 'pet_purchase', 'pet_evolve', 'premium_purchase',
                 'demo_withdraw') AND delta < 0)
    OR (kind = 'flashback_stake' AND delta < 0)
    OR (kind IN ('flashback_win', 'flashback_refund') AND delta > 0)
    OR kind NOT IN ('lesson_first_completion', 'demo_deposit', 'mascot_purchase',
                    'pet_purchase', 'pet_evolve', 'premium_purchase', 'demo_withdraw',
                    'flashback_stake', 'flashback_win', 'flashback_refund')
  );

-- One stake, one win and one refund per (match, user) (spec §8). unique_key already carries
-- `<kind>:<match_id>:<user_id>`; this index states the rule on the columns themselves.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_ledger_flashback_match_user_kind
  ON coin_ledger ((ref->>'match_id'), user_id, kind)
  WHERE kind IN ('flashback_stake', 'flashback_win', 'flashback_refund');

-- 2. Rooms.
CREATE TABLE IF NOT EXISTS fb_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 6-digit code shown to players ("ID phòng"); unique among rooms that are not closed.
  code varchar(6) NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_bars integer NOT NULL,
  play_bars integer NOT NULL,
  minutes integer NOT NULL,
  max_players integer NOT NULL,
  stake_xu integer NOT NULL DEFAULT 0,
  -- scrypt$<salt>$<hash>; NULL = no password.
  password_hash text,
  status varchar(16) NOT NULL DEFAULT 'waiting',
  current_match_id uuid,
  match_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Start of the current waiting period (creation or "Chơi lại"); auto-close after 30 minutes.
  waiting_since timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_reason varchar(32),
  CONSTRAINT ck_fb_rooms_code CHECK (code ~ '^[0-9]{6}$'),
  CONSTRAINT ck_fb_rooms_view_bars CHECK (view_bars BETWEEN 30 AND 120),
  CONSTRAINT ck_fb_rooms_play_bars CHECK (play_bars BETWEEN 30 AND 120),
  CONSTRAINT ck_fb_rooms_minutes CHECK (minutes IN (5, 10, 15, 20, 30, 45, 60)),
  CONSTRAINT ck_fb_rooms_max_players CHECK (max_players BETWEEN 1 AND 4),
  CONSTRAINT ck_fb_rooms_stake CHECK (
    (stake_xu = 0) OR (stake_xu >= 10 AND stake_xu % 10 = 0 AND max_players > 1)
  ),
  CONSTRAINT ck_fb_rooms_status CHECK (status IN ('waiting', 'playing', 'closed')),
  CONSTRAINT ck_fb_rooms_closed CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_rooms_open_code ON fb_rooms (code) WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS ix_fb_rooms_open_created
  ON fb_rooms (created_at DESC) WHERE status <> 'closed';

-- 3. Members. left_at IS NULL = still in the room. One open room per account (spec §2.3).
CREATE TABLE IF NOT EXISTS fb_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES fb_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  left_at timestamptz,
  -- Why the member left: leave, closed, xu_insufficient.
  left_reason varchar(32),
  -- One-time message for a member removed by the server (shown by GET rooms/me, then cleared).
  notice text,
  CONSTRAINT ck_fb_room_members_left CHECK (left_at IS NOT NULL OR left_reason IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_room_members_one_open_room
  ON fb_room_members (user_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_fb_room_members_room ON fb_room_members (room_id, joined_at);
CREATE INDEX IF NOT EXISTS ix_fb_room_members_notice
  ON fb_room_members (user_id, left_at DESC) WHERE notice IS NOT NULL;

-- 4. Matches. bars = view_bars + play_bars bars on the chart; warmup_bars = 252 bars only used
--    to initialise indicators. Everyone in the room gets the same bars.
CREATE TABLE IF NOT EXISTS fb_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES fb_rooms(id) ON DELETE CASCADE,
  -- server-only until the match has ended
  symbol varchar(16) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  price_source varchar(64),
  fallback_level smallint NOT NULL DEFAULT 0,
  view_bars integer NOT NULL,
  play_bars integer NOT NULL,
  warmup_bars jsonb NOT NULL DEFAULT '[]'::jsonb,
  bars jsonb NOT NULL DEFAULT '[]'::jsonb,
  minutes integer NOT NULL,
  stake_xu integer NOT NULL DEFAULT 0,
  player_count integer NOT NULL,
  pot_xu integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'playing',
  ended_at timestamptz,
  end_reason varchar(16),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_fb_matches_status CHECK (status IN ('playing', 'finished', 'paid')),
  CONSTRAINT ck_fb_matches_end_reason CHECK (end_reason IS NULL OR end_reason IN ('all_finished', 'timeout')),
  CONSTRAINT ck_fb_matches_bars_array CHECK (jsonb_typeof(bars) = 'array'),
  CONSTRAINT ck_fb_matches_warmup_array CHECK (jsonb_typeof(warmup_bars) = 'array'),
  CONSTRAINT ck_fb_matches_view_bars CHECK (view_bars BETWEEN 30 AND 120),
  CONSTRAINT ck_fb_matches_play_bars CHECK (play_bars BETWEEN 30 AND 120),
  CONSTRAINT ck_fb_matches_players CHECK (player_count BETWEEN 1 AND 4),
  CONSTRAINT ck_fb_matches_stake CHECK (stake_xu >= 0 AND pot_xu = stake_xu * player_count)
);
CREATE INDEX IF NOT EXISTS ix_fb_matches_room ON fb_matches (room_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_fb_matches_due ON fb_matches (ends_at) WHERE status = 'playing';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fb_rooms_current_match') THEN
    ALTER TABLE fb_rooms
      ADD CONSTRAINT fk_fb_rooms_current_match FOREIGN KEY (current_match_id)
      REFERENCES fb_matches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Entries: one per player per match. step 0 = last history bar, step play_bars = last bar.
--    nav_by_step[k+1] (1-based array) = total assets at step k after that step's orders.
CREATE TABLE IF NOT EXISTS fb_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES fb_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stake_xu integer NOT NULL DEFAULT 0,
  step integer NOT NULL DEFAULT 0,
  cash bigint NOT NULL DEFAULT 10000000,
  initial_cash bigint NOT NULL DEFAULT 10000000,
  nav_by_step bigint[] NOT NULL DEFAULT ARRAY[10000000]::bigint[],
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  -- true when the match ended on time and the server moved this player to the last bar
  auto_finished boolean NOT NULL DEFAULT false,
  final_nav bigint,
  pnl_pct numeric(20,10),
  rank integer,
  win_xu integer NOT NULL DEFAULT 0,
  refund_xu integer NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'playing',
  CONSTRAINT uq_fb_entries_match_user UNIQUE (match_id, user_id),
  CONSTRAINT ck_fb_entries_status CHECK (status IN ('playing', 'finished')),
  CONSTRAINT ck_fb_entries_step CHECK (step BETWEEN 0 AND 120),
  CONSTRAINT ck_fb_entries_cash CHECK (cash >= 0),
  CONSTRAINT ck_fb_entries_xu CHECK (stake_xu >= 0 AND win_xu >= 0 AND refund_xu >= 0)
);
CREATE INDEX IF NOT EXISTS ix_fb_entries_user ON fb_entries (user_id, joined_at DESC);

-- 6. Lots (T+2). qty is what is left of the lot.
CREATE TABLE IF NOT EXISTS fb_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES fb_entries(id) ON DELETE CASCADE,
  qty integer NOT NULL,
  price bigint NOT NULL,
  step integer NOT NULL,
  sellable_step integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_fb_lots_qty CHECK (qty >= 0),
  CONSTRAINT ck_fb_lots_price CHECK (price > 0),
  CONSTRAINT ck_fb_lots_step CHECK (step BETWEEN 0 AND 120),
  CONSTRAINT ck_fb_lots_sellable_step CHECK (sellable_step BETWEEN 2 AND 122)
);
CREATE INDEX IF NOT EXISTS ix_fb_lots_entry ON fb_lots (entry_id, step, created_at);

-- 7. Orders. amount = qty * price, fee = 0.15%, tax = 0.1% (sell only).
CREATE TABLE IF NOT EXISTS fb_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES fb_entries(id) ON DELETE CASCADE,
  side varchar(8) NOT NULL,
  qty integer NOT NULL,
  price bigint NOT NULL,
  step integer NOT NULL,
  amount bigint NOT NULL,
  fee bigint NOT NULL,
  tax bigint NOT NULL,
  idempotency_key varchar(128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_fb_orders_side CHECK (side IN ('buy', 'sell')),
  CONSTRAINT ck_fb_orders_qty CHECK (qty > 0),
  CONSTRAINT ck_fb_orders_price CHECK (price > 0),
  CONSTRAINT ck_fb_orders_step CHECK (step BETWEEN 0 AND 120),
  CONSTRAINT ck_fb_orders_amounts CHECK (amount >= 0 AND fee >= 0 AND tax >= 0)
);
CREATE INDEX IF NOT EXISTS ix_fb_orders_entry ON fb_orders (entry_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_orders_idempotency
  ON fb_orders (entry_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE fb_rooms IS 'Flashback v2: phòng chơi do người dùng tạo; code 6 chữ số duy nhất trong các phòng chưa đóng.';
COMMENT ON TABLE fb_room_members IS 'Thành viên phòng; left_at IS NULL là đang ở trong phòng, mỗi tài khoản tối đa một phòng.';
COMMENT ON TABLE fb_matches IS 'Một ván của phòng; symbol, start_date, end_date và ngày trong bars chỉ ở server tới khi ván kết thúc.';
COMMENT ON TABLE fb_entries IS 'Một người chơi trong một ván; nav_by_step là tổng tài sản từng phiên.';
COMMENT ON TABLE fb_lots IS 'Lô cổ phiếu T+2 của một người chơi trong ván; qty là số lượng còn lại.';
COMMENT ON TABLE fb_orders IS 'Lệnh đã khớp của một người chơi trong ván.';
