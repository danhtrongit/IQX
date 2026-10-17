import { HttpException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import {
  AcademyProgressReader,
  type AcademyProgressSummary,
} from '../academy/academy-progress-reader.service.js';
import { AdminMetricsService } from '../admin/admin-metrics.service.js';
import type { UserRole, UserStatus } from '../auth/index.js';
import { AdminUsersService } from '../users/admin-users.service.js';
import type { AuditContext } from '../users/audit.js';
import { memberPerformance } from '../users/member-performance.js';
import { currentTeamLeadPolicy, type TeamLeadOfferType } from './team-lead-policy.js';
import type { TeamLoginHistoryQuery, TeamUserListQuery } from './team.schemas.js';
import { TeamLeadsService, type MemberRemoveResult, type Page } from './team-leads.service.js';

export type TeamMe = {
  user: { id: string; username: string; full_name: string };
  code: string;
  status: 'active';
  appointed_at: Date | string;
  commission_pct: number | null;
  offer_type: TeamLeadOfferType | null;
  offer_days: number | null;
  member_count: number;
};

export type TeamUserItem = {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  is_email_verified: boolean;
  last_login_at: Date | string | null;
  created_at: Date | string;
  group_join_via: 'code' | 'admin';
  group_joined_at: Date | string;
  demo_trading: { activated: boolean; pnl_pct: number | null };
  bot: { activated: boolean; pnl_pct: number | null; as_of: string | null };
  academy: AcademyProgressSummary;
};

type MemberListRow = Omit<TeamUserItem, 'demo_trading' | 'bot' | 'academy'>;

/** Live members of the lead in $1 (deleted users never show in team views). */
const MEMBER_SCOPE = `m.group_lead_id = $1 and m.deleted_at is null and m.status <> 'deleted'`;

/**
 * The member's grant active now, excluding free referral offers, is a trial: the same
 * "current grant" rule as the overview's active_trial_count (admin-metrics.service.ts).
 */
const TRIALING_SQL = `(select p.code from billing_entitlement_grants g
                        left join premium_plans p on p.id = g.plan_id
                       where g.user_id = m.id and g.status = 'active'
                         and g.kind <> 'referral_offer'
                         and g.starts_at <= now() and now() < g.ends_at
                       order by g.starts_at desc, g.ends_at desc, g.id
                       limit 1) = 'TRIAL_7D'`;

const SEGMENT_SQL: Record<NonNullable<TeamUserListQuery['segment']>, string> = {
  new_7d: `m.created_at >= now() - interval '7 days'`,
  email_unverified: 'm.is_email_verified = false',
  trialing: TRIALING_SQL,
  // Never signed in counts from the account's creation, so a brand-new user is not inactive.
  inactive_14d: `coalesce(m.last_login_at, m.created_at) < now() - interval '14 days'`,
};

const SQL_SORTS: Partial<Record<TeamUserListQuery['sort_by'], string>> = {
  username: 'lower(m.username)',
  role: 'm.role::text',
  created_at: 'm.created_at',
};

const MEMBER_COLUMNS = `m.id, m.username, m.full_name, m.email, m.role, m.status,
  m.is_email_verified, m.last_login_at, m.created_at,
  coalesce(m.group_join_via, 'admin') as group_join_via,
  coalesce(m.group_joined_at, m.created_at) as group_joined_at`;

function userNotFound(): NotFoundException {
  return new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
}

/** Ascending comparison with nulls always last, whatever the direction. */
function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

/**
 * Admin spec v1.1 §4.3: the team lead's own view of its group. The group is always the
 * caller's (`leadId` comes from the authenticated user, never from the client), every member
 * lookup is `id = ? and group_lead_id = lead`, and anything outside the group is 404
 * USER_NOT_FOUND. Money is limited to revenue and order amounts: no commission amounts, no VT
 * or Bot capital (results are percentages only).
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly database: DatabaseService,
    private readonly teamLeads: TeamLeadsService,
    private readonly adminUsers: AdminUsersService,
    private readonly metrics: AdminMetricsService,
    private readonly academy: AcademyProgressReader,
  ) {}

  async me(leadId: string): Promise<TeamMe> {
    const [row] = await this.database.query<{
      id: string;
      username: string;
      full_name: string;
      appointed_at: Date | string;
      member_count: string;
    }>(
      `select u.id, u.username, u.full_name, p.appointed_at,
              (select count(*) from users m where ${MEMBER_SCOPE})::text as member_count
         from team_lead_profiles p
         join users u on u.id = p.user_id
        where p.user_id = $1 and p.status = 'active'`,
      [leadId],
    );
    if (!row) throw userNotFound();
    const policy = await currentTeamLeadPolicy(this.database, leadId);
    return {
      user: { id: row.id, username: row.username, full_name: row.full_name },
      code: row.username,
      status: 'active',
      appointed_at: row.appointed_at,
      commission_pct: policy?.commission_pct ?? null,
      offer_type: policy?.offer_type ?? null,
      offer_days: policy?.offer_days ?? null,
      member_count: Number(row.member_count),
    };
  }

  overview(leadId: string): Promise<Record<string, unknown>> {
    return this.metrics.overview({ leadId });
  }

  revenue(leadId: string, days: number): Promise<Record<string, unknown>[]> {
    return this.metrics.dailyRevenue(days, { leadId });
  }

  /**
   * Members with their Demo / Bot results (percent) and Academy progress. Username, role and
   * created_at sort and page in SQL. The result and Academy sorts are computed in memory over
   * every matching member (groups are small): Demo values come from stored prices, so they
   * cannot be ordered by an index.
   */
  async users(leadId: string, query: TeamUserListQuery): Promise<Page<TeamUserItem>> {
    const conditions = [MEMBER_SCOPE];
    const params: unknown[] = [leadId];
    if (query.search) {
      params.push(`%${query.search}%`);
      const at = `$${params.length}`;
      conditions.push(`(m.username ilike ${at} or m.full_name ilike ${at} or m.email ilike ${at})`);
    }
    if (query.role) {
      params.push(query.role);
      conditions.push(`m.role = $${params.length}`);
    }
    if (query.segment) conditions.push(SEGMENT_SQL[query.segment]);
    const where = conditions.join(' and ');
    const direction = query.sort_order === 'asc' ? 'asc' : 'desc';
    const sqlSort = SQL_SORTS[query.sort_by];
    const offset = (query.page - 1) * query.page_size;

    if (sqlSort) {
      const [count] = await this.database.query<{ total: string }>(
        `select count(*)::text as total from users m where ${where}`,
        params,
      );
      const rows = await this.database.query<MemberListRow>(
        `select ${MEMBER_COLUMNS} from users m where ${where}
          order by ${sqlSort} ${direction}, m.id ${direction}
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, query.page_size, offset],
      );
      return this.page(await this.withInsights(rows), Number(count?.total ?? 0), query);
    }

    const rows = await this.database.query<MemberListRow>(
      `select ${MEMBER_COLUMNS} from users m where ${where}`,
      params,
    );
    const items = await this.withInsights(rows);
    const sign = direction === 'asc' ? 1 : -1;
    const value = (item: TeamUserItem): number | null =>
      query.sort_by === 'demo_pnl_pct'
        ? item.demo_trading.pnl_pct
        : query.sort_by === 'bot_pnl_pct'
          ? item.bot.pnl_pct
          : item.academy.completed;
    items.sort(
      (a, b) =>
        compareNullable(value(a), value(b), sign) ||
        a.username.localeCompare(b.username) ||
        a.id.localeCompare(b.id),
    );
    return this.page(items.slice(offset, offset + query.page_size), items.length, query);
  }

  /** The admin user 360 restricted to the group and without the admin-only money views. */
  user(leadId: string, userId: string): Promise<Record<string, unknown>> {
    return this.adminUsers.get360(userId, { leadId });
  }

  async loginHistory(
    leadId: string,
    userId: string,
    query: TeamLoginHistoryQuery,
  ): Promise<Record<string, unknown>> {
    if (!(await this.adminUsers.isGroupMember(userId, { leadId }))) throw userNotFound();
    return this.adminUsers.loginHistory(userId, query);
  }

  /** §3.4 Loại khỏi nhóm by the lead (own group only); audit `group.member_remove`. */
  async removeMember(
    leadId: string,
    userId: string,
    reason: string,
    audit: AuditContext,
  ): Promise<MemberRemoveResult> {
    try {
      return await this.teamLeads.removeMember(leadId, userId, reason, audit);
    } catch (error) {
      // Outside the group (or deleted) reads as not found, like every other team lookup.
      if (error instanceof HttpException && errorCode(error) === 'NOT_IN_GROUP')
        throw userNotFound();
      throw error;
    }
  }

  private async withInsights(rows: MemberListRow[]): Promise<TeamUserItem[]> {
    const ids = rows.map((row) => row.id);
    const [performance, academy] = await Promise.all([
      memberPerformance(this.database, ids),
      this.academy.summaries(ids),
    ]);
    return rows.map((row) => {
      const result = performance.get(row.id);
      const progress = academy.get(row.id);
      if (!result || !progress) throw new Error('member insight lookup returned no entry');
      return {
        ...row,
        demo_trading: {
          activated: result.demo_trading.activated,
          pnl_pct: result.demo_trading.pnl_pct,
        },
        bot: {
          activated: result.bot.activated,
          pnl_pct: result.bot.pnl_pct,
          as_of: result.bot.as_of,
        },
        academy: progress,
      };
    });
  }

  private page(
    items: TeamUserItem[],
    total: number,
    query: { page: number; page_size: number },
  ): Page<TeamUserItem> {
    return {
      items,
      total,
      page: query.page,
      page_size: query.page_size,
      total_pages: total > 0 ? Math.ceil(total / query.page_size) : 0,
    };
  }
}

function errorCode(error: HttpException): string | undefined {
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String((response as { code: unknown }).code)
    : undefined;
}
