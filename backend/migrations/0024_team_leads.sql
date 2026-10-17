-- Admin spec v1.1 §3: team leads (Trưởng nhóm), their append-only policies, group membership,
-- order snapshots for commission, the referral-offer grant kind and the audit actor role.
-- Schema only: no account is converted here (the LS/CTV conversion is a later migration).

-- §3.1 Profile. A revoked lead keeps the row (members stay in the group); re-appointing
-- flips it back to active.
CREATE TABLE IF NOT EXISTS team_lead_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'active',
  appointed_at timestamptz NOT NULL DEFAULT now(),
  appointed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_team_lead_profiles_status CHECK (status IN ('active', 'revoked')),
  CONSTRAINT ck_team_lead_profiles_revoked CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_team_lead_profiles_status ON team_lead_profiles (status);

-- §3.1 Policy. Every edit is a new row; the current policy is the newest effective_from.
-- offer_version_id identifies the free-Premium offer itself (DECISION 3): it is copied from
-- the previous policy when (offer_type, offer_days) is unchanged, so a commission-only edit
-- keeps the version and can never re-grant the offer. The trigger below owns the column.
CREATE TABLE IF NOT EXISTS team_lead_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_user_id uuid NOT NULL REFERENCES team_lead_profiles(user_id) ON DELETE CASCADE,
  commission_pct smallint NOT NULL,
  offer_type varchar(16) NOT NULL,
  offer_days smallint,
  offer_version_id uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reason varchar(1000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_team_lead_policies_commission CHECK (commission_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_team_lead_policies_offer_type CHECK (offer_type IN ('none', 'days', 'lifetime')),
  CONSTRAINT ck_team_lead_policies_offer_days CHECK (
    offer_days IS NULL OR offer_days IN (7, 30, 90, 180, 365)
  ),
  CONSTRAINT ck_team_lead_policies_offer_shape CHECK ((offer_type = 'days') = (offer_days IS NOT NULL)),
  CONSTRAINT ck_team_lead_policies_reason CHECK (length(btrim(reason)) > 0)
);
CREATE INDEX IF NOT EXISTS ix_team_lead_policies_lead_effective
  ON team_lead_policies (lead_user_id, effective_from DESC, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION team_lead_policies_assign_offer_version() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previous record;
BEGIN
  SELECT offer_type, offer_days, offer_version_id INTO previous
    FROM team_lead_policies
   WHERE lead_user_id = NEW.lead_user_id
   ORDER BY effective_from DESC, created_at DESC, id DESC
   LIMIT 1;
  IF FOUND
     AND previous.offer_type = NEW.offer_type
     AND previous.offer_days IS NOT DISTINCT FROM NEW.offer_days THEN
    NEW.offer_version_id := previous.offer_version_id;
  ELSE
    NEW.offer_version_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION team_lead_policies_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'team_lead_policies is append-only; insert a new policy row instead'
    USING ERRCODE = 'check_violation';
END $$;

DROP TRIGGER IF EXISTS trg_team_lead_policies_offer_version ON team_lead_policies;
CREATE TRIGGER trg_team_lead_policies_offer_version
  BEFORE INSERT ON team_lead_policies
  FOR EACH ROW EXECUTE FUNCTION team_lead_policies_assign_offer_version();
DROP TRIGGER IF EXISTS trg_team_lead_policies_append_only ON team_lead_policies;
CREATE TRIGGER trg_team_lead_policies_append_only
  BEFORE UPDATE ON team_lead_policies
  FOR EACH ROW EXECUTE FUNCTION team_lead_policies_append_only();

-- §3.1 Current group of a user. Points at the lead profile, so a member can only belong to a
-- (possibly revoked) team lead. A lead is never a member of any group.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS group_lead_id uuid REFERENCES team_lead_profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS group_join_via varchar(8);
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_group_join_via;
ALTER TABLE users
  ADD CONSTRAINT ck_users_group_join_via CHECK (group_join_via IN ('code', 'admin'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_group_membership;
ALTER TABLE users
  ADD CONSTRAINT ck_users_group_membership CHECK (
    group_lead_id IS NULL
    OR (group_lead_id <> id AND group_joined_at IS NOT NULL AND group_join_via IS NOT NULL)
  );
CREATE INDEX IF NOT EXISTS ix_users_group_lead ON users (group_lead_id, group_joined_at DESC)
  WHERE group_lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS group_membership_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action varchar(16) NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role varchar(16) NOT NULL,
  reason varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_group_membership_history_action CHECK (
    action IN ('join_code', 'add_admin', 'move_in', 'move_out', 'remove')
  ),
  CONSTRAINT ck_group_membership_history_actor_role CHECK (
    actor_role IN ('admin', 'team_lead', 'user', 'system')
  )
);
CREATE INDEX IF NOT EXISTS ix_group_membership_history_lead
  ON group_membership_history (lead_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_group_membership_history_user
  ON group_membership_history (user_id, created_at DESC);

-- §3.1/§3.3-4 Commission snapshot taken when an order becomes paid. DECISION 2: both stay NULL
-- when the member has no group or the lead is not active at that moment.
ALTER TABLE premium_payment_orders
  ADD COLUMN IF NOT EXISTS team_lead_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS commission_pct smallint;
ALTER TABLE premium_payment_orders DROP CONSTRAINT IF EXISTS ck_premium_payment_orders_team_lead_snapshot;
ALTER TABLE premium_payment_orders
  ADD CONSTRAINT ck_premium_payment_orders_team_lead_snapshot CHECK (
    (team_lead_id IS NULL) = (commission_pct IS NULL)
    AND (commission_pct IS NULL OR commission_pct BETWEEN 0 AND 100)
  );
CREATE INDEX IF NOT EXISTS ix_premium_payment_orders_team_lead_paid
  ON premium_payment_orders (team_lead_id, paid_at) WHERE team_lead_id IS NOT NULL;

-- §3.5 Who performed an audited action. Existing rows were written by admins, or by the
-- system when no admin is recorded. Writers that do not set it are admin paths.
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS actor_role varchar(16);
UPDATE admin_audit_log
   SET actor_role = CASE WHEN admin_user_id IS NULL THEN 'system' ELSE 'admin' END
 WHERE actor_role IS NULL;
ALTER TABLE admin_audit_log
  ALTER COLUMN actor_role SET DEFAULT 'admin',
  ALTER COLUMN actor_role SET NOT NULL;
ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS ck_admin_audit_log_actor_role;
ALTER TABLE admin_audit_log
  ADD CONSTRAINT ck_admin_audit_log_actor_role CHECK (actor_role IN ('admin', 'team_lead', 'system'));

-- §3.3-3 Free-Premium referral offer grants. The kind CHECK from 0002 is inline and unnamed,
-- so it is located through pg_constraint before being replaced by a named one.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'billing_entitlement_grants'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~ '\mkind\M'
  LOOP
    EXECUTE format('ALTER TABLE billing_entitlement_grants DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE billing_entitlement_grants
  ADD CONSTRAINT ck_billing_entitlement_grants_kind CHECK (
    kind IN ('payment', 'admin_confirmed', 'admin_grant', 'trial', 'admin_extension', 'referral_offer')
  );
ALTER TABLE billing_entitlement_grants
  ADD COLUMN IF NOT EXISTS team_lead_policy_id uuid REFERENCES team_lead_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_lead_offer_version_id uuid;
ALTER TABLE billing_entitlement_grants
  ADD CONSTRAINT ck_billing_entitlement_grants_referral_offer CHECK (
    (kind = 'referral_offer') = (team_lead_offer_version_id IS NOT NULL)
  );
-- DECISION 3: at most one referral-offer grant per (user, offer version), whatever the path
-- (registration by code, admin add or move) and even after the grant is revoked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_entitlement_grants_referral_offer
  ON billing_entitlement_grants (user_id, team_lead_offer_version_id)
  WHERE kind = 'referral_offer';

-- §3.3-4 Ledger types for the single direct team-lead commission and its refund reversal.
-- Legacy types stay valid so old rows and reversals of old orders keep working.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'referral_commission_ledger'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~ '\mcommission_type\M'
  LOOP
    EXECUTE format('ALTER TABLE referral_commission_ledger DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE referral_commission_ledger
  ADD CONSTRAINT ck_referral_commission_ledger_type CHECK (
    commission_type IN (
      'ctv_direct', 'lead_management', 'ctv_direct_reversal', 'lead_management_reversal',
      'team_lead_direct', 'team_lead_direct_reversal'
    )
  );

-- Anchor plan for referral-offer grants. Never sold: inactive and free; each grant carries
-- its own duration.
INSERT INTO premium_plans (code, name, description, price_vnd, duration_days, is_active, sort_order)
VALUES ('REFERRAL_OFFER', 'Ưu đãi giới thiệu',
        'Premium miễn phí theo ưu đãi của trưởng nhóm. Không bán.', 0, 1, false, 999)
ON CONFLICT (code) DO NOTHING;
