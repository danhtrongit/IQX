-- Khu giao dịch · Tán lộc (mưa xu) v1.0 (backend/docs/trading-floor-fx/SPEC.md).
-- Additive and idempotent: safe to run twice. The only change to an existing object is three new
-- `coin_ledger.kind` values plus a sign CHECK for them.
--
--   tf_coin_rains  one row per rain: the giver paid `amount` xu up front (ledger 'floor_rain_give'),
--                  split into `coins` coins of `coin_value` xu. When the rain ends (45 s, or on API boot
--                  for rains left over by a restart) it is settled once: coins nobody picked are refunded
--                  to the giver (ledger 'floor_rain_refund') and `settled_at` / `refunded` are set.
--   tf_coin_grabs  one row per picked coin; the primary key (rain_id, coin) makes each coin pickable once.
--                  The picker is credited `coin_value` xu (ledger 'floor_rain_catch').
--
-- Ledger unique keys: floor_rain_give:<rain>, floor_rain_catch:<rain>:<coin>, floor_rain_refund:<rain>;
-- policy_version 'iqx-floor-rain-v1'.

-- 1. Ledger kinds. Rebuild the CHECK from the kinds it already allows plus the three new ones.
DO $$
DECLARE
  kinds text[];
BEGIN
  SELECT array_agg(DISTINCT lit[1] ORDER BY lit[1])
    INTO kinds
    FROM pg_constraint c,
         LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS lit
   WHERE c.conrelid = 'coin_ledger'::regclass
     AND c.conname = 'ck_coin_ledger_kind';
  IF kinds IS NULL THEN
    RAISE EXCEPTION 'ck_coin_ledger_kind not found on coin_ledger';
  END IF;
  kinds := ARRAY(SELECT DISTINCT k FROM unnest(kinds || ARRAY['floor_rain_give', 'floor_rain_catch', 'floor_rain_refund']) AS k ORDER BY k);
  ALTER TABLE coin_ledger DROP CONSTRAINT ck_coin_ledger_kind;
  EXECUTE format(
    'ALTER TABLE coin_ledger ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (%s))',
    (SELECT string_agg(quote_literal(k), ', ') FROM unnest(kinds) AS k)
  );
END $$;

ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_floor_rain_sign;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_floor_rain_sign CHECK (
    (kind = 'floor_rain_give' AND delta < 0)
    OR (kind = 'floor_rain_catch' AND delta > 0)
    OR (kind = 'floor_rain_refund' AND delta > 0)
    OR kind NOT IN ('floor_rain_give', 'floor_rain_catch', 'floor_rain_refund')
  );

-- 2. Tables.
CREATE TABLE IF NOT EXISTS tf_coin_rains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giver_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount BETWEEN 50 AND 1000 AND amount % 10 = 0),
  coin_value smallint NOT NULL DEFAULT 10,
  coins smallint NOT NULL CHECK (coins * coin_value = amount),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  settled_at timestamptz,
  refunded integer NOT NULL DEFAULT 0 CHECK (refunded >= 0)
);

CREATE INDEX IF NOT EXISTS ix_tf_coin_rains_unsettled
  ON tf_coin_rains (expires_at) WHERE settled_at IS NULL;

CREATE TABLE IF NOT EXISTS tf_coin_grabs (
  rain_id uuid NOT NULL REFERENCES tf_coin_rains(id) ON DELETE CASCADE,
  coin smallint NOT NULL CHECK (coin >= 0),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rain_id, coin)
);

CREATE INDEX IF NOT EXISTS ix_tf_coin_grabs_user ON tf_coin_grabs (user_id);

COMMENT ON TABLE tf_coin_rains IS 'Khu giao dịch Tán lộc: one coin rain paid by the giver; unpicked coins refunded at settlement';
COMMENT ON TABLE tf_coin_grabs IS 'Khu giao dịch Tán lộc: coins picked from a rain, one row per coin';
