-- Strategy page (Cảnh báo / Backtest / Bộ lọc) v1.0. Additive and non-destructive: no legacy
-- alert rule, filter, list or backtest row is changed; legacy `user_alert_rules` / `alert_events`
-- stay readable and keep their existing scanner. Applied files are immutable (checksum).

-- ---------------------------------------------------------------------------------------------
-- 0. Shared helper: tables that are append-only evidence reject UPDATE.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION strategy_forbid_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- 1. Alerts (spec §4): definitions, immutable versions, per-(version, symbol, side) state, events.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
  enabled boolean NOT NULL DEFAULT true,
  current_version integer NOT NULL CHECK (current_version >= 1),
  -- Bumped on every resume (and set to 1 on creation): a resumed alert starts a fresh
  -- observation instead of replaying the sessions it was paused for.
  observation_epoch integer NOT NULL DEFAULT 1 CHECK (observation_epoch >= 1),
  observation_started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  idempotency_key varchar(128),
  request_hash char(64) CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_strategy_alerts_user_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_strategy_alerts_user_name
  ON strategy_alerts(user_id, lower(btrim(name))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_strategy_alerts_owner
  ON strategy_alerts(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_strategy_alerts_active
  ON strategy_alerts(enabled) WHERE deleted_at IS NULL AND enabled = true;

COMMENT ON TABLE strategy_alerts IS
  'Strategy-page alert definitions (16-indicator registry). Renaming/pausing never creates a version.';

CREATE TABLE IF NOT EXISTS strategy_alert_versions (
  alert_id uuid NOT NULL REFERENCES strategy_alerts(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  -- {kind:'shared_config', revision} | {kind:'backtest_run', run_id, shared_revision} | {kind:'kept', ...}
  source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
  -- Immutable pinned shared-config document (current 16-indicator shape).
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  config_hash char(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  schema_version varchar(16) NOT NULL,
  rule_version varchar(32) NOT NULL,
  calculation_version varchar(32) NOT NULL,
  -- {kind:'symbols'} | {kind:'saved_list', list_id, list_version, list_name, as_of}
  scope jsonb NOT NULL CHECK (jsonb_typeof(scope) = 'object'),
  symbols text[] NOT NULL CHECK (cardinality(symbols) BETWEEN 1 AND 500),
  sides text[] NOT NULL CHECK (cardinality(sides) BETWEEN 1 AND 2 AND sides <@ ARRAY['buy', 'sell']),
  definition_hash char(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, version)
);
DROP TRIGGER IF EXISTS trg_strategy_alert_versions_immutable ON strategy_alert_versions;
DROP TRIGGER IF EXISTS trg_strategy_alert_versions_immutable ON strategy_alert_versions;
CREATE TRIGGER trg_strategy_alert_versions_immutable
  BEFORE UPDATE ON strategy_alert_versions
  FOR EACH ROW EXECUTE FUNCTION strategy_forbid_update();

CREATE TABLE IF NOT EXISTS strategy_alert_states (
  alert_id uuid NOT NULL,
  version integer NOT NULL,
  symbol varchar(20) NOT NULL,
  side varchar(4) NOT NULL CHECK (side IN ('buy', 'sell')),
  epoch integer NOT NULL DEFAULT 1,
  -- Latest VALID (true/false) evaluation; NULL = no valid check yet in this observation.
  last_valid_result boolean,
  last_valid_session date,
  -- Latest evaluation of any kind (true/false/unknown) and why it was unknown.
  last_result varchar(8) NOT NULL CHECK (last_result IN ('true', 'false', 'unknown')),
  last_session date,
  last_reason varchar(64),
  last_evaluated_at timestamptz,
  data_version char(64) CHECK (data_version IS NULL OR data_version ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, version, symbol, side),
  CONSTRAINT fk_strategy_alert_states_version FOREIGN KEY (alert_id, version)
    REFERENCES strategy_alert_versions(alert_id, version) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_strategy_alert_states_due
  ON strategy_alert_states(last_session, last_result);

CREATE TABLE IF NOT EXISTS strategy_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL,
  alert_version integer NOT NULL,
  -- Name at emission time: renaming the alert later never rewrites history.
  alert_name varchar(120) NOT NULL,
  symbol varchar(20) NOT NULL,
  side varchar(4) NOT NULL CHECK (side IN ('buy', 'sell')),
  signal_session date NOT NULL,
  event_kind varchar(24) NOT NULL CHECK (event_kind IN ('first_observation', 'new_signal')),
  message varchar(200) NOT NULL,
  evaluated_at timestamptz NOT NULL,
  data_version char(64) NOT NULL CHECK (data_version ~ '^[a-f0-9]{64}$'),
  config_hash char(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  rule_version varchar(32) NOT NULL,
  calculation_version varchar(32) NOT NULL,
  previous_valid_result boolean,
  previous_valid_session date,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Durable de-duplication: retries and concurrent workers cannot emit one signal twice.
  CONSTRAINT uq_strategy_alert_events_dedupe
    UNIQUE (alert_id, alert_version, symbol, side, signal_session),
  CONSTRAINT fk_strategy_alert_events_version FOREIGN KEY (alert_id, alert_version)
    REFERENCES strategy_alert_versions(alert_id, version) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_strategy_alert_events_owner
  ON strategy_alert_events(user_id, signal_session DESC, created_at DESC, id);
CREATE INDEX IF NOT EXISTS ix_strategy_alert_events_alert
  ON strategy_alert_events(alert_id, signal_session DESC);
DROP TRIGGER IF EXISTS trg_strategy_alert_events_immutable ON strategy_alert_events;
DROP TRIGGER IF EXISTS trg_strategy_alert_events_immutable ON strategy_alert_events;
CREATE TRIGGER trg_strategy_alert_events_immutable
  BEFORE UPDATE ON strategy_alert_events
  FOR EACH ROW EXECUTE FUNCTION strategy_forbid_update();

COMMENT ON COLUMN strategy_alert_events.message IS
  'Always "Thỏa điều kiện Mua/Bán": a signal is a condition match, never an order or a Bot trade.';

-- ---------------------------------------------------------------------------------------------
-- 2. Backtest runs are insert-only evidence (spec §5.4).
-- ---------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_backtest_runs_immutable ON backtest_runs;
DROP TRIGGER IF EXISTS trg_backtest_runs_immutable ON backtest_runs;
CREATE TRIGGER trg_backtest_runs_immutable
  BEFORE UPDATE ON backtest_runs
  FOR EACH ROW EXECUTE FUNCTION strategy_forbid_update();

-- ---------------------------------------------------------------------------------------------
-- 3. Screener runs (server-held result of one filter run) and saved result snapshots (spec §8).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS screener_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Normalised definition (schema 3.0) actually evaluated; legacy input is mapped, never stored raw here.
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  definition_hash char(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  as_of timestamptz NOT NULL,
  data_source varchar(60) NOT NULL,
  calculation_version varchar(32) NOT NULL,
  registry_version varchar(32) NOT NULL,
  universe_truncated boolean NOT NULL DEFAULT false,
  -- {counts, data_quality, legacy_review}: everything of the header except the rows.
  summary jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  -- Every evaluated row with per-cell provenance; paginated by GET /screener/results/:id.
  results jsonb NOT NULL CHECK (jsonb_typeof(results) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_screener_runs_owner ON screener_runs(user_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_screener_runs_immutable ON screener_runs;
DROP TRIGGER IF EXISTS trg_screener_runs_immutable ON screener_runs;
CREATE TRIGGER trg_screener_runs_immutable
  BEFORE UPDATE ON screener_runs
  FOR EACH ROW EXECUTE FUNCTION strategy_forbid_update();

CREATE TABLE IF NOT EXISTS result_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
  -- saved = shown to the user; internal = created only so "Áp dụng cho Bot" has trusted evidence.
  visibility varchar(12) NOT NULL DEFAULT 'saved' CHECK (visibility IN ('saved', 'internal')),
  -- Provenance: the server-held run this snapshot copied its rows from (no FK: runs are pruned).
  run_id uuid,
  filter_id uuid,
  filter_version integer,
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  definition_hash char(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  -- Data cutoff of the run (`as_of`) vs the real save time (`created_at`): never one field.
  as_of timestamptz NOT NULL,
  run_at timestamptz NOT NULL,
  data_source varchar(60) NOT NULL,
  calculation_version varchar(32) NOT NULL,
  registry_version varchar(32) NOT NULL,
  selection jsonb NOT NULL CHECK (jsonb_typeof(selection) = 'object'),
  symbols text[] NOT NULL CHECK (cardinality(symbols) BETWEEN 1 AND 500),
  -- Rows (metrics + provenance) of the saved symbols only, frozen at save time.
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  totals jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(totals) = 'object'),
  idempotency_key varchar(128),
  request_hash char(64) CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ck_result_snapshots_filter_pair CHECK ((filter_id IS NULL) = (filter_version IS NULL)),
  CONSTRAINT uq_result_snapshots_user_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_result_snapshots_owner
  ON result_snapshots(user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Immutable except for the soft-delete marker.
CREATE OR REPLACE FUNCTION strategy_result_snapshot_guard() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'deleted_at') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at') THEN
    RAISE EXCEPTION 'result_snapshots rows are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_result_snapshots_immutable ON result_snapshots;
DROP TRIGGER IF EXISTS trg_result_snapshots_immutable ON result_snapshots;
CREATE TRIGGER trg_result_snapshots_immutable
  BEFORE UPDATE ON result_snapshots
  FOR EACH ROW EXECUTE FUNCTION strategy_result_snapshot_guard();

-- ---------------------------------------------------------------------------------------------
-- 4. Saved lists record where they came from; internal lists back "apply to Bot" without
--    adding an entry to the user's "Danh mục đã lưu".
-- ---------------------------------------------------------------------------------------------
ALTER TABLE list_snapshots
  ADD COLUMN IF NOT EXISTS visibility varchar(12) NOT NULL DEFAULT 'saved'
    CHECK (visibility IN ('saved', 'internal')),
  ADD COLUMN IF NOT EXISTS result_snapshot_id uuid REFERENCES result_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS provenance jsonb CHECK (provenance IS NULL OR jsonb_typeof(provenance) = 'object');

CREATE INDEX IF NOT EXISTS ix_list_snapshots_result ON list_snapshots(result_snapshot_id)
  WHERE result_snapshot_id IS NOT NULL;

COMMENT ON COLUMN list_snapshots.visibility IS
  'saved = shown in "Danh mục đã lưu"; internal = created only to feed "Áp dụng cho Bot" from a result.';

-- Bot buy-universe revisions point at saved lists; deleting such a list is refused (spec §8.7).
CREATE INDEX IF NOT EXISTS ix_bot_universe_revisions_list
  ON bot_universe_revisions(saved_list_id) WHERE saved_list_id IS NOT NULL;
