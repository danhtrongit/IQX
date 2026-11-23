import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';
import type { AuthenticatedUser } from '../../src/modules/auth/index.js';
import type {
  OfficeNotificationInput,
  OfficeNotifier,
} from '../../src/modules/notifications/index.js';
import { OfficeController } from '../../src/modules/office/office.controller.js';
import { OfficeJobsModule } from '../../src/modules/office/office.module.js';
import { officeApproveTasksResponseSchema } from '../../src/modules/office/office.schemas.js';
import type { OfficeAccessContext } from '../../src/modules/office/office.types.js';
import type { OfficeHub } from '../../src/modules/office/realtime/office.hub.js';
import {
  OFFICE_TEAM_SYNC_CACHE_TTL_MS,
  OfficeAccessService,
} from '../../src/modules/office/services/office-access.service.js';
import { OfficeAttendanceService } from '../../src/modules/office/services/office-attendance.service.js';
import { OfficeCronService } from '../../src/modules/office/services/office-cron.service.js';
import { OfficeTasksService } from '../../src/modules/office/services/office-tasks.service.js';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const BOSS_ID = '22222222-2222-4222-8222-222222222222';
const STAFF1_ID = '33333333-3333-4333-8333-333333333333';
const STAFF2_ID = '44444444-4444-4444-8444-444444444444';
const STAFF3_ID = '55555555-5555-4555-8555-555555555555';
const ASSIGN_ID = '66666666-6666-4666-8666-666666666666';
const TASK_VALID_ID = '77777777-7777-4777-8777-777777777771';
const TASK_EXPIRED_ID = '77777777-7777-4777-8777-777777777772';
const TASK_DONE_ID = '77777777-7777-4777-8777-777777777773';
const TASK_MISSING_ID = '77777777-7777-4777-8777-777777777774';

const bossUser = { id: BOSS_ID, role: 'team_lead' } as AuthenticatedUser;
const staff1User = { id: STAFF1_ID, role: 'user' } as AuthenticatedUser;
const staff2User = { id: STAFF2_ID, role: 'user' } as AuthenticatedUser;

function makeFakeDb(
  handler: (sql: string, params: readonly unknown[]) => unknown[] | Promise<unknown[]>,
) {
  const calls: Array<{ sql: string; params: readonly unknown[]; inTx: boolean }> = [];
  const makeQuery = (inTx: boolean) =>
    vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params, inTx });
      return handler(sql, params);
    });
  const topQuery = makeQuery(false);
  const txQuery = makeQuery(true);
  const transaction = vi.fn(async (fn: (tx: SqlClient) => Promise<unknown>) =>
    fn({ query: txQuery } as unknown as SqlClient),
  );
  const db = {
    query: topQuery,
    transaction,
  } as unknown as DatabaseService;
  return { db, calls, transaction };
}

function makeContext(role: 'boss' | 'staff'): OfficeAccessContext {
  const bossMember = {
    id: 'mb-1',
    teamId: TEAM_ID,
    userId: BOSS_ID,
    role: 'boss' as const,
    displayName: 'Lê Huy',
    email: 'huy@iqx.vn',
    avatar: null,
    avatarColor: null,
    deskIndex: null,
    joinDate: '2025-01-01',
    accentColor: '#B7791F',
    active: true,
  };
  const s1 = {
    id: 'ms-1',
    teamId: TEAM_ID,
    userId: STAFF1_ID,
    role: 'staff' as const,
    displayName: 'Lê Ngọc Hạnh',
    email: 'hanh@iqx.vn',
    avatar: null,
    avatarColor: null,
    deskIndex: 0,
    joinDate: '2025-08-03',
    accentColor: '#C2417D',
    active: true,
  };
  const s2 = {
    id: 'ms-2',
    teamId: TEAM_ID,
    userId: STAFF2_ID,
    role: 'staff' as const,
    displayName: 'Nguyễn Văn An',
    email: 'an@iqx.vn',
    avatar: null,
    avatarColor: null,
    deskIndex: 1,
    joinDate: '2026-01-15',
    accentColor: '#1D6FE8',
    active: true,
  };
  return {
    member: true,
    role,
    team: {
      id: TEAM_ID,
      bossUserId: BOSS_ID,
      bossName: 'Lê Huy',
      name: 'Nhóm Lê Huy',
      checkinOnTimeCutoff: '08:30',
      checkinLockCutoff: '12:00',
    },
    self: role === 'boss' ? bossMember : s1,
    members: [bossMember, s1, s2],
  };
}

