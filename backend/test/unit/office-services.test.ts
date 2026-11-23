import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';
import type { AuthenticatedUser } from '../../src/modules/auth/index.js';
import type {
  OfficeNotificationInput,
  OfficeNotifier,
} from '../../src/modules/notifications/index.js';
import { OfficeWorkspaceController } from '../../src/modules/office/office-workspace.controller.js';
import type { OfficeAccessContext } from '../../src/modules/office/office.types.js';
import type { OfficeHub } from '../../src/modules/office/realtime/office.hub.js';
import { OfficeAccessService } from '../../src/modules/office/services/office-access.service.js';
import { OfficeAttendanceService } from '../../src/modules/office/services/office-attendance.service.js';
import { OfficeCollabService } from '../../src/modules/office/services/office-collab.service.js';
import { OfficeCronService } from '../../src/modules/office/services/office-cron.service.js';
import { OfficeRoomsService } from '../../src/modules/office/services/office-rooms.service.js';
import { OfficeTasksService } from '../../src/modules/office/services/office-tasks.service.js';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const BOSS_ID = '22222222-2222-4222-8222-222222222222';
const STAFF1_ID = '33333333-3333-4333-8333-333333333333';
const STAFF2_ID = '44444444-4444-4444-8444-444444444444';
const TASK1_ID = '55555555-5555-4555-8555-555555555555';
const TASK2_ID = '66666666-6666-4666-8666-666666666666';
const ASSIGN_ID = '77777777-7777-4777-8777-777777777777';
const PROP_ID = '88888888-8888-4888-8888-888888888888';

const bossUser = { id: BOSS_ID, role: 'team_lead' } as AuthenticatedUser;
const staff1User = { id: STAFF1_ID, role: 'user' } as AuthenticatedUser;

const makeContext = (role: 'boss' | 'staff'): OfficeAccessContext => {
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
};

function makeAccessStub(holidays: string[] = []): OfficeAccessService {
  const bossCtx = makeContext('boss');
  const staffCtx = makeContext('staff');
  const resolve = async (u: Pick<AuthenticatedUser, 'id'>) => {
    if (u.id === BOSS_ID) return bossCtx;
    if (u.id === STAFF1_ID) return staffCtx;
    return {
      member: false as const,
      role: 'none' as const,
      team: null,
      self: null,
      members: [] as const,
    };
  };
  const svc = new OfficeAccessService({} as DatabaseService);
  vi.spyOn(svc, 'resolveAccess').mockImplementation(resolve);
  vi.spyOn(svc, 'loadHolidays').mockResolvedValue(new Set(['2026-04-30', ...holidays]));
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

function makeFakeDb(
  handler: (sql: string, params: readonly unknown[]) => unknown[] | Promise<unknown[]>,
) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    return handler(sql, params);
  });
  const db = {
    query,
    transaction: vi.fn(async (fn: (tx: SqlClient) => Promise<unknown>) =>
      fn({ query } as unknown as SqlClient),
    ),
  } as unknown as DatabaseService;
  return { db, calls };
}

