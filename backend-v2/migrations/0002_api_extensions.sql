-- Application extensions required by the full v2 API surface. This migration
-- is intentionally additive and is applied only by the guarded v2 runner.
ALTER TYPE payment_order_status ADD VALUE IF NOT EXISTS 'partially_refunded';

ALTER TABLE premium_payment_orders
  ADD COLUMN IF NOT EXISTS plan_code_snapshot varchar(50),
  ADD COLUMN IF NOT EXISTS plan_name_snapshot varchar(200),
  ADD COLUMN IF NOT EXISTS duration_days_snapshot integer,
  ADD COLUMN IF NOT EXISTS refunded_amount_vnd bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grant_type varchar(40),
  ADD COLUMN IF NOT EXISTS granted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grant_note text,
  ADD COLUMN IF NOT EXISTS raw_ipn jsonb;

CREATE TABLE IF NOT EXISTS billing_entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES premium_plans(id) ON DELETE SET NULL,
  order_id uuid REFERENCES premium_payment_orders(id) ON DELETE SET NULL,
  kind varchar(40) NOT NULL CHECK (kind IN ('payment','admin_confirmed','admin_grant','trial','admin_extension')),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  original_ends_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  granted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at),
  CHECK (original_ends_at >= starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_grant_order ON billing_entitlement_grants(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_billing_grants_user_status_end ON billing_entitlement_grants(user_id, status, ends_at DESC);

CREATE TABLE IF NOT EXISTS billing_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES premium_payment_orders(id) ON DELETE RESTRICT,
  amount_vnd bigint NOT NULL CHECK (amount_vnd > 0),
  reason varchar(1000) NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_billing_refunds_order ON billing_refunds(order_id, created_at DESC);

ALTER TABLE sepay_ipn_logs ADD COLUMN IF NOT EXISTS retried_from_log_id uuid REFERENCES sepay_ipn_logs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS billing_subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES premium_plans(id) ON DELETE SET NULL,
  event_type varchar(40) NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason varchar(1000),
  days_delta integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_billing_subscription_history_user_created ON billing_subscription_history(user_id, created_at DESC);

ALTER TABLE analysis_history
  ADD COLUMN IF NOT EXISTS generation_status varchar(20) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS generation_error text;

CREATE TABLE IF NOT EXISTS market_report_input_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type varchar(16) NOT NULL,
  session_date date NOT NULL,
  payload jsonb NOT NULL,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  complete boolean NOT NULL DEFAULT false,
  UNIQUE (report_type, session_date, captured_at)
);
CREATE INDEX IF NOT EXISTS ix_market_report_inputs_type_date ON market_report_input_snapshots(report_type, session_date DESC);
