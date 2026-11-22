-- Bot và Chiến lược v2.0 (backend/docs/update-22-11/PLAN-bot-strategy.md §5.1, spec §10.1):
-- user strategies + immutable versions, basket Backtest runs, IQX strategy events and the IQX v2
-- content (universe VN30, Giữ tối đa 30). Additive and idempotent; no existing row is rewritten
-- (iqx_template_versions v1 rows stay; a v2 row is inserted beside them).

-- 1. Strategies of a user (at most 20 not deleted, checked in the service transaction).
CREATE TABLE IF NOT EXISTS user_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name varchar(40) NOT NULL CHECK (length(btrim(name)) > 0 AND name = btrim(name)),
  latest_version integer NOT NULL CHECK (latest_version >= 1),
  -- {type:"iqx_strategy", id, version}; null in v2 flows (D22).
  origin jsonb CHECK (origin IS NULL OR jsonb_typeof(origin) = 'object'),
  sell_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_strategies_user_name
  ON user_strategies (user_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_user_strategies_user
  ON user_strategies (user_id) WHERE deleted_at IS NULL;

-- 2. Versions: immutable (no UPDATE, no DELETE). `from_run_id` is the Backtest run that proved the
--    content (required for user saves; null for restores and the one-off conversion).
CREATE TABLE IF NOT EXISTS user_strategy_versions (
  strategy_id uuid NOT NULL REFERENCES user_strategies (id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  config_hash char(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  from_run_id uuid REFERENCES backtest_runs (id) ON DELETE SET NULL,
  note varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_strategy_versions PRIMARY KEY (strategy_id, version)
);

CREATE OR REPLACE FUNCTION user_strategy_versions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- ON DELETE SET NULL of from_run_id (the run's owner deleted) is the only allowed change.
  IF TG_OP = 'UPDATE'
     AND NEW.strategy_id = OLD.strategy_id AND NEW.version = OLD.version
     AND NEW.content = OLD.content AND NEW.config_hash = OLD.config_hash
     AND NEW.note IS NOT DISTINCT FROM OLD.note AND NEW.created_at = OLD.created_at
     AND NEW.from_run_id IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END $$;

DROP TRIGGER IF EXISTS tr_user_strategy_versions_immutable ON user_strategy_versions;
CREATE TRIGGER tr_user_strategy_versions_immutable
  BEFORE UPDATE OR DELETE ON user_strategy_versions
  FOR EACH ROW EXECUTE FUNCTION user_strategy_versions_immutable();

-- 3. Basket Backtest runs (§4, §10.3). Legacy runs keep their kind and shared_revision.
ALTER TABLE backtest_runs ALTER COLUMN shared_revision DROP NOT NULL;
ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_kind_check;
ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS ck_backtest_runs_kind;
ALTER TABLE backtest_runs ADD CONSTRAINT ck_backtest_runs_kind
  CHECK (kind IN ('single', 'sensitivity', 'out_of_sample', 'walk_forward', 'portfolio', 'basket'));
ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS strategy_source varchar(8);
ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS strategy_ref_id text;
ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS strategy_version integer;
ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS ck_backtest_runs_strategy_source;
ALTER TABLE backtest_runs ADD CONSTRAINT ck_backtest_runs_strategy_source
  CHECK (strategy_source IS NULL OR strategy_source IN ('iqx', 'user', 'draft'));
ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS ck_backtest_runs_basket_shape;
ALTER TABLE backtest_runs ADD CONSTRAINT ck_backtest_runs_basket_shape
  CHECK ((kind = 'basket') = (strategy_source IS NOT NULL)
         AND (kind = 'basket' OR shared_revision IS NOT NULL));
CREATE INDEX IF NOT EXISTS ix_backtest_runs_user_strategy
  ON backtest_runs (user_id, strategy_source, strategy_ref_id, created_at DESC);

-- 4. IQX strategy events (§7.2): trial runs and Bot assignments next to the old "Dùng" event.
ALTER TABLE iqx_template_used ADD COLUMN IF NOT EXISTS event varchar(24) NOT NULL DEFAULT 'used';
ALTER TABLE iqx_template_used DROP CONSTRAINT IF EXISTS ck_iqx_template_used_event;
ALTER TABLE iqx_template_used ADD CONSTRAINT ck_iqx_template_used_event
  CHECK (event IN ('used', 'strategy_run', 'strategy_assigned'));
CREATE INDEX IF NOT EXISTS ix_iqx_template_used_event_time
  ON iqx_template_used (template_id, event, created_at);

-- 5. IQX v2 (D9, spec §7.1): every published Chiến lược IQX whose current content has no basket gets
--    v{current+1} = same texts and indicators, universe VN30, Giữ tối đa 30. Templates an admin
--    already moved to a content with `universe` are left alone. Safe to run twice.
WITH targets AS (
  SELECT t.id, t.current_version, v.content
    FROM iqx_templates t
    JOIN iqx_template_versions v ON v.template_id = t.id AND v.version = t.current_version
   WHERE t.kind = 'strategy'
     AND t.current_version IS NOT NULL
     AND NOT (v.content -> 'definition' ? 'universe')
   FOR UPDATE OF t
), inserted AS (
  INSERT INTO iqx_template_versions (template_id, version, content, reason)
  SELECT id, current_version + 1,
         jsonb_set(
           jsonb_set(content, '{definition,universe}', '{"type":"vn30"}'::jsonb, true),
           '{definition,max_holding}', '30'::jsonb, true),
         'Thêm rổ mã; giữ tối đa 30 phiên'
    FROM targets
  ON CONFLICT (template_id, version) DO NOTHING
  RETURNING template_id, version
)
UPDATE iqx_templates t
   SET current_version = inserted.version, updated_at = now()
  FROM inserted
 WHERE t.id = inserted.template_id;

COMMENT ON TABLE user_strategies IS
  'Chiến lược của người dùng (spec Bot và Chiến lược v2.0 §10.1); xóa mềm, tối đa 20 chưa xóa.';
COMMENT ON TABLE user_strategy_versions IS
  'Bản bất biến của chiến lược: content {universe, indicators, max_holding, sell_only?} (D14).';