function makeAccessStub(): OfficeAccessService {
  const bossCtx = makeContext('boss');
  const staffCtx = makeContext('staff');
  const svc = new OfficeAccessService({} as DatabaseService);
  vi.spyOn(svc, 'resolveAccess').mockImplementation(async (u) => {
    if (u.id === BOSS_ID) return bossCtx;
    if (u.id === STAFF1_ID) return staffCtx;
    return {
      member: false as const,
      role: 'none' as const,
      team: null,
      self: null,
      members: [] as const,
    };
  });
  vi.spyOn(svc, 'loadHolidays').mockResolvedValue(new Set(['2026-04-30']));
  return svc;
}

function makeHubStub() {
  return {
    broadcastSync: vi.fn(),
    broadcastSyncAllTeams: vi.fn(),
    publishSyncAcrossProcesses: vi.fn().mockResolvedValue(undefined),
    onlineUserIds: vi.fn().mockReturnValue([]),
  } as unknown as OfficeHub & {
    broadcastSync: ReturnType<typeof vi.fn>;
    publishSyncAcrossProcesses: ReturnType<typeof vi.fn>;
  };
}

function makeNotifierStub() {
  const sent: OfficeNotificationInput[] = [];
  const notifier: OfficeNotifier = {
    officeNotify: vi.fn(async (_tx: SqlClient, input: OfficeNotificationInput) => {
      sent.push(input);
      return { created: true, notificationId: 'notif-1' };
    }),
  };
  return { notifier, sent };
}

