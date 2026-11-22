-- Bot và Chiến lược v2.0 (backend/docs/update-22-11/PLAN-bot-strategy.md §5.1, spec §3.2, §6, §10.4,
-- §11). Additive and idempotent: one schedule table, one conversion log, nullable ledger columns.
-- Old code ignores every object added here (rollback = previous release).

-- 1. Lịch phiên: which strategy (and version) the Bot runs in each session (§6). The unlocked row
--    is "Phiên tới"; the job locks it at the cutoff of its session and creates the next one.
--    strategy_source/id null = "Chưa chọn chiến lược" (§5.6). `follow_latest` only for user
--    strategies: the latest version is resolved when the row is locked (§6.1).
CREATE TABLE IF NOT EXISTS bot_strategy_schedule (
  bot_id uuid NOT NULL REFERENCES bot_instances (id) ON DELETE CASCADE,
  session_date date NOT NULL,
  strategy_source varchar(8),
  strategy_id text,
  version integer,
  follow_latest boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  run_status varchar(24),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT pk_bot_strategy_schedule PRIMARY KEY (bot_id, session_date),
  CONSTRAINT ck_bot_strategy_schedule_source
    CHECK (strategy_source IS NULL OR strategy_source IN ('iqx', 'user')),
  CONSTRAINT ck_bot_strategy_schedule_ref
    CHECK ((strategy_source IS NULL) = (strategy_id IS NULL)),
  CONSTRAINT ck_bot_strategy_schedule_locked_version
    CHECK (locked_at IS NULL OR strategy_source IS NULL OR version IS NOT NULL),
  CONSTRAINT ck_bot_strategy_schedule_version CHECK (version IS NULL OR version >= 1),
  CONSTRAINT ck_bot_strategy_schedule_follow
    CHECK (NOT follow_latest OR strategy_source = 'user'),
  CONSTRAINT ck_bot_strategy_schedule_run_status CHECK (
    run_status IS NULL
    OR run_status IN ('succeeded', 'failed', 'skipped_no_session', 'converted')
  )
);
-- At most one "Phiên tới" (unlocked row) per Bot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_strategy_schedule_next
  ON bot_strategy_schedule (bot_id) WHERE locked_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_bot_strategy_schedule_strategy
  ON bot_strategy_schedule (strategy_source, strategy_id) WHERE strategy_source IS NOT NULL;

COMMENT ON TABLE bot_strategy_schedule IS
  'Bot v2.0 Lịch phiên: strategy + version per session; unlocked row = next session (spec §6).';

-- 2. Positions: holding-limit anchor and T+2 (§3.2). entry = opened_session.
ALTER TABLE bot_positions
  ADD COLUMN IF NOT EXISTS anchor_session date,
  ADD COLUMN IF NOT EXISTS anchor_reason varchar(16),
  ADD COLUMN IF NOT EXISTS sellable_from_session date;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_bot_positions_anchor_reason'
  ) THEN
    ALTER TABLE bot_positions ADD CONSTRAINT ck_bot_positions_anchor_reason
      CHECK (anchor_reason IS NULL OR anchor_reason IN ('entry', 'policy_cutover'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_bot_positions_anchor_shape'
  ) THEN
    ALTER TABLE bot_positions ADD CONSTRAINT ck_bot_positions_anchor_shape
      CHECK ((anchor_session IS NULL) = (anchor_reason IS NULL));
  END IF;
END $$;
COMMENT ON COLUMN bot_positions.anchor_session IS
  'Session the holding limit counts from: the entry session, or P for positions converted at v2.0 (§11). NULL = entry (positions of v1.x not converted yet).';

-- 3. Executions: exit reasons, holding and strategy of the sell (§10.4 Sổ sách). NULL on rows
--    written before v2.0 (legacy, never backfilled).
ALTER TABLE bot_executions
  ADD COLUMN IF NOT EXISTS exit_reason varchar(16),
  ADD COLUMN IF NOT EXISTS exit_reasons jsonb,
  ADD COLUMN IF NOT EXISTS holding_sessions integer,
  ADD COLUMN IF NOT EXISTS counted_sessions integer,
  ADD COLUMN IF NOT EXISTS max_holding_at_exit integer,
  ADD COLUMN IF NOT EXISTS strategy_source varchar(8),
  ADD COLUMN IF NOT EXISTS strategy_id text,
  ADD COLUMN IF NOT EXISTS strategy_version integer;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_bot_executions_exit_reason'
  ) THEN
    ALTER TABLE bot_executions ADD CONSTRAINT ck_bot_executions_exit_reason
      CHECK (exit_reason IS NULL OR exit_reason IN ('indicator', 'max_holding', 'legacy'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_bot_executions_strategy_source'
  ) THEN
    ALTER TABLE bot_executions ADD CONSTRAINT ck_bot_executions_strategy_source
      CHECK (strategy_source IS NULL OR strategy_source IN ('iqx', 'user'));
  END IF;
END $$;

-- 4. Run receipts: the strategy, universe and counters of the session (§5.5 Nhật ký).
ALTER TABLE bot_run_receipts
  ADD COLUMN IF NOT EXISTS strategy_source varchar(8),
  ADD COLUMN IF NOT EXISTS strategy_ref_id text,
  ADD COLUMN IF NOT EXISTS strategy_ref_version integer,
  ADD COLUMN IF NOT EXISTS universe jsonb,
  ADD COLUMN IF NOT EXISTS counters jsonb;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_bot_run_receipts_strategy_source'
  ) THEN
    ALTER TABLE bot_run_receipts ADD CONSTRAINT ck_bot_run_receipts_strategy_source
      CHECK (strategy_source IS NULL OR strategy_source IN ('iqx', 'user'));
  END IF;
END $$;
COMMENT ON COLUMN bot_run_receipts.strategy_ref_id IS
  'v2.0: strategy of the session (the legacy strategy_id/strategy_version columns keep the Bot instance strategy).';

-- 5. One-off conversion of v1.x Bots (§11): one row per converted account, idempotency + audit.
CREATE TABLE IF NOT EXISTS bot_strategy_conversion_log (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES bot_instances (id) ON DELETE CASCADE,
  group_kind varchar(24) NOT NULL,
  strategy_id uuid,
  versions integer NOT NULL DEFAULT 0,
  max_holding integer,
  excluded_symbols text[] NOT NULL DEFAULT '{}',
  positions_anchored integer NOT NULL DEFAULT 0,
  p_session date NOT NULL,
  dry_run_hash char(64),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_bot_strategy_conversion_log_group CHECK (
    group_kind IN ('buy', 'buy_pending', 'sell_only', 'none')
  )
);
