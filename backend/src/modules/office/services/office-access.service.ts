import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../../platform/database/index.js';
import type { AuthenticatedUser } from '../../auth/index.js';
import {
  extractHolidaySet,
  ictMonthString,
  ictNowParts,
  isWorkdayIct,
  parseCutoffMinutes,
} from '../office.time.js';
import {
  OFFICE_BOSS_ACCENT_COLOR,
  OFFICE_DEFAULT_LOCK_CUTOFF,
  OFFICE_DEFAULT_ON_TIME_CUTOFF,
  OFFICE_STAFF_ACCENT_PALETTE,
  type OfficeAccessContext,
  type OfficeAttendanceDisplayState,
  type OfficeMemberRow,
  type OfficeResolvedAccess,
  type OfficeRole,
  type OfficeTeamRow,
} from '../office.types.js';

type TeamDbRow = {
  id: string;
  boss_user_id: string;
  boss_name: string;
  name: string;
  checkin_on_time_cutoff: string;
  checkin_lock_cutoff: string;
};

type MemberDbRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: OfficeRole;
  display_name: string;
  email: string;
  avatar: string | null;
  avatar_color: string | null;
  desk_index: number | null;
  join_date: string;
  accent_color: string;
  active: boolean;
};

type SacoSyncRow = {
  user_id: string;
  assigned_date: string;
};

const toTeam = (row: TeamDbRow): OfficeTeamRow => ({
  id: row.id,
  bossUserId: row.boss_user_id,
  bossName: row.boss_name,
  name: row.name,
  checkinOnTimeCutoff: row.checkin_on_time_cutoff,
  checkinLockCutoff: row.checkin_lock_cutoff,
});

const toMember = (row: MemberDbRow): OfficeMemberRow => ({
  id: row.id,
  teamId: row.team_id,
  userId: row.user_id,
  role: row.role,
  displayName: row.display_name,
  email: row.email,
  avatar: row.avatar,
  avatarColor: row.avatar_color,
  deskIndex: row.desk_index,
  joinDate: String(row.join_date).slice(0, 10),
  accentColor: row.accent_color,
  active: row.active,
});

const NO_ACCESS: OfficeResolvedAccess = {
  member: false,
  role: 'none',
  team: null,
  self: null,
  members: [],
};

export const OFFICE_ACCESS_CLOCK = Symbol('OFFICE_ACCESS_CLOCK');
export const OFFICE_TEAM_SYNC_CACHE_TTL_MS = 30_000;
const MAX_SYNC_CACHE_ENTRIES = 1_000;

type TeamSyncCacheEntry = {
  readonly team: OfficeTeamRow;
  readonly activeUserIds: ReadonlySet<string>;
  readonly expiresAt: number;
};

@Injectable()
export class OfficeAccessService {
  private readonly now: () => Date;
  private readonly syncCache = new Map<string, TeamSyncCacheEntry>();