describe('Fix 1: ensureTeamSynced skip logic, advisory lock serialization & desk uniqueness', () => {
  const teamRow = {
    id: TEAM_ID,
    boss_user_id: BOSS_ID,
    boss_name: 'Lê Huy',
    name: 'Nhóm Lê Huy',
    checkin_on_time_cutoff: '08:30',
    checkin_lock_cutoff: '12:00',
  };

  const activeMemberListRows = [
    {
      id: 'mb-1',
      team_id: TEAM_ID,
      user_id: BOSS_ID,
      role: 'boss',
      display_name: 'Lê Huy',
      email: 'huy@iqx.vn',
      avatar: null,
      avatar_color: null,
      desk_index: null,
      join_date: '2025-01-01',
      accent_color: '#B7791F',
      active: true,
    },
    {
      id: 'ms-1',
      team_id: TEAM_ID,
      user_id: STAFF1_ID,
      role: 'staff',
      display_name: 'Lê Ngọc Hạnh',
      email: 'hanh@iqx.vn',
      avatar: null,
      avatar_color: null,
      desk_index: 0,
      join_date: '2026-11-20',
      accent_color: '#C2417D',
      active: true,
    },
  ];

  it('skips write transaction when DB signature is already in sync and uses TTL cache on repeat requests', async () => {
    let nowMs = new Date('2026-11-23T02:00:00.000Z').getTime();
    const { db, calls, transaction } = makeFakeDb((sql) => {
      if (sql.includes('from team_lead_profiles tlp')) {
        return [{ user_id: BOSS_ID, name: 'Lê Huy' }];
      }
      if (sql.includes('from office_teams t') && sql.includes('t.boss_user_id = $1')) {
        return [teamRow];
      }
      if (sql.includes('from tf_sacos s') && sql.includes('assigned_date')) {
        return [{ user_id: STAFF1_ID, assigned_date: '2026-11-20' }];
      }
      if (sql.includes('as has_saco_row')) {
        return [
          { user_id: BOSS_ID, role: 'boss', desk_index: null, active: true, has_saco_row: false },
          { user_id: STAFF1_ID, role: 'staff', desk_index: 0, active: true, has_saco_row: true },
        ];
      }
      if (sql.includes('as has_pending_transfer')) {
        return [{ has_pending_transfer: false }];
      }
      if (sql.includes('from office_members om') && sql.includes('left join tf_profiles')) {
        return activeMemberListRows;
      }
      return [];
    });

    const svc = new OfficeAccessService(db, () => new Date(nowMs));

    // First call: cold cache -> read-only probe detects exact match -> 0 write transactions
    const r1 = await svc.resolveAccess(bossUser);
    expect(r1.member).toBe(true);
    expect(transaction).not.toHaveBeenCalled();

    const callsAfterFirst = calls.length;

    // Second call within TTL -> hits memory cache (only step-1 lead check + listActiveMembers)
    nowMs += 5_000;
    const r2 = await svc.resolveAccess(bossUser);
    expect(r2.member).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
    const secondCallSqls = calls.slice(callsAfterFirst).map((c) => c.sql);
    expect(secondCallSqls.some((sql) => sql.includes('as has_saco_row'))).toBe(false);

    // After TTL expires -> re-probes read-only signature, still 0 write transactions
    nowMs += OFFICE_TEAM_SYNC_CACHE_TTL_MS + 1_000;
    const callsBeforeThird = calls.length;
    const r3 = await svc.resolveAccess(bossUser);
    expect(r3.member).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
    const thirdCallSqls = calls.slice(callsBeforeThird).map((c) => c.sql);
    expect(thirdCallSqls.some((sql) => sql.includes('as has_saco_row'))).toBe(true);
  });

  it('bypasses TTL cache for a newly added SACO, serializes with pg_advisory_xact_lock, and avoids colliding desks', async () => {
    let nowMs = new Date('2026-11-23T02:00:00.000Z').getTime();
    let staff2Added = false;

    const { db, calls, transaction } = makeFakeDb((sql) => {
      if (sql.includes('from team_lead_profiles tlp')) {
        return [{ user_id: BOSS_ID, name: 'Lê Huy' }];
      }
      if (sql.includes('from tf_sacos s') && sql.includes('s.lead_user_id, coalesce')) {
        return [{ lead_user_id: BOSS_ID, lead_name: 'Lê Huy' }];
      }
      if (sql.includes('from office_teams t') && sql.includes('t.boss_user_id = $1')) {
        return [teamRow];
      }
      if (sql.includes('from tf_sacos s') && sql.includes('assigned_date')) {
        return staff2Added
          ? [
              { user_id: STAFF1_ID, assigned_date: '2026-11-20' },
              { user_id: STAFF2_ID, assigned_date: '2026-11-23' },
            ]
          : [{ user_id: STAFF1_ID, assigned_date: '2026-11-20' }];
      }
      if (sql.includes('as has_saco_row')) {
        return [
          { user_id: BOSS_ID, role: 'boss', desk_index: null, active: true, has_saco_row: false },
          { user_id: STAFF1_ID, role: 'staff', desk_index: 0, active: true, has_saco_row: true },
        ];
      }
      if (sql.includes('as has_pending_transfer')) {
        return [{ has_pending_transfer: false }];
      }
      if (sql.includes('from office_members') && sql.includes("role = 'staff'")) {
        // STAFF1 active on desk 0; STAFF2 was previously inactive with colliding desk 0
        return [
          { user_id: STAFF1_ID, desk_index: 0, active: true },
          { user_id: STAFF2_ID, desk_index: 0, active: false },
        ];
      }
      if (sql.includes('from office_members om') && sql.includes('left join tf_profiles')) {
        return [
          ...activeMemberListRows,
          ...(staff2Added
            ? [
                {
                  id: 'ms-2',
                  team_id: TEAM_ID,
                  user_id: STAFF2_ID,
                  role: 'staff',
                  display_name: 'Nguyễn Văn An',
                  email: 'an@iqx.vn',
                  avatar: null,
                  avatar_color: null,
                  desk_index: 1,
                  join_date: '2026-11-23',
                  accent_color: '#1D6FE8',
                  active: true,
                },
              ]
            : []),
        ];
      }
      return [];
    });

    const svc = new OfficeAccessService(db, () => new Date(nowMs));

    // Warm cache with boss
    await svc.resolveAccess(bossUser);
    expect(transaction).not.toHaveBeenCalled();

    // New SACO arrives within 2s (inside TTL) -> bypasses cache because STAFF2_ID not in cached activeUserIds
    staff2Added = true;
    nowMs += 2_000;
    const resolvedStaff2 = await svc.resolveAccess(staff2User);
    expect(resolvedStaff2.member).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);

    const txCalls = calls.filter((c) => c.inTx);
    expect(txCalls[0]?.sql).toContain("pg_advisory_xact_lock(hashtext('office_team_sync:' || $1))");
    expect(txCalls[0]?.params).toEqual([BOSS_ID]);

    // Reactivating STAFF2 whose old desk_index (0) is already occupied by active STAFF1 gets fresh desk 1
    const reactivateCall = txCalls.find(
      (c) =>
        c.sql.includes('update office_members') &&
        c.sql.includes('set active = true, desk_index = $3'),
    );
    expect(reactivateCall?.params).toEqual([TEAM_ID, STAFF2_ID, 1]);
  });

  it('assigns strictly distinct sequential desks to multiple new staff during locked first sync', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from team_lead_profiles tlp')) {
        return [{ user_id: BOSS_ID, name: 'Lê Huy' }];
      }
      if (sql.includes('from office_teams t') && sql.includes('t.boss_user_id = $1')) {
        return calls.some((c) => c.sql.includes('insert into office_teams')) ? [teamRow] : [];
      }
      if (sql.includes('from tf_sacos s') && sql.includes('assigned_date')) {
        return [
          { user_id: STAFF1_ID, assigned_date: '2026-11-20' },
          { user_id: STAFF2_ID, assigned_date: '2026-11-21' },
          { user_id: STAFF3_ID, assigned_date: '2026-11-22' },
        ];
      }
      if (sql.includes('from office_members om') && sql.includes('left join tf_profiles')) {
        return activeMemberListRows;
      }
      return [];
    });

    const svc = new OfficeAccessService(db, () => new Date('2026-11-23T02:00:00.000Z'));
    await svc.resolveAccess(bossUser);

    const staffInserts = calls.filter(
      (c) => c.inTx && c.sql.includes('insert into office_members') && c.sql.includes("'staff'"),
    );
    expect(staffInserts).toHaveLength(3);
    expect(staffInserts.map((c) => c.params[2])).toEqual([0, 1, 2]);
  });
});

