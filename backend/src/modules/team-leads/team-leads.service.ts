import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { UserRole, UserStatus } from '../auth/index.js';
import { lockEntitlementUser } from '../billing/entitlement-state.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import { createReferralOfferGrant, type ReferralOfferGrant } from './referral-offer.js';
import {
  CURRENT_POLICY_ORDER,
  currentTeamLeadPolicy,
  type TeamLeadOfferType,
  type TeamLeadPolicyRow,
} from './team-lead-policy.js';
import type {
  TeamLeadAppointInput,
  TeamLeadListQuery,
  TeamLeadLookupQuery,
  TeamLeadMemberAddInput,
  TeamLeadMembersQuery,
  TeamLeadPolicyInput,
} from './team-leads.schemas.js';

type TeamLeadStatus = 'active' | 'revoked';
type GroupJoinVia = 'code' | 'admin';

export type UserSummary = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
};

export type TeamLeadPolicyView = {
  id: string;
  commission_pct: number;
  offer_type: TeamLeadOfferType;
  offer_days: number | null;
  offer_version_id: string;
  effective_from: Date | string;
  reason: string;
  created_by: string | null;
};

export type TeamLeadMetrics = {
  member_count: number;
  revenue_30d_vnd: number;
  commission_30d_vnd: number;
  active_free_premium_count: number;
};

export type TeamLeadHistoryEntry = {
  id: string;
  created_at: Date | string;
  action: string;
  actor_role: string;
  actor: { id: string; username: string | null; full_name: string | null } | null;
  before: unknown;
  after: unknown;
  reason: string | null;
};

export type TeamLeadDetail = {
  user: UserSummary;
  code: string;
  status: TeamLeadStatus;
  accepting_new_users: boolean;
  appointed_at: Date | string;
  appointed_by: string | null;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  policy: TeamLeadPolicyView | null;
  metrics: TeamLeadMetrics;
  history: TeamLeadHistoryEntry[];
};

export type TeamLeadListItem = {
  user: UserSummary;
  code: string;
  status: TeamLeadStatus;
  appointed_at: Date | string;
  revoked_at: Date | string | null;
  member_count: number;
  commission_pct: number | null;
  offer_type: TeamLeadOfferType | null;
  offer_days: number | null;
  revenue_30d_vnd: number;
  commission_30d_vnd: number;
};

export type TeamLeadMember = UserSummary & {
  group_join_via: GroupJoinVia;
  group_joined_at: Date | string;
  created_at: Date | string;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type MemberAddResult = {
  action: 'add' | 'move';
  lead_user_id: string;
  previous_lead_user_id: string | null;
  member: TeamLeadMember;
  offer_grant: ReferralOfferGrant | null;
};

export type MemberRemoveResult = {
  lead_user_id: string;
  user_id: string;
  removed_at: Date | string;
};

export type TeamLeadLookup = {
  user: UserSummary;
  team_lead: { status: TeamLeadStatus; appointed_at: Date | string } | null;
  group: {
    lead_user_id: string;
    lead_username: string;
    lead_full_name: string;
    lead_status: TeamLeadStatus;
    join_via: GroupJoinVia;
    joined_at: Date | string;
  } | null;
  appoint: { eligible: boolean; reason: string | null };
  add_member: { eligible: boolean; reason: string | null; action: 'add' | 'move' | null };
};

type MemberRow = {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  deleted_at: Date | string | null;
  group_lead_id: string | null;
  group_join_via: GroupJoinVia | null;
  group_joined_at: Date | string | null;
  created_at: Date | string;
};

/** Members are current group users that are not deleted (§6, team views exclude deleted). */
const LIVE_MEMBER = `m.deleted_at is null and m.status <> 'deleted'`;

/**
 * 30-day group revenue: orders snapshotted to the lead when they became paid (§6), net of
 * refunds, so a refunded order does not count as revenue.
 */
function revenue30dSql(leadColumn: string): string {
  return `(select coalesce(sum(o.amount_vnd - o.refunded_amount_vnd), 0)
             from premium_payment_orders o
            where o.team_lead_id = ${leadColumn}
              and o.status in ('paid', 'partially_refunded', 'refunded')
              and o.paid_at >= now() - interval '30 days')`;
}

/** 30-day commission: every ledger row credited to the lead, net of refund reversals. */
function commission30dSql(leadColumn: string): string {
  return `(select coalesce(sum(l.amount_vnd), 0)
             from referral_commission_ledger l
            where l.beneficiary_user_id = ${leadColumn}
              and l.created_at >= now() - interval '30 days')`;
}

function memberCountSql(leadColumn: string): string {
  return `(select count(*) from users m where m.group_lead_id = ${leadColumn} and ${LIVE_MEMBER})`;
}

const HISTORY_ACTIONS = [
  'team_lead.appoint',
  'team_lead.policy_update',
  'team_lead.revoke',
  'group.member_add',
  'group.member_move',
  'group.member_remove',
];

function integer(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(parsed))
    throw new RangeError('Database integer exceeds JSON safe range');
  return parsed;
}

