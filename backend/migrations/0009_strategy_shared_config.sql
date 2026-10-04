-- bot-v2 shared Buy/Sell indicator config: one append-only revision history per account.
-- Each PATCH writes exactly one revision (optimistic concurrency on `revision`, idempotent per
-- owner+idempotency_key) and one effective-session row computed from the Asia/Ho_Chi_Minh
-- trading calendar (first valid session with date > save date; NULL when the calendar is
-- unavailable). Additive only.
CREATE TABLE IF NOT EXISTS shared_config_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  schema_version varchar(16) NOT NULL,
  rule_version varchar(32) NOT NULL,
  calculation_version varchar(32) NOT NULL,
  config jsonb NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  config_hash char(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  before_hash char(64) CHECK (before_hash IS NULL OR before_hash ~ '^[a-f0-9]{64}$'),
  patch jsonb NOT NULL CHECK (jsonb_typeof(patch) = 'object'),
  requested_at timestamptz NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES users(id),
  idempotency_key varchar(128) NOT NULL,
  CONSTRAINT uq_shared_config_revisions_user_revision UNIQUE (user_id, revision),
  CONSTRAINT uq_shared_config_revisions_user_idempotency UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS effective_config_sessions (
  user_id uuid NOT NULL,
  revision integer NOT NULL,
  effective_session date,
  status varchar(24) NOT NULL CHECK (status IN ('pending', 'effective', 'calendar_unavailable')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_effective_config_sessions PRIMARY KEY (user_id, revision),
  CONSTRAINT fk_effective_config_sessions_revision FOREIGN KEY (user_id, revision)
    REFERENCES shared_config_revisions(user_id, revision) ON DELETE CASCADE,
  CONSTRAINT ck_effective_config_sessions_session CHECK (
    (status = 'calendar_unavailable' AND effective_session IS NULL)
    OR (status <> 'calendar_unavailable' AND effective_session IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_effective_config_sessions_user_session
  ON effective_config_sessions(user_id, effective_session DESC)
  WHERE effective_session IS NOT NULL;
