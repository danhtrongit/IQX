/**
 * Scheduled BullMQ jobs for Khu Văn phòng (UTC+7 / Asia/Ho_Chi_Minh):
 * 1. office.expire-daily        (00:00 daily)    — expire yesterday's open daily tasks + prune >30d office notifications
 * 2. office.spawn-daily-repeats (00:01 Mon–Fri)  — skip VN holidays; idempotently instantiate repeat_daily assignments
 * 3. office.monthly-rollover    (00:00 day 1)    — expire prior month's open monthly & KPI tasks
 * 4. office.lock-attendance     (12:00 Mon–Fri)  — broadcast attendance lock sync at 12:00 cutoff
 */
import { Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/index.js';
import { RedisService } from '../../../platform/redis/index.js';
import type { JobOutcome } from '../../runtime/runtime.types.js';
import { extractHolidaySet, ictNowParts, isWorkdayIct } from '../office.time.js';
import type { OfficeSyncScope } from '../office.types.js';
import { OfficeHub } from '../realtime/office.hub.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class OfficeCronService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() private readonly hub?: OfficeHub,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async expireDaily(now: Date = new Date()): Promise<JobOutcome> {
    const parts = ictNowParts(now);
    const cutoff30d = new Date(now.getTime() - THIRTY_DAYS_MS);

    const { expiredTasks, purgedNotifications } = await this.database.transaction(async (tx) => {
      const expired = await tx.query<{ id: string; team_id: string }>(
        `update office_tasks
            set status = 'expired',
                expired_at = $2,
                updated_at = $2
          where kind = 'day'
            and task_date < $1::date
            and status in ('todo', 'pending', 'returned')
          returning id, team_id`,
        [parts.date, now],
      );

      for (const task of expired) {
        await tx.query(
          `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
           values ($1, null, 'expired', $2::jsonb, $3)`,
          [task.id, JSON.stringify({ reason: 'daily_cutoff', date: parts.date }), now],
        );
      }

      const purged = await tx.query<{ id: string }>(
        `delete from user_notifications
          where type like 'office_%'
            and created_at < $1
          returning id`,
        [cutoff30d],
      );

      return { expiredTasks: expired, purgedNotifications: purged.length };
    });

    const teamIds = [...new Set(expiredTasks.map((t) => t.team_id))];
    for (const teamId of teamIds) {
      await this.emitSync(teamId, 'tasks');
    }

    return {
      status: 'completed',
      detail: {
        todayDate: parts.date,
        expiredDailyTasks: expiredTasks.length,
        purgedOfficeNotifications: purgedNotifications,
      },
    };
  }

  async spawnDailyRepeats(now: Date = new Date()): Promise<JobOutcome> {
    const parts = ictNowParts(now);
    const holidays = await this.loadHolidays();

    if (!isWorkdayIct(parts.date, holidays)) {
      return {
        status: 'skipped',
        reason: 'non-workday',
        detail: { todayDate: parts.date },
      };
    }

    const spawned = await this.database.transaction(async (tx) => {
      // Strictly idempotent: both NOT EXISTS and ON CONFLICT DO NOTHING prevent duplicate tasks
      // on retries or overlapping runs, and repeat tasks do NOT trigger repeat notifications (Spec §12).
      const rows = await tx.query<{ id: string; team_id: string }>(
        `insert into office_tasks
           (team_id, assignment_id, user_id, kind, title, points, repeat_daily,
            task_date, due_date, period_month, status, created_at, updated_at)
         select a.team_id, a.id, t.user_id, 'day', a.title, a.points, true,
                $1::date, null, $2, 'todo', $3, $3
           from office_assignments a
           join office_assignment_targets t on t.assignment_id = a.id
           join office_members om
             on om.team_id = a.team_id
            and om.user_id = t.user_id
            and om.role = 'staff'
            and om.active = true
          where a.kind = 'day'
            and a.repeat_daily = true
            and a.deleted_at is null
            and not exists (
              select 1 from office_tasks existing
               where existing.assignment_id = a.id
                 and existing.user_id = t.user_id
                 and existing.task_date = $1::date
            )
         on conflict (assignment_id, user_id, task_date) do nothing
         returning id, team_id`,
        [parts.date, parts.monthKey, now],
      );

      for (const task of rows) {
        await tx.query(
          `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
           values ($1, null, 'spawned_repeat', $2::jsonb, $3)`,
          [task.id, JSON.stringify({ taskDate: parts.date }), now],
        );
      }
      return rows;
    });

    const teamIds = [...new Set(spawned.map((row) => row.team_id))];
    for (const teamId of teamIds) {
      await this.emitSync(teamId, 'tasks');
    }

    return {
      status: 'completed',
      detail: {
        todayDate: parts.date,
        spawnedTasks: spawned.length,
        teamsAffected: teamIds.length,
      },
    };
  }

  async monthlyRollover(now: Date = new Date()): Promise<JobOutcome> {
    const parts = ictNowParts(now);

    const expired = await this.database.transaction(async (tx) => {
      const rows = await tx.query<{ id: string; team_id: string }>(
        `update office_tasks
            set status = 'expired',
                expired_at = $2,
                updated_at = $2
          where kind in ('month', 'kpi')
            and period_month < $1
            and status in ('todo', 'pending', 'returned')
          returning id, team_id`,
        [parts.monthKey, now],
      );

      for (const task of rows) {
        await tx.query(
          `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
           values ($1, null, 'expired', $2::jsonb, $3)`,
          [
            task.id,
            JSON.stringify({ reason: 'monthly_rollover', periodMonth: parts.monthKey }),
            now,
          ],
        );
      }

      return rows;
    });

    await this.emitSync('all', 'tasks');
    await this.emitSync('all', 'leaderboard');

    return {
      status: 'completed',
      detail: {
        periodMonth: parts.monthKey,
        expiredMonthlyTasks: expired.length,
      },
    };
  }

  async lockAttendance(now: Date = new Date()): Promise<JobOutcome> {
    const parts = ictNowParts(now);
    const holidays = await this.loadHolidays();

    if (!isWorkdayIct(parts.date, holidays)) {
      return {
        status: 'skipped',
        reason: 'non-workday',
        detail: { todayDate: parts.date },
      };
    }

    await this.emitSync('all', 'attendance');
    return {
      status: 'completed',
      detail: {
        todayDate: parts.date,
        lockedAt: now.toISOString(),
      },
    };
  }

  private async loadHolidays(): Promise<Set<string>> {
    try {
      const rows = await this.database.query<{ holidays: unknown }>(
        'select holidays from virtual_trading_configs where is_active = true order by updated_at desc limit 1',
      );
      return extractHolidaySet(rows[0]?.holidays);
    } catch {
      return extractHolidaySet(null);
    }
  }

  private async emitSync(teamId: string | 'all', scope: OfficeSyncScope): Promise<void> {
    if (this.hub) {
      await this.hub.publishSyncAcrossProcesses(teamId, scope);
      return;
    }
    if (!this.redis?.isEnabled()) return;
    try {
      const channel = this.redis.key('office', 'sync');
      await this.redis.execute((client) =>
        client.publish(channel, JSON.stringify({ teamId, scope })),
      );
    } catch {
      // Best-effort worker-to-API broadcast.
    }
  }
}
