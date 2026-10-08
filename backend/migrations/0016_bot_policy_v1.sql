-- Bot policy iqx-bot-v1.0: gate-free account initialisation, no stop/L1/amplitude, and a
-- versioned buy universe (VN30 by default, or a fixed snapshot of a user-applied saved list).
-- Non-destructive: no history column is dropped; constraints are relaxed so legacy rows keep
-- their stored stop/amplitude evidence while new positions simply carry NULL.

-- 1. The Bot account no longer depends on the retired graduation gate.
ALTER TABLE bot_instances
  ALTER COLUMN cap6_graduated_at DROP NOT NULL;

COMMENT ON COLUMN bot_instances.cap6_graduated_at IS
  'Legacy audit value only; NULL for accounts initialised without the retired graduation gate.';

-- 2. Stops, L1 amplitude and amplitude evidence are legacy history only.
ALTER TABLE bot_positions
  ALTER COLUMN stop_loss_vnd DROP NOT NULL,
  ALTER COLUMN amplitude_at_entry_vnd DROP NOT NULL,
  ALTER COLUMN amplitude_source_ref DROP NOT NULL;

ALTER TABLE bot_positions
  DROP CONSTRAINT IF EXISTS ck_bot_positions_bot_position_stop;

ALTER TABLE bot_positions
  ADD CONSTRAINT ck_bot_positions_bot_position_stop
  CHECK (stop_loss_vnd IS NULL OR (stop_loss_vnd > 0 AND stop_loss_vnd < entry_price_vnd));

ALTER TABLE bot_positions
  ADD COLUMN IF NOT EXISTS entry_source_snapshot jsonb NULL
  CHECK (entry_source_snapshot IS NULL OR jsonb_typeof(entry_source_snapshot) = 'object');

COMMENT ON COLUMN bot_positions.stop_loss_vnd IS
  'Legacy audit value only; ignored by policy iqx-bot-v1.0 (no stop is executed or written).';
COMMENT ON COLUMN bot_positions.amplitude_at_entry_vnd IS
  'Legacy audit value only; policy iqx-bot-v1.0 does not require L1 amplitude.';
COMMENT ON COLUMN bot_positions.entry_source_snapshot IS
  'Buy universe (kind/name/revision) at entry; history only, never a buy source.';

-- 3. Run receipts remember which universe revision was captured.
ALTER TABLE bot_run_receipts
  ADD COLUMN IF NOT EXISTS universe_revision integer NULL,
  ADD COLUMN IF NOT EXISTS universe_kind varchar(8) NULL
  CHECK (universe_kind IS NULL OR universe_kind IN ('vn30', 'custom'));

-- 4. Buy universe revisions. No row means the implicit VN30 default.
CREATE TABLE IF NOT EXISTS bot_universe_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_account_id uuid NOT NULL REFERENCES bot_accounts(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  kind varchar(8) NOT NULL CHECK (kind IN ('vn30', 'custom')),
  saved_list_id uuid,
  list_as_of date,
  list_filter_id uuid,
  list_filter_version integer,
  name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
  tickers text[],
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  requested_at timestamptz NOT NULL,
  effective_session date,
  status varchar(24) NOT NULL
    CHECK (status IN ('pending', 'effective', 'cancelled', 'superseded', 'calendar_unavailable')),
  superseded_by integer,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CONSTRAINT uq_bot_universe_revisions_user_revision UNIQUE (user_id, revision),
  CONSTRAINT uq_bot_universe_revisions_user_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT ck_bot_universe_revisions_shape CHECK (
    (kind = 'custom' AND tickers IS NOT NULL AND cardinality(tickers) BETWEEN 1 AND 500
      AND saved_list_id IS NOT NULL)
    OR (kind = 'vn30' AND tickers IS NULL)
  ),
  CONSTRAINT ck_bot_universe_revisions_session CHECK (
    (status = 'calendar_unavailable' AND effective_session IS NULL)
    OR status = 'cancelled'
    OR (status IN ('pending', 'effective', 'superseded') AND effective_session IS NOT NULL)
  ),
  CONSTRAINT ck_bot_universe_revisions_cancelled CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ix_bot_universe_revisions_resolution
  ON bot_universe_revisions(user_id, effective_session DESC, revision DESC)
  WHERE status IN ('pending', 'effective');

CREATE INDEX IF NOT EXISTS ix_bot_universe_revisions_account
  ON bot_universe_revisions(bot_account_id);

COMMENT ON TABLE bot_universe_revisions IS
  'Immutable buy-universe change requests; effective from the first trading session after the server save date.';
COMMENT ON COLUMN bot_universe_revisions.tickers IS
  'Deduplicated uppercase symbols the user confirmed (custom only); the fixed snapshot used for buys.';
COMMENT ON COLUMN bot_universe_revisions.status IS
  'pending/effective are live; effective is marked lazily when a Bot run captures the revision.';

-- 5. Per-session index membership (never rewritten for past sessions).
CREATE TABLE IF NOT EXISTS index_membership_snapshots (
  index_code varchar(16) NOT NULL,
  session_date date NOT NULL,
  symbols text[] NOT NULL CHECK (cardinality(symbols) > 0),
  source varchar(160) NOT NULL,
  fetched_at timestamptz NOT NULL,
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (index_code, session_date)
);

COMMENT ON TABLE index_membership_snapshots IS
  'Constituents of an index as observed for one trading session; append-only per (index, session).';
