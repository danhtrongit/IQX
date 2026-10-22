-- Kinh tế xu v2 (IQX-Flashback-SPEC §1.1-1.3): giá Shop mới, tiến hoá linh thú, Premium mua
-- bằng xu và đổi xu hai chiều với tiền Demo Trading.
-- Idempotent: chỉ thêm bảng/cột/ràng buộc, không xoá và không sửa dữ liệu lịch sử.
-- Lưu ý: hai kind 'flashback_fee'/'flashback_reward' thuộc migration 0028, không khai báo ở đây.

-- 1. Ledger xu: 3 kind -> 8 kind. 'mascot_purchase' còn giữ cho các dòng đã ghi trước đây.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_kind;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_kind CHECK (kind IN (
    'lesson_first_completion', 'mascot_purchase', 'pet_purchase', 'pet_evolve',
    'premium_purchase', 'demo_deposit', 'demo_withdraw', 'adjustment'));

-- Dấu của delta: nhận xu thì dương, chi xu thì âm. Các kind chưa biết (ví dụ của
-- migration 0028) không bị ràng buộc ở đây để hai migration không cạnh tranh nhau.
ALTER TABLE coin_ledger DROP CONSTRAINT IF EXISTS ck_coin_ledger_delta_sign;
ALTER TABLE coin_ledger
  ADD CONSTRAINT ck_coin_ledger_delta_sign CHECK (
    (kind = 'lesson_first_completion' AND delta > 0)
    OR (kind = 'demo_deposit' AND delta > 0)
    OR (kind IN ('mascot_purchase', 'pet_purchase', 'pet_evolve', 'premium_purchase',
                 'demo_withdraw') AND delta < 0)
    OR kind NOT IN ('lesson_first_completion', 'demo_deposit', 'mascot_purchase',
                    'pet_purchase', 'pet_evolve', 'premium_purchase', 'demo_withdraw')
  );

-- 2. Tiến hoá linh thú: mỗi linh thú một cấp riêng (1 = mặc định, chưa tiến hoá).
CREATE TABLE IF NOT EXISTS pet_levels (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pet_id varchar(24) NOT NULL,
  level smallint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_pet_levels PRIMARY KEY (user_id, pet_id),
  CONSTRAINT ck_pet_levels_level CHECK (level BETWEEN 1 AND 3),
  CONSTRAINT ck_pet_levels_pet CHECK (
    pet_id IN ('bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy')
  )
);
CREATE INDEX IF NOT EXISTS ix_pet_levels_user ON pet_levels (user_id);

-- 3. Lịch sử đổi xu <-> tiền Demo Trading (mỗi lần đổi một dòng, unique_key chống trùng).
CREATE TABLE IF NOT EXISTS demo_exchange_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction varchar(16) NOT NULL,
  xu_delta integer NOT NULL,
  cash_delta bigint NOT NULL,
  unique_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_demo_exchange_ledger_unique_key UNIQUE (unique_key),
  CONSTRAINT ck_demo_exchange_ledger_direction CHECK (direction IN ('xu_to_cash', 'cash_to_xu')),
  CONSTRAINT ck_demo_exchange_ledger_xu_delta CHECK (xu_delta <> 0),
  CONSTRAINT ck_demo_exchange_ledger_cash_delta CHECK (cash_delta <> 0)
);
CREATE INDEX IF NOT EXISTS ix_demo_exchange_ledger_user_created
  ON demo_exchange_ledger (user_id, created_at DESC);

-- 4. Vốn nạp ròng của tài khoản Demo: tổng tiền đổi từ xu vào - tổng tiền đổi ra xu.
-- % lợi nhuận Demo = (NAV - vốn nạp ròng) / vốn nạp ròng.
ALTER TABLE virtual_trading_accounts
  ADD COLUMN IF NOT EXISTS net_deposited_cash_vnd bigint NOT NULL DEFAULT 0;

