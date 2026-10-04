-- bot-v2 Bộ lọc: owner-scoped saved filters with immutable versions and static list snapshots.
-- Additive only. Soft delete via deleted_at; definition_hash = sha256 hex of canonical JSON.
CREATE TABLE IF NOT EXISTS strategy_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
  current_version integer NOT NULL CHECK (current_version >= 1),
  idempotency_key varchar(128),
  request_hash char(64) CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_strategy_filters_user_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_strategy_filters_owner
  ON strategy_filters(user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS filter_versions (
  filter_id uuid NOT NULL REFERENCES strategy_filters(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  definition_hash char(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (filter_id, version)
);

CREATE TABLE IF NOT EXISTS list_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
  filter_id uuid,
  filter_version integer,
  tickers text[] NOT NULL CHECK (cardinality(tickers) <= 500),
  as_of date NOT NULL,
  data_source varchar(120) NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
  idempotency_key varchar(128),
  request_hash char(64) CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ck_list_snapshots_filter_pair CHECK ((filter_id IS NULL) = (filter_version IS NULL)),
  CONSTRAINT fk_list_snapshots_filter_version FOREIGN KEY (filter_id, filter_version)
    REFERENCES filter_versions(filter_id, version) ON DELETE SET NULL,
  CONSTRAINT uq_list_snapshots_user_idempotency UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_list_snapshots_owner
  ON list_snapshots(user_id, created_at DESC) WHERE deleted_at IS NULL;
