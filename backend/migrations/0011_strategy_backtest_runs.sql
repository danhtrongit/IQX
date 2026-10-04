-- bot-v2 backtest runs over a saved shared-config revision. Each row is an immutable record of
-- one POST /api/v2/strategy/backtests: the request, the full snapshot (config, revision, hashes,
-- data source, requested vs actual range, fees/lot/execution/profile, versions, open-position
-- policy) and the result. Research candidates live only inside `research_result`; they are
-- never written back to shared config. Idempotent per owner+idempotency_key. Additive only.
CREATE TABLE IF NOT EXISTS backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind varchar(16) NOT NULL
    CHECK (kind IN ('single', 'sensitivity', 'out_of_sample', 'walk_forward', 'portfolio')),
  shared_revision integer NOT NULL CHECK (shared_revision >= 1),
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb CHECK (snapshot IS NULL OR jsonb_typeof(snapshot) = 'object'),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  research_result jsonb CHECK (research_result IS NULL OR jsonb_typeof(research_result) = 'object'),
  system_result jsonb CHECK (system_result IS NULL OR jsonb_typeof(system_result) = 'object'),
  config_hash char(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  data_hash char(64) CHECK (data_hash IS NULL OR data_hash ~ '^[a-f0-9]{64}$'),
  engine_version varchar(32) NOT NULL,
  calculation_version varchar(32) NOT NULL,
  rule_version varchar(32) NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('succeeded', 'failed')),
  error jsonb CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_backtest_runs_user_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT fk_backtest_runs_revision FOREIGN KEY (user_id, shared_revision)
    REFERENCES shared_config_revisions(user_id, revision) ON DELETE CASCADE,
  CONSTRAINT ck_backtest_runs_outcome CHECK (
    (status = 'succeeded' AND result IS NOT NULL AND snapshot IS NOT NULL AND error IS NULL)
    OR (status = 'failed' AND result IS NULL AND error IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_backtest_runs_user_created
  ON backtest_runs(user_id, created_at DESC, id DESC);
