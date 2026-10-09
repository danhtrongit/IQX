-- Mini practice ("mini luyện tập", Bot SPEC §10-§11). Additive only: nothing here references
-- bot/manual accounts, shared config, grants or coins.
--
--   practice_symbol_data  frozen daily bars per (set_version, symbol), written once on first use
--   practice_progress     one row per (user, indicator, set): cursor, server-side draft
--   practice_cases        the stored 30-case permutation (opaque case_id <-> hidden symbol)
--   practice_runs         one locked, immutable run per (user, indicator, set, ordinal)
--   practice_advances     audit + idempotency of "next" (cursor increments)
--
-- The symbol <-> case mapping and the real dates only live in these tables; the API never
-- serialises them.

-- Frozen bars. A row is never updated: new data requires a new set_version.
CREATE TABLE IF NOT EXISTS practice_symbol_data (
  set_version varchar(64) NOT NULL,
  symbol varchar(16) NOT NULL,
  data_version char(64) NOT NULL CHECK (data_version ~ '^[a-f0-9]{64}$'),
  source varchar(32),
  source_priority integer,
  adjusted boolean NOT NULL DEFAULT false,
  price_scale integer NOT NULL DEFAULT 1 CHECK (price_scale IN (1, 1000)),
  warmup_bars integer NOT NULL CHECK (warmup_bars >= 0),
  observation_bars integer NOT NULL CHECK (observation_bars >= 0),
  test_bars integer NOT NULL CHECK (test_bars >= 0),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings) = 'array'),
  -- [[YYYY-MM-DD, open, high, low, close, volume], ...] strictly chronological
  bars jsonb NOT NULL CHECK (jsonb_typeof(bars) = 'array'),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_practice_symbol_data PRIMARY KEY (set_version, symbol)
);

CREATE TABLE IF NOT EXISTS practice_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  indicator_id varchar(32) NOT NULL CHECK (indicator_id IN (
    'rsi', 'macd', 'ma', 'bollinger', 'volume', 'ema', 'ma_cross', 'dmi',
    'stochastic', 'cci', 'obv', 'mfi', 'cmf', 'donchian', 'roc', 'williams_r'
  )),
  set_version varchar(64) NOT NULL,
  cursor_ordinal smallint NOT NULL DEFAULT 1 CHECK (cursor_ordinal BETWEEN 1 AND 30),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_practice_progress_owner UNIQUE (user_id, indicator_id, set_version)
);

-- The permutation is created together with the progress row and never rewritten.
CREATE TABLE IF NOT EXISTS practice_cases (
  progress_id uuid NOT NULL REFERENCES practice_progress(id) ON DELETE CASCADE,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 30),
  case_id uuid NOT NULL,
  symbol varchar(16) NOT NULL,
  CONSTRAINT pk_practice_cases PRIMARY KEY (progress_id, ordinal),
  CONSTRAINT uq_practice_cases_case_id UNIQUE (case_id),
  CONSTRAINT uq_practice_cases_symbol UNIQUE (progress_id, symbol)
);

