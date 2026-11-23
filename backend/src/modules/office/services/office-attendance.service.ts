import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/index.js';
import type { AuthenticatedUser } from '../../auth/index.js';
import { formatIctHhmm, ictNowParts, isWorkdayIct, parseCutoffMinutes } from '../office.time.js';
import type { OfficeAttendanceDisplayState, OfficeAttendanceState } from '../office.types.js';
import { OfficeHub } from '../realtime/office.hub.js';
import { OfficeAccessService } from './office-access.service.js';

export const OFFICE_ATTENDANCE_CLOCK = Symbol('OFFICE_ATTENDANCE_CLOCK');

@Injectable()
export class OfficeAttendanceService {
  private readonly now: () => Date;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: OfficeAccessService,
    private readonly hub: OfficeHub,
    @Optional() @Inject(OFFICE_ATTENDANCE_CLOCK) now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  async checkIn(user: AuthenticatedUser) {
    const ctx = await this.access.requireStaff(user);
    const now = this.now();
    const parts = ictNowParts(now);
    const holidays = await this.access.loadHolidays();

    if (!isWorkdayIct(parts.date, holidays)) {
      throw new BadRequestException({
        code: 'OFFICE_ATTENDANCE_NON_WORKDAY',
        message: 'Hôm nay là ngày nghỉ, không có điểm danh.',
      });
    }

    const onTimeMinutes = parseCutoffMinutes(ctx.team.checkinOnTimeCutoff, 8 * 60 + 30);
    const lockMinutes = parseCutoffMinutes(ctx.team.checkinLockCutoff, 12 * 60);

    if (parts.minutesOfDay > lockMinutes) {
      throw new BadRequestException({
        code: 'OFFICE_ATTENDANCE_LOCKED',
        message: `Hết giờ điểm danh (${ctx.team.checkinLockCutoff}) · hôm nay tính vắng.`,
      });
    }

    const status: OfficeAttendanceState = parts.minutesOfDay <= onTimeMinutes ? 'ok' : 'late';

    const rows = await this.database.query<{
      work_date: string;
      status: OfficeAttendanceState;
      checked_in_at: Date | string;
    }>(
      `insert into office_attendance (team_id, user_id, work_date, status, checked_in_at)
       values ($1, $2, $3::date, $4, $5)
       on conflict (team_id, user_id, work_date) do nothing
       returning to_char(work_date, 'YYYY-MM-DD') as work_date, status, checked_in_at`,
      [ctx.team.id, user.id, parts.date, status, now],
    );

    const inserted = rows[0];
    if (!inserted) {
      throw new ConflictException({
        code: 'OFFICE_ALREADY_CHECKED_IN',
        message: 'Bạn đã điểm danh hôm nay rồi.',
      });
    }

    this.hub.broadcastSync(ctx.team.id, 'attendance');

    const checkedInIso =
      inserted.checked_in_at instanceof Date
        ? inserted.checked_in_at.toISOString()
        : new Date(inserted.checked_in_at).toISOString();

    return {
      workDate: String(inserted.work_date).slice(0, 10),
      status: inserted.status,
      checkedInAt: checkedInIso,
      timeLabel: formatIctHhmm(checkedInIso),
    };
  }

  async today(user: AuthenticatedUser) {
    const ctx = await this.access.requireMember(user);
    const now = this.now();
    const parts = ictNowParts(now);
    const holidays = await this.access.loadHolidays();
    const isWorkday = isWorkdayIct(parts.date, holidays);
    const lockMinutes = parseCutoffMinutes(ctx.team.checkinLockCutoff, 12 * 60);
    const isLocked = !isWorkday || parts.minutesOfDay > lockMinutes;

    const staff = ctx.members.filter((m) => m.role === 'staff');
    const records = await this.database.query<{
      user_id: string;
      status: OfficeAttendanceState;
      checked_in_at: Date | string;
    }>(
      `select user_id, status, checked_in_at
         from office_attendance
        where team_id = $1 and work_date = $2::date`,
      [ctx.team.id, parts.date],
    );
    const byUser = new Map(records.map((r) => [r.user_id, r]));

    type Entry = {
      userId: string;
      displayName: string;
      accentColor: string;
      status: OfficeAttendanceDisplayState;
      checkedInAt: string | null;
      timeLabel: string | null;
      isSelf: boolean;
    };

    const ok: Entry[] = [];
    const late: Entry[] = [];
    const absent: Entry[] = [];

    for (const member of staff) {
      const rec = byUser.get(member.userId);
      const checkedInAt = rec
        ? rec.checked_in_at instanceof Date
          ? rec.checked_in_at.toISOString()
          : new Date(rec.checked_in_at).toISOString()
        : null;
      const status: OfficeAttendanceDisplayState = rec?.status ?? 'absent';
      const entry: Entry = {
        userId: member.userId,
        displayName: member.displayName,
        accentColor: member.accentColor,
        status,
        checkedInAt,
        timeLabel: checkedInAt ? formatIctHhmm(checkedInAt) : null,
        isSelf: member.userId === user.id,
      };
      if (status === 'ok') ok.push(entry);
      else if (status === 'late') late.push(entry);
      else absent.push(entry);
    }

    ok.sort((a, b) => (a.checkedInAt ?? '').localeCompare(b.checkedInAt ?? ''));
    late.sort((a, b) => (a.checkedInAt ?? '').localeCompare(b.checkedInAt ?? ''));
    absent.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));

    let myStatus: OfficeAttendanceDisplayState | null = null;
    let myCheckedInAt: string | null = null;
    if (ctx.role === 'staff') {
      const mine = byUser.get(user.id);
      myStatus = mine?.status ?? 'absent';
      myCheckedInAt = mine
        ? mine.checked_in_at instanceof Date
          ? mine.checked_in_at.toISOString()
          : new Date(mine.checked_in_at).toISOString()
        : null;
    }

    return {
      workDate: parts.date,
      isWorkday,
      isLocked,
      cutoffs: {
        onTime: ctx.team.checkinOnTimeCutoff,
        lock: ctx.team.checkinLockCutoff,
      },
      counts: {
        ok: ok.length,
        late: late.length,
        absent: absent.length,
        total: staff.length,
      },
      myStatus,
      myCheckedInAt,
      showDotsForAll: ctx.role === 'boss',
      roster: { ok, late, absent },
    };
  }
}