describe('Fix 2: Daily repeat spawn lazy catch-up, idempotency & worker boot pass', () => {
  const MONDAY = new Date('2026-11-23T02:00:00.000Z'); // 2026-11-23 09:00 ICT (Mon)
  const TUESDAY = new Date('2026-11-24T02:00:00.000Z'); // 2026-11-24 09:00 ICT (Tue)
  const SATURDAY = new Date('2026-11-21T02:00:00.000Z'); // 2026-11-21 09:00 ICT (Sat)

  it('runs lazy per-team catch-up at most once per team per ICT day and coalesces concurrent calls', async () => {
    let releaseInsert!: () => void;
    const insertGate = new Promise<void>((resolveGate) => {
      releaseInsert = resolveGate;
    });
    const { db, calls, transaction } = makeFakeDb(async (sql) => {
      if (sql.includes('from virtual_trading_configs')) return [{ holidays: [] }];
      if (sql.includes('insert into office_tasks')) {
        await insertGate;
        return [{ id: TASK_VALID_ID, team_id: TEAM_ID }];
      }
      return [];
    });
    const hub = makeHubStub();
    const cron = new OfficeCronService(db, hub);

    // Fire two concurrent catch-up requests for the same team+day
    const p1 = cron.ensureDailyRepeatsForTeam(TEAM_ID, MONDAY);
    const p2 = cron.ensureDailyRepeatsForTeam(TEAM_ID, MONDAY);
    releaseInsert();
    const [o1, o2] = await Promise.all([p1, p2]);

    expect(o1).toEqual({ status: 'completed', todayDate: '2026-11-23', spawnedTasks: 1 });
    expect(o2).toEqual(o1);
    expect(transaction).toHaveBeenCalledTimes(1);
    const insertCall = calls.find((c) => c.sql.includes('insert into office_tasks'))!;
    expect(insertCall.sql).toContain('and a.team_id = $4');
    expect(insertCall.sql).toContain('not exists');
    expect(insertCall.sql).toContain('on conflict (assignment_id, user_id, task_date) do nothing');
    expect(insertCall.params[3]).toBe(TEAM_ID);
    expect(hub.publishSyncAcrossProcesses).toHaveBeenCalledTimes(1);

    // Subsequent call same day hits in-memory guard -> zero DB queries
    const callsBeforeRepeat = calls.length;
    const o3 = await cron.ensureDailyRepeatsForTeam(TEAM_ID, MONDAY);
    expect(o3).toEqual({
      status: 'skipped',
      reason: 'already-caught-up',
      todayDate: '2026-11-23',
      spawnedTasks: 0,
    });
    expect(calls.length).toBe(callsBeforeRepeat);

    // Next workday runs a fresh catch-up pass
    const o4 = await cron.ensureDailyRepeatsForTeam(TEAM_ID, TUESDAY);
    expect(o4).toMatchObject({ status: 'completed', todayDate: '2026-11-24' });
    expect(transaction).toHaveBeenCalledTimes(2);

    // Weekend skips without write transaction
    const oSat = await cron.ensureDailyRepeatsForTeam(TEAM_ID, SATURDAY);
    expect(oSat).toEqual({
      status: 'skipped',
      reason: 'non-workday',
      todayDate: '2026-11-21',
      spawnedTasks: 0,
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('triggers lazy catch-up from listMyTasks, listAssignments, listReview, getProgress, and office/me', async () => {
    const { db } = makeFakeDb(() => []);
    const ensureSpy = vi.fn().mockResolvedValue({
      status: 'completed',
      todayDate: '2026-11-23',
      spawnedTasks: 0,
    });
    const cronStub = {
      ensureDailyRepeatsForTeam: ensureSpy,
    } as unknown as OfficeCronService;
    const access = makeAccessStub();
    const hub = makeHubStub();
    const tasksSvc = new OfficeTasksService(
      db,
      access,
      makeNotifierStub().notifier,
      hub,
      () => MONDAY,
      cronStub,
    );

    await tasksSvc.listMyTasks(staff1User);
    await tasksSvc.listAssignments(bossUser);
    await tasksSvc.listReview(bossUser);
    await tasksSvc.getProgress(bossUser);
    expect(ensureSpy).toHaveBeenCalledTimes(4);
    expect(ensureSpy).toHaveBeenCalledWith(TEAM_ID, MONDAY);

    // Also triggered via GET office/me (board HUD)
    const { db: meDb } = makeFakeDb((sql) => {
      if (sql.includes('from virtual_trading_configs')) return [{ holidays: [] }];
      if (sql.includes('from office_tasks')) {
        return [{ pending_count: '0', today_done: '0', today_total: '0' }];
      }
      if (sql.includes('from office_proposals')) return [{ new_count: '0' }];
      return [];
    });
    const meAccess = new OfficeAccessService(meDb, () => MONDAY);
    vi.spyOn(meAccess, 'resolveAccess').mockResolvedValue(makeContext('boss'));
    const controller = new OfficeController(
      meAccess,
      tasksSvc,
      {} as OfficeAttendanceService,
      hub,
      cronStub,
    );
    await controller.me(bossUser);
    expect(ensureSpy).toHaveBeenCalledTimes(5);
  });

  it('runs daily repeat spawn catch-up at worker boot via OfficeJobsModule.onApplicationBootstrap', async () => {
    const spawnDailyRepeats = vi.fn().mockResolvedValue({
      status: 'completed',
      detail: { todayDate: '2026-11-23', spawnedTasks: 2, teamsAffected: 1 },
    });
    const mod = new OfficeJobsModule({ spawnDailyRepeats } as unknown as OfficeCronService);

    await mod.onApplicationBootstrap();
    expect(spawnDailyRepeats).toHaveBeenCalledTimes(1);

    // Respects JOB_OFFICE_SPAWN_DAILY_REPEATS_ENABLED=false
    const prev = process.env.JOB_OFFICE_SPAWN_DAILY_REPEATS_ENABLED;
    process.env.JOB_OFFICE_SPAWN_DAILY_REPEATS_ENABLED = 'false';
    try {
      await mod.onApplicationBootstrap();
      expect(spawnDailyRepeats).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.JOB_OFFICE_SPAWN_DAILY_REPEATS_ENABLED;
      else process.env.JOB_OFFICE_SPAWN_DAILY_REPEATS_ENABLED = prev;
    }

    // Transient DB error does not crash worker startup
    const failingMod = new OfficeJobsModule({
      spawnDailyRepeats: vi.fn().mockRejectedValue(new Error('db unavailable')),
    } as unknown as OfficeCronService);
    await expect(failingMod.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});

describe('Fix 3: updateAssignment due_date validation (today..monthEnd VN time)', () => {
  const TODAY_ICT = () => new Date('2026-11-23T02:00:00.000Z'); // 2026-11-23 09:00 ICT

  const makeUpdateService = (kind: 'month' | 'kpi', periodMonth = '2026-11', dueDate = '2026-11-28') => {
    const { db } = makeFakeDb((sql) => {
      if (sql.includes('from office_assignments') && sql.includes('for update')) {
        return [
          {
            id: ASSIGN_ID,
            kind,
            title: 'Monthly Goal',
            points: 50,
            repeat_daily: false,
            due_date: dueDate,
            period_month: periodMonth,
            created_at: new Date('2026-11-10T02:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('from office_assignment_targets')) return [{ user_id: STAFF1_ID }];
      if (sql.includes('done_count')) return [{ done_count: '0', active_count: '1' }];
      return [];
    });
    return new OfficeTasksService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      TODAY_ICT,
    );
  };

  it('rejects dueDate earlier than today for both month and kpi assignments while accepting today..monthEnd', async () => {
    for (const kind of ['month', 'kpi'] as const) {
      const svc = makeUpdateService(kind);

      // Yesterday (within same month) -> rejected with same rule as createAssignment
      await expect(
        svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-11-22' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-11-01' }),
      ).rejects.toThrow(BadRequestException);
      // Past month end -> rejected
      await expect(
        svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-12-01' }),
      ).rejects.toThrow(BadRequestException);

      // Exact lower bound (today) and upper bound (month end) -> accepted
      const onToday = await svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-11-23' });
      expect(onToday.dueDate).toBe('2026-11-23');

      const onMonthEnd = await svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-11-30' });
      expect(onMonthEnd.dueDate).toBe('2026-11-30');

      const onNull = await svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: null });
      expect(onNull.dueDate).toBe('2026-11-30');
    }

    // Editing title/points without changing dueDate on an already-overdue assignment remains allowed
    const overdueSvc = makeUpdateService('month', '2026-11', '2026-11-15');
    const edited = await overdueSvc.updateAssignment(bossUser, ASSIGN_ID, { title: 'Updated' });
    expect(edited.dueDate).toBe('2026-11-15');

    // Past-month assignment rejects dueDate updates (even null)
    const pastMonthSvc = makeUpdateService('kpi', '2026-10', '2026-10-31');
    await expect(
      pastMonthSvc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-11-25' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      pastMonthSvc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: null }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('Fix 4: office_attendance unique (user_id, work_date) across team transfers', () => {
  const MORNING_ICT = () => new Date('2026-11-23T01:15:00.000Z'); // 08:15 ICT

  it('uses ON CONFLICT (user_id, work_date) and returns 409 on conflict or Postgres 23505', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('insert into office_attendance')) return [];
      return [];
    });
    const svc = new OfficeAttendanceService(db, makeAccessStub(), makeHubStub(), MORNING_ICT);

    await expect(svc.checkIn(staff1User)).rejects.toBeInstanceOf(ConflictException);
    const insertCall = calls.find((c) => c.sql.includes('insert into office_attendance'))!;
    expect(insertCall.sql).toContain('on conflict (user_id, work_date) do nothing');
    expect(insertCall.sql).not.toContain('on conflict (team_id, user_id, work_date)');

    // Also converts raw Postgres unique violation (23505) to the same 409 ConflictException
    const pgConflictDb = makeFakeDb((sql) => {
      if (sql.includes('insert into office_attendance')) {
        const err = Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
        });
        throw err;
      }
      return [];
    }).db;
    const svc2 = new OfficeAttendanceService(pgConflictDb, makeAccessStub(), makeHubStub(), MORNING_ICT);
    await expect(svc2.checkIn(staff1User)).rejects.toBeInstanceOf(ConflictException);
  });

  it('reads today attendance and staff HUD by user_id + work_date (team-transfer safe)', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_attendance')) {
        return [{ user_id: STAFF1_ID, status: 'ok', checked_in_at: new Date('2026-11-23T01:10:00Z') }];
      }
      return [];
    });
    const svc = new OfficeAttendanceService(db, makeAccessStub(), makeHubStub(), MORNING_ICT);
    const today = await svc.today(staff1User);

    expect(today.counts.ok).toBe(1);
    expect(today.myStatus).toBe('ok');
    const attQuery = calls.find((c) => c.sql.includes('from office_attendance'))!;
    expect(attQuery.sql).toContain('user_id = any($1::uuid[]) and work_date = $2::date');
    expect(attQuery.params).toEqual([[STAFF1_ID, STAFF2_ID], '2026-11-23']);
  });

  it('migration 0068_office_fixes.sql deduplicates desks and attendance before creating unique indexes', async () => {
    const sql = await readFile(
      resolve(process.cwd(), 'migrations/0068_office_fixes.sql'),
      'utf8',
    );
    expect(sql).toContain('uq_office_members_team_desk_active');
    expect(sql).toContain('WHERE desk_index IS NOT NULL AND active = true');
    expect(sql).toContain('uq_office_attendance_user_date');
    expect(sql).toContain('ON office_attendance (user_id, work_date)');
    expect(sql).toContain('ORDER BY checked_in_at ASC, id ASC');
  });
});

