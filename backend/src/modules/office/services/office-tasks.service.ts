import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/index.js';
import type { AuthenticatedUser } from '../../auth/index.js';
import { OFFICE_NOTIFIER, type OfficeNotifier } from '../../notifications/index.js';
import type {
  ApproveTasksBody,
  CreateAssignmentBody,
  OfficePeriodQuery,
  ReturnTaskBody,
  SubmitTaskBody,
  UpdateAssignmentBody,
} from '../office.schemas.js';
import {
  ictMonthEndDate,
  ictMonthString,
  ictNextMonthReset,
  ictNowParts,
  parseDateYmd,
  parseMonthYm,
} from '../office.time.js';
import {
  OFFICE_TASK_KIND_LABEL,
  type OfficeApproveSkipCode,
  type OfficeTaskKind,
  type OfficeTaskStatus,
} from '../office.types.js';
import { OfficeHub } from '../realtime/office.hub.js';
import { OfficeAccessService } from './office-access.service.js';
import { OfficeCronService } from './office-cron.service.js';

export const OFFICE_TASKS_CLOCK = Symbol('OFFICE_TASKS_CLOCK');

type TaskDbRow = {
  id: string;
  assignment_id: string;
  user_id: string;
  kind: OfficeTaskKind;
  title: string;
  points: number;
  points_snapshot: number | null;
  repeat_daily: boolean;
  task_date: string;
  due_date: string | null;
  period_month: string;
  status: OfficeTaskStatus;
  submit_note: string | null;
  submitted_at: Date | string | null;
  return_reason: string | null;
  returned_at: Date | string | null;
  approved_at: Date | string | null;
  created_at: Date | string;
};

type AssignmentDbRow = {
  id: string;
  kind: OfficeTaskKind;
  title: string;
  points: number;
  repeat_daily: boolean;
  due_date: string | null;
  period_month: string;
  created_at: Date | string;
};

const iso = (value: Date | string | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();

const ymd = (value: string | null): string | null => (value ? String(value).slice(0, 10) : null);

function mapTask(row: TaskDbRow, todayDate: string) {
  const dueDate = ymd(row.due_date);
  const overdue =
    row.kind !== 'day' &&
    row.status !== 'done' &&
    row.status !== 'expired' &&
    dueDate !== null &&
    dueDate < todayDate;
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    points:
      row.status === 'done' && row.points_snapshot !== null ? row.points_snapshot : row.points,
    pointsSnapshot: row.points_snapshot,
    repeatDaily: row.repeat_daily,
    taskDate: String(row.task_date).slice(0, 10),
    dueDate,
    periodMonth: row.period_month,
    status: row.status,
    overdue,
    submitNote: row.submit_note,
    submittedAt: iso(row.submitted_at),
    returnReason: row.return_reason,
    returnedAt: iso(row.returned_at),
    approvedAt: iso(row.approved_at),
    createdAt: iso(row.created_at)!,
  };
}

function isTaskPastExpiry(
  task: { kind: OfficeTaskKind; task_date: string; period_month: string },
  todayDate: string,
  periodMonth: string,
): boolean {
  if (task.kind === 'day') return String(task.task_date).slice(0, 10) < todayDate;
  return task.period_month < periodMonth;
}