function summary(row: {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
}): UserSummary {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    status: row.status,
  };
}

function policyFields(
  policy: Pick<TeamLeadPolicyRow, 'commission_pct' | 'offer_type' | 'offer_days'>,
) {
  return {
    commission_pct: policy.commission_pct,
    offer_type: policy.offer_type,
    offer_days: policy.offer_days,
  };
}

function page<T>(items: T[], total: number, query: { page: number; page_size: number }): Page<T> {
  return {
    items,
    total,
    page: query.page,
    page_size: query.page_size,
    total_pages: total > 0 ? Math.ceil(total / query.page_size) : 0,
  };
}

function teamLeadNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'TEAM_LEAD_NOT_FOUND',
    message: 'Không tìm thấy trưởng nhóm',
  });
}

function userNotFound(): NotFoundException {
  return new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
}

function teamLeadExists(): ConflictException {
  return new ConflictException({
    code: 'TEAM_LEAD_EXISTS',
    message: 'Người dùng này đã là trưởng nhóm',
  });
}

function teamLeadNotActive(): ConflictException {
  return new ConflictException({
    code: 'TEAM_LEAD_NOT_ACTIVE',
    message: 'Trưởng nhóm đã thôi bổ nhiệm',
  });
}

function userNotEligible(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code: 'USER_NOT_ELIGIBLE', message });
}

function targetIsTeamLead(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: 'TARGET_IS_TEAM_LEAD',
    message: 'Trưởng nhóm không thể là thành viên của nhóm nào',
  });
}

/**
 * Admin spec v1.1 §3.2 / §3.4 / §4.2: team leads, their policies and group membership.
 *
 * Lock order (shared with registration and billing): entitlement advisory lock of a user,
 * then that user's row, then a lead profile. Registration holds the lead profile FOR SHARE, so
 * a revoke or policy change serializes with a join by code. Every mutation writes exactly one
 * admin_audit_log row with the caller's actor_role (§3.5, §7.7); a referral-offer grant
 * triggered by an add or move adds its own `system.referral_offer_grant` row as `system`.
 */
