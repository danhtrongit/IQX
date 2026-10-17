import type { SqlClient } from '../../platform/database/index.js';
import {
  LIFETIME_ENDS_AT,
  hasActiveLifetimeGrant,
  lockEntitlementUser,
  refreshSubscriptionState,
} from '../billing/entitlement-state.js';
import type { TeamLeadPolicyRow } from './team-lead-policy.js';

/** Where the offer came from; recorded in the audit payload. */
export type ReferralOfferSource = 'register' | 'admin_add' | 'admin_move';

export type ReferralOfferGrant = {
  grant_id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  offer_type: 'days' | 'lifetime';
  offer_days: number | null;
};

/**
 * Admin spec v1.1 §3.3-3: grant a team lead's free-Premium offer to a member.
 *
 * - Stacks after the member's current grants like any other grant. A `days` offer lasts
 *   offer_days; a `lifetime` offer ends at LIFETIME_ENDS_AT. duration_days must be positive,
 *   so a lifetime grant stores its real day count.
 * - DECISION 3: at most one grant per (user, offer version), enforced by
 *   uq_billing_entitlement_grants_referral_offer; a repeat is a no-op that returns null.
 * - Nothing is granted when the policy has no offer, or when the member already holds an
 *   active lifetime grant (anything stacked after it would only start in year 9999).
 * - Not revenue and never commissionable: there is no order behind it.
 * - Writes one `system.referral_offer_grant` audit row (actor_role 'system').
 *
 * Must run inside the caller's transaction.
 */
export async function createReferralOfferGrant(
  client: SqlClient,
  input: {
    userId: string;
    leadUserId: string;
    policy: TeamLeadPolicyRow;
    source: ReferralOfferSource;
    /** Admin who added or moved the member; null for registration by code. */
    triggeredByUserId?: string | null;
  },
): Promise<ReferralOfferGrant | null> {
  const { policy } = input;
  if (policy.offer_type === 'none') return null;
  const lifetime = policy.offer_type === 'lifetime';
  if (!lifetime && !policy.offer_days) return null;
  await lockEntitlementUser(client, input.userId);
  if (await hasActiveLifetimeGrant(client, input.userId)) return null;
  const [plan] = await client.query<{ id: string }>(
    `select id from premium_plans where code = 'REFERRAL_OFFER' limit 1`,
  );
  if (!plan) throw new Error('REFERRAL_OFFER plan is missing (migration 0024 seeds it)');
  const [grant] = await client.query<{
    id: string;
    starts_at: Date | string;
    ends_at: Date | string;
  }>(
    `with boundary as (
       select greatest(now(), coalesce(max(ends_at), now())) as starts_at
         from billing_entitlement_grants
        where user_id = $1 and status = 'active' and ends_at > now()
     ), span as (
       select starts_at,
              case when $4::boolean then $5::timestamptz
                   else starts_at + make_interval(days => $3::integer) end as ends_at
         from boundary
     )
     insert into billing_entitlement_grants
       (user_id, plan_id, order_id, kind, duration_days, starts_at, ends_at, original_ends_at,
        granted_by_user_id, note, status, team_lead_policy_id, team_lead_offer_version_id)
     select $1, $2, null, 'referral_offer',
            case when $4::boolean
                 then greatest(1, ceil(extract(epoch from (ends_at - starts_at)) / 86400))::integer
                 else $3::integer end,
            starts_at, ends_at, ends_at, null, $6, 'active', $7, $8
       from span
     on conflict (user_id, team_lead_offer_version_id) where kind = 'referral_offer' do nothing
     returning id, starts_at, ends_at`,
    [
      input.userId,
      plan.id,
      policy.offer_days ?? 1,
      lifetime,
      LIFETIME_ENDS_AT,
      'team lead referral offer',
      policy.id,
      policy.offer_version_id,
    ],
  );
  if (!grant) return null;
  await refreshSubscriptionState(client, input.userId, plan.id);
  const result: ReferralOfferGrant = {
    grant_id: grant.id,
    starts_at: grant.starts_at,
    ends_at: grant.ends_at,
    offer_type: lifetime ? 'lifetime' : 'days',
    offer_days: lifetime ? null : policy.offer_days,
  };
  await client.query(
    `insert into admin_audit_log
       (admin_user_id, actor_role, action, target_entity, target_id, payload_before,
        payload_after, note)
     values (null, 'system', 'system.referral_offer_grant', 'user', $1, null, $2::jsonb, null)`,
    [
      input.userId,
      JSON.stringify({
        ...result,
        lead_user_id: input.leadUserId,
        team_lead_policy_id: policy.id,
        team_lead_offer_version_id: policy.offer_version_id,
        source: input.source,
        triggered_by_user_id: input.triggeredByUserId ?? null,
      }),
    ],
  );
  return result;
}
