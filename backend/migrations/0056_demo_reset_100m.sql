-- Update 19-11 · Demo về bản cũ (backend/docs/update-19-11/IQX-Bo-Cuc-SPEC.md §8, DEV-NOTES.md §8.2).
-- One-off and idempotent: safe to run twice; an account already in demo_reset_100m_log is skipped.
--
--   Every Demo account (virtual_trading_accounts) ends at initial_cash_vnd = net_deposited_cash_vnd
--   = 100.000.000 VND, as if it had just been granted 100M once. For each account not yet logged:
--     cash_added = 100.000.000 − net_deposited_cash_vnd           (added to cash_available_vnd)
--     refund_xu  = max(0, net_deposited_cash_vnd − initial_cash_vnd) / 10.000
--   net_deposited_cash_vnd already equals old grant + xu→cash − cash→xu, so refund_xu is exactly the
--   xu the user converted into Demo cash and did not convert back. It is credited to the xu wallet
--   as one coin_ledger row 'demo_exchange_refund' (unique key demo_exchange_refund:<user_id>).
--   Positions, orders and trades are untouched. If any account would end with negative cash the
--   migration aborts and lists the account ids (nothing is changed).
--   Bot accounts (bot_accounts) are not touched.
--
--   Examples (initial, net, cash) → result: (0, 0, 0) → cash 100M; (0, 10M, 4.2M) → +90M and
--   1000 xu; (0, 1M, 1M) → +99M and 100 xu; (100M, 0, 0) → +100M, no xu; (100M, 100M, x) → +0.

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
  kinds := ARRAY(SELECT DISTINCT k FROM unnest(kinds || ARRAY['demo_exchange_refund']) AS k ORDER BY k);
  ALTER TABLE coin_ledger DROP CONSTRAINT ck_coin_ledger_kind;
  EXECUTE format(
    'ALTER TABLE coin_ledger ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (%s))',
    (SELECT string_agg(quote_literal(k), ', ') FROM unnest(kinds) AS k)
  );
END $$;

-- 2. Sign: a refund always gives xu back.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_demo_refund_sign;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_demo_refund_sign CHECK (
    (kind = 'demo_exchange_refund' AND delta > 0)
    OR kind <> 'demo_exchange_refund'
  );

-- 3. Reconciliation log: one row per converted account, written in the same transaction.
CREATE TABLE IF NOT EXISTS demo_reset_100m_log (
  account_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  old_initial_cash_vnd bigint NOT NULL,
  old_net_deposited_cash_vnd bigint NOT NULL,
  old_cash_available_vnd bigint NOT NULL,
  cash_added_vnd bigint NOT NULL,
  refund_xu integer NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_demo_reset_100m_log_refund CHECK (refund_xu >= 0)
);
CREATE INDEX IF NOT EXISTS ix_demo_reset_100m_log_user ON demo_reset_100m_log (user_id);

-- 4. No Demo cash or xu move while the conversion runs (same lock as the 0034 backfill).
LOCK TABLE virtual_trading_accounts IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE coin_wallets IN SHARE ROW EXCLUSIVE MODE;

-- 5. Guard: never leave an account with negative cash. Report and stop instead.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(a.id::text, ', ' ORDER BY a.id::text)
    INTO bad
    FROM virtual_trading_accounts a
   WHERE NOT EXISTS (SELECT 1 FROM demo_reset_100m_log l WHERE l.account_id = a.id)
     AND a.cash_available_vnd + (100000000 - a.net_deposited_cash_vnd) < 0;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'demo_reset_100m: cash_available_vnd would become negative for accounts: %', bad;
  END IF;
END $$;

-- 6. Wallet rows for the users who get xu back (the refund below updates them).
INSERT INTO coin_wallets (user_id)
SELECT a.user_id
  FROM virtual_trading_accounts a
 WHERE NOT EXISTS (SELECT 1 FROM demo_reset_100m_log l WHERE l.account_id = a.id)
   AND a.net_deposited_cash_vnd - a.initial_cash_vnd >= 10000
ON CONFLICT (user_id) DO NOTHING;

