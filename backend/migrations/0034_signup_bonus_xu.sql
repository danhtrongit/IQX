-- Thưởng 1000 xu cho tài khoản mới đăng ký (kind 'signup_bonus', delta > 0).
-- Idempotent: chỉ khai báo lại ràng buộc kind/sign, không sửa dữ liệu lịch sử.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_kind;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (
    'lesson_first_completion', 'mascot_purchase', 'pet_purchase', 'pet_evolve',
    'premium_purchase', 'demo_deposit', 'demo_withdraw', 'adjustment',
    'flashback_fee', 'flashback_reward',
    'flashback_stake', 'flashback_win', 'flashback_refund',
    'signup_bonus'));

ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_delta_sign;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_delta_sign CHECK (
    (kind IN ('lesson_first_completion', 'signup_bonus') AND delta > 0)
    OR (kind = 'demo_deposit' AND delta > 0)
    OR (kind IN ('mascot_purchase', 'pet_purchase', 'pet_evolve', 'premium_purchase',
                 'demo_withdraw') AND delta < 0)
    OR (kind = 'flashback_stake' AND delta < 0)
    OR (kind IN ('flashback_win', 'flashback_refund') AND delta > 0)
    OR kind NOT IN ('lesson_first_completion', 'signup_bonus', 'demo_deposit', 'mascot_purchase',
                    'pet_purchase', 'pet_evolve', 'premium_purchase', 'demo_withdraw',
                    'flashback_stake', 'flashback_win', 'flashback_refund')
  );

-- Backfill: mọi tài khoản hiện có (chưa xoá) nhận 1000 xu một lần.
-- unique_key 'signup_bonus:<user_id>' làm chạy lại an toàn; khoá bảng ví để không đua với
-- giao dịch xu đang chạy trong lúc deploy.
LOCK TABLE coin_wallets IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO coin_wallets (user_id)
SELECT u.id FROM users u
WHERE u.deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

WITH targets AS (
  SELECT w.user_id, w.balance + 1000 AS balance_after, w.last_seq + 1 AS seq
  FROM coin_wallets w
  JOIN users u ON u.id = w.user_id AND u.deleted_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM coin_ledger l WHERE l.unique_key = 'signup_bonus:' || w.user_id::text
  )
), ledger AS (
  INSERT INTO coin_ledger (user_id, seq, kind, delta, balance_after, unique_key, ref, policy_version)
  SELECT t.user_id, t.seq, 'signup_bonus', 1000, t.balance_after,
         'signup_bonus:' || t.user_id::text, '{"source":"backfill"}'::jsonb, 'iqx-shop-xu-v2'
  FROM targets t
  RETURNING user_id, seq, balance_after
)
UPDATE coin_wallets w
SET balance = l.balance_after, last_seq = l.seq, updated_at = now()
FROM ledger l
WHERE w.user_id = l.user_id;