CREATE TABLE IF NOT EXISTS practice_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  indicator_id varchar(32) NOT NULL,
  set_version varchar(64) NOT NULL,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 30),
  case_id uuid NOT NULL REFERENCES practice_cases(case_id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'computing'
    CHECK (status IN ('computing', 'succeeded', 'failed')),
  -- Locked at start, before any future bar is read: the normalised config and the hold limit.
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  config_hash char(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  hold_max_sessions integer NOT NULL CHECK (hold_max_sessions BETWEEN 1 AND 1000),
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  data_version char(64) NOT NULL CHECK (data_version ~ '^[a-f0-9]{64}$'),
  profile_version varchar(64) NOT NULL,
  calculation_version varchar(32) NOT NULL,
  rule_version varchar(32) NOT NULL,
  engine_version varchar(64) NOT NULL,
  execution_version varchar(64) NOT NULL,
  comment_version varchar(64) NOT NULL,
  -- Immutable outcome (written once, when status becomes 'succeeded').
  summary jsonb CHECK (summary IS NULL OR jsonb_typeof(summary) = 'object'),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  chart jsonb CHECK (chart IS NULL OR jsonb_typeof(chart) = 'object'),
  error jsonb CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT fk_practice_runs_case FOREIGN KEY (progress_id, ordinal)
    REFERENCES practice_cases(progress_id, ordinal) ON DELETE CASCADE,
  CONSTRAINT uq_practice_runs_case UNIQUE (user_id, indicator_id, set_version, ordinal),
  CONSTRAINT uq_practice_runs_progress_ordinal UNIQUE (progress_id, ordinal),
  CONSTRAINT uq_practice_runs_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT ck_practice_runs_outcome CHECK (
    (status = 'succeeded' AND summary IS NOT NULL AND result IS NOT NULL
       AND chart IS NOT NULL AND error IS NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND error IS NOT NULL AND result IS NULL AND chart IS NULL)
    OR (status = 'computing' AND result IS NULL AND chart IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_practice_runs_history
  ON practice_runs(progress_id, ordinal DESC);

CREATE TABLE IF NOT EXISTS practice_advances (
  progress_id uuid NOT NULL REFERENCES practice_progress(id) ON DELETE CASCADE,
  from_ordinal smallint NOT NULL CHECK (from_ordinal BETWEEN 1 AND 29),
  to_ordinal smallint NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_practice_advances PRIMARY KEY (progress_id, from_ordinal),
  CONSTRAINT uq_practice_advances_key UNIQUE (progress_id, idempotency_key),
  CONSTRAINT ck_practice_advances_step CHECK (to_ordinal = from_ordinal + 1)
);

-- Frozen bars cannot be edited.
CREATE OR REPLACE FUNCTION practice_symbol_data_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Practice symbol data is frozen per set_version';
END;
$$;
DROP TRIGGER IF EXISTS trg_practice_symbol_data_immutable ON practice_symbol_data;
CREATE TRIGGER trg_practice_symbol_data_immutable
  BEFORE UPDATE ON practice_symbol_data
  FOR EACH ROW EXECUTE FUNCTION practice_symbol_data_immutable();

-- The permutation is stored once and never reshuffled.
CREATE OR REPLACE FUNCTION practice_cases_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Practice case order is immutable';
END;
$$;
DROP TRIGGER IF EXISTS trg_practice_cases_immutable ON practice_cases;
CREATE TRIGGER trg_practice_cases_immutable
  BEFORE UPDATE ON practice_cases
  FOR EACH ROW EXECUTE FUNCTION practice_cases_immutable();

-- The cursor only moves forward by exactly one, and only after the current case has a
-- completed run. No wrap-around: the column check caps it at 30.
CREATE OR REPLACE FUNCTION practice_progress_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.indicator_id IS DISTINCT FROM OLD.indicator_id
     OR NEW.set_version IS DISTINCT FROM OLD.set_version THEN
    RAISE EXCEPTION 'Practice progress identity is immutable';
  END IF;
  IF NEW.cursor_ordinal IS DISTINCT FROM OLD.cursor_ordinal THEN
    IF NEW.cursor_ordinal <> OLD.cursor_ordinal + 1 THEN
      RAISE EXCEPTION 'Practice cursor must advance by exactly one';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM practice_runs
      WHERE progress_id = OLD.id AND ordinal = OLD.cursor_ordinal AND status = 'succeeded'
    ) THEN
      RAISE EXCEPTION 'Practice cursor can advance only after the current run completed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_practice_progress_guard ON practice_progress;
CREATE TRIGGER trg_practice_progress_guard
  BEFORE UPDATE ON practice_progress
  FOR EACH ROW EXECUTE FUNCTION practice_progress_guard();

-- Locked config/versions never change; a succeeded run is fully immutable.
CREATE OR REPLACE FUNCTION practice_runs_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'succeeded' THEN
    RAISE EXCEPTION 'A completed practice run is immutable';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'summary', 'result', 'chart', 'error', 'attempts', 'completed_at'])
      IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'summary', 'result', 'chart', 'error', 'attempts', 'completed_at']) THEN
    RAISE EXCEPTION 'The locked practice run configuration and versions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_practice_runs_guard ON practice_runs;
CREATE TRIGGER trg_practice_runs_guard
  BEFORE UPDATE ON practice_runs
  FOR EACH ROW EXECUTE FUNCTION practice_runs_guard();