  constructor(
    private readonly database: DatabaseService,
    @Optional() @Inject(OFFICE_ACCESS_CLOCK) now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  invalidateTeamSyncCache(bossUserId?: string): void {
    if (bossUserId) this.syncCache.delete(bossUserId);
    else this.syncCache.clear();
  }

  async loadHolidays(client: SqlClient = this.database): Promise<Set<string>> {
    try {
      const rows = await client.query<{ holidays: unknown }>(
        'select holidays from virtual_trading_configs where is_active = true order by updated_at desc limit 1',
      );
      return extractHolidaySet(rows[0]?.holidays);
    } catch {
      return extractHolidaySet(null);
    }
  }

  /**
   * Resolves a signed-in user's office team and role, auto-syncing from
   * `team_lead_profiles` and `tf_sacos` while handling team transfers ([CHỐT #3]).
   */
  async resolveAccess(user: Pick<AuthenticatedUser, 'id'>): Promise<OfficeResolvedAccess> {
    // 1. Active team lead -> boss of their own office team.
    const [lead] = await this.database.query<{ user_id: string; name: string }>(
      `select tlp.user_id, coalesce(nullif(btrim(u.full_name), ''), u.username) as name
         from team_lead_profiles tlp
         join users u on u.id = tlp.user_id
        where tlp.user_id = $1
          and tlp.status = 'active'
          and u.status = 'active'
          and u.deleted_at is null`,
      [user.id],
    );
    if (lead) {
      const team = await this.ensureTeamSynced(lead.user_id, lead.name, user.id);
      return this.buildContext(team, user.id);
    }

    // 2. Active SACO under an active team lead -> staff of that lead's office team.
    const [saco] = await this.database.query<{ lead_user_id: string; lead_name: string }>(
      `select s.lead_user_id, coalesce(nullif(btrim(l.full_name), ''), l.username) as lead_name
         from tf_sacos s
         join team_lead_profiles tlp on tlp.user_id = s.lead_user_id and tlp.status = 'active'
         join users l on l.id = s.lead_user_id and l.status = 'active' and l.deleted_at is null
        where s.user_id = $1 and s.active = true`,
      [user.id],
    );
    if (saco) {
      const team = await this.ensureTeamSynced(saco.lead_user_id, saco.lead_name, user.id);
      return this.buildContext(team, user.id);
    }

    // 3. Explicit active office_members fallback (only for direct/manual memberships
    // under an active team_lead_profiles boss where neither team_lead_profiles nor tf_sacos revokes access).
    const [explicit] = await this.database.query<{ team_id: string }>(
      `select om.team_id
         from office_members om
         join office_teams t on t.id = om.team_id
         join users u on u.id = om.user_id and u.status = 'active' and u.deleted_at is null
         join team_lead_profiles boss_tlp
           on boss_tlp.user_id = t.boss_user_id and boss_tlp.status = 'active'
         join users boss_u
           on boss_u.id = t.boss_user_id and boss_u.status = 'active' and boss_u.deleted_at is null
        where om.user_id = $1
          and om.active = true
          and (
            (om.role = 'boss' and om.user_id = t.boss_user_id)
            or (
              om.role = 'staff'
              and (
                not exists (select 1 from tf_sacos s where s.user_id = om.user_id)
                or exists (
                  select 1 from tf_sacos s
                   where s.user_id = om.user_id
                     and s.lead_user_id = t.boss_user_id
                     and s.active = true
                )
              )
            )
          )
        order by om.updated_at desc
        limit 1`,
      [user.id],
    );
    if (explicit) {
      const team = await this.findTeamById(this.database, explicit.team_id);
      if (team) return this.buildContext(team, user.id);
    }

    return NO_ACCESS;
  }

  async requireMember(user: Pick<AuthenticatedUser, 'id'>): Promise<OfficeAccessContext> {
    const resolved = await this.resolveAccess(user);
    if (!resolved.member) {
      throw new ForbiddenException({
        code: 'OFFICE_NOT_MEMBER',
        message: 'Bạn chưa thuộc nhóm nào. Liên hệ trưởng nhóm để được thêm vào văn phòng.',
      });
    }
    return resolved;
  }

  async requireBoss(user: Pick<AuthenticatedUser, 'id'>): Promise<OfficeAccessContext> {
    const ctx = await this.requireMember(user);
    if (ctx.role !== 'boss') {
      throw new ForbiddenException({
        code: 'OFFICE_BOSS_ONLY',
        message: 'Chỉ trưởng nhóm mới có quyền thực hiện thao tác này.',
      });
    }
    return ctx;
  }

  async requireStaff(user: Pick<AuthenticatedUser, 'id'>): Promise<OfficeAccessContext> {
    const ctx = await this.requireMember(user);
    if (ctx.role !== 'staff') {
      throw new ForbiddenException({
        code: 'OFFICE_STAFF_ONLY',
        message: 'Chức năng này chỉ dành cho nhân viên.',
      });
    }
    return ctx;
  }

  async getMeSummary(
    user: Pick<AuthenticatedUser, 'id'>,
    onlineUserIdsForTeam: (teamId: string) => string[],
    now: Date = this.now(),
    beforeHud?: (teamId: string, at: Date) => Promise<void>,
  ) {
    const parts = ictNowParts(now);
    const holidays = await this.loadHolidays();
    const isWorkday = isWorkdayIct(parts.date, holidays);
    const resolved = await this.resolveAccess(user);

    if (!resolved.member) {
      const lockMin = parseCutoffMinutes(OFFICE_DEFAULT_LOCK_CUTOFF, 12 * 60);
      return {
        member: false,
        role: 'none' as const,
        serverTime: now.toISOString(),
        todayDate: parts.date,
        periodMonth: parts.monthKey,
        isWorkday,
        isAttendanceLocked: !isWorkday || parts.minutesOfDay > lockMin,
        cutoffs: {
          onTime: OFFICE_DEFAULT_ON_TIME_CUTOFF,
          lock: OFFICE_DEFAULT_LOCK_CUTOFF,
        },
        team: null,
        self: null,
        members: [],
        onlineUserIds: [],
        onlineCount: 0,
        hud: null,
      };
    }

    const { team, self, members, role } = resolved;
    if (beforeHud) {
      await beforeHud(team.id, now);
    }
    const lockMin = parseCutoffMinutes(team.checkinLockCutoff, 12 * 60);
    const isAttendanceLocked = !isWorkday || parts.minutesOfDay > lockMin;
    const onlineIds = onlineUserIdsForTeam(team.id);
    const onlineSet = new Set(onlineIds);

    const mapMember = (m: OfficeMemberRow) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      displayName: m.displayName,
      avatar: m.avatar,
      avatarColor: m.avatarColor,
      deskIndex: m.deskIndex,
      accentColor: m.accentColor,
      online: onlineSet.has(m.userId),
    });

