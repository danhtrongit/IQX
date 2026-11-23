import { describe, expect, it, vi } from 'vitest';

import {
  approveTasksBodySchema,
  createAssignmentBodySchema,
  createMeetingBodySchema,
  createProposalBodySchema,
  createStickyNoteBodySchema,
  returnTaskBodySchema,
  submitTaskBodySchema,
} from '../../src/modules/office/office.schemas.js';
import {
  computeTenureParts,
  countWorkdaysInMonthUpTo,
  extractHolidaySet,
  ictDateString,
  ictMonthEndDate,
  ictMonthString,
  ictNextMonthReset,
  ictNowParts,
  ictPreviousDate,
  ictPreviousMonth,
  isWeekendIct,
  isWorkdayIct,
  normalizeVietnameseSearch,
  parseCutoffMinutes,
} from '../../src/modules/office/office.time.js';
import {
  OFFICE_CLOSE_AUTH,
  OFFICE_CLOSE_FORBIDDEN,
  OfficeHub,
  defaultOfficeSpawn,
  type OfficeHubSocket,
} from '../../src/modules/office/realtime/office.hub.js';
import {
  computeOfficeWorldHeight,
  type OfficeMemberRow,
  type OfficeResolvedAccess,
} from '../../src/modules/office/office.types.js';