-- 7. The conversion, as one statement: log, account, Demo cash history, xu ledger and wallet.
--    The account update sets initial_cash_vnd and net_deposited_cash_vnd together, which is what
--    trigger trg_demo_net_deposited_default (0027) would derive anyway.
WITH targets AS (
  SELECT a.id AS account_id,
         a.user_id,
         a.initial_cash_vnd,
         a.net_deposited_cash_vnd,
         a.cash_available_vnd,
         100000000 - a.net_deposited_cash_vnd AS cash_added,
         (greatest(0, a.net_deposited_cash_vnd - a.initial_cash_vnd) / 10000)::integer AS refund_xu
    FROM virtual_trading_accounts a
   WHERE NOT EXISTS (SELECT 1 FROM demo_reset_100m_log l WHERE l.account_id = a.id)
), logged AS (
  INSERT INTO demo_reset_100m_log
    (account_id, user_id, old_initial_cash_vnd, old_net_deposited_cash_vnd,
     old_cash_available_vnd, cash_added_vnd, refund_xu)
  SELECT t.account_id, t.user_id, t.initial_cash_vnd, t.net_deposited_cash_vnd,
         t.cash_available_vnd, t.cash_added, t.refund_xu
    FROM targets t
  RETURNING account_id
), accounts AS (
  UPDATE virtual_trading_accounts a
     SET initial_cash_vnd = 100000000,
         net_deposited_cash_vnd = 100000000,
         cash_available_vnd = a.cash_available_vnd + t.cash_added,
         updated_at = now()
    FROM targets t
   WHERE a.id = t.account_id
  RETURNING a.id, a.cash_available_vnd
), cash_history AS (
  INSERT INTO virtual_cash_ledger
    (id, account_id, amount_vnd, balance_after_vnd, kind, note, idempotency_key, created_at)
  SELECT gen_random_uuid(), t.account_id, t.cash_added, ac.cash_available_vnd, 'demo_reset_100m',
         'Đưa vốn Demo về 100.000.000 VND (update 19-11)',
         'demo_reset_100m:' || t.account_id::text, now()
    FROM targets t
    JOIN accounts ac ON ac.id = t.account_id
   WHERE t.cash_added <> 0
  RETURNING account_id
), refunds AS (
  INSERT INTO coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
  SELECT t.user_id, w.last_seq + 1, 'demo_exchange_refund', t.refund_xu, w.balance + t.refund_xu,
         'demo_exchange_refund:' || t.user_id::text,
         jsonb_build_object(
           'source', 'migration_0056',
           'account_id', t.account_id,
           'old_initial_cash_vnd', t.initial_cash_vnd,
           'old_net_deposited_cash_vnd', t.net_deposited_cash_vnd
         ),
         'iqx-shop-xu-v2'
    FROM targets t
    JOIN coin_wallets w ON w.user_id = t.user_id
   WHERE t.refund_xu > 0
  RETURNING user_id, seq, balance_after
)
UPDATE coin_wallets w
   SET balance = r.balance_after, last_seq = r.seq, updated_at = now()
  FROM refunds r
 WHERE w.user_id = r.user_id;

-- 8. New Demo accounts and admin resets grant 100.000.000 VND again.
ALTER TABLE virtual_trading_configs ALTER COLUMN initial_cash_vnd SET DEFAULT 100000000;
UPDATE virtual_trading_configs
   SET initial_cash_vnd = 100000000, updated_at = now()
 WHERE initial_cash_vnd <> 100000000;
ALTER TABLE cap0_progress ALTER COLUMN virtual_balance_init SET DEFAULT 100000000;

COMMENT ON TABLE demo_reset_100m_log IS
  'Update 19-11 §8.2: one row per Demo account moved back to 100.000.000 VND (old values, cash added, xu refunded).';
COMMENT ON COLUMN virtual_trading_configs.initial_cash_vnd IS
  'Vốn cấp lại cho tài khoản Demo sau khi admin reset; mặc định 100.000.000 đồng (update 19-11 §8.1).';
COMMENT ON COLUMN cap0_progress.virtual_balance_init IS
  'Vốn mở tài khoản Demo Trading khi vào Cấp 0; 100.000.000 đồng (update 19-11 §8.1).';
COMMENT ON COLUMN virtual_trading_accounts.net_deposited_cash_vnd IS
  'Cột cũ (đổi xu <-> tiền Demo đã bỏ từ update 19-11): luôn 100.000.000 đồng, không còn là mẫu số của % lợi nhuận.';