describe('OfficeTasksService: 5-state lifecycle, edit/delete rules, leaderboard', () => {
  const MONDAY_0900_ICT = () => new Date('2026-11-23T02:00:00.000Z'); // 2026-11-23 09:00 ICT

  it('creates assignment, spawns 1 task per target, logs events, notifies once per target', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('insert into office_assignments')) {
        return [
          {
            id: ASSIGN_ID,
            kind: 'day',
            title: 'Báo cáo đầu phiên',
            points: 15,
            repeat_daily: true,
            due_date: null,
            period_month: '2026-11',
            created_at: new Date('2026-11-23T02:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('insert into office_tasks')) return [{ id: TASK1_ID }];
      return [];
    });
    const { notifier, sent } = makeNotifierStub();
    const hub = makeHubStub();
    const svc = new OfficeTasksService(db, makeAccessStub(), notifier, hub, MONDAY_0900_ICT);

    const res = await svc.createAssignment(bossUser, {
      kind: 'day',
      title: 'Báo cáo đầu phiên',
      points: 15,
      repeatDaily: true,
      userIds: [STAFF1_ID, STAFF2_ID],
    });

    expect(res.targetCount).toBe(2);
    expect(res.isAllTeam).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      type: 'office_task_assigned',
      link: '/van-phong?modal=mine',
      body: 'Sếp giao nhiệm vụ ngày "Báo cáo đầu phiên"',
    });
    expect(calls.filter((c) => c.sql.includes('insert into office_task_events'))).toHaveLength(2);
    expect(hub.broadcastSync).toHaveBeenCalledWith(TEAM_ID, 'tasks');
  });

  it('edits assignment: updates title on ALL tasks, points & due_date ONLY on non-done tasks', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_assignments') && sql.includes('for update')) {
        return [
          {
            id: ASSIGN_ID,
            kind: 'month',
            title: 'Old title',
            points: 40,
            repeat_daily: false,
            due_date: '2026-11-28',
            period_month: '2026-11',
            created_at: new Date('2026-11-23T02:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('returning id')) return [{ id: TASK1_ID }];
      if (sql.includes('from office_assignment_targets'))
        return [{ user_id: STAFF1_ID }, { user_id: STAFF2_ID }];
      if (sql.includes('done_count')) return [{ done_count: '1', active_count: '2' }];
      return [];
    });
    const svc = new OfficeTasksService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      MONDAY_0900_ICT,
    );

    await svc.updateAssignment(bossUser, ASSIGN_ID, {
      title: 'New title',
      points: 60,
      dueDate: '2026-11-30',
    });

    const pointsUpdate = calls.find((c) => c.sql.includes('set points = $3, due_date = $4'));
    expect(pointsUpdate).toBeDefined();
    expect(pointsUpdate!.sql).toContain("status in ('todo', 'pending', 'returned')");
  });

  it('deletes assignment: soft-deletes assignment and deletes ONLY non-done tasks', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_assignments')) return [{ id: ASSIGN_ID }];
      if (sql.includes('delete from office_tasks')) return [{ id: TASK1_ID }];
      if (sql.includes('count(*)::text as n')) return [{ n: '1' }];
      return [];
    });
    const svc = new OfficeTasksService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      MONDAY_0900_ICT,
    );

    const res = await svc.deleteAssignment(bossUser, ASSIGN_ID);
    expect(res).toEqual({ ok: true, deletedTaskCount: 1, retainedDoneCount: 1 });
    expect(calls.some((c) => c.sql.includes('set deleted_at = $3'))).toBe(true);
    expect(calls.some((c) => c.sql.includes("status <> 'done'"))).toBe(true);
  });

  it('rejects submitting and approving expired tasks, and credits points_snapshot + reached_at on bulk approve', async () => {
    const expiredDb = makeFakeDb((sql) => {
      if (sql.includes('from office_tasks')) {
        return [
          {
            id: TASK1_ID,
            assignment_id: ASSIGN_ID,
            user_id: STAFF1_ID,
            kind: 'day',
            title: 'Old day task',
            points: 10,
            points_snapshot: null,
            repeat_daily: false,
            task_date: '2026-11-22', // yesterday -> expired!
            due_date: null,
            period_month: '2026-11',
            status: 'pending',
            submit_note: null,
            submitted_at: new Date('2026-11-22T09:00:00Z'),
            return_reason: null,
            returned_at: null,
            approved_at: null,
            created_at: new Date('2026-11-22T01:00:00Z'),
          },
        ];
      }
      return [];
    });
    const expiredSvc = new OfficeTasksService(
      expiredDb.db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      MONDAY_0900_ICT,
    );

    await expect(expiredSvc.approveTasks(bossUser, { ids: [TASK1_ID] })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // Valid bulk approve freezes points_snapshot and notifies each staff with "+{p} điểm"
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_tasks') && sql.includes('for update')) {
        return [
          {
            id: TASK1_ID,
            assignment_id: ASSIGN_ID,
            user_id: STAFF1_ID,
            kind: 'day',
            title: 'Task 1',
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
          },
          {
            id: TASK2_ID,
            assignment_id: ASSIGN_ID,
            user_id: STAFF2_ID,
            kind: 'kpi',
            title: 'Mở 20 TK',
            points: 100,
            points_snapshot: null,
            repeat_daily: false,
            task_date: '2026-11-23',
            due_date: '2026-11-30',
            period_month: '2026-11',
            status: 'pending',
            submit_note: '20/20',
            submitted_at: new Date('2026-11-23T01:20:00Z'),
            return_reason: null,
            returned_at: null,
            approved_at: null,
            created_at: new Date('2026-11-23T01:00:00Z'),
          },
        ];
      }
      if (sql.includes('insert into office_points_monthly')) return [{ points: 120 }];
      return [];
    });
    const { notifier, sent } = makeNotifierStub();
    const hub = makeHubStub();
    const svc = new OfficeTasksService(db, makeAccessStub(), notifier, hub, MONDAY_0900_ICT);

    const approved = await svc.approveTasks(bossUser, { ids: [TASK1_ID, TASK2_ID] });
    expect(approved.approved).toHaveLength(2);
    expect(calls.some((c) => c.sql.includes('points_snapshot = $3'))).toBe(true);
    expect(calls.some((c) => c.sql.includes('insert into office_points_monthly'))).toBe(true);
    expect(sent.map((n) => n.body)).toEqual([
      'Sếp đã duyệt "Task 1" · +20 điểm',
      'Sếp đã duyệt "Mở 20 TK" · +100 điểm',
    ]);
    expect(hub.broadcastSync).toHaveBeenCalledWith(TEAM_ID, 'leaderboard');
  });

  it('orders review queue oldest submitted_at first and handles leaderboard tie-break + Dec->Jan reset', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_points_monthly pm')) {
        return [
          {
            user_id: STAFF2_ID,
            display_name: 'Nguyễn Văn An',
            accent_color: '#1D6FE8',
            points: 100,
            reached_at: new Date('2026-12-10T01:00:00Z'),
          },
          {
            user_id: STAFF1_ID,
            display_name: 'Lê Ngọc Hạnh',
            accent_color: '#C2417D',
            points: 100,
            reached_at: new Date('2026-12-10T02:00:00Z'),
          },
        ];
      }
      return [];
    });
    const svc = new OfficeTasksService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      () => new Date('2026-12-15T03:00:00Z'),
    );

    await svc.listReview(bossUser);
    expect(calls[0]!.sql).toContain('order by t.submitted_at asc');

    const lb = await svc.getLeaderboard(staff1User, { period: '2026-12' });
    expect(calls[1]!.sql).toContain('pm.points > 0');
    expect(calls[1]!.sql).toContain(
      'join office_members om on om.team_id = pm.team_id and om.user_id = pm.user_id and om.active = true',
    );
    expect(calls[1]!.sql).toContain('order by pm.points desc, pm.reached_at asc');
    expect(lb.top3[0]?.userId).toBe(STAFF2_ID);
    expect(lb.myRank).toEqual({ rank: 2, points: 100 });
    expect(lb.nextResetLabel).toBe('01/01');
    expect(lb.nextResetDate).toBe('2027-01-01');

    // Past historical month preserves LEFT JOIN so historical rankings remain visible
    await svc.getLeaderboard(staff1User, { period: '2026-11' });
    expect(calls[2]!.sql).toContain(
      'left join office_members om on om.team_id = pm.team_id and om.user_id = pm.user_id',
    );

    const bossLb = await svc.getLeaderboard(bossUser, { period: '2026-12' });
    expect(bossLb.myRank).toBeNull();
  });

  it('[L-M4] filters listAssignments to current month + repeating day tasks, and enforces dueDate >= monthStart on update', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from office_assignments') && sql.includes('for update')) {
        return [
          {
            id: ASSIGN_ID,
            kind: 'month',
            title: 'Monthly KPI',
            points: 50,
            repeat_daily: false,
            due_date: '2026-11-28',
            period_month: '2026-11',
            created_at: new Date('2026-11-23T02:00:00.000Z'),
          },
        ];
      }
      return [];
    });
    const svc = new OfficeTasksService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      MONDAY_0900_ICT,
    );

    await svc.listAssignments(bossUser);
    expect(calls[0]!.sql).toContain('period_month = $2');
    expect(calls[0]!.sql).toContain("kind = 'day' and repeat_daily = true");
    expect(calls[0]!.params).toEqual([TEAM_ID, '2026-11']);

    // Arbitrary past date before monthStart rejected
    await expect(
      svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '1990-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-10-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Date after monthEnd rejected
    await expect(
      svc.updateAssignment(bossUser, ASSIGN_ID, { dueDate: '2026-12-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('OfficeAttendanceService: UTC+7 cutoffs, holidays, weekends, duplicates, RBAC', () => {
  const runCheckIn = async (isoUtc: string, alreadyCheckedIn = false, user = staff1User) => {
    const { db } = makeFakeDb((sql) => {
      if (sql.includes('insert into office_attendance')) {
        if (alreadyCheckedIn) return [];
        const status = sql
          ? new Date(isoUtc).getUTCHours() < 1 ||
            (new Date(isoUtc).getUTCHours() === 1 && new Date(isoUtc).getUTCMinutes() <= 30)
            ? 'ok'
            : 'late'
          : 'ok';
        return [{ work_date: '2026-11-23', status, checked_in_at: new Date(isoUtc) }];
      }
      return [];
    });
    const svc = new OfficeAttendanceService(
      db,
      makeAccessStub(),
      makeHubStub(),
      () => new Date(isoUtc),
    );
    return svc.checkIn(user);
  };

  it('marks <=08:30 ok, 08:31..12:00 late, rejects >12:00, weekends, holidays, duplicates, and boss', async () => {
    // 08:30 ICT (01:30Z) -> ok
    expect((await runCheckIn('2026-11-23T01:30:00.000Z')).status).toBe('ok');
    // 08:31 ICT (01:31Z) -> late
    expect((await runCheckIn('2026-11-23T01:31:00.000Z')).status).toBe('late');
    // 12:00 ICT (05:00Z) -> late
    expect((await runCheckIn('2026-11-23T05:00:00.000Z')).status).toBe('late');
    // 12:01 ICT (05:01Z) -> 400 locked
    await expect(runCheckIn('2026-11-23T05:01:00.000Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Saturday 2026-11-21 08:15 ICT -> 400 non-workday
    await expect(runCheckIn('2026-11-21T01:15:00.000Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // VN Holiday 2026-04-30 08:15 ICT -> 400 non-workday
    await expect(runCheckIn('2026-04-30T01:15:00.000Z')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Duplicate same day -> 409
    await expect(runCheckIn('2026-11-23T01:15:00.000Z', true)).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Boss blocked -> 403
    await expect(runCheckIn('2026-11-23T01:15:00.000Z', false, bossUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('OfficeCollabService: RBAC isolation, sticky note limits, one-time proposal reply, joinDate', () => {
  const NOW = () => new Date('2026-11-23T03:00:00.000Z');

  it('blocks Boss from staff sticky notes (403) and blocks Staff from boss profiles/proposals (403)', async () => {
    const { db } = makeFakeDb(() => []);
    const svc = new OfficeCollabService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      NOW,
    );

    await expect(svc.listStickyNotes(bossUser)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.createStickyNote(bossUser, { color: 'y', content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.listTeamProposals(staff1User)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.getMemberProfile(staff1User, STAFF1_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      svc.createMemberNote(staff1User, STAFF1_ID, { content: 'secret' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces max 50 sticky notes, one-time proposal reply (409), and joinDate <= today (400)', async () => {
    const { db } = makeFakeDb((sql) => {
      if (sql.includes('from office_sticky_notes') && sql.includes('count(*)'))
        return [{ n: '50' }];
      if (sql.includes('from office_proposals') && sql.includes('for update')) {
        return [{ id: PROP_ID, user_id: STAFF1_ID, status: 'replied' }];
      }
      return [];
    });
    const svc = new OfficeCollabService(
      db,
      makeAccessStub(),
      makeNotifierStub().notifier,
      makeHubStub(),
      NOW,
    );

    await expect(
      svc.createStickyNote(staff1User, { color: 'y', content: '51st' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      svc.replyProposal(bossUser, PROP_ID, { reply: 'Already replied' }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      svc.updateMemberProfile(bossUser, STAFF1_ID, { joinDate: '2026-11-24' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('[L-M3] does not penalize mid-month new hires for workdays before joinDate in getMemberProfile', async () => {
    const newHireCtx = makeContext('boss');
    const midMonthMembers = newHireCtx.members.map((m) =>
      m.userId === STAFF2_ID ? { ...m, joinDate: '2026-11-20' } : m,
    );
    const access = makeAccessStub();
    vi.spyOn(access, 'resolveAccess').mockResolvedValue({
      ...newHireCtx,
      members: midMonthMembers,
    });

    const { db } = makeFakeDb((sql) => {
      if (sql.includes('from office_points_monthly')) return [{ points: 40 }];
      if (sql.includes('from office_tasks'))
        return [{ done_count: '2', total_count: '3', pending_count: '0' }];
      if (sql.includes('from office_attendance')) return [{ ok_count: '1', late_count: '0' }];
      return [];
    });
    const svc = new OfficeCollabService(
      db,
      access,
      makeNotifierStub().notifier,
      makeHubStub(),
      NOW, // 2026-11-23 (Mon); joinDate = 2026-11-20 (Fri) -> 2 workdays (Nov 20, Nov 23)
    );

    const profile = await svc.getMemberProfile(bossUser, STAFF2_ID);
    expect(profile.stats.attendanceOk).toBe(1);
    expect(profile.stats.attendanceAbsent).toBe(1); // 2 workdays since joinDate - 1 ok = 1 (not 15!)
  });
});

describe('OfficeRoomsService: document magic-byte, size, and HMAC download security', () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  const makeConfig = (mediaRoot: string) =>
    ({
      get: (key: string) =>
        ({
          MEDIA_ROOT: mediaRoot,
          MEDIA_SIGNING_SECRET: 's'.repeat(48),
          APP_ENV: 'test',
        })[key],
    }) as never;

  const streamFrom = async function* (chunks: Buffer[]) {
    for (const chunk of chunks) yield chunk;
  };

  it('uploads valid PDF, validates magic bytes & HMAC tokens, and rejects spoofing / >20MB', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'iqx-office-docs-'));
    let storedRow: Record<string, unknown> | null = null;
    const { db } = makeFakeDb((sql, params) => {
      if (sql.includes('insert into office_documents')) {
        storedRow = {
          id: params[0],
          team_id: params[1],
          title: params[3],
          file_name: params[4],
          file_ext: params[5],
          mime_type: params[6],
          size_bytes: params[7],
          storage_rel_path: params[8],
          created_at: new Date('2026-11-23T02:00:00Z'),
        };
        return [storedRow];
      }
      if (sql.includes('select id, team_id')) return storedRow ? [storedRow] : [];
      if (sql.includes('delete from office_documents')) return storedRow ? [storedRow] : [];
      return [];
    });

    const svc = new OfficeRoomsService(
      db,
      makeAccessStub(),
      makeConfig(tmpDir),
      makeHubStub(),
      () => new Date('2026-11-23T02:00:00Z'),
    );

    // Valid minimal PDF header
    const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    const uploaded = await svc.uploadDocument(bossUser, {
      stream: streamFrom([pdfBytes]),
      fileName: 'huong-dan.pdf',
      title: 'Hướng dẫn SACO',
    });

    expect(uploaded.fileExt).toBe('pdf');
    expect(uploaded.mimeType).toBe('application/pdf');
    expect(uploaded.downloadUrl).toContain('/api/v2/office/documents/');
    const token = new URL(`http://local${uploaded.downloadUrl}`).searchParams.get('token')!;

    // Valid HMAC download resolves canonical file on disk
    const resolved = await svc.resolveDownload(uploaded.id, token);
    expect(resolved.mimeType).toBe('application/pdf');
    expect((await stat(resolved.path)).isFile()).toBe(true);

    // Tampered token or mismatched docId rejected with 400
    await expect(svc.resolveDownload(uploaded.id, `${token}x`)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.resolveDownload(TASK1_ID, token)).rejects.toBeInstanceOf(BadRequestException);

    // Spoofed extension (.png bytes with .pdf name) rejected with 415
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);
    await expect(
      svc.uploadDocument(bossUser, {
        stream: streamFrom([pngBytes]),
        fileName: 'fake.pdf',
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    // Plain text / script rejected with 415
    await expect(
      svc.uploadDocument(bossUser, {
        stream: streamFrom([Buffer.from('<script>alert(1)</script>')]),
        fileName: 'bad.html',
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    // >20 MB rejected with 413
    const hugeChunk = Buffer.alloc(11 * 1024 * 1024, 0x41);
    await expect(
      svc.uploadDocument(bossUser, {
        stream: streamFrom([hugeChunk, hugeChunk]),
        fileName: 'big.pdf',
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    // Staff upload blocked -> 403
    await expect(
      svc.uploadDocument(staff1User, { stream: streamFrom([pdfBytes]), fileName: 'a.pdf' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Delete removes DB row and unlinks file from disk
    await svc.deleteDocument(bossUser, uploaded.id);
    await expect(stat(resolved.path)).rejects.toThrow();
  });
});

describe('OfficeCronService: idempotency, holiday skipping, notification 30d purge', () => {
  it('expires yesterday daily tasks and purges >30d office notifications', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes("set status = 'expired'")) return [{ id: TASK1_ID, team_id: TEAM_ID }];
      if (sql.includes('delete from user_notifications')) return [{ id: 'n1' }, { id: 'n2' }];
      return [];
    });
    const hub = makeHubStub();
    const cron = new OfficeCronService(db, hub);

    const outcome = await cron.expireDaily(new Date('2026-11-23T17:00:00Z')); // 2026-11-24 00:00 ICT
    expect(outcome).toEqual({
      status: 'completed',
      detail: {
        todayDate: '2026-11-24',
        expiredDailyTasks: 1,
        purgedOfficeNotifications: 2,
      },
    });
    expect(calls.some((c) => c.sql.includes("type like 'office_%'"))).toBe(true);
    expect(hub.publishSyncAcrossProcesses).toHaveBeenCalledWith(TEAM_ID, 'tasks');
  });

  it('skips spawnDailyRepeats on VN holidays and weekends, and uses idempotent NOT EXISTS + ON CONFLICT on workdays', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from virtual_trading_configs')) return [{ holidays: ['2026-11-25'] }];
      if (sql.includes('insert into office_tasks')) return [{ id: TASK1_ID, team_id: TEAM_ID }];
      return [];
    });
    const cron = new OfficeCronService(db, makeHubStub());

    // Custom holiday 2026-11-25 00:01 ICT
    expect(await cron.spawnDailyRepeats(new Date('2026-11-24T17:01:00Z'))).toMatchObject({
      status: 'skipped',
      reason: 'non-workday',
    });

    // Saturday 2026-11-21 00:01 ICT
    expect(await cron.spawnDailyRepeats(new Date('2026-11-20T17:01:00Z'))).toMatchObject({
      status: 'skipped',
      reason: 'non-workday',
    });

    // Workday Monday 2026-11-23 00:01 ICT
    const ok = await cron.spawnDailyRepeats(new Date('2026-11-22T17:01:00Z'));
    expect(ok).toMatchObject({
      status: 'completed',
      detail: { todayDate: '2026-11-23', spawnedTasks: 1, teamsAffected: 1 },
    });
    const insertCall = calls.find((c) => c.sql.includes('insert into office_tasks'))!;
    expect(insertCall.sql).toContain('not exists');
    expect(insertCall.sql).toContain('on conflict (assignment_id, user_id, task_date) do nothing');
  });

  it('runs monthlyRollover and lockAttendance cleanly', async () => {
    const { db } = makeFakeDb((sql) => {
      if (sql.includes('from virtual_trading_configs')) return [{ holidays: [] }];
      if (sql.includes("set status = 'expired'")) return [{ id: TASK2_ID, team_id: TEAM_ID }];
      return [];
    });
    const hub = makeHubStub();
    const cron = new OfficeCronService(db, hub);

    const rollover = await cron.monthlyRollover(new Date('2026-11-30T17:00:00Z')); // 2026-12-01 00:00 ICT
    expect(rollover).toMatchObject({
      status: 'completed',
      detail: { periodMonth: '2026-12', expiredMonthlyTasks: 1 },
    });
    expect(hub.publishSyncAcrossProcesses).toHaveBeenCalledWith('all', 'leaderboard');

    // Holiday lockAttendance skipped
    expect(await cron.lockAttendance(new Date('2026-04-30T05:00:00Z'))).toMatchObject({
      status: 'skipped',
      reason: 'non-workday',
    });

    // Workday 12:00 ICT lockAttendance broadcasts attendance sync
    expect(await cron.lockAttendance(new Date('2026-11-23T05:00:00Z'))).toMatchObject({
      status: 'completed',
    });
    expect(hub.publishSyncAcrossProcesses).toHaveBeenCalledWith('all', 'attendance');
  });
});

describe('OfficeAccessService & Controller regressions ([L-H1], [L-H2], [L-M1], [L-M2])', () => {
  const OLD_TEAM_ID = '99999999-9999-4999-8999-999999999999';
  const FIXED_NOW = () => new Date('2026-11-23T02:00:00.000Z'); // 2026-11-23 09:00 ICT

  it('[L-H1] Step 3 fallback requires active team_lead_profiles boss and rejects revoked leads / deactivated SACOs', async () => {
    const { db, calls } = makeFakeDb(() => []);
    const svc = new OfficeAccessService(db, FIXED_NOW);

    const resolved = await svc.resolveAccess(staff1User);
    expect(resolved.member).toBe(false);

    // Step 3 query must join active boss team_lead_profiles and guard tf_sacos revocation
    const step3 = calls[2]!;
    expect(step3.sql).toContain("boss_tlp.status = 'active'");
    expect(step3.sql).toContain("om.role = 'boss' and om.user_id = t.boss_user_id");
    expect(step3.sql).toContain(
      'not exists (select 1 from tf_sacos s where s.user_id = om.user_id)',
    );
    expect(step3.sql).toContain('and s.lead_user_id = t.boss_user_id');
    expect(step3.sql).toContain('and s.active = true');
  });

  it('[L-H1] + [L-H2] cleans up deactivated SACO open tasks and migrates current-month points on team transfer', async () => {
    const reachedAt = new Date('2026-11-18T03:30:00.000Z');
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from team_lead_profiles tlp')) {
        return [{ user_id: BOSS_ID, name: 'Lê Huy' }];
      }
      if (sql.includes('from office_teams t') && sql.includes('t.boss_user_id = $1')) {
        return [
          {
            id: TEAM_ID,
            boss_user_id: BOSS_ID,
            boss_name: 'Lê Huy',
            name: 'Nhóm Lê Huy',
            checkin_on_time_cutoff: '08:30',
            checkin_lock_cutoff: '12:00',
          },
        ];
      }
      if (sql.includes('from tf_sacos s') && sql.includes('assigned_date')) {
        return [{ user_id: STAFF1_ID, assigned_date: '2026-11-20' }];
      }
      if (sql.includes('from office_members') && sql.includes("role = 'staff'")) {
        return [{ user_id: STAFF2_ID, desk_index: 1, active: true }];
      }
      if (sql.includes('set active = false') && sql.includes('team_id <> $2')) {
        return [{ team_id: OLD_TEAM_ID }];
      }
      if (sql.includes('delete from office_points_monthly')) {
        return [{ points: 140, reached_at: reachedAt }];
      }
      if (sql.includes('returning om.user_id')) {
        // STAFF2 was deactivated in tf_sacos
        return [{ user_id: STAFF2_ID }];
      }
      if (sql.includes('from office_members om') && sql.includes('left join tf_profiles')) {
        return [
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
      }
      return [];
    });

    const svc = new OfficeAccessService(db, FIXED_NOW);
    const resolved = await svc.resolveAccess(bossUser);
    expect(resolved.member).toBe(true);

    // [L-H2] Current-month points migrated from old team(s) to new TEAM_ID
    const deleteOldPts = calls.find((c) => c.sql.includes('delete from office_points_monthly'));
    expect(deleteOldPts?.params).toEqual([STAFF1_ID, TEAM_ID, '2026-11']);
    const upsertNewPts = calls.find((c) => c.sql.includes('insert into office_points_monthly'));
    expect(upsertNewPts?.params).toEqual([TEAM_ID, STAFF1_ID, '2026-11', 140, reachedAt]);

    // [L-H1] Deactivated STAFF2's non-done tasks & assignment targets deleted (keeping done tasks)
    const deletedStaff2Tasks = calls.find(
      (c) =>
        c.sql.includes('delete from office_tasks') &&
        c.sql.includes("status <> 'done'") &&
        c.params[0] === TEAM_ID &&
        c.params[1] === STAFF2_ID,
    );
    expect(deletedStaff2Tasks).toBeDefined();
    const deletedStaff2Targets = calls.find(
      (c) =>
        c.sql.includes('delete from office_assignment_targets') &&
        c.params[0] === TEAM_ID &&
        c.params[1] === STAFF2_ID,
    );
    expect(deletedStaff2Targets).toBeDefined();
  });

  it('[L-M1] filters Boss HUD pendingCount by current task_date and period_month', async () => {
    const { db, calls } = makeFakeDb((sql) => {
      if (sql.includes('from virtual_trading_configs')) return [{ holidays: [] }];
      if (sql.includes('from office_tasks')) {
        return [{ pending_count: '2', today_done: '3', today_total: '5' }];
      }
      if (sql.includes('from office_proposals')) return [{ new_count: '1' }];
      return [];
    });
    const svc = new OfficeAccessService(db, FIXED_NOW);
    vi.spyOn(svc, 'resolveAccess').mockResolvedValue(makeContext('boss'));

    const me = await svc.getMeSummary(bossUser, () => [BOSS_ID], FIXED_NOW());
    expect(me.hud).toMatchObject({ kind: 'boss', pendingCount: 2, todayDoneCount: 3 });

    const bossHudQuery = calls.find((c) => c.sql.includes('as pending_count'))!;
    expect(bossHudQuery.sql).toContain("kind = 'day' and task_date = $2::date");
    expect(bossHudQuery.sql).toContain("kind in ('month', 'kpi') and period_month = $3");
    expect(bossHudQuery.params).toEqual([TEAM_ID, '2026-11-23', '2026-11']);
  });

  it('[L-M2] checks Boss RBAC before parsing multipart in uploadDocument', async () => {
    const access = makeAccessStub();
    const rooms = { uploadDocument: vi.fn() } as unknown as OfficeRoomsService;
    const collab = {} as OfficeCollabService;
    const controller = new OfficeWorkspaceController(access, collab, rooms);

    const isMultipart = vi.fn(() => false);
    const file = vi.fn();
    const fakeReq = { isMultipart, file } as never;

    await expect(controller.uploadDocument(staff1User, fakeReq)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(isMultipart).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
    expect(rooms.uploadDocument).not.toHaveBeenCalled();
  });
});