@Injectable()
export class TeamLeadsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: TeamLeadListQuery): Promise<Page<TeamLeadListItem>> {
    const conditions = ['true'];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(
        `(u.username ilike $${params.length} or u.email ilike $${params.length} or u.full_name ilike $${params.length})`,
      );
    }
    const where = conditions.join(' and ');
    const [count] = await this.database.query<{ total: string }>(
      `select count(*)::text as total
         from team_lead_profiles p join users u on u.id = p.user_id
        where ${where}`,
      [...params],
    );
    params.push(query.page_size, (query.page - 1) * query.page_size);
    const rows = await this.database.query<
      UserSummary & {
        lead_status: TeamLeadStatus;
        appointed_at: Date | string;
        revoked_at: Date | string | null;
        commission_pct: number | null;
        offer_type: TeamLeadOfferType | null;
        offer_days: number | null;
        member_count: string;
        revenue_30d_vnd: string;
        commission_30d_vnd: string;
      }
    >(
      `select u.id, u.username, u.email, u.full_name, u.role, u.status,
              p.status as lead_status, p.appointed_at, p.revoked_at,
              pol.commission_pct, pol.offer_type, pol.offer_days,
              ${memberCountSql('p.user_id')}::text as member_count,
              ${revenue30dSql('p.user_id')}::text as revenue_30d_vnd,
              ${commission30dSql('p.user_id')}::text as commission_30d_vnd
         from team_lead_profiles p
         join users u on u.id = p.user_id
         left join lateral (
           select commission_pct, offer_type, offer_days from team_lead_policies
            where lead_user_id = p.user_id
            order by ${CURRENT_POLICY_ORDER} limit 1
         ) pol on true
        where ${where}
        order by p.appointed_at desc, p.user_id
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return page(
      rows.map((row) => ({
        user: summary(row),
        code: row.username,
        status: row.lead_status,
        appointed_at: row.appointed_at,
        revoked_at: row.revoked_at,
        member_count: integer(row.member_count),
        commission_pct: row.commission_pct,
        offer_type: row.offer_type,
        offer_days: row.offer_days,
        revenue_30d_vnd: integer(row.revenue_30d_vnd),
        commission_30d_vnd: integer(row.commission_30d_vnd),
      })),
      integer(count?.total),
      query,
    );
  }

  /** Appoint / add-member dialogs: resolve a username or email to a user and its eligibility. */
  async lookup(query: TeamLeadLookupQuery): Promise<TeamLeadLookup> {
    const byEmail = query.q.includes('@');
    const [row] = await this.database.query<
      MemberRow & {
        lead_profile_status: TeamLeadStatus | null;
        lead_profile_appointed_at: Date | string | null;
        group_lead_username: string | null;
        group_lead_full_name: string | null;
        group_lead_status: TeamLeadStatus | null;
      }
    >(
      `select u.id, u.username, u.email, u.full_name, u.role, u.status, u.deleted_at,
              u.group_lead_id, u.group_join_via, u.group_joined_at, u.created_at,
              own.status as lead_profile_status, own.appointed_at as lead_profile_appointed_at,
              gl.username as group_lead_username, gl.full_name as group_lead_full_name,
              gp.status as group_lead_status
         from users u
         left join team_lead_profiles own on own.user_id = u.id
         left join team_lead_profiles gp on gp.user_id = u.group_lead_id
         left join users gl on gl.id = u.group_lead_id
        where ${byEmail ? 'lower(u.email) = lower($1)' : 'lower(u.username) = lower($1)'}
          and u.deleted_at is null and u.status <> 'deleted'
        limit 1`,
      [query.q],
    );
    if (!row) throw userNotFound();
    const isLead = row.role === 'team_lead' || row.lead_profile_status === 'active';
    const appointReason = isLead
      ? 'TEAM_LEAD_EXISTS'
      : row.role === 'admin' || row.status !== 'active'
        ? 'USER_NOT_ELIGIBLE'
        : null;
    const addReason = isLead
      ? 'TARGET_IS_TEAM_LEAD'
      : row.role === 'admin'
        ? 'USER_NOT_ELIGIBLE'
        : query.lead_id && row.group_lead_id === query.lead_id
          ? 'ALREADY_IN_GROUP'
          : null;
    return {
      user: summary(row),
      team_lead:
        row.lead_profile_status && row.lead_profile_appointed_at
          ? { status: row.lead_profile_status, appointed_at: row.lead_profile_appointed_at }
          : null,
      group:
        row.group_lead_id && row.group_join_via && row.group_joined_at
          ? {
              lead_user_id: row.group_lead_id,
              lead_username: row.group_lead_username ?? '',
              lead_full_name: row.group_lead_full_name ?? '',
              lead_status: row.group_lead_status ?? 'revoked',
              join_via: row.group_join_via,
              joined_at: row.group_joined_at,
            }
          : null,
      appoint: { eligible: appointReason === null, reason: appointReason },
      add_member: {
        eligible: addReason === null,
        reason: addReason,
        action: addReason === null ? (row.group_lead_id ? 'move' : 'add') : null,
      },
    };
  }

  async detail(leadId: string): Promise<TeamLeadDetail> {
    const [row] = await this.database.query<
      UserSummary & {
        deleted_at: Date | string | null;
        lead_status: TeamLeadStatus;
        appointed_at: Date | string;
        appointed_by: string | null;
        revoked_at: Date | string | null;
        revoked_by: string | null;
        member_count: string;
        revenue_30d_vnd: string;
        commission_30d_vnd: string;
        active_free_premium_count: string;
      }
    >(
      `select u.id, u.username, u.email, u.full_name, u.role, u.status, u.deleted_at,
              p.status as lead_status, p.appointed_at, p.appointed_by, p.revoked_at, p.revoked_by,
              ${memberCountSql('p.user_id')}::text as member_count,
              ${revenue30dSql('p.user_id')}::text as revenue_30d_vnd,
              ${commission30dSql('p.user_id')}::text as commission_30d_vnd,
              (select count(*) from users m
                where m.group_lead_id = p.user_id and ${LIVE_MEMBER}
                  and exists (
                    select 1 from billing_entitlement_grants g
                     where g.user_id = m.id and g.kind = 'referral_offer' and g.status = 'active'
                       and g.starts_at <= now() and now() < g.ends_at
                  ))::text as active_free_premium_count
         from team_lead_profiles p
         join users u on u.id = p.user_id
        where p.user_id = $1`,
      [leadId],
    );
    if (!row) throw teamLeadNotFound();
    const [policy] = await this.database.query<TeamLeadPolicyView & Record<string, unknown>>(
      `select id, commission_pct, offer_type, offer_days, offer_version_id, effective_from,
              reason, created_by
         from team_lead_policies where lead_user_id = $1
        order by ${CURRENT_POLICY_ORDER} limit 1`,
      [leadId],
    );
    const history = await this.database.query<
      Record<string, unknown> & {
        id: string;
        created_at: Date | string;
        action: string;
        actor_role: string;
        actor_id: string | null;
        actor_username: string | null;
        actor_full_name: string | null;
        payload_before: unknown;
        payload_after: unknown;
        note: string | null;
      }
    >(
      `select a.id, a.created_at, a.action, a.actor_role, a.admin_user_id as actor_id,
              actor.username as actor_username, actor.full_name as actor_full_name,
              a.payload_before, a.payload_after, a.note
         from admin_audit_log a
         left join users actor on actor.id = a.admin_user_id
        where a.target_entity = 'team_lead' and a.target_id = $1 and a.action = any($2::text[])
        order by a.created_at desc, a.id desc
        limit 100`,
      [leadId, HISTORY_ACTIONS],
    );
    const status = row.lead_status;
    return {
      user: summary(row),
      code: row.username,
      status,
      accepting_new_users:
        status === 'active' &&
        row.role === 'team_lead' &&
        row.status === 'active' &&
        row.deleted_at === null,
      appointed_at: row.appointed_at,
      appointed_by: row.appointed_by,
      revoked_at: row.revoked_at,
      revoked_by: row.revoked_by,
      policy: policy
        ? {
            id: policy.id,
            commission_pct: policy.commission_pct,
            offer_type: policy.offer_type,
            offer_days: policy.offer_days,
            offer_version_id: policy.offer_version_id,
            effective_from: policy.effective_from,
            reason: policy.reason,
            created_by: policy.created_by,
          }
        : null,
      metrics: {
        member_count: integer(row.member_count),
        revenue_30d_vnd: integer(row.revenue_30d_vnd),
        commission_30d_vnd: integer(row.commission_30d_vnd),
        active_free_premium_count: integer(row.active_free_premium_count),
      },
      history: history.map((entry) => ({
        id: entry.id,
        created_at: entry.created_at,
        action: entry.action,
        actor_role: entry.actor_role,
        actor: entry.actor_id
          ? {
              id: entry.actor_id,
              username: entry.actor_username,
              full_name: entry.actor_full_name,
            }
          : null,
        before: entry.payload_before,
        after: entry.payload_after,
        reason: entry.note,
      })),
    };
  }

  /**
   * §3.2 Bổ nhiệm: an active, non-admin user who is not already a lead becomes `team_lead` with
   * a profile and a first policy; the code (username) works at once. A user who was a member
   * of another group leaves it (`move_out`), since a lead is never a member. A revoked lead is
   * re-appointed on the same profile. The username is locked because it is the code.
   */
  async appoint(input: TeamLeadAppointInput, audit: AuditContext): Promise<TeamLeadDetail> {
    const leadId = input.user_id;
    await this.database.transaction(async (tx) => {
      const user = await this.lockUser(tx, leadId);
      if (!user) throw userNotFound();
      const [profile] = await tx.query<{ status: TeamLeadStatus }>(
        'select status from team_lead_profiles where user_id = $1 for update',
        [leadId],
      );
      if (user.role === 'team_lead' || profile?.status === 'active') throw teamLeadExists();
      if (user.role === 'admin')
        throw userNotEligible('Quản trị viên không thể được bổ nhiệm làm trưởng nhóm');
      if (user.status !== 'active')
        throw userNotEligible('Chỉ tài khoản đang hoạt động mới được bổ nhiệm');

      const previousLeadId = user.group_lead_id;
      if (previousLeadId) {
        await this.insertHistory(tx, leadId, previousLeadId, 'move_out', audit, input.reason);
        await tx.query(
          `update users set group_lead_id = null, group_joined_at = null, group_join_via = null,
                  updated_at = now()
            where id = $1`,
          [leadId],
        );
      }
      await tx.query(
        `insert into team_lead_profiles (user_id, status, appointed_at, appointed_by)
         values ($1, 'active', now(), $2)
         on conflict (user_id) do update set
           status = 'active', appointed_at = now(), appointed_by = excluded.appointed_by,
           revoked_at = null, revoked_by = null, updated_at = now()`,
        [leadId, audit.adminId],
      );
      const policy = await this.insertPolicy(tx, leadId, input, audit);
      await tx.query(
        `update users set role = 'team_lead', username_change_allowed = false, updated_at = now()
          where id = $1`,
        [leadId],
      );
      await recordAudit(tx, audit, {
        action: 'team_lead.appoint',
        targetEntity: 'team_lead',
        targetId: leadId,
        before: {
          role: user.role,
          team_lead_status: profile?.status ?? null,
          group_lead_id: previousLeadId,
        },
        after: {
          role: 'team_lead',
          team_lead_status: 'active',
          code: user.username,
          group_lead_id: null,
          policy_id: policy.id,
          offer_version_id: policy.offer_version_id,
          ...policyFields(policy),
        },
        note: input.reason,
      });
    });
    return this.detail(leadId);
  }

  /** §3.2 Sửa chính sách: a new append-only policy row; 422 POLICY_UNCHANGED for a no-op. */
  async updatePolicy(
    leadId: string,
    input: TeamLeadPolicyInput,
    audit: AuditContext,
  ): Promise<TeamLeadDetail> {
    await this.database.transaction(async (tx) => {
      await this.lockActiveProfile(tx, leadId);
      const current = await currentTeamLeadPolicy(tx, leadId);
      const next = {
        commission_pct: input.commission_pct,
        offer_type: input.offer_type,
        offer_days: input.offer_type === 'days' ? (input.offer_days ?? null) : null,
      };
      if (
        current &&
        current.commission_pct === next.commission_pct &&
        current.offer_type === next.offer_type &&
        (current.offer_days ?? null) === next.offer_days
      ) {
        throw new UnprocessableEntityException({
          code: 'POLICY_UNCHANGED',
          message: 'Chính sách mới không khác chính sách hiện hành',
        });
      }
      const policy = await this.insertPolicy(tx, leadId, input, audit);
      await recordAudit(tx, audit, {
        action: 'team_lead.policy_update',
        targetEntity: 'team_lead',
        targetId: leadId,
        before: current
          ? {
              policy_id: current.id,
              offer_version_id: current.offer_version_id,
              ...policyFields(current),
            }
          : null,
        after: {
          policy_id: policy.id,
          offer_version_id: policy.offer_version_id,
          ...policyFields(policy),
        },
        note: input.reason,
      });
    });
    return this.detail(leadId);
  }

  /**
   * §3.2 Thôi bổ nhiệm: the code stops accepting new users, members stay in the group with the
   * offers they already hold, the role falls back to premium (a grant covers now) or user, and
   * every refresh token is revoked, which ends the lead's sessions everywhere.
   */
  async revoke(leadId: string, reason: string, audit: AuditContext): Promise<TeamLeadDetail> {
    await this.database.transaction(async (tx) => {
      await lockEntitlementUser(tx, leadId);
      const user = await this.lockUser(tx, leadId);
      if (!user) throw teamLeadNotFound();
      await this.lockActiveProfile(tx, leadId);
      await tx.query(
        `update team_lead_profiles
            set status = 'revoked', revoked_at = now(), revoked_by = $2, updated_at = now()
          where user_id = $1`,
        [leadId, audit.adminId],
      );
      const [updated] = await tx.query<{ role: UserRole }>(
        `update users set role = case when exists (
                   select 1 from billing_entitlement_grants g
                    where g.user_id = users.id and g.status = 'active'
                      and g.starts_at <= now() and now() < g.ends_at
                 ) then 'premium'::user_role else 'user'::user_role end,
                updated_at = now()
          where id = $1 and role = 'team_lead'
          returning role`,
        [leadId],
      );
      const tokens = await tx.query<{ id: string }>(
        `update refresh_tokens set revoked = true where user_id = $1 and revoked = false
         returning id`,
        [leadId],
      );
      await recordAudit(tx, audit, {
        action: 'team_lead.revoke',
        targetEntity: 'team_lead',
        targetId: leadId,
        before: { team_lead_status: 'active', role: user.role },
        after: {
          team_lead_status: 'revoked',
          role: updated?.role ?? user.role,
          revoked_refresh_tokens: tokens.length,
        },
        note: reason,
      });
    });
    return this.detail(leadId);
  }

  async members(leadId: string, query: TeamLeadMembersQuery): Promise<Page<TeamLeadMember>> {
    await this.requireProfile(this.database, leadId);
    const conditions = ['m.group_lead_id = $1', LIVE_MEMBER];
    const params: unknown[] = [leadId];
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(
        `(m.username ilike $${params.length} or m.email ilike $${params.length} or m.full_name ilike $${params.length})`,
      );
    }
    const where = conditions.join(' and ');
    const [count] = await this.database.query<{ total: string }>(
      `select count(*)::text as total from users m where ${where}`,
      [...params],
    );
    params.push(query.page_size, (query.page - 1) * query.page_size);
    const rows = await this.database.query<MemberRow>(
      `select m.id, m.username, m.email, m.full_name, m.role, m.status, m.deleted_at,
              m.group_lead_id, m.group_join_via, m.group_joined_at, m.created_at
         from users m where ${where}
        order by m.group_joined_at desc, m.id
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return page(
      rows.map((row) => toMember(row)),
      integer(count?.total),
      query,
    );
  }

  /**
   * §3.4 Thêm vào nhóm / Chuyển nhóm by an admin. A user outside any group joins
   * (`add_admin`); a member of another group moves (`move_out` + `move_in`). DECISION 3: the
   * group's current free-Premium offer is granted once per offer version.
   */
  async addMember(
    leadId: string,
    input: TeamLeadMemberAddInput,
    audit: AuditContext,
  ): Promise<MemberAddResult> {
    const userId = input.user_id;
    return this.database.transaction(async (tx) => {
      await this.requireProfile(tx, leadId);
      if (userId === leadId) throw targetIsTeamLead();
      await lockEntitlementUser(tx, userId);
      const user = await this.lockUser(tx, userId);
      if (!user) throw userNotFound();
      const [ownProfile] = await tx.query<{ status: TeamLeadStatus }>(
        'select status from team_lead_profiles where user_id = $1',
        [userId],
      );
      if (user.role === 'team_lead' || ownProfile?.status === 'active') throw targetIsTeamLead();
      if (user.role === 'admin')
        throw userNotEligible('Quản trị viên không thể là thành viên của nhóm');
      await this.lockActiveProfile(tx, leadId, 'share');
      if (user.group_lead_id === leadId) {
        throw new ConflictException({
          code: 'ALREADY_IN_GROUP',
          message: 'Người dùng đã ở trong nhóm này',
        });
      }
      const previousLeadId = user.group_lead_id;
      const action = previousLeadId ? 'move' : 'add';
      if (previousLeadId) {
        await this.insertHistory(tx, userId, previousLeadId, 'move_out', audit, input.reason);
        await this.insertHistory(tx, userId, leadId, 'move_in', audit, input.reason);
      } else {
        await this.insertHistory(tx, userId, leadId, 'add_admin', audit, input.reason);
      }
      const [updated] = await tx.query<MemberRow>(
        `update users set group_lead_id = $2, group_joined_at = now(), group_join_via = 'admin',
                updated_at = now()
          where id = $1
          returning id, username, email, full_name, role, status, deleted_at, group_lead_id,
                    group_join_via, group_joined_at, created_at`,
        [userId, leadId],
      );
      if (!updated) throw userNotFound();
      const policy = await currentTeamLeadPolicy(tx, leadId);
      const offerGrant = policy
        ? await createReferralOfferGrant(tx, {
            userId,
            leadUserId: leadId,
            policy,
            source: action === 'move' ? 'admin_move' : 'admin_add',
            triggeredByUserId: audit.adminId,
          })
        : null;
      await recordAudit(tx, audit, {
        action: action === 'move' ? 'group.member_move' : 'group.member_add',
        targetEntity: 'team_lead',
        targetId: leadId,
        before: {
          member_user_id: userId,
          group_lead_id: previousLeadId,
          group_join_via: user.group_join_via,
          group_joined_at: user.group_joined_at,
        },
        after: {
          member_user_id: userId,
          group_lead_id: leadId,
          group_join_via: 'admin',
          group_joined_at: updated.group_joined_at,
          offer_grant_id: offerGrant?.grant_id ?? null,
        },
        note: input.reason,
      });
      // Re-read the member: an offer grant may have turned the role into premium.
      const [member] = await tx.query<MemberRow>(
        `select id, username, email, full_name, role, status, deleted_at, group_lead_id,
                group_join_via, group_joined_at, created_at
           from users where id = $1`,
        [userId],
      );
      return {
        action,
        lead_user_id: leadId,
        previous_lead_user_id: previousLeadId,
        member: toMember(member ?? updated),
        offer_grant: offerGrant,
      };
    });
  }

  /**
   * §3.4 Loại khỏi nhóm, by an admin (any group) or, later, by the lead (own group). The member
   * keeps every grant already received (DECISION 4); later payments carry no snapshot. The
   * history and audit rows take the caller's role.
   */
  async removeMember(
    leadId: string,
    userId: string,
    reason: string,
    audit: AuditContext,
  ): Promise<MemberRemoveResult> {
    return this.database.transaction(async (tx) => {
      await this.requireProfile(tx, leadId);
      const user = await this.lockUser(tx, userId);
      if (!user || user.group_lead_id !== leadId) {
        throw new NotFoundException({
          code: 'NOT_IN_GROUP',
          message: 'Người dùng không ở trong nhóm này',
        });
      }
      await this.insertHistory(tx, userId, leadId, 'remove', audit, reason);
      const [updated] = await tx.query<{ updated_at: Date | string }>(
        `update users set group_lead_id = null, group_joined_at = null, group_join_via = null,
                updated_at = now()
          where id = $1
          returning updated_at`,
        [userId],
      );
      await recordAudit(tx, audit, {
        action: 'group.member_remove',
        targetEntity: 'team_lead',
        targetId: leadId,
        before: {
          member_user_id: userId,
          group_lead_id: leadId,
          group_join_via: user.group_join_via,
          group_joined_at: user.group_joined_at,
        },
        after: { member_user_id: userId, group_lead_id: null },
        note: reason,
      });
      return {
        lead_user_id: leadId,
        user_id: userId,
        removed_at: updated?.updated_at ?? new Date(),
      };
    });
  }

  private async lockUser(tx: SqlClient, userId: string): Promise<MemberRow | null> {
    const [user] = await tx.query<MemberRow>(
      `select id, username, email, full_name, role, status, deleted_at, group_lead_id,
              group_join_via, group_joined_at, created_at
         from users
        where id = $1 and deleted_at is null and status <> 'deleted'
        for update`,
      [userId],
    );
    return user ?? null;
  }

  private async requireProfile(
    client: SqlClient | DatabaseService,
    leadId: string,
  ): Promise<TeamLeadStatus> {
    const [profile] = await client.query<{ status: TeamLeadStatus }>(
      'select status from team_lead_profiles where user_id = $1',
      [leadId],
    );
    if (!profile) throw teamLeadNotFound();
    return profile.status;
  }

  private async lockActiveProfile(
    tx: SqlClient,
    leadId: string,
    mode: 'update' | 'share' = 'update',
  ): Promise<void> {
    const [profile] = await tx.query<{ status: TeamLeadStatus }>(
      `select status from team_lead_profiles where user_id = $1 for ${mode}`,
      [leadId],
    );
    if (!profile) throw teamLeadNotFound();
    if (profile.status !== 'active') throw teamLeadNotActive();
  }

  private async insertPolicy(
    tx: SqlClient,
    leadId: string,
    input: TeamLeadPolicyInput,
    audit: AuditContext,
  ): Promise<TeamLeadPolicyRow> {
    const [policy] = await tx.query<TeamLeadPolicyRow>(
      `insert into team_lead_policies
         (lead_user_id, commission_pct, offer_type, offer_days, reason, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, lead_user_id, commission_pct, offer_type, offer_days, offer_version_id`,
      [
        leadId,
        input.commission_pct,
        input.offer_type,
        input.offer_type === 'days' ? (input.offer_days ?? null) : null,
        input.reason,
        audit.adminId,
      ],
    );
    if (!policy) throw new Error('team lead policy insert returned no row');
    return policy;
  }

  private async insertHistory(
    tx: SqlClient,
    userId: string,
    leadId: string,
    action: 'add_admin' | 'move_in' | 'move_out' | 'remove',
    audit: AuditContext,
    reason: string,
  ): Promise<void> {
    await tx.query(
      `insert into group_membership_history
         (user_id, lead_user_id, action, actor_user_id, actor_role, reason)
       values ($1, $2, $3, $4, $5, $6)`,
      [userId, leadId, action, audit.adminId, audit.actorRole, reason],
    );
  }
}

function toMember(row: MemberRow): TeamLeadMember {
  return {
    ...summary(row),
    group_join_via: row.group_join_via ?? 'admin',
    group_joined_at: row.group_joined_at ?? row.created_at,
    created_at: row.created_at,
  };
}
