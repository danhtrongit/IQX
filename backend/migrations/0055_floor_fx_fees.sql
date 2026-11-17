-- Khu giao dịch · phí hành động trên sàn v2 (backend/docs/trading-floor-fx/SPEC.md, mục "v2").
-- Additive and idempotent: safe to run twice. The only change to an existing object is one new
-- `coin_ledger.kind` value plus a sign CHECK for it.
--
--   Xả xui (50 xu), Gáy (100 xu) and Khấn Thần Tài (50 xu) are paid from the xu wallet: one ledger row
--   'floor_fx_fee' (delta < 0) per use, unique key floor_fx_fee:<random uuid>, ref {kind, text},
--   policy_version 'iqx-floor-fx-v1'. No new table.

-- 1. Ledger kind. Rebuild the CHECK from the kinds it already allows plus the new one.
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
  kinds := ARRAY(SELECT DISTINCT k FROM unnest(kinds || ARRAY['floor_fx_fee']) AS k ORDER BY k);
  ALTER TABLE coin_ledger DROP CONSTRAINT ck_coin_ledger_kind;
  EXECUTE format(
    'ALTER TABLE coin_ledger ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (%s))',
    (SELECT string_agg(quote_literal(k), ', ') FROM unnest(kinds) AS k)
  );
END $$;

-- 2. Sign: a fee always takes xu out of the wallet.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_floor_fx_sign;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_floor_fx_sign CHECK (
    (kind = 'floor_fx_fee' AND delta < 0)
    OR kind <> 'floor_fx_fee'
  );
