-- IQX workspace onboarding, learning coins ("xu") and the mascot shop.
-- Specs: IQX-Bo-Shop-Xu-Linh-Thu v1.0 (sections 4-8) and IQX-Bo-Bot v1.0 (section 3).
-- Additive and idempotent: no history column is dropped, no existing row is rewritten.

-- 1. Durable idempotency for the manual demo account's initial funding.
-- Existing ledger rows keep NULL (a unique index accepts many NULLs); only new
-- onboarding rows carry `manual:initial_funding:<user_id>`.
ALTER TABLE virtual_cash_ledger ADD COLUMN IF NOT EXISTS idempotency_key varchar(160);
CREATE UNIQUE INDEX IF NOT EXISTS uq_virtual_cash_ledger_idempotency_key
  ON virtual_cash_ledger (idempotency_key);

-- 2. Learning-coin wallet: one row per user, serialised by `SELECT ... FOR UPDATE`.
-- `last_seq` is the commit sequence of the user's ledger; balance and last_seq only
-- change together with a new coin_ledger row.
CREATE TABLE IF NOT EXISTS coin_wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  last_seq bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_coin_wallets_balance_non_negative CHECK (balance >= 0),
  CONSTRAINT ck_coin_wallets_last_seq_non_negative CHECK (last_seq >= 0)
);

-- 3. Immutable coin ledger, ordered by `seq` (never by timestamp alone).
CREATE TABLE IF NOT EXISTS coin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  kind varchar(32) NOT NULL,
  delta integer NOT NULL,
  balance_after bigint NOT NULL,
  unique_key text NOT NULL,
  ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_coin_ledger_user_seq UNIQUE (user_id, seq),
  CONSTRAINT uq_coin_ledger_unique_key UNIQUE (unique_key),
  CONSTRAINT ck_coin_ledger_seq_positive CHECK (seq >= 1),
  CONSTRAINT ck_coin_ledger_kind CHECK (kind IN ('lesson_first_completion', 'mascot_purchase', 'adjustment')),
  CONSTRAINT ck_coin_ledger_delta_non_zero CHECK (delta <> 0),
  CONSTRAINT ck_coin_ledger_delta_sign CHECK (
    (kind = 'lesson_first_completion' AND delta > 0)
    OR (kind = 'mascot_purchase' AND delta < 0)
    OR kind = 'adjustment'
  ),
  CONSTRAINT ck_coin_ledger_balance_non_negative CHECK (balance_after >= 0)
);

-- A ledger row is never updated. It is removed only by the ON DELETE CASCADE of its
-- owning user (that delete runs one trigger level deeper than a direct DELETE).
CREATE OR REPLACE FUNCTION protect_coin_ledger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'coin_ledger rows are immutable' USING ERRCODE = '23000';
  END IF;
  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'coin_ledger rows cannot be deleted directly' USING ERRCODE = '23000';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_coin_ledger ON coin_ledger;
CREATE TRIGGER trg_protect_coin_ledger
  BEFORE UPDATE OR DELETE ON coin_ledger
  FOR EACH ROW EXECUTE FUNCTION protect_coin_ledger();

-- 4. First-completion reward evidence: one reward per (user, stable lesson key),
-- shared by the realtime Academy hook and the backfill (same key, no second namespace).
-- ledger_id is assigned before the ledger row is written, hence the deferred FK.
CREATE TABLE IF NOT EXISTS lesson_rewards (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key text NOT NULL,
  lesson_id text NOT NULL,
  catalog_version text NOT NULL,
  completion_method varchar(16) NOT NULL,
  completed_at timestamptz NOT NULL,
  ledger_id uuid NOT NULL REFERENCES coin_ledger(id) DEFERRABLE INITIALLY DEFERRED,
  policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_lesson_rewards PRIMARY KEY (user_id, lesson_key),
  CONSTRAINT uq_lesson_rewards_ledger UNIQUE (ledger_id),
  CONSTRAINT ck_lesson_rewards_method CHECK (completion_method IN ('quiz', 'guide'))
);

-- 5. Mascot ownership (default / purchase / legacy grant), independent of purchases.
CREATE TABLE IF NOT EXISTS mascot_ownerships (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mascot_id varchar(24) NOT NULL,
  source varchar(16) NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT pk_mascot_ownerships PRIMARY KEY (user_id, mascot_id),
  CONSTRAINT ck_mascot_ownerships_mascot CHECK (
    mascot_id IN ('bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy')
  ),
  CONSTRAINT ck_mascot_ownerships_source CHECK (source IN ('default', 'purchase', 'legacy_grant'))
);

-- 6. Purchases: one per (user, mascot) and one per (user, idempotency key).
CREATE TABLE IF NOT EXISTS mascot_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mascot_id varchar(24) NOT NULL,
  price_xu integer NOT NULL,
  catalog_version text NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL,
  ledger_id uuid NOT NULL REFERENCES coin_ledger(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_mascot_purchases_user_key UNIQUE (user_id, idempotency_key),
  CONSTRAINT uq_mascot_purchases_user_mascot UNIQUE (user_id, mascot_id),
  CONSTRAINT uq_mascot_purchases_ledger UNIQUE (ledger_id),
  CONSTRAINT ck_mascot_purchases_mascot CHECK (
    mascot_id IN ('bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy')
  ),
  CONSTRAINT ck_mascot_purchases_price CHECK (price_xu > 0)
);

-- 7. Display profile: the one active mascot (must be owned) with its own revision.
CREATE TABLE IF NOT EXISTS mascot_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_mascot_id varchar(24) NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_mascot_profiles_revision CHECK (revision >= 1),
  CONSTRAINT fk_mascot_profiles_owned FOREIGN KEY (user_id, active_mascot_id)
    REFERENCES mascot_ownerships (user_id, mascot_id)
);

COMMENT ON TABLE coin_wallets IS 'Learning-coin (xu) wallet; unit is xu, never VND.';
COMMENT ON TABLE coin_ledger IS 'Immutable xu ledger ordered by seq; unique_key makes every credit/debit idempotent.';
COMMENT ON TABLE lesson_rewards IS 'One +100 xu first-completion reward per (user, stable lesson key).';
COMMENT ON TABLE mascot_ownerships IS 'Owned mascots; not derived from purchases (default and legacy grants exist).';
COMMENT ON TABLE mascot_purchases IS 'Idempotent mascot purchases paid with xu.';
COMMENT ON TABLE mascot_profiles IS 'Active mascot per user with an optimistic revision; display only.';
COMMENT ON COLUMN virtual_cash_ledger.idempotency_key IS 'Durable once-only key, e.g. manual:initial_funding:<user_id>.';
