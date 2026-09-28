-- Referral attribution, collaborator hierarchy, and idempotent commission ledger.
DO $$ BEGIN
  CREATE TYPE referral_partner_kind AS ENUM ('lead_sale', 'ctv');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code varchar(32),
  ADD COLUMN IF NOT EXISTS referral_partner_kind referral_partner_kind,
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_lead_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_attributed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_referred_by_user_id ON users(referred_by_user_id);

CREATE TABLE IF NOT EXISTS referral_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES premium_payment_orders(id) ON DELETE RESTRICT,
  refund_id uuid REFERENCES billing_refunds(id) ON DELETE RESTRICT,
  beneficiary_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  commission_type varchar(32) NOT NULL CHECK (commission_type IN ('ctv_direct','lead_management','ctv_direct_reversal','lead_management_reversal')),
  amount_vnd bigint NOT NULL CHECK (amount_vnd <> 0),
  source_amount_vnd bigint NOT NULL CHECK (source_amount_vnd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (refund_id, commission_type)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_commission_order_type ON referral_commission_ledger(order_id, commission_type) WHERE refund_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_referral_commission_beneficiary ON referral_commission_ledger(beneficiary_user_id, created_at DESC);