@Injectable()
export class OfficeTasksService {
  private readonly now: () => Date;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: OfficeAccessService,
    @Inject(OFFICE_NOTIFIER) private readonly notifier: OfficeNotifier,
    private readonly hub: OfficeHub,
    @Optional() @Inject(OFFICE_TASKS_CLOCK) now?: () => Date,
    @Optional() private readonly cron?: OfficeCronService,
  ) {
    this.now = now ?? (() => new Date());
  }

  async listMyTasks(user: AuthenticatedUser) {
    const ctx = await this.access.requireStaff(user);
    const now = this.now();
    await this.cron?.ensureDailyRepeatsForTeam(ctx.team.id, now);
    const parts = ictNowParts(now);

    const rows = await this.database.query<TaskDbRow>(
      `select id, assignment_id, user_id, kind, title, points, points_snapshot,
              repeat_daily, to_char(task_date, 'YYYY-MM-DD') as task_date,
              to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, status,
              submit_note, submitted_at, return_reason, returned_at, approved_at, created_at
         from office_tasks
        where team_id = $1
          and user_id = $2
          and status <> 'expired'
          and (
            (kind = 'day' and task_date = $3::date)
            or (kind in ('month', 'kpi') and period_month = $4)
          )
        order by created_at asc, id asc`,
      [ctx.team.id, user.id, parts.date, parts.monthKey],
    );

    const [pointsRow] = await this.database.query<{ points: number }>(
      `select points from office_points_monthly
        where team_id = $1 and user_id = $2 and period_month = $3`,
      [ctx.team.id, user.id, parts.monthKey],
    );

    const mapped = rows.map((row) => mapTask(row, parts.date));
    return {
      todayDate: parts.date,
      periodMonth: parts.monthKey,
      monthlyPoints: Number(pointsRow?.points ?? 0),
      day: mapped.filter((t) => t.kind === 'day'),
      month: mapped.filter((t) => t.kind === 'month'),
      kpi: mapped.filter((t) => t.kind === 'kpi'),
    };
  }

  async listAssignments(user: AuthenticatedUser) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    await this.cron?.ensureDailyRepeatsForTeam(ctx.team.id, now);
    const parts = ictNowParts(now);
    const activeStaffCount = ctx.members.filter((m) => m.role === 'staff').length;

    const assignments = await this.database.query<AssignmentDbRow>(
      `select id, kind, title, points, repeat_daily,
              to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, created_at
         from office_assignments
        where team_id = $1
          and deleted_at is null
          and (
            period_month = $2
            or (kind = 'day' and repeat_daily = true)
          )
        order by created_at desc, id desc`,
      [ctx.team.id, parts.monthKey],
    );

    if (assignments.length === 0) return { items: [] };

    const ids = assignments.map((a) => a.id);
    const targets = await this.database.query<{ assignment_id: string; user_id: string }>(
      `select assignment_id, user_id
         from office_assignment_targets
        where assignment_id = any($1::uuid[])`,
      [ids],
    );

    const counts = await this.database.query<{
      assignment_id: string;
      done_count: string;
      active_count: string;
    }>(
      `select assignment_id,
              count(*) filter (where status = 'done')::text as done_count,
              count(*) filter (where status <> 'expired')::text as active_count
         from office_tasks
        where team_id = $1
          and assignment_id = any($2::uuid[])
          and ((kind = 'day' and task_date = $3::date) or kind <> 'day')
        group by assignment_id`,
      [ctx.team.id, ids, parts.date],
    );

    const targetMap = new Map<string, string[]>();
    for (const row of targets) {
      const list = targetMap.get(row.assignment_id) ?? [];
      list.push(row.user_id);
      targetMap.set(row.assignment_id, list);
    }
    const countMap = new Map(counts.map((c) => [c.assignment_id, c]));

    return {
      items: assignments.map((a) => {
        const targetUserIds = targetMap.get(a.id) ?? [];
        const stat = countMap.get(a.id);
        return {
          id: a.id,
          kind: a.kind,
          title: a.title,
          points: a.points,
          repeatDaily: a.repeat_daily,
          dueDate: ymd(a.due_date),
          periodMonth: a.period_month,
          targetUserIds,
          targetCount: targetUserIds.length,
          isAllTeam: activeStaffCount > 0 && targetUserIds.length >= activeStaffCount,
          doneCount: Number(stat?.done_count ?? 0),
          activeCount: Number(stat?.active_count ?? targetUserIds.length),
          createdAt: iso(a.created_at)!,
        };
      }),
    };
  }

  async createAssignment(user: AuthenticatedUser, body: CreateAssignmentBody) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    const parts = ictNowParts(now);

    const staffById = new Map(
      ctx.members.filter((m) => m.role === 'staff').map((m) => [m.userId, m]),
    );
    const targetUserIds = [...new Set(body.userIds)];
    if (targetUserIds.length === 0) {
      throw new BadRequestException({
        code: 'OFFICE_TARGETS_REQUIRED',
        message: 'Chọn người nhận',
      });
    }
    for (const targetId of targetUserIds) {
      if (!staffById.has(targetId)) {
        throw new ForbiddenException({
          code: 'OFFICE_INVALID_TARGET',
          message: 'Người nhận không thuộc nhóm văn phòng của bạn.',
        });
      }
    }

    const repeatDaily = body.kind === 'day' ? (body.repeatDaily ?? true) : false;
    let dueDate: string | null = null;
    if (body.kind !== 'day') {
      const monthEnd = ictMonthEndDate(parts.monthKey);
      dueDate = body.dueDate ?? monthEnd;
      if (!parseDateYmd(dueDate)) {
        throw new BadRequestException({
          code: 'OFFICE_INVALID_DUE_DATE',
          message: 'Ngày hạn hoàn thành không hợp lệ.',
        });
      }
      if (dueDate < parts.date || dueDate > monthEnd) {
        throw new BadRequestException({
          code: 'OFFICE_DUE_DATE_OUT_OF_RANGE',
          message: 'Hạn hoàn thành phải nằm từ hôm nay tới cuối tháng.',
        });
      }
    }

    const created = await this.database.transaction(async (tx) => {
      const [assignment] = await tx.query<AssignmentDbRow>(
        `insert into office_assignments
           (team_id, created_by, kind, title, points, repeat_daily, due_date, period_month, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $9)
         returning id, kind, title, points, repeat_daily,
                   to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, created_at`,
        [
          ctx.team.id,
          user.id,
          body.kind,
          body.title,
          body.points,
          repeatDaily,
          dueDate,
          parts.monthKey,
          now,
        ],
      );
      if (!assignment) throw new Error('Failed to create office assignment');

      const kindLabel = OFFICE_TASK_KIND_LABEL[body.kind];
      for (const targetId of targetUserIds) {
        await tx.query(
          `insert into office_assignment_targets (assignment_id, user_id)
           values ($1, $2)
           on conflict do nothing`,
          [assignment.id, targetId],
        );

        const [task] = await tx.query<{ id: string }>(
          `insert into office_tasks
             (team_id, assignment_id, user_id, kind, title, points, repeat_daily,
              task_date, due_date, period_month, status, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, 'todo', $11, $11)
           returning id`,
          [
            ctx.team.id,
            assignment.id,
            targetId,
            body.kind,
            body.title,
            body.points,
            repeatDaily,
            parts.date,
            dueDate,
            parts.monthKey,
            now,
          ],
        );

        if (task) {
          await tx.query(
            `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
             values ($1, $2, 'created', $3::jsonb, $4)`,
            [
              task.id,
              user.id,
              JSON.stringify({ kind: body.kind, points: body.points, repeatDaily, dueDate }),
              now,
            ],
          );

          await this.notifier.officeNotify(tx, {
            userId: targetId,
            type: 'office_task_assigned',
            tradeDate: parts.date,
            title: 'Nhiệm vụ mới',
            body: `Sếp giao nhiệm vụ ${kindLabel} "${body.title}"`,
            link: '/van-phong?modal=mine',
            payload: { assignmentId: assignment.id, taskId: task.id, kind: body.kind },
          });
        }
      }

      return assignment;
    });

    this.hub.broadcastSync(ctx.team.id, 'tasks');
    this.hub.broadcastSync(ctx.team.id, 'notifications', targetUserIds);

    return {
      id: created.id,
      kind: created.kind,
      title: created.title,
      points: created.points,
      repeatDaily: created.repeat_daily,
      dueDate: ymd(created.due_date),
      periodMonth: created.period_month,
      targetUserIds,
      targetCount: targetUserIds.length,
      isAllTeam: staffById.size > 0 && targetUserIds.length >= staffById.size,
      doneCount: 0,
      activeCount: targetUserIds.length,
      createdAt: iso(created.created_at)!,
    };
  }

  async updateAssignment(
    user: AuthenticatedUser,
    assignmentId: string,
    body: UpdateAssignmentBody,
  ) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    const parts = ictNowParts(now);

    const updated = await this.database.transaction(async (tx) => {
      const [existing] = await tx.query<AssignmentDbRow>(
        `select id, kind, title, points, repeat_daily,
                to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, created_at
           from office_assignments
          where id = $1 and team_id = $2 and deleted_at is null
          for update`,
        [assignmentId, ctx.team.id],
      );
      if (!existing) {
        throw new NotFoundException({
          code: 'OFFICE_ASSIGNMENT_NOT_FOUND',
          message: 'Không tìm thấy nhóm nhiệm vụ đã giao.',
        });
      }

      const nextTitle = body.title ?? existing.title;
      const nextPoints = body.points ?? existing.points;
      const nextRepeatDaily =
        existing.kind === 'day' ? (body.repeatDaily ?? existing.repeat_daily) : false;
      let nextDueDate = existing.kind === 'day' ? null : ymd(existing.due_date);

      if (existing.kind !== 'day' && body.dueDate !== undefined) {
        const currentMonthEnd = ictMonthEndDate(parts.monthKey);
        const assignmentMonthEnd = ictMonthEndDate(existing.period_month);
        const maxDueDate =
          assignmentMonthEnd < currentMonthEnd ? assignmentMonthEnd : currentMonthEnd;
        if (body.dueDate === null) {
          if (maxDueDate < parts.date) {
            throw new BadRequestException({
              code: 'OFFICE_DUE_DATE_OUT_OF_RANGE',
              message: 'Hạn hoàn thành phải nằm từ hôm nay tới cuối tháng.',
            });
          }
          nextDueDate = maxDueDate;
        } else {
          if (!parseDateYmd(body.dueDate)) {
            throw new BadRequestException({
              code: 'OFFICE_INVALID_DUE_DATE',
              message: 'Ngày hạn hoàn thành không hợp lệ.',
            });
          }
          if (body.dueDate < parts.date || body.dueDate > maxDueDate) {
            throw new BadRequestException({
              code: 'OFFICE_DUE_DATE_OUT_OF_RANGE',
              message: 'Hạn hoàn thành phải nằm từ hôm nay tới cuối tháng.',
            });
          }
          nextDueDate = body.dueDate;
        }
      }

      await tx.query(
        `update office_assignments
            set title = $3, points = $4, due_date = $5::date, repeat_daily = $6, updated_at = $7
          where id = $1 and team_id = $2`,
        [assignmentId, ctx.team.id, nextTitle, nextPoints, nextDueDate, nextRepeatDaily, now],
      );

      // Spec §7.1: Title updates all tasks in the assignment.
      if (body.title !== undefined) {
        await tx.query(
          `update office_tasks
              set title = $3, updated_at = $4
            where assignment_id = $1 and team_id = $2`,
          [assignmentId, ctx.team.id, nextTitle, now],
        );
      }

      // Spec §7.1 (fixing prototype bug #6): points & due_date ONLY update non-done tasks!
      const affectedOpenTasks = await tx.query<{ id: string }>(
        `update office_tasks
            set points = $3, due_date = $4::date, repeat_daily = $5, updated_at = $6
          where assignment_id = $1
            and team_id = $2
            and status in ('todo', 'pending', 'returned')
          returning id`,
        [assignmentId, ctx.team.id, nextPoints, nextDueDate, nextRepeatDaily, now],
      );

      for (const task of affectedOpenTasks) {
        await tx.query(
          `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
           values ($1, $2, 'edited', $3::jsonb, $4)`,
          [
            task.id,
            user.id,
            JSON.stringify({ title: nextTitle, points: nextPoints, dueDate: nextDueDate }),
            now,
          ],
        );
      }

      const targets = await tx.query<{ user_id: string }>(
        `select user_id from office_assignment_targets where assignment_id = $1`,
        [assignmentId],
      );
      const [stats] = await tx.query<{ done_count: string; active_count: string }>(
        `select count(*) filter (where status = 'done')::text as done_count,
                count(*) filter (where status <> 'expired')::text as active_count
           from office_tasks
          where assignment_id = $1 and team_id = $2
            and ((kind = 'day' and task_date = $3::date) or kind <> 'day')`,
        [assignmentId, ctx.team.id, parts.date],
      );

      return {
        existing,
        nextTitle,
        nextPoints,
        nextDueDate,
        nextRepeatDaily,
        targetUserIds: targets.map((t) => t.user_id),
        doneCount: Number(stats?.done_count ?? 0),
        activeCount: Number(stats?.active_count ?? targets.length),
      };
    });

    this.hub.broadcastSync(ctx.team.id, 'tasks');
    const activeStaffCount = ctx.members.filter((m) => m.role === 'staff').length;

    return {
      id: updated.existing.id,
      kind: updated.existing.kind,
      title: updated.nextTitle,
      points: updated.nextPoints,
      repeatDaily: updated.nextRepeatDaily,
      dueDate: updated.nextDueDate,
      periodMonth: updated.existing.period_month,
      targetUserIds: updated.targetUserIds,
      targetCount: updated.targetUserIds.length,
      isAllTeam: activeStaffCount > 0 && updated.targetUserIds.length >= activeStaffCount,
      doneCount: updated.doneCount,
      activeCount: updated.activeCount,
      createdAt: iso(updated.existing.created_at)!,
    };
  }

  async deleteAssignment(user: AuthenticatedUser, assignmentId: string) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();

    const result = await this.database.transaction(async (tx) => {
      const [existing] = await tx.query<{ id: string }>(
        `select id from office_assignments
          where id = $1 and team_id = $2 and deleted_at is null
          for update`,
        [assignmentId, ctx.team.id],
      );
      if (!existing) {
        throw new NotFoundException({
          code: 'OFFICE_ASSIGNMENT_NOT_FOUND',
          message: 'Không tìm thấy nhóm nhiệm vụ đã giao.',
        });
      }

      // Soft-delete assignment so repeat_daily stops, remove ONLY non-done tasks, keep done points.
      await tx.query(
        `update office_assignments
            set deleted_at = $3, updated_at = $3
          where id = $1 and team_id = $2`,
        [assignmentId, ctx.team.id, now],
      );

      const deleted = await tx.query<{ id: string }>(
        `delete from office_tasks
          where assignment_id = $1 and team_id = $2 and status <> 'done'
          returning id`,
        [assignmentId, ctx.team.id],
      );

      const [retained] = await tx.query<{ n: string }>(
        `select count(*)::text as n from office_tasks
          where assignment_id = $1 and team_id = $2 and status = 'done'`,
        [assignmentId, ctx.team.id],
      );

      return {
        ok: true as const,
        deletedTaskCount: deleted.length,
        retainedDoneCount: Number(retained?.n ?? 0),
      };
    });

    this.hub.broadcastSync(ctx.team.id, 'tasks');
    return result;
  }

  async submitTask(user: AuthenticatedUser, taskId: string, body: SubmitTaskBody) {
    const ctx = await this.access.requireStaff(user);
    const now = this.now();
    const parts = ictNowParts(now);

    const updated = await this.database.transaction(async (tx) => {
      const [task] = await tx.query<TaskDbRow>(
        `select id, assignment_id, user_id, kind, title, points, points_snapshot,
                repeat_daily, to_char(task_date, 'YYYY-MM-DD') as task_date,
                to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, status,
                submit_note, submitted_at, return_reason, returned_at, approved_at, created_at
           from office_tasks
          where id = $1 and team_id = $2
          for update`,
        [taskId, ctx.team.id],
      );
      if (!task) {
        throw new NotFoundException({
          code: 'OFFICE_TASK_NOT_FOUND',
          message: 'Không tìm thấy nhiệm vụ.',
        });
      }
      if (task.user_id !== user.id) {
        throw new ForbiddenException({
          code: 'OFFICE_TASK_FORBIDDEN',
          message: 'Bạn không thể thao tác trên nhiệm vụ của người khác.',
        });
      }
      if (task.status === 'done') {
        throw new ConflictException({
          code: 'OFFICE_TASK_ALREADY_DONE',
          message: 'Nhiệm vụ đã hoàn thành.',
        });
      }
      if (task.status === 'pending') {
        throw new ConflictException({
          code: 'OFFICE_TASK_ALREADY_PENDING',
          message: 'Nhiệm vụ đang chờ sếp xác nhận.',
        });
      }
      if (task.status === 'expired' || isTaskPastExpiry(task, parts.date, parts.monthKey)) {
        throw new BadRequestException({
          code: 'OFFICE_TASK_EXPIRED',
          message: 'Nhiệm vụ đã hết hạn, không thể gửi xác nhận.',
        });
      }

      const cleanNote = body.note.trim();
      const noteValue = cleanNote.length > 0 ? cleanNote : null;
      const [saved] = await tx.query<TaskDbRow>(
        `update office_tasks
            set status = 'pending',
                submit_note = $3,
                submitted_at = $4,
                updated_at = $4
          where id = $1 and team_id = $2
          returning id, assignment_id, user_id, kind, title, points, points_snapshot,
                    repeat_daily, to_char(task_date, 'YYYY-MM-DD') as task_date,
                    to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, status,
                    submit_note, submitted_at, return_reason, returned_at, approved_at, created_at`,
        [task.id, ctx.team.id, noteValue, now],
      );

      await tx.query(
        `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
         values ($1, $2, 'submitted', $3::jsonb, $4)`,
        [task.id, user.id, JSON.stringify({ note: noteValue, previousStatus: task.status }), now],
      );

      await this.notifier.officeNotify(tx, {
        userId: ctx.team.bossUserId,
        type: 'office_task_submitted',
        tradeDate: parts.date,
        title: 'Chờ xác nhận nhiệm vụ',
        body: `${ctx.self.displayName} gửi xác nhận "${task.title}"`,
        link: '/van-phong?modal=mgr',
        payload: { taskId: task.id, staffUserId: user.id },
      });

      return saved!;
    });

    this.hub.broadcastSync(ctx.team.id, 'tasks');
    this.hub.broadcastSync(ctx.team.id, 'notifications', [ctx.team.bossUserId]);
    return mapTask(updated, parts.date);
  }

  async listReview(user: AuthenticatedUser) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    await this.cron?.ensureDailyRepeatsForTeam(ctx.team.id, now);
    const parts = ictNowParts(now);

    // Spec §7.2 (fixing prototype bug #8): oldest submitted_at FIRST.
    const rows = await this.database.query<{
      id: string;
      assignment_id: string;
      user_id: string;
      staff_name: string;
      staff_accent_color: string;
      kind: OfficeTaskKind;
      title: string;
      points: number;
      task_date: string;
      due_date: string | null;
      period_month: string;
      submit_note: string | null;
      submitted_at: Date | string;
    }>(
      `select t.id, t.assignment_id, t.user_id,
              coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as staff_name,
              coalesce(om.accent_color, '#1D6FE8') as staff_accent_color,
              t.kind, t.title, t.points,
              to_char(t.task_date, 'YYYY-MM-DD') as task_date,
              to_char(t.due_date, 'YYYY-MM-DD') as due_date,
              t.period_month,
              t.submit_note, t.submitted_at
         from office_tasks t
         join users u on u.id = t.user_id
         left join tf_sacos s on s.user_id = t.user_id
         left join office_members om on om.team_id = t.team_id and om.user_id = t.user_id
        where t.team_id = $1
          and t.status = 'pending'
          and (
            (t.kind = 'day' and t.task_date = $2::date)
            or (t.kind in ('month', 'kpi') and t.period_month = $3)
          )
        order by t.submitted_at asc nulls last, t.created_at asc, t.id asc`,
      [ctx.team.id, parts.date, parts.monthKey],
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        assignmentId: row.assignment_id,
        userId: row.user_id,
        staffName: row.staff_name,
        staffAccentColor: row.staff_accent_color,
        kind: row.kind,
        title: row.title,
        points: row.points,
        taskDate: String(row.task_date).slice(0, 10),
        dueDate: ymd(row.due_date),
        submitNote: row.submit_note,
        submittedAt: iso(row.submitted_at)!,
      })),
    };
  }

  async approveTasks(user: AuthenticatedUser, body: ApproveTasksBody) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    const parts = ictNowParts(now);
    const uniqueIds = [...new Set(body.ids)];
    const memberById = new Map(ctx.members.map((m) => [m.userId, m]));

    const { approved, skipped } = await this.database.transaction(async (tx) => {
      // Lock all requested rows in deterministic id order to prevent deadlocks & double-awards.
      const tasks = await tx.query<TaskDbRow>(
        `select id, assignment_id, user_id, kind, title, points, points_snapshot,
                repeat_daily, to_char(task_date, 'YYYY-MM-DD') as task_date,
                to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, status,
                submit_note, submitted_at, return_reason, returned_at, approved_at, created_at
           from office_tasks
          where team_id = $1 and id = any($2::uuid[])
          order by id asc
          for update`,
        [ctx.team.id, uniqueIds],
      );

      const taskById = new Map(tasks.map((task) => [task.id, task]));
      const validTasks: TaskDbRow[] = [];
      const skippedItems: Array<{
        taskId: string;
        code: OfficeApproveSkipCode;
        reason: string;
      }> = [];

      for (const id of uniqueIds) {
        const task = taskById.get(id);
        if (!task) {
          skippedItems.push({
            taskId: id,
            code: 'OFFICE_TASK_NOT_FOUND',
            reason: 'Nhiệm vụ không tồn tại trong nhóm của bạn.',
          });
          continue;
        }
        if (task.status === 'expired' || isTaskPastExpiry(task, parts.date, parts.monthKey)) {
          skippedItems.push({
            taskId: task.id,
            code: 'OFFICE_TASK_EXPIRED',
            reason: 'Nhiệm vụ đã hết hạn, không duyệt được.',
          });
          continue;
        }
        if (task.status !== 'pending') {
          skippedItems.push({
            taskId: task.id,
            code: 'OFFICE_TASK_NOT_PENDING',
            reason: 'Chỉ duyệt được nhiệm vụ đang chờ xác nhận.',
          });
          continue;
        }
        validTasks.push(task);
      }

      // Single-task approve preserves direct HTTP error semantics (Spec §13.3).
      if (uniqueIds.length === 1 && validTasks.length === 0 && skippedItems[0]) {
        const only = skippedItems[0];
        if (only.code === 'OFFICE_TASK_NOT_FOUND') {
          throw new NotFoundException({ code: only.code, message: only.reason });
        }
        if (only.code === 'OFFICE_TASK_EXPIRED') {
          throw new BadRequestException({ code: only.code, message: only.reason });
        }
        throw new ConflictException({ code: only.code, message: only.reason });
      }

      // Deterministic processing order matching the FOR UPDATE lock order.
      validTasks.sort((a, b) => a.id.localeCompare(b.id));

      const results: Array<{
        taskId: string;
        userId: string;
        staffName: string;
        title: string;
        points: number;
        totalMonthlyPoints: number;
      }> = [];

      for (const task of validTasks) {
        const snapshot = task.points;
        await tx.query(
          `update office_tasks
              set status = 'done',
                  points_snapshot = $3,
                  approved_at = $4,
                  approved_by = $5,
                  updated_at = $4
            where id = $1 and team_id = $2 and status = 'pending'`,
          [task.id, ctx.team.id, snapshot, now, user.id],
        );

        const [pointsRow] = await tx.query<{ points: number }>(
          `insert into office_points_monthly (team_id, user_id, period_month, points, reached_at)
           values ($1, $2, $3, $4, $5)
           on conflict (team_id, user_id, period_month) do update
             set points = office_points_monthly.points + excluded.points,
                 reached_at = case
                   when excluded.points > 0 then $5
                   else office_points_monthly.reached_at
                 end
           returning points`,
          [ctx.team.id, task.user_id, parts.monthKey, snapshot, now],
        );

        await tx.query(
          `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
           values ($1, $2, 'approved', $3::jsonb, $4)`,
          [
            task.id,
            user.id,
            JSON.stringify({ pointsSnapshot: snapshot, periodMonth: parts.monthKey }),
            now,
          ],
        );

        await this.notifier.officeNotify(tx, {
          userId: task.user_id,
          type: 'office_task_approved',
          tradeDate: parts.date,
          title: 'Nhiệm vụ đã được duyệt',
          body: `Sếp đã duyệt "${task.title}" · +${snapshot} điểm`,
          link: '/van-phong?modal=mine',
          payload: { taskId: task.id, points: snapshot },
        });

        results.push({
          taskId: task.id,
          userId: task.user_id,
          staffName: memberById.get(task.user_id)?.displayName ?? 'Nhân viên',
          title: task.title,
          points: snapshot,
          totalMonthlyPoints: Number(pointsRow?.points ?? snapshot),
        });
      }

      return { approved: results, skipped: skippedItems };
    });

    if (approved.length > 0) {
      const staffIds = [...new Set(approved.map((a) => a.userId))];
      this.hub.broadcastSync(ctx.team.id, 'tasks');
      this.hub.broadcastSync(ctx.team.id, 'leaderboard');
      this.hub.broadcastSync(ctx.team.id, 'notifications', staffIds);
    }
    return { approved, skipped };
  }

  async returnTask(user: AuthenticatedUser, taskId: string, body: ReturnTaskBody) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    const parts = ictNowParts(now);

    const saved = await this.database.transaction(async (tx) => {
      const [task] = await tx.query<TaskDbRow>(
        `select id, assignment_id, user_id, kind, title, points, points_snapshot,
                repeat_daily, to_char(task_date, 'YYYY-MM-DD') as task_date,
                to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, status,
                submit_note, submitted_at, return_reason, returned_at, approved_at, created_at
           from office_tasks
          where id = $1 and team_id = $2
          for update`,
        [taskId, ctx.team.id],
      );
      if (!task) {
        throw new NotFoundException({
          code: 'OFFICE_TASK_NOT_FOUND',
          message: 'Không tìm thấy nhiệm vụ.',
        });
      }
      if (task.status === 'expired' || isTaskPastExpiry(task, parts.date, parts.monthKey)) {
        throw new BadRequestException({
          code: 'OFFICE_TASK_EXPIRED',
          message: 'Nhiệm vụ đã hết hạn.',
        });
      }
      if (task.status !== 'pending') {
        throw new ConflictException({
          code: 'OFFICE_TASK_NOT_PENDING',
          message: 'Chỉ trả lại được nhiệm vụ đang chờ xác nhận.',
        });
      }

      const [updated] = await tx.query<TaskDbRow>(
        `update office_tasks
            set status = 'returned',
                return_reason = $3,
                returned_at = $4,
                updated_at = $4
          where id = $1 and team_id = $2
          returning id, assignment_id, user_id, kind, title, points, points_snapshot,
                    repeat_daily, to_char(task_date, 'YYYY-MM-DD') as task_date,
                    to_char(due_date, 'YYYY-MM-DD') as due_date, period_month, status,
                    submit_note, submitted_at, return_reason, returned_at, approved_at, created_at`,
        [task.id, ctx.team.id, body.reason, now],
      );

      await tx.query(
        `insert into office_task_events (task_id, actor_user_id, event_type, payload, created_at)
         values ($1, $2, 'returned', $3::jsonb, $4)`,
        [task.id, user.id, JSON.stringify({ reason: body.reason }), now],
      );

      await this.notifier.officeNotify(tx, {
        userId: task.user_id,
        type: 'office_task_returned',
        tradeDate: parts.date,
        title: 'Nhiệm vụ cần làm lại',
        body: `Sếp trả lại "${task.title}"`,
        link: '/van-phong?modal=mine',
        payload: { taskId: task.id, reason: body.reason },
      });

      return updated!;
    });

    this.hub.broadcastSync(ctx.team.id, 'tasks');
    this.hub.broadcastSync(ctx.team.id, 'notifications', [saved.user_id]);
    return mapTask(saved, parts.date);
  }

  async getProgress(user: AuthenticatedUser) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    await this.cron?.ensureDailyRepeatsForTeam(ctx.team.id, now);
    const parts = ictNowParts(now);
    const staff = ctx.members.filter((m) => m.role === 'staff');

    const taskAgg = await this.database.query<{
      user_id: string;
      day_done: string;
      day_total: string;
      month_done: string;
      month_total: string;
      kpi_done: string;
      kpi_total: string;
      pending_count: string;
    }>(
      `select user_id,
              count(*) filter (where kind = 'day' and task_date = $2::date and status = 'done')::text as day_done,
              count(*) filter (where kind = 'day' and task_date = $2::date and status <> 'expired')::text as day_total,
              count(*) filter (where kind = 'month' and period_month = $3 and status = 'done')::text as month_done,
              count(*) filter (where kind = 'month' and period_month = $3 and status <> 'expired')::text as month_total,
              count(*) filter (where kind = 'kpi' and period_month = $3 and status = 'done')::text as kpi_done,
              count(*) filter (where kind = 'kpi' and period_month = $3 and status <> 'expired')::text as kpi_total,
              count(*) filter (where status = 'pending' and ((kind = 'day' and task_date = $2::date) or (kind <> 'day' and period_month = $3)))::text as pending_count
         from office_tasks
        where team_id = $1
        group by user_id`,
      [ctx.team.id, parts.date, parts.monthKey],
    );

    const pointRows = await this.database.query<{
      user_id: string;
      points: number;
      reached_at: Date | string;
    }>(
      `select user_id, points, reached_at
         from office_points_monthly
        where team_id = $1 and period_month = $2`,
      [ctx.team.id, parts.monthKey],
    );

    const aggByUser = new Map(taskAgg.map((r) => [r.user_id, r]));
    const ptsByUser = new Map(pointRows.map((r) => [r.user_id, r]));

    const items = staff
      .map((member) => {
        const agg = aggByUser.get(member.userId);
        const pts = ptsByUser.get(member.userId);
        return {
          userId: member.userId,
          displayName: member.displayName,
          accentColor: member.accentColor,
          dayDone: Number(agg?.day_done ?? 0),
          dayTotal: Number(agg?.day_total ?? 0),
          monthDone: Number(agg?.month_done ?? 0),
          monthTotal: Number(agg?.month_total ?? 0),
          kpiDone: Number(agg?.kpi_done ?? 0),
          kpiTotal: Number(agg?.kpi_total ?? 0),
          pendingCount: Number(agg?.pending_count ?? 0),
          points: Number(pts?.points ?? 0),
          reachedAtMs: pts ? new Date(pts.reached_at).getTime() : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (a.reachedAtMs !== b.reachedAtMs) return a.reachedAtMs - b.reachedAtMs;
        return a.displayName.localeCompare(b.displayName, 'vi');
      })
      .map(({ reachedAtMs: _ignore, ...item }) => item);

    return {
      todayDate: parts.date,
      periodMonth: parts.monthKey,
      items,
    };
  }

  async getLeaderboard(user: AuthenticatedUser, query: OfficePeriodQuery) {
    const ctx = await this.access.requireMember(user);
    const currentMonth = ictMonthString(this.now());
    const periodMonth = query.period ?? currentMonth;
    const parsed = parseMonthYm(periodMonth);
    if (!parsed) {
      throw new BadRequestException({
        code: 'OFFICE_INVALID_PERIOD',
        message: 'Kỳ tháng phải có định dạng YYYY-MM.',
      });
    }

    const memberJoin =
      periodMonth >= currentMonth
        ? 'join office_members om on om.team_id = pm.team_id and om.user_id = pm.user_id and om.active = true'
        : 'left join office_members om on om.team_id = pm.team_id and om.user_id = pm.user_id';

    const rows = await this.database.query<{
      user_id: string;
      display_name: string;
      accent_color: string;
      points: number;
      reached_at: Date | string;
    }>(
      `select pm.user_id,
              coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as display_name,
              coalesce(om.accent_color, '#1D6FE8') as accent_color,
              pm.points,
              pm.reached_at
         from office_points_monthly pm
         join users u on u.id = pm.user_id
         left join tf_sacos s on s.user_id = pm.user_id
         ${memberJoin}
        where pm.team_id = $1
          and pm.period_month = $2
          and pm.points > 0
        order by pm.points desc, pm.reached_at asc, pm.user_id asc`,
      [ctx.team.id, periodMonth],
    );

    const top3 = rows.slice(0, 3).map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      displayName: row.display_name,
      accentColor: row.accent_color,
      points: Number(row.points),
      reachedAt: iso(row.reached_at)!,
    }));

    let myRank: { rank: number | null; points: number } | null = null;
    if (ctx.role === 'staff') {
      const idx = rows.findIndex((r) => r.user_id === user.id);
      myRank =
        idx >= 0 ? { rank: idx + 1, points: Number(rows[idx]!.points) } : { rank: null, points: 0 };
    }

    const nextReset = ictNextMonthReset(periodMonth);
    return {
      periodMonth,
      monthNumber: parsed.month,
      nextResetLabel: nextReset.label,
      nextResetDate: nextReset.date,
      teamName: ctx.team.name,
      bossName: ctx.team.bossName,
      top3,
      myRank,
      totalRanked: rows.length,
    };
  }
}
