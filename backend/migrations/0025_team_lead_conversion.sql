-- Admin spec v1.1 §3.6 [DECISION 5]: convert the existing Lead sale / CTV partners into team
-- leads. Runs after 0022 (team_lead enum value, committed in its own transaction), 0023
-- (usernames, which become the new codes) and 0024 (team-lead tables).
--
-- * Partners kept: referral_partner_kind set, status 'active', not deleted, not admin and
--   without any team_lead_profiles row yet. Each gets an active profile (appointed_by NULL),
--   a first policy (CTV 40%, Lead sale 10%, offer none, reason 'v1.1 conversion'), role
--   team_lead, username_change_allowed=false (their username is now their code) and one
--   team_lead.appoint audit row with actor_role 'system'.
-- * Partners skipped (inactive/suspended, deleted, admin, already a team lead) are listed with
--   RAISE NOTICE for a manual check.
-- * Users the converted partner referred (users.referred_by_user_id, set only before v1.1)
--   join that lead's group (join_via 'code', joined at referral_attributed_at) with a
--   join_code history row (actor_role 'system'). Users already in a group, deleted users,
--   admins and team leads are left alone.
-- * The legacy columns (referral_code, referral_partner_kind, referred_by_user_id,
--   referral_lead_user_id) are kept: history, and LS_/CTV_ codes still register into the
--   converted lead's group until LEGACY_REFERRAL_CODE_UNTIL (backend config).
--
-- Re-running the body is harmless: converted partners already have a profile and are
-- skipped, and only users without a group are attached.
DO $$
DECLARE
  partner record;
  converted_count integer := 0;
  joined_count integer := 0;
BEGIN
  FOR partner IN
    SELECT u.id, u.username, u.email, u.referral_partner_kind, u.role, u.status, u.deleted_at,
           p.status AS profile_status
      FROM users u
      LEFT JOIN team_lead_profiles p ON p.user_id = u.id
     WHERE u.referral_partner_kind IS NOT NULL
       AND (u.status <> 'active' OR u.deleted_at IS NOT NULL OR u.role = 'admin'
            OR p.user_id IS NOT NULL)
     ORDER BY u.created_at, u.id
  LOOP
    RAISE NOTICE 'v1.1 conversion: skipped % partner % (%, id %): %',
      partner.referral_partner_kind, partner.username, partner.email, partner.id,
      CASE
        WHEN partner.profile_status IS NOT NULL
          THEN format('already has a %s team lead profile', partner.profile_status)
        WHEN partner.deleted_at IS NOT NULL THEN 'deleted'
        WHEN partner.role = 'admin' THEN 'admin'
        ELSE format('status %s', partner.status)
      END;
  END LOOP;

  DROP TABLE IF EXISTS pg_temp.team_lead_conversion;
  CREATE TEMP TABLE team_lead_conversion ON COMMIT DROP AS
    SELECT u.id AS user_id, u.username, u.role AS previous_role,
           u.group_lead_id AS previous_group_lead_id,
           CASE u.referral_partner_kind WHEN 'ctv' THEN 40 ELSE 10 END::smallint AS commission_pct,
           u.referral_partner_kind::text AS partner_kind
      FROM users u
     WHERE u.referral_partner_kind IS NOT NULL
       AND u.status = 'active'
       AND u.deleted_at IS NULL
       AND u.role <> 'admin'
       AND NOT EXISTS (SELECT 1 FROM team_lead_profiles p WHERE p.user_id = u.id);

  -- A team lead is never a member of a group (no group existed before v1.1, but stay safe).
  INSERT INTO group_membership_history
    (user_id, lead_user_id, action, actor_user_id, actor_role, reason)
  SELECT c.user_id, c.previous_group_lead_id, 'move_out', NULL, 'system', 'v1.1 conversion'
    FROM team_lead_conversion c
   WHERE c.previous_group_lead_id IS NOT NULL;

  INSERT INTO team_lead_profiles (user_id, status, appointed_at, appointed_by)
  SELECT c.user_id, 'active', now(), NULL FROM team_lead_conversion c;

  -- The BEFORE INSERT trigger from 0024 assigns offer_version_id.
  INSERT INTO team_lead_policies
    (lead_user_id, commission_pct, offer_type, offer_days, created_by, reason)
  SELECT c.user_id, c.commission_pct, 'none', NULL, NULL, 'v1.1 conversion'
    FROM team_lead_conversion c;

  UPDATE users u
     SET role = 'team_lead', username_change_allowed = false,
         group_lead_id = NULL, group_joined_at = NULL, group_join_via = NULL, updated_at = now()
    FROM team_lead_conversion c
   WHERE u.id = c.user_id;

  INSERT INTO admin_audit_log
    (admin_user_id, actor_role, action, target_entity, target_id, payload_before, payload_after,
     note)
  SELECT NULL, 'system', 'team_lead.appoint', 'team_lead', c.user_id::text,
         jsonb_build_object(
           'role', c.previous_role,
           'team_lead_status', NULL,
           'group_lead_id', c.previous_group_lead_id,
           'referral_partner_kind', c.partner_kind
         ),
         jsonb_build_object(
           'role', 'team_lead',
           'team_lead_status', 'active',
           'code', c.username,
           'group_lead_id', NULL,
           'policy_id', pol.id,
           'offer_version_id', pol.offer_version_id,
           'commission_pct', pol.commission_pct,
           'offer_type', pol.offer_type,
           'offer_days', pol.offer_days
         ),
         'v1.1 conversion'
    FROM team_lead_conversion c
    JOIN team_lead_policies pol ON pol.lead_user_id = c.user_id;

  GET DIAGNOSTICS converted_count = ROW_COUNT;

  -- Referred users join the group of the partner who referred them. Admins and team leads
  -- (including partners converted just above) never become members.
  WITH joined AS (
    UPDATE users m
       SET group_lead_id = c.user_id,
           group_joined_at = coalesce(m.referral_attributed_at, m.created_at),
           group_join_via = 'code',
           updated_at = now()
      FROM team_lead_conversion c
     WHERE m.referred_by_user_id = c.user_id
       AND m.id <> c.user_id
       AND m.group_lead_id IS NULL
       AND m.deleted_at IS NULL
       AND m.role NOT IN ('admin', 'team_lead')
    RETURNING m.id, m.group_lead_id, m.group_joined_at
  )
  INSERT INTO group_membership_history
    (user_id, lead_user_id, action, actor_user_id, actor_role, reason, created_at)
  SELECT j.id, j.group_lead_id, 'join_code', NULL, 'system', 'v1.1 conversion', j.group_joined_at
    FROM joined j;

  GET DIAGNOSTICS joined_count = ROW_COUNT;

  RAISE NOTICE 'v1.1 conversion: % partner(s) converted to team leads, % referred user(s) joined their group',
    converted_count, joined_count;
END $$;