describe('office.time (UTC+7 / Asia/Ho_Chi_Minh)', () => {
  it('converts UTC timestamps cleanly across Vietnam midnight boundaries', () => {
    // 2026-11-22 17:00:00Z == 2026-11-23 00:00:00 ICT
    const midnightIct = new Date('2026-11-22T17:00:00.000Z');
    const parts = ictNowParts(midnightIct);
    expect(parts.date).toBe('2026-11-23');
    expect(parts.monthKey).toBe('2026-11');
    expect(parts.hhmm).toBe('00:00');
    expect(parts.minutesOfDay).toBe(0);
    expect(parts.weekday).toBe(1); // Monday

    // 2026-11-23 01:30:00Z == 2026-11-23 08:30:00 ICT
    const onTimeEdge = new Date('2026-11-23T01:30:00.000Z');
    expect(ictNowParts(onTimeEdge).minutesOfDay).toBe(510);
    expect(ictDateString(onTimeEdge)).toBe('2026-11-23');
    expect(ictMonthString(onTimeEdge)).toBe('2026-11');
  });

  it('computes month ends, previous dates/months, and Dec -> Jan rollover', () => {
    expect(ictMonthEndDate('2026-02')).toBe('2026-02-28');
    expect(ictMonthEndDate('2024-02')).toBe('2024-02-29');
    expect(ictMonthEndDate('2026-11')).toBe('2026-11-30');
    expect(ictPreviousDate('2026-03-01')).toBe('2026-02-28');
    expect(ictPreviousMonth('2026-01')).toBe('2025-12');

    expect(ictNextMonthReset('2026-11')).toEqual({ date: '2026-12-01', label: '01/12' });
    expect(ictNextMonthReset('2026-12')).toEqual({ date: '2027-01-01', label: '01/01' });
  });

  it('handles cutoffs, weekends, and VN holidays', () => {
    expect(parseCutoffMinutes('08:30', 500)).toBe(510);
    expect(parseCutoffMinutes('12:00', 700)).toBe(720);
    expect(parseCutoffMinutes('bad', 510)).toBe(510);

    expect(isWeekendIct('2026-11-21')).toBe(true); // Saturday
    expect(isWeekendIct('2026-11-22')).toBe(true); // Sunday
    expect(isWeekendIct('2026-11-23')).toBe(false); // Monday

    const holidays = extractHolidaySet(['2026-11-24']);
    expect(isWorkdayIct('2026-11-23', holidays)).toBe(true);
    expect(isWorkdayIct('2026-11-24', holidays)).toBe(false);
    expect(isWorkdayIct('2026-04-30', holidays)).toBe(false); // built-in VN_HOLIDAYS
    expect(isWorkdayIct('2026-11-21', holidays)).toBe(false); // Saturday

    // 2026-11-01 is Sunday; Nov 2..6 (5) + Nov 9..13 (5) + Nov 16..20 (5) + Nov 23 (1) = 16 workdays
    expect(countWorkdaysInMonthUpTo('2026-11', '2026-11-23', extractHolidaySet(null))).toBe(16);
    expect(countWorkdaysInMonthUpTo('2026-11', '2026-11-24', holidays)).toBe(16); // Nov 24 excluded

    // [L-M3] Mid-month new hire clamps start date to max(monthStart, joinDate)
    expect(
      countWorkdaysInMonthUpTo('2026-11', '2026-11-23', extractHolidaySet(null), '2026-11-20'),
    ).toBe(2); // Fri Nov 20 + Mon Nov 23
    expect(
      countWorkdaysInMonthUpTo('2026-11', '2026-11-23', extractHolidaySet(null), '2026-11-24'),
    ).toBe(0); // joinDate > upToDate
    expect(
      countWorkdaysInMonthUpTo('2026-11', '2026-11-23', extractHolidaySet(null), '2025-08-03'),
    ).toBe(16); // prior month -> full month workdays
  });

  it('computes exact calendar tenure without UTC drift and omits zero units', () => {
    // Spec Criterion #12 example: 03/08/2025 -> 23/11/2026 = "1 năm 3 tháng 20 ngày"
    expect(computeTenureParts('2025-08-03', '2026-11-23')).toEqual({
      years: 1,
      months: 3,
      days: 20,
      label: '1 năm 3 tháng 20 ngày',
    });

    // Zero years omitted
    expect(computeTenureParts('2026-09-14', '2026-11-23')).toEqual({
      years: 0,
      months: 2,
      days: 9,
      label: '2 tháng 9 ngày',
    });

    // Exact years, zero months & days omitted
    expect(computeTenureParts('2024-11-23', '2026-11-23')).toEqual({
      years: 2,
      months: 0,
      days: 0,
      label: '2 năm',
    });

    // Same day or future -> 0 ngày
    expect(computeTenureParts('2026-11-23', '2026-11-23').label).toBe('0 ngày');
    expect(computeTenureParts('2026-12-01', '2026-11-23').label).toBe('0 ngày');

    // Month-end anchoring across February (2026 is non-leap -> Feb has 28 days)
    expect(computeTenureParts('2026-01-31', '2026-02-27')).toEqual({
      years: 0,
      months: 0,
      days: 27,
      label: '27 ngày',
    });
    expect(computeTenureParts('2026-01-31', '2026-02-28')).toEqual({
      years: 0,
      months: 1,
      days: 0,
      label: '1 tháng',
    });
    expect(computeTenureParts('2026-01-31', '2026-03-02')).toEqual({
      years: 0,
      months: 1,
      days: 2,
      label: '1 tháng 2 ngày',
    });
  });

  it('normalizes Vietnamese diacritics including đ/Đ for staff search', () => {
    expect(normalizeVietnameseSearch('Đặng Ngọc Hương')).toBe('dang ngoc huong');
    expect(normalizeVietnameseSearch('Lê Ngọc Hạnh')).toBe('le ngoc hanh');
    expect(normalizeVietnameseSearch('  NGUYỄN VĂN AN  ')).toBe('nguyen van an');
  });
});