    const hud =
      role === 'boss'
        ? await this.loadBossHud(team.id, members, parts.date, parts.monthKey)
        : await this.loadStaffHud(team.id, self.userId, parts.date, parts.monthKey);

    return {
      member: true,
      role,
      serverTime: now.toISOString(),
      todayDate: parts.date,
      periodMonth: parts.monthKey,
      isWorkday,
      isAttendanceLocked,
      cutoffs: {
        onTime: team.checkinOnTimeCutoff,
        lock: team.checkinLockCutoff,
      },
      team: {
        id: team.id,
        bossUserId: team.bossUserId,
        bossName: team.bossName,
        name: team.name,
        checkinOnTimeCutoff: team.checkinOnTimeCutoff,
        checkinLockCutoff: team.checkinLockCutoff,
      },
      self: mapMember(self),
      members: members.map(mapMember),
      onlineUserIds: onlineIds,
      onlineCount: onlineIds.length,
      hud,
    };
  }

  private async loadBossHud(
    teamId: string,
    members: readonly OfficeMemberRow[],
    todayDate: string,
    periodMonth: string,
  ) {
    const [taskStats] = await this.database.query<{
      pending_count: string;
      today_done: string;
      today_total: string;
    }>(
      `select
         count(*) filter (
           where status = 'pending'
             and (
               (kind = 'day' and task_date = $2::date)
               or (kind in ('month', 'kpi') and period_month = $3)
             )
         )::text as pending_count,
         count(*) filter (where kind = 'day' and task_date = $2::date and status = 'done')::text as today_done,
         count(*) filter (where kind = 'day' and task_date = $2::date and status <> 'expired')::text as today_total
       from office_tasks
       where team_id = $1`,
      [teamId, todayDate, periodMonth],
    );
    const [propStats] = await this.database.query<{ new_count: string }>(
      `select count(*)::text as new_count
         from office_proposals
        where team_id = $1 and status = 'sent'`,
      [teamId],
    );

    const staff = members.filter((m) => m.role === 'staff');
    const latestStaff =
      staff.length > 0 ? [...staff].sort((a, b) => b.joinDate.localeCompare(a.joinDate))[0]! : null;

    return {
      kind: 'boss' as const,
      pendingCount: Number(taskStats?.pending_count ?? 0),
      newProposalsCount: Number(propStats?.new_count ?? 0),
      todayDoneCount: Number(taskStats?.today_done ?? 0),
      todayTotalCount: Number(taskStats?.today_total ?? 0),
      staffCount: staff.length,
      latestStaffName: latestStaff?.displayName ?? null,
    };
  }

  private async loadStaffHud(
    teamId: string,
    userId: string,
    todayDate: string,
    periodMonth: string,
  ) {
    const [taskStats] = await this.database.query<{
      returned_count: string;
      pending_count: string;
      today_done: string;
      today_total: string;
    }>(
      `select
         count(*) filter (where status = 'returned' and ((kind = 'day' and task_date = $3::date) or (kind <> 'day' and period_month = $4)))::text as returned_count,
         count(*) filter (where status = 'pending' and ((kind = 'day' and task_date = $3::date) or (kind <> 'day' and period_month = $4)))::text as pending_count,
         count(*) filter (where kind = 'day' and task_date = $3::date and status = 'done')::text as today_done,
         count(*) filter (where kind = 'day' and task_date = $3::date and status <> 'expired')::text as today_total
       from office_tasks
       where team_id = $1 and user_id = $2`,
      [teamId, userId, todayDate, periodMonth],
    );

    const [pointsRow] = await this.database.query<{ points: number }>(
      `select points from office_points_monthly
        where team_id = $1 and user_id = $2 and period_month = $3`,
      [teamId, userId, periodMonth],
    );

    const [attRow] = await this.database.query<{
      status: 'ok' | 'late';
      checked_in_at: Date | string;
    }>(
      `select status, checked_in_at from office_attendance
        where user_id = $1 and work_date = $2::date`,
      [userId, todayDate],
    );

    const myAttendanceStatus: OfficeAttendanceDisplayState = attRow?.status ?? 'absent';

    return {
      kind: 'staff' as const,
      returnedCount: Number(taskStats?.returned_count ?? 0),
      todayDoneCount: Number(taskStats?.today_done ?? 0),
      todayTotalCount: Number(taskStats?.today_total ?? 0),
      pendingCount: Number(taskStats?.pending_count ?? 0),
      monthlyPoints: Number(pointsRow?.points ?? 0),
      myAttendanceStatus,
      myCheckedInAt: attRow
        ? attRow.checked_in_at instanceof Date
          ? attRow.checked_in_at.toISOString()
          : new Date(attRow.checked_in_at).toISOString()
        : null,
    };
  }

  private cacheTeamSync(
    bossUserId: string,
    team: OfficeTeamRow,
    activeUserIds: ReadonlySet<string>,
    nowMs: number,
  ): void {
    if (this.syncCache.size >= MAX_SYNC_CACHE_ENTRIES) {
      for (const [key, entry] of this.syncCache) {
        if (entry.expiresAt <= nowMs) this.syncCache.delete(key);
      }
    }
    this.syncCache.set(bossUserId, {
      team,
      activeUserIds,
      expiresAt: nowMs + OFFICE_TEAM_SYNC_CACHE_TTL_MS,
    });
  }

  private async checkTeamInSyncReadOnly(
    bossUserId: string,
  ): Promise<
    { inSync: true; team: OfficeTeamRow; activeUserIds: ReadonlySet<string> } | { inSync: false }
  > {
    const team = await this.findTeamByBoss(this.database, bossUserId);
    if (!team) return { inSync: false };

    const activeSacos = await this.database.query<SacoSyncRow>(
      `select s.user_id, to_char(s.assigned_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as assigned_date
         from tf_sacos s
         join users u on u.id = s.user_id and u.status = 'active' and u.deleted_at is null
        where s.lead_user_id = $1 and s.active = true
        order by s.assigned_at asc, s.id asc`,
      [bossUserId],
    );

    const members = await this.database.query<{
      user_id: string;
      role: OfficeRole;
      desk_index: number | null;
      active: boolean;
      has_saco_row: boolean;
    }>(
      `select om.user_id, om.role, om.desk_index, om.active,
              exists (select 1 from tf_sacos s where s.user_id = om.user_id) as has_saco_row
         from office_members om
        where om.team_id = $1`,
      [team.id],
    );

    const bossRow = members.find((m) => m.user_id === bossUserId);
    if (!bossRow || bossRow.role !== 'boss' || !bossRow.active || bossRow.desk_index !== null) {
      return { inSync: false };
    }

    const activeSacoIds = new Set(activeSacos.map((s) => s.user_id));
    const memberByUser = new Map(members.map((m) => [m.user_id, m]));
    const seenActiveDesks = new Set<number>();

    for (const member of members) {
      if (member.active && member.desk_index !== null) {
        if (seenActiveDesks.has(member.desk_index)) return { inSync: false };
        seenActiveDesks.add(member.desk_index);
      }
      if (
        member.role === 'staff' &&
        member.active &&
        member.has_saco_row &&
        !activeSacoIds.has(member.user_id)
      ) {
        return { inSync: false };
      }
    }

    for (const saco of activeSacos) {
      const existing = memberByUser.get(saco.user_id);
      if (
        !existing ||
        !existing.active ||
        existing.role !== 'staff' ||
        existing.desk_index === null
      ) {
        return { inSync: false };
      }
    }

    if (activeSacos.length > 0) {
      const sacoUserIds = activeSacos.map((s) => s.user_id);
      const currentMonth = ictMonthString(this.now());
      const [pending] = await this.database.query<{ has_pending_transfer: boolean }>(
        `select (
           exists (
             select 1 from office_members
              where user_id = any($1::uuid[])
                and team_id <> $2
                and role = 'staff'
                and active = true
           )
           or exists (
             select 1 from office_points_monthly
              where user_id = any($1::uuid[])
                and team_id <> $2
                and period_month = $3
                and points > 0
           )
         ) as has_pending_transfer`,
        [sacoUserIds, team.id, currentMonth],
      );
      if (pending?.has_pending_transfer) return { inSync: false };
    }

    const activeUserIds = new Set<string>([bossUserId]);
    for (const member of members) {
      if (member.active) activeUserIds.add(member.user_id);
    }
    return { inSync: true, team, activeUserIds };
  }

  private async ensureTeamSynced(
    bossUserId: string,
    bossName: string,
    requestingUserId?: string,
  ): Promise<OfficeTeamRow> {
    const nowMs = this.now().getTime();
    const cached = this.syncCache.get(bossUserId);
    if (
      cached &&
      nowMs < cached.expiresAt &&
      (!requestingUserId || cached.activeUserIds.has(requestingUserId))
    ) {
      return cached.team;
    }

    const probe = await this.checkTeamInSyncReadOnly(bossUserId);
    if (probe.inSync) {
      this.cacheTeamSync(bossUserId, probe.team, probe.activeUserIds, nowMs);
      return probe.team;
    }

    const { team, activeUserIds } = await this.database.transaction(async (tx) => {
      // Serialize concurrent first-time and membership syncs per team across all processes.
      await tx.query(`select pg_advisory_xact_lock(hashtext('office_team_sync:' || $1))`, [
        bossUserId,
      ]);

      const teamName = `Nhóm ${bossName}`.slice(0, 120);
      await tx.query(
        `insert into office_teams (boss_user_id, name)
         values ($1, $2)
         on conflict (boss_user_id) do nothing`,
        [bossUserId, teamName],
      );

      const resolvedTeam = await this.findTeamByBoss(tx, bossUserId);
      if (!resolvedTeam) throw new Error(`Failed to resolve office team for boss ${bossUserId}`);

      await tx.query(
        `insert into office_members (team_id, user_id, role, desk_index, accent_color, active)
         values ($1, $2, 'boss', null, $3, true)
         on conflict (team_id, user_id) do update
           set role = 'boss', desk_index = null, active = true, updated_at = now()
         where office_members.active = false
            or office_members.role <> 'boss'
            or office_members.desk_index is not null`,
        [resolvedTeam.id, bossUserId, OFFICE_BOSS_ACCENT_COLOR],
      );

      const activeSacos = await tx.query<SacoSyncRow>(
        `select s.user_id, to_char(s.assigned_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as assigned_date
           from tf_sacos s
           join users u on u.id = s.user_id and u.status = 'active' and u.deleted_at is null
          where s.lead_user_id = $1 and s.active = true
          order by s.assigned_at asc, s.id asc`,
        [bossUserId],
      );

      const existingStaff = await tx.query<{
        user_id: string;
        desk_index: number | null;
        active: boolean;
      }>(
        `select user_id, desk_index, active
           from office_members
          where team_id = $1 and role = 'staff'`,
        [resolvedTeam.id],
      );
      const existingByUser = new Map(existingStaff.map((row) => [row.user_id, row]));
      const activeUsedDesks = new Set(
        existingStaff
          .filter((row) => row.active && row.desk_index !== null)
          .map((row) => row.desk_index as number),
      );
      const usedDesks = new Set(
        existingStaff
          .filter((row) => row.desk_index !== null)
          .map((row) => row.desk_index as number),
      );
      const nextDesk = (): number => {
        let idx = 0;
        while (usedDesks.has(idx) || activeUsedDesks.has(idx)) idx += 1;
        usedDesks.add(idx);
        activeUsedDesks.add(idx);
        return idx;
      };

      const currentMonth = ictMonthString(this.now());

      for (const saco of activeSacos) {
        // [CHỐT #3]: If staff transferred from another team, deactivate old membership,
        // delete only incomplete tasks in the old team, keep old boss notes isolated by team_id,
        // and carry over current-month points to the new team.
        const oldTeams = await tx.query<{ team_id: string }>(
          `update office_members
              set active = false, updated_at = now()
            where user_id = $1 and team_id <> $2 and role = 'staff' and active = true
            returning team_id`,
          [saco.user_id, resolvedTeam.id],
        );
        for (const old of oldTeams) {
          await tx.query(
            `delete from office_tasks
              where team_id = $1 and user_id = $2 and status <> 'done'`,
            [old.team_id, saco.user_id],
          );
          await tx.query(
            `delete from office_assignment_targets t
              using office_assignments a
              where t.assignment_id = a.id and a.team_id = $1 and t.user_id = $2`,
            [old.team_id, saco.user_id],
          );
        }

        // Carry over current-month points from any prior team (handles both sync orderings:
        // whether the old boss or the new team synced first) while leaving historical months untouched.
        const migratedPoints = await tx.query<{ points: number; reached_at: Date | string }>(
          `delete from office_points_monthly
            where user_id = $1
              and team_id <> $2
              and period_month = $3
            returning points, reached_at`,
          [saco.user_id, resolvedTeam.id, currentMonth],
        );
        let totalMigrated = 0;
        let latestReachedAt: Date | null = null;
        for (const row of migratedPoints) {
          const pts = Number(row.points ?? 0);
          if (pts <= 0) continue;
          totalMigrated += pts;
          const ts = row.reached_at instanceof Date ? row.reached_at : new Date(row.reached_at);
          if (!latestReachedAt || ts.getTime() > latestReachedAt.getTime()) {
            latestReachedAt = ts;
          }
        }
        if (totalMigrated > 0 && latestReachedAt) {
          await tx.query(
            `insert into office_points_monthly (team_id, user_id, period_month, points, reached_at)
             values ($1, $2, $3, $4, $5)
             on conflict (team_id, user_id, period_month) do update
               set points = office_points_monthly.points + excluded.points,
                   reached_at = greatest(office_points_monthly.reached_at, excluded.reached_at)`,
            [resolvedTeam.id, saco.user_id, currentMonth, totalMigrated, latestReachedAt],
          );
        }

        const existing = existingByUser.get(saco.user_id);
        if (!existing) {
          const desk = nextDesk();
          const color = OFFICE_STAFF_ACCENT_PALETTE[desk % OFFICE_STAFF_ACCENT_PALETTE.length]!;
          await tx.query(
            `insert into office_members (team_id, user_id, role, desk_index, join_date, accent_color, active)
             values ($1, $2, 'staff', $3, $4::date, $5, true)
             on conflict (team_id, user_id) do update
               set active = true,
                   desk_index = coalesce(office_members.desk_index, excluded.desk_index),
                   updated_at = now()`,
            [resolvedTeam.id, saco.user_id, desk, saco.assigned_date, color],
          );
        } else if (!existing.active || existing.desk_index === null) {
          const desk =
            existing.desk_index !== null && !activeUsedDesks.has(existing.desk_index)
              ? existing.desk_index
              : nextDesk();
          activeUsedDesks.add(desk);
          usedDesks.add(desk);
          await tx.query(
            `update office_members
                set active = true, desk_index = $3, updated_at = now()
              where team_id = $1 and user_id = $2`,
            [resolvedTeam.id, saco.user_id, desk],
          );
        }
      }

      // Deactivate staff whose SACO record was removed, deactivated, or reassigned to another lead,
      // and clear their non-done open/pending tasks + assignment targets while keeping done tasks & points.
      const deactivatedStaff = await tx.query<{ user_id: string }>(
        `update office_members om
            set active = false, updated_at = now()
          where om.team_id = $1
            and om.role = 'staff'
            and om.active = true
            and exists (select 1 from tf_sacos s where s.user_id = om.user_id)
            and not exists (
              select 1 from tf_sacos s
              join users u on u.id = s.user_id and u.status = 'active' and u.deleted_at is null
               where s.user_id = om.user_id
                 and s.lead_user_id = $2
                 and s.active = true
            )
          returning om.user_id`,
        [resolvedTeam.id, bossUserId],
      );
      for (const removed of deactivatedStaff) {
        await tx.query(
          `delete from office_tasks
            where team_id = $1 and user_id = $2 and status <> 'done'`,
          [resolvedTeam.id, removed.user_id],
        );
        await tx.query(
          `delete from office_assignment_targets t
            using office_assignments a
            where t.assignment_id = a.id and a.team_id = $1 and t.user_id = $2`,
          [resolvedTeam.id, removed.user_id],
        );
      }

      const deactivatedSet = new Set(deactivatedStaff.map((row) => row.user_id));
      const syncedActiveUsers = new Set<string>([bossUserId]);
      for (const saco of activeSacos) syncedActiveUsers.add(saco.user_id);
      for (const row of existingStaff) {
        if (row.active && !deactivatedSet.has(row.user_id)) {
          syncedActiveUsers.add(row.user_id);
        }
      }

      return { team: resolvedTeam, activeUserIds: syncedActiveUsers };
    });

    this.cacheTeamSync(bossUserId, team, activeUserIds, nowMs);
    return team;
  }

  private async buildContext(team: OfficeTeamRow, userId: string): Promise<OfficeResolvedAccess> {
    const members = await this.listActiveMembers(this.database, team.id);
    const self = members.find((m) => m.userId === userId);
    if (!self) return NO_ACCESS;
    return {
      member: true,
      role: self.role,
      team,
      self,
      members,
    };
  }

  private async findTeamByBoss(
    client: SqlClient,
    bossUserId: string,
  ): Promise<OfficeTeamRow | null> {
    const [row] = await client.query<TeamDbRow>(
      `select t.id, t.boss_user_id,
              coalesce(nullif(btrim(u.full_name), ''), u.username) as boss_name,
              t.name, t.checkin_on_time_cutoff, t.checkin_lock_cutoff
         from office_teams t
         join users u on u.id = t.boss_user_id
        where t.boss_user_id = $1`,
      [bossUserId],
    );
    return row ? toTeam(row) : null;
  }

  private async findTeamById(client: SqlClient, teamId: string): Promise<OfficeTeamRow | null> {
    const [row] = await client.query<TeamDbRow>(
      `select t.id, t.boss_user_id,
              coalesce(nullif(btrim(u.full_name), ''), u.username) as boss_name,
              t.name, t.checkin_on_time_cutoff, t.checkin_lock_cutoff
         from office_teams t
         join users u on u.id = t.boss_user_id
        where t.id = $1`,
      [teamId],
    );
    return row ? toTeam(row) : null;
  }

  private async listActiveMembers(client: SqlClient, teamId: string): Promise<OfficeMemberRow[]> {
    const rows = await client.query<MemberDbRow>(
      `select om.id, om.team_id, om.user_id, om.role,
              coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as display_name,
              u.email,
              p.avatar,
              p.color as avatar_color,
              om.desk_index,
              to_char(om.join_date, 'YYYY-MM-DD') as join_date,
              om.accent_color,
              om.active
         from office_members om
         join users u on u.id = om.user_id
         left join tf_sacos s on s.user_id = om.user_id
         left join tf_profiles p on p.user_id = om.user_id
        where om.team_id = $1 and om.active = true
        order by case when om.role = 'boss' then 0 else 1 end, om.desk_index asc nulls last, om.created_at asc`,
      [teamId],
    );
    return rows.map(toMember);
  }
}