-- Tài khoản cũ (cấp vốn 100.000.000đ ngoài kinh tế xu) giữ nguyên % lợi nhuận như trước:
-- vốn nạp ròng = vốn ban đầu. Tài khoản đã từng đổi xu thì để nguyên số đã đổi.
UPDATE virtual_trading_accounts a
   SET net_deposited_cash_vnd = a.initial_cash_vnd
 WHERE a.net_deposited_cash_vnd = 0
   AND a.initial_cash_vnd > 0
   AND NOT EXISTS (select 1 from demo_exchange_ledger e where e.user_id = a.user_id);

-- Vốn cấp ngoài kinh tế xu (tài khoản cũ, admin cấp lại vốn) là vốn nạp ròng của tài khoản.
CREATE OR REPLACE FUNCTION iqx_demo_net_deposited_default() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.net_deposited_cash_vnd = 0 AND NEW.initial_cash_vnd > 0 THEN
      NEW.net_deposited_cash_vnd := NEW.initial_cash_vnd;
    END IF;
  ELSIF NEW.initial_cash_vnd <> OLD.initial_cash_vnd THEN
    NEW.net_deposited_cash_vnd := NEW.initial_cash_vnd;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_demo_net_deposited_default ON virtual_trading_accounts;
CREATE TRIGGER trg_demo_net_deposited_default
  BEFORE INSERT OR UPDATE OF initial_cash_vnd ON virtual_trading_accounts
  FOR EACH ROW EXECUTE FUNCTION iqx_demo_net_deposited_default();

-- 5. Premium mua bằng xu: một dòng cho mỗi lần đổi, unique_key chống đổi trùng.
CREATE TABLE IF NOT EXISTS premium_xu_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES premium_plans(id) ON DELETE SET NULL,
  xu_spent integer NOT NULL,
  days_granted integer NOT NULL,
  unique_key text NOT NULL,
  ledger_id uuid NOT NULL REFERENCES coin_ledger(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_premium_xu_purchases_unique_key UNIQUE (unique_key),
  CONSTRAINT uq_premium_xu_purchases_ledger UNIQUE (ledger_id),
  CONSTRAINT ck_premium_xu_purchases_xu CHECK (xu_spent > 0),
  CONSTRAINT ck_premium_xu_purchases_days CHECK (days_granted > 0)
);
CREATE INDEX IF NOT EXISTS ix_premium_xu_purchases_user_created
  ON premium_xu_purchases (user_id, created_at DESC);

-- 6. Grant Premium mua bằng xu có kind riêng (để không lẫn với grant thanh toán hay admin).
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'billing_entitlement_grants'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ~ '\mkind\M'
  LOOP
    EXECUTE format('ALTER TABLE billing_entitlement_grants DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE billing_entitlement_grants
  ADD COLUMN IF NOT EXISTS team_lead_offer_version_id uuid;
ALTER TABLE billing_entitlement_grants
  ADD CONSTRAINT ck_billing_entitlement_grants_kind CHECK (
    kind IN ('payment', 'admin_confirmed', 'admin_grant', 'trial', 'admin_extension',
             'referral_offer', 'xu_purchase')
  );
ALTER TABLE billing_entitlement_grants
  ADD CONSTRAINT ck_billing_entitlement_grants_referral_offer CHECK (
    (kind = 'referral_offer') = (team_lead_offer_version_id IS NOT NULL)
  );

COMMENT ON TABLE pet_levels IS 'Cấp tiến hoá của từng linh thú (1 = chưa tiến hoá, tối đa 3).';
COMMENT ON TABLE demo_exchange_ledger IS 'Lịch sử đổi xu hai chiều với tiền Demo Trading.';
COMMENT ON COLUMN virtual_trading_accounts.net_deposited_cash_vnd IS
  'Vốn nạp ròng: tổng tiền đổi từ xu vào trừ tổng tiền đổi ra xu; mẫu số của % lợi nhuận Demo.';
COMMENT ON TABLE premium_xu_purchases IS 'Lượt mua Premium bằng xu; unique_key chống đổi trùng.';