describe('office.schemas validation', () => {
  const uid = '11111111-1111-4111-8111-111111111111';

  it('enforces exact length and range limits from Spec', () => {
    expect(
      createAssignmentBodySchema.safeParse({
        kind: 'day',
        title: 'a'.repeat(121),
        points: 10,
        userIds: [uid],
      }).success,
    ).toBe(false);
    expect(
      createAssignmentBodySchema.safeParse({
        kind: 'kpi',
        title: 'Mở 20 tài khoản',
        points: 1001,
        userIds: [uid],
      }).success,
    ).toBe(false);
    expect(
      createAssignmentBodySchema.safeParse({
        kind: 'day',
        title: 'Báo cáo đầu phiên',
        points: 10,
        userIds: [uid],
      }).success,
    ).toBe(true);

    expect(submitTaskBodySchema.safeParse({ note: 'x'.repeat(501) }).success).toBe(false);
    expect(returnTaskBodySchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(returnTaskBodySchema.safeParse({ reason: 'x'.repeat(301) }).success).toBe(false);
    expect(approveTasksBodySchema.safeParse({ ids: [] }).success).toBe(false);
    expect(createProposalBodySchema.safeParse({ content: 'x'.repeat(1001) }).success).toBe(false);
    expect(
      createStickyNoteBodySchema.safeParse({ color: 'y', content: 'x'.repeat(301) }).success,
    ).toBe(false);
  });

  it('rejects non-HTTP(S) meeting URLs', () => {
    const base = {
      title: 'Họp tuần',
      startsAt: '2026-11-23T09:00:00+07:00',
      durationMinutes: 60,
      meetingUrl: 'javascript:alert(1)',
    };
    expect(createMeetingBodySchema.safeParse(base).success).toBe(false);
    expect(
      createMeetingBodySchema.safeParse({
        ...base,
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      }).success,
    ).toBe(true);
  });
});

describe('OfficeHub WebSocket presence & team isolation', () => {
  function fakeSocket() {
    const sent: Array<Record<string, unknown>> = [];
    const closed: Array<{ code?: number; reason?: string }> = [];
    const socket: OfficeHubSocket = {
      bufferedAmount: 0,
      send: (raw: string) => {
        sent.push(JSON.parse(raw) as Record<string, unknown>);
      },
      close: (code?: number, reason?: string) => {
        closed.push({ code, reason });
      },
    };
    return { socket, sent, closed };
  }

  const teamMemberAccess = (
    teamId: string,
    userId: string,
    role: 'boss' | 'staff',
  ): OfficeResolvedAccess => ({
    member: true,
    role,
    team: {
      id: teamId,
      bossUserId: role === 'boss' ? userId : '00000000-0000-4000-8000-000000000001',
      bossName: 'Lê Huy',
      name: 'Nhóm Lê Huy',
      checkinOnTimeCutoff: '08:30',
      checkinLockCutoff: '12:00',
    },
    self: {
      id: `m-${userId}`,
      teamId,
      userId,
      role,
      displayName: role === 'boss' ? 'Lê Huy' : 'Ngọc Hạnh',
      email: `${userId}@iqx.vn`,
      avatar: null,
      avatarColor: null,
      deskIndex: role === 'boss' ? null : 0,
      joinDate: '2026-01-01',
      accentColor: '#1D6FE8',
      active: true,
    },
    members: [],
  });

  it('closes non-members with 4403 and unauthenticated messages with 4401', async () => {
    const auth = {
      authenticate: vi.fn(async (token: string) => ({ id: token }) as never),
    };
    const access = {
      resolveAccess: vi.fn(async () => ({
        member: false as const,
        role: 'none' as const,
        team: null,
        self: null,
        members: [] as const,
      })),
    };
    const hub = new OfficeHub(auth, access as never);

    const s1 = fakeSocket();
    hub.connect(s1.socket);
    await hub.message(s1.socket, JSON.stringify({ type: 'ping' }));
    expect(s1.closed[0]?.code).toBe(OFFICE_CLOSE_AUTH);

    const s2 = fakeSocket();
    hub.connect(s2.socket);
    await hub.message(s2.socket, JSON.stringify({ type: 'auth', token: 'outsider-user' }));
    expect(s2.closed[0]?.code).toBe(OFFICE_CLOSE_FORBIDDEN);
    hub.shutdown();
  });

  it('isolates presence, clamped movement, and office:sync per team', async () => {
    const teamA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const teamB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const accessMap: Record<string, OfficeResolvedAccess> = {
      'boss-a': teamMemberAccess(teamA, 'boss-a', 'boss'),
      'staff-a': teamMemberAccess(teamA, 'staff-a', 'staff'),
      'boss-b': teamMemberAccess(teamB, 'boss-b', 'boss'),
    };
    const auth = {
      authenticate: vi.fn(async (token: string) => ({ id: token }) as never),
    };
    const access = {
      resolveAccess: vi.fn(async (u: { id: string }) => accessMap[u.id]!),
    };
    const hub = new OfficeHub(auth, access as never);

    const bossA = fakeSocket();
    const staffA = fakeSocket();
    const bossB = fakeSocket();

    hub.connect(bossA.socket);
    hub.connect(staffA.socket);
    hub.connect(bossB.socket);

    await hub.message(bossA.socket, JSON.stringify({ type: 'auth', token: 'boss-a' }));
    await hub.message(staffA.socket, JSON.stringify({ type: 'auth', token: 'staff-a' }));
    await hub.message(bossB.socket, JSON.stringify({ type: 'auth', token: 'boss-b' }));

    expect(hub.onlineUserIds(teamA).sort()).toEqual(['boss-a', 'staff-a']);
    expect(hub.onlineUserIds(teamB)).toEqual(['boss-b']);
    expect(bossA.sent.some((m) => m.type === 'peer:join')).toBe(true);
    expect(bossB.sent.filter((m) => m.type === 'peer:join')).toHaveLength(0);

    // Out-of-bounds coordinates are clamped to [0, 2400] x [0, 1560]
    await hub.message(
      staffA.socket,
      JSON.stringify({ type: 'state', x: 9999, y: -50, facing: 'right', moving: true }),
    );
    const stateMsg = bossA.sent.find((m) => m.type === 'peer:state');
    expect(stateMsg).toMatchObject({ x: 2400, y: 0, facing: 'right', moving: true });
    expect(bossB.sent.some((m) => m.type === 'peer:state')).toBe(false);

    // Targeted sync reaches only staff-a in teamA
    hub.broadcastSync(teamA, 'notifications', ['staff-a']);
    expect(staffA.sent.some((m) => m.type === 'office:sync' && m.scope === 'notifications')).toBe(
      true,
    );
    expect(bossA.sent.some((m) => m.type === 'office:sync' && m.scope === 'notifications')).toBe(
      false,
    );
    expect(bossB.sent.some((m) => m.type === 'office:sync')).toBe(false);

    hub.shutdown();
  });

  it('[L-H3] aligns defaultOfficeSpawn with frontend office-layout.ts and clamps y dynamically for >12 staff', async () => {
    // Exact pixel parity with frontend office-layout.ts (`x = 150 + col * 270 + 95`, `y = 720 + row * 330 + 150`)
    expect(defaultOfficeSpawn('boss', null)).toEqual({ x: 440, y: 310 });
    expect(defaultOfficeSpawn('staff', 0)).toEqual({ x: 245, y: 870 });
    expect(defaultOfficeSpawn('staff', 5)).toEqual({ x: 1595, y: 870 });
    expect(defaultOfficeSpawn('staff', 12)).toEqual({ x: 245, y: 1530 });
    expect(defaultOfficeSpawn('staff', 18)).toEqual({ x: 245, y: 1860 });

    expect(computeOfficeWorldHeight(0)).toBe(1560);
    expect(computeOfficeWorldHeight(12)).toBe(1560);
    expect(computeOfficeWorldHeight(13)).toBe(1890);
    expect(computeOfficeWorldHeight(18)).toBe(1890);
    expect(computeOfficeWorldHeight(19)).toBe(2220);

    const teamLarge = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const members: OfficeMemberRow[] = Array.from({ length: 15 }, (_, idx) => ({
      id: `ms-${idx}`,
      teamId: teamLarge,
      userId: `staff-${idx}`,
      role: 'staff',
      displayName: `Nhân viên ${idx}`,
      email: `s${idx}@iqx.vn`,
      avatar: null,
      avatarColor: null,
      deskIndex: idx,
      joinDate: '2026-01-01',
      accentColor: '#1D6FE8',
      active: true,
    }));
    const bossRow: OfficeMemberRow = {
      id: 'mb-large',
      teamId: teamLarge,
      userId: 'boss-large',
      role: 'boss',
      displayName: 'Lê Huy',
      email: 'boss@iqx.vn',
      avatar: null,
      avatarColor: null,
      deskIndex: null,
      joinDate: '2025-01-01',
      accentColor: '#B7791F',
      active: true,
    };
    const allMembers = [bossRow, ...members];
    const resolvedFor = (userId: string): OfficeResolvedAccess => {
      const self = allMembers.find((m) => m.userId === userId)!;
      return {
        member: true,
        role: self.role,
        team: {
          id: teamLarge,
          bossUserId: 'boss-large',
          bossName: 'Lê Huy',
          name: 'Nhóm lớn',
          checkinOnTimeCutoff: '08:30',
          checkinLockCutoff: '12:00',
        },
        self,
        members: allMembers,
      };
    };

    const hub = new OfficeHub(
      { authenticate: vi.fn(async (token: string) => ({ id: token }) as never) },
      { resolveAccess: vi.fn(async (u: { id: string }) => resolvedFor(u.id)) } as never,
    );

    const bossSock = fakeSocket();
    const row3StaffSock = fakeSocket();
    hub.connect(bossSock.socket);
    hub.connect(row3StaffSock.socket);
    await hub.message(bossSock.socket, JSON.stringify({ type: 'auth', token: 'boss-large' }));
    await hub.message(row3StaffSock.socket, JSON.stringify({ type: 'auth', token: 'staff-14' }));

    // Staff #14 (row 2, col 2) spawns at x = 150 + 2*270 + 95 = 785, y = 720 + 2*330 + 150 = 1530
    const welcome = row3StaffSock.sent.find((m) => m.type === 'welcome');
    expect(welcome?.self).toMatchObject({ x: 785, y: 1530 });

    // Moving into Row 3 (y = 1780) is NOT clamped down to 1560 (dynamic maxY = 1890 for 15 staff)
    await hub.message(
      row3StaffSock.socket,
      JSON.stringify({ type: 'state', x: 785, y: 1780, facing: 'down', moving: true }),
    );
    expect(bossSock.sent.find((m) => m.type === 'peer:state')).toMatchObject({
      x: 785,
      y: 1780,
    });

    // Coordinates beyond dynamic world height (1890) still clamp cleanly
    await hub.message(
      row3StaffSock.socket,
      JSON.stringify({ type: 'state', x: 785, y: 9999, facing: 'down', moving: true }),
    );
    const states = bossSock.sent.filter((m) => m.type === 'peer:state');
    expect(states[states.length - 1]).toMatchObject({ x: 785, y: 1890 });

    hub.shutdown();
  });

  it('[L-M5] stamps originId on Redis sync and skips self-originated echoes to prevent double broadcast', async () => {
    const teamA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const messageListeners: Array<(ch: string, payload: string) => void> = [];
    const published: string[] = [];

    const fakeSub = {
      on: vi.fn((event: string, cb: (ch: string, payload: string) => void) => {
        if (event === 'message') messageListeners.push(cb);
      }),
      subscribe: vi.fn(async () => 1),
      disconnect: vi.fn(),
    };
    const fakeRedisClient = {
      duplicate: vi.fn(() => fakeSub),
      publish: vi.fn(async (ch: string, payload: string) => {
        published.push(payload);
        // Simulate Redis echoing the published message back to the local subscriber
        for (const listener of messageListeners) listener(ch, payload);
        return 1;
      }),
    };
    const fakeRedisService = {
      isEnabled: () => true,
      getClient: async () => fakeRedisClient,
      key: (...parts: string[]) => parts.join(':'),
      execute: async <T>(fn: (client: typeof fakeRedisClient) => Promise<T>) => fn(fakeRedisClient),
    };

    const hub = new OfficeHub(
      { authenticate: vi.fn(async (token: string) => ({ id: token }) as never) },
      {
        resolveAccess: vi.fn(async (u: { id: string }) => teamMemberAccess(teamA, u.id, 'boss')),
      } as never,
      fakeRedisService as never,
    );
    await hub.onModuleInit();

    const bossSock = fakeSocket();
    hub.connect(bossSock.socket);
    await hub.message(bossSock.socket, JSON.stringify({ type: 'auth', token: 'boss-a' }));

    await hub.publishSyncAcrossProcesses(teamA, 'tasks');
    expect(published).toHaveLength(1);
    const parsedPublished = JSON.parse(published[0]!) as Record<string, unknown>;
    expect(typeof parsedPublished.originId).toBe('string');

    // Local socket must receive ONLY 1 office:sync (self-echo from Redis skipped)
    expect(bossSock.sent.filter((m) => m.type === 'office:sync')).toHaveLength(1);

    // Messages from another worker/process (different/absent originId) MUST still be delivered
    for (const listener of messageListeners) {
      listener('office:sync', JSON.stringify({ teamId: teamA, scope: 'leaderboard' }));
    }
    expect(
      bossSock.sent.filter((m) => m.type === 'office:sync' && m.scope === 'leaderboard'),
    ).toHaveLength(1);

    hub.shutdown();
  });

  it('[L-M6] suppresses peer:leave while a multi-tab user still has an active socket in the team', async () => {
    const teamA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const accessMap: Record<string, OfficeResolvedAccess> = {
      'boss-a': teamMemberAccess(teamA, 'boss-a', 'boss'),
      'staff-a': teamMemberAccess(teamA, 'staff-a', 'staff'),
    };
    const hub = new OfficeHub(
      { authenticate: vi.fn(async (token: string) => ({ id: token }) as never) },
      { resolveAccess: vi.fn(async (u: { id: string }) => accessMap[u.id]!) } as never,
    );

    const boss = fakeSocket();
    const staffTab1 = fakeSocket();
    const staffTab2 = fakeSocket();

    hub.connect(boss.socket);
    hub.connect(staffTab1.socket);
    hub.connect(staffTab2.socket);

    await hub.message(boss.socket, JSON.stringify({ type: 'auth', token: 'boss-a' }));
    await hub.message(staffTab1.socket, JSON.stringify({ type: 'auth', token: 'staff-a' }));
    await hub.message(staffTab2.socket, JSON.stringify({ type: 'auth', token: 'staff-a' }));

    // Boss receives only ONE peer:join for staff-a across both tabs, and both tabs share peerId
    const joins = boss.sent.filter((m) => m.type === 'peer:join');
    expect(joins).toHaveLength(1);
    const tab1PeerId = (
      staffTab1.sent.find((m) => m.type === 'welcome')?.self as { peerId: string }
    ).peerId;
    const tab2PeerId = (
      staffTab2.sent.find((m) => m.type === 'welcome')?.self as { peerId: string }
    ).peerId;
    expect(tab2PeerId).toBe(tab1PeerId);

    // Closing Tab 1 must NOT emit peer:leave because Tab 2 is still connected
    hub.disconnect(staffTab1.socket);
    expect(boss.sent.filter((m) => m.type === 'peer:leave')).toHaveLength(0);
    expect(hub.onlineUserIds(teamA).sort()).toEqual(['boss-a', 'staff-a']);

    // Closing Tab 2 emits ONE peer:leave with the canonical peerId
    hub.disconnect(staffTab2.socket);
    const leaves = boss.sent.filter((m) => m.type === 'peer:leave');
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ peerId: tab1PeerId, userId: 'staff-a', onlineCount: 1 });
    expect(hub.onlineUserIds(teamA)).toEqual(['boss-a']);

    hub.shutdown();
  });
});