describe('Fix 6: Partial per-id bulk approve with row locks & single-award guarantee', () => {
  const MONDAY_0900_ICT = () => new Date('2026-11-23T02:00:00.000Z');

  const makeTaskRow = (overrides: Record<string, unknown>) => ({
    id: TASK_VALID_ID,
    assignment_id: ASSIGN_ID,
    user_id: STAFF1_ID,
    kind: 'day',
    title: 'Báo cáo đầu phiên',
    points: 20,
    points_snapshot: null,
    repeat_daily: false,
    task_date: '2026-11-23',
    due_date: null,
    period_month: '2026-11',
    status: 'pending',
    submit_note: 'Xong',
    submitted_at: new Date('2026-11-23T01:10:00Z'),
    return_reason: null,
    returned_at: null,
    approved_at: null,
    created_at: new Date('2026-11-23T01:00:00Z'),
    ...overrides,
  });

  it('approves valid ids and returns per-id skipped reasons for expired, non-pending, and missing ids', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_tasks') && sql.includes('for update')) {
        return [
          makeTaskRow({ id: TASK_VALID_ID, status: 'pending', task_date: '2026-11-23' }),
          makeTaskRow({
            id: TASK_EXPIRED_ID,
            user_id: STAFF2_ID,
            title: 'Nhiệm vụ hôm qua',
            status: 'pending',
            task_date: '2026-11-22',
          }),
          makeTaskRow({
            id: TASK_DONE_ID,
            user_id: STAFF2_ID,
            title: 'Đã duyệt rồi',
            status: 'done',
            task_date: '2026-11-23',
          }),
        ];
      }
      if (sql.includes('insert into office_points_monthly')) return [{ points: 120 }];
      return [];
    });

    const { notifier, sent } = makeNotifierStub();
    const hub = makeHubStub();
    const svc = new OfficeTasksService(db, makeAccessStub(), notifier, hub, MONDAY_0900_ICT);

    const res = await svc.approveTasks(bossUser, {
      ids: [TASK_VALID_ID, TASK_EXPIRED_ID, TASK_DONE_ID, TASK_MISSING_ID],
    });

    expect(officeApproveTasksResponseSchema.safeParse(res).success).toBe(true);
    expect(res.approved).toEqual([
      {
        taskId: TASK_VALID_ID,
        userId: STAFF1_ID,
        staffName: 'Lê Ngọc Hạnh',
        title: 'Báo cáo đầu phiên',
        points: 20,
        totalMonthlyPoints: 120,
      },
    ]);
    expect(res.skipped).toEqual([
      {
        taskId: TASK_EXPIRED_ID,
        code: 'OFFICE_TASK_EXPIRED',
        reason: 'Nhiệm vụ đã hết hạn, không duyệt được.',
      },
      {
        taskId: TASK_DONE_ID,
        code: 'OFFICE_TASK_NOT_PENDING',
        reason: 'Chỉ duyệt được nhiệm vụ đang chờ xác nhận.',
      },
      {
        taskId: TASK_MISSING_ID,
        code: 'OFFICE_TASK_NOT_FOUND',
        reason: 'Nhiệm vụ không tồn tại trong nhóm của bạn.',
      },
    ]);

    // Keeps FOR UPDATE row lock and single-award `status = 'pending'` guard
    const lockCall = calls.find((c) => c.sql.includes('for update'))!;
    expect(lockCall.sql).toContain('order by id asc');
    const updateCall = calls.find((c) => c.sql.includes('update office_tasks'))!;
    expect(updateCall.sql).toContain("and status = 'pending'");
    expect(updateCall.params[0]).toBe(TASK_VALID_ID);

    // Only awards and notifies the 1 valid task
    expect(sent).toHaveLength(1);
    expect(sent[0]?.userId).toBe(STAFF1_ID);
    expect(hub.broadcastSync).toHaveBeenCalledWith(TEAM_ID, 'tasks');
    expect(hub.broadcastSync).toHaveBeenCalledWith(TEAM_ID, 'leaderboard');
    expect(hub.broadcastSync).toHaveBeenCalledWith(TEAM_ID, 'notifications', [STAFF1_ID]);
  });

  it('returns empty approved and full skipped list without broadcasting when all items in a multi-id batch are skipped', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_tasks') && sql.includes('for update')) {
        return [
          makeTaskRow({ id: TASK_EXPIRED_ID, status: 'pending', task_date: '2026-11-22' }),
          makeTaskRow({ id: TASK_DONE_ID, status: 'done', task_date: '2026-11-23' }),
        ];
      }
      return [];
    });
    const { notifier, sent } = makeNotifierStub();
    const hub = makeHubStub();
    const svc = new OfficeTasksService(db, makeAccessStub(), notifier, hub, MONDAY_0900_ICT);

    const res = await svc.approveTasks(bossUser, { ids: [TASK_EXPIRED_ID, TASK_DONE_ID] });
    expect(res.approved).toEqual([]);
    expect(res.skipped).toHaveLength(2);
    expect(calls.some((c) => c.sql.includes('update office_tasks'))).toBe(false);
    expect(sent).toHaveLength(0);
    expect(hub.broadcastSync).not.toHaveBeenCalled();
  });

  it('deduplicates repeated ids in a batch and preserves single-id HTTP errors', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_tasks') && sql.includes('for update')) {
        return [makeTaskRow({ id: TASK_VALID_ID, status: 'pending', task_date: '2026-11-23' })];
      }
      if (sql.includes('insert into office_points_monthly')) return [{ points: 20 }];
      return [];
    });
    const svc = new OfficeTasksService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      MONDAY_0900_ICT,
    );

    const deduped = await svc.approveTasks(bossUser, { ids: [TASK_VALID_ID, TASK_VALID_ID] });
    expect(deduped.approved).toHaveLength(1);
    expect(deduped.skipped).toEqual([]);
    expect(calls.filter((c) => c.sql.includes('insert into office_points_monthly'))).toHaveLength(1);

    // Single missing id -> 404, single non-pending -> 409, single expired -> 400
    const missingSvc = new OfficeTasksService(
      makeFakeDb(() => []).db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      MONDAY_0900_ICT,
    );
    await expect(
      missingSvc.approveTasks(bossUser, { ids: [TASK_MISSING_ID] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const doneSvc = new OfficeTasksService(
      makeFakeDb((sql) =>
        sql.includes('for update') ? [makeTaskRow({ id: TASK_DONE_ID, status: 'done' })] : [],
      ).db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      MONDAY_0900_ICT,
    );
    await expect(doneSvc.approveTasks(bossUser, { ids: [TASK_DONE_ID] })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
