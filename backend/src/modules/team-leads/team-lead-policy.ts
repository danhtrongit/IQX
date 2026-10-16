import type { SqlClient } from '../../platform/database/index.js';
import { isValidUsername } from '../auth/user-identity.js';

/**
 * Admin spec v1.1 §3: team-lead policy reads shared by registration, billing and the
 * team-lead modules. Plain functions over a SQL client so they run inside the caller's
 * transaction.
 */

export type TeamLeadOfferType = 'none' | 'days' | 'lifetime';

export interface TeamLeadPolicyRow extends Record<string, unknown> {
  id: string;
  lead_user_id: string;
  commission_pct: number;
  offer_type: TeamLeadOfferType;
  offer_days: number | null;
  offer_version_id: string;
}

/** The current policy is the newest row (§3.1); the trigger in 0024 owns offer_version_id. */
export const CURRENT_POLICY_ORDER = 'effective_from desc, created_at desc, id desc';

/**
 * §3.3-4 / DECISION 2: commission snapshot for the order in $1, taken in the same UPDATE that
 * marks it paid. Empty when the buyer has no group or the lead profile is not active, so both
 * team_lead_id and commission_pct stay NULL (ck_premium_payment_orders_team_lead_snapshot).
 * Usage: `${ORDER_TEAM_LEAD_SNAPSHOT_CTE} update premium_payment_orders set ...,
 * ${ORDER_TEAM_LEAD_SNAPSHOT_ASSIGNMENTS} where id = $1 ...`.
 */
export const ORDER_TEAM_LEAD_SNAPSHOT_CTE = `with team_lead_snapshot as (
         select p.user_id as team_lead_id, pol.commission_pct
           from premium_payment_orders paid_order
           join users member on member.id = paid_order.user_id
           join team_lead_profiles p on p.user_id = member.group_lead_id and p.status = 'active'
           cross join lateral (
             select commission_pct from team_lead_policies
              where lead_user_id = p.user_id
              order by ${CURRENT_POLICY_ORDER} limit 1
           ) pol
          where paid_order.id = $1
       )`;
export const ORDER_TEAM_LEAD_SNAPSHOT_ASSIGNMENTS = `team_lead_id = (select team_lead_id from team_lead_snapshot),
                commission_pct = (select commission_pct from team_lead_snapshot)`;

export async function currentTeamLeadPolicy(
  client: SqlClient,
  leadUserId: string,
): Promise<TeamLeadPolicyRow | null> {
  const [policy] = await client.query<TeamLeadPolicyRow>(
    `select id, lead_user_id, commission_pct, offer_type, offer_days, offer_version_id
       from team_lead_policies where lead_user_id = $1
      order by ${CURRENT_POLICY_ORDER} limit 1`,
    [leadUserId],
  );
  return policy ?? null;
}

export type ResolvedReferralCode = {
  leadUserId: string;
  policy: TeamLeadPolicyRow;
  /** True when a legacy LS_/CTV_ code was mapped to its converted team lead. */
  legacy: boolean;
};

/**
 * §3.1: a referral code is the username of an active team lead. Matching is
 * case-insensitive. With `lock`, the lead profile is held FOR SHARE until the caller's
 * transaction ends, so a concurrent revoke or policy change cannot interleave with the join.
 */
export async function resolveReferralCode(
  client: SqlClient,
  rawCode: string,
  options: { lock: boolean },
): Promise<ResolvedReferralCode | null> {
  const code = rawCode.trim();
  const username = code.toLowerCase();
  if (isValidUsername(username)) {
    const [lead] = await client.query<{ user_id: string }>(
      `select p.user_id
         from users u
         join team_lead_profiles p on p.user_id = u.id
        where lower(u.username) = $1 and p.status = 'active'
          and u.role = 'team_lead' and u.status = 'active' and u.deleted_at is null
        limit 1${options.lock ? ' for share of p' : ''}`,
      [username],
    );
    if (lead) {
      const policy = await currentTeamLeadPolicy(client, lead.user_id);
      if (policy) return { leadUserId: lead.user_id, policy, legacy: false };
    }
  }
  return resolveLegacyReferralCode(client, code, options);
}

/**
 * DECISION 5 hook: legacy LS_/CTV_ codes are mapped to the team lead they were converted to
 * until LEGACY_REFERRAL_CODE_UNTIL. The conversion migration and that window ship in a later
 * stage; until then no legacy code resolves.
 */
export async function resolveLegacyReferralCode(
  _client: SqlClient,
  _code: string,
  _options: { lock: boolean },
): Promise<ResolvedReferralCode | null> {
  return null;
}
