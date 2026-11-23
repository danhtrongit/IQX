import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/index.js';
import type { AuthenticatedUser } from '../../auth/index.js';
import { OFFICE_NOTIFIER, type OfficeNotifier } from '../../notifications/index.js';
import type {
  CreateMemberNoteBody,
  CreateProposalBody,
  CreateStickyNoteBody,
  OfficeMembersQuery,
  ReplyProposalBody,
  UpdateMemberProfileBody,
  UpdateStickyNoteBody,
} from '../office.schemas.js';
import {
  computeTenureParts,
  countWorkdaysInMonthUpTo,
  ictNowParts,
  normalizeVietnameseSearch,
  parseDateYmd,
} from '../office.time.js';
import {
  OFFICE_MAX_STICKY_NOTES,
  type OfficeProposalStatus,
  type OfficeStickyColor,
} from '../office.types.js';
import { OfficeHub } from '../realtime/office.hub.js';
import { OfficeAccessService } from './office-access.service.js';

export const OFFICE_COLLAB_CLOCK = Symbol('OFFICE_COLLAB_CLOCK');

type ProposalDbRow = {
  id: string;
  user_id: string;
  staff_name: string;
  staff_accent_color: string;
  content: string;
  status: OfficeProposalStatus;
  seen_at: Date | string | null;
  reply: string | null;
  replied_at: Date | string | null;
  created_at: Date | string;
};

type StickyDbRow = {
  id: string;
  color: OfficeStickyColor;
  content: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type BossNoteDbRow = {
  id: string;
  content: string;
  created_at: Date | string;
};

const iso = (value: Date | string | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();

const mapProposal = (row: ProposalDbRow) => ({
  id: row.id,
  userId: row.user_id,
  staffName: row.staff_name,
  staffAccentColor: row.staff_accent_color,
  content: row.content,
  status: row.status,
  seenAt: iso(row.seen_at),
  reply: row.reply,
  repliedAt: iso(row.replied_at),
  createdAt: iso(row.created_at)!,
});

const mapSticky = (row: StickyDbRow) => ({
  id: row.id,
  color: row.color,
  content: row.content,
  createdAt: iso(row.created_at)!,
  updatedAt: iso(row.updated_at)!,
});

const mapBossNote = (row: BossNoteDbRow) => ({
  id: row.id,
  content: row.content,
  createdAt: iso(row.created_at)!,
});

@Injectable()
export class OfficeCollabService {
  private readonly now: () => Date;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: OfficeAccessService,
    @Inject(OFFICE_NOTIFIER) private readonly notifier: OfficeNotifier,
    private readonly hub: OfficeHub,
    @Optional() @Inject(OFFICE_COLLAB_CLOCK) now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
  }

  // ───────────── Proposals ─────────────

  async listMyProposals(user: AuthenticatedUser) {
    const ctx = await this.access.requireStaff(user);
    const rows = await this.database.query<ProposalDbRow>(
      `select p.id, p.user_id,
              coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as staff_name,
              coalesce(om.accent_color, '#1D6FE8') as staff_accent_color,
              p.content, p.status, p.seen_at, p.reply, p.replied_at, p.created_at
         from office_proposals p
         join users u on u.id = p.user_id
         left join tf_sacos s on s.user_id = p.user_id
         left join office_members om on om.team_id = p.team_id and om.user_id = p.user_id
        where p.team_id = $1 and p.user_id = $2
        order by p.created_at desc, p.id desc`,
      [ctx.team.id, user.id],
    );
    return { items: rows.map(mapProposal), unreadCount: 0 };
  }

  async createProposal(user: AuthenticatedUser, body: CreateProposalBody) {
    const ctx = await this.access.requireStaff(user);
    const now = this.now();
    const parts = ictNowParts(now);

    const created = await this.database.transaction(async (tx) => {
      const [row] = await tx.query<{
        id: string;
        user_id: string;
        content: string;
        status: OfficeProposalStatus;
        seen_at: Date | string | null;
        reply: string | null;
        replied_at: Date | string | null;
        created_at: Date | string;
      }>(
        `insert into office_proposals (team_id, user_id, content, status, created_at)
         values ($1, $2, $3, 'sent', $4)
         returning id, user_id, content, status, seen_at, reply, replied_at, created_at`,
        [ctx.team.id, user.id, body.content, now],
      );

      await this.notifier.officeNotify(tx, {
        userId: ctx.team.bossUserId,
        type: 'office_proposal_sent',
        tradeDate: parts.date,
        title: 'Đề xuất mới',
        body: `${ctx.self.displayName} gửi đề xuất mới`,
        link: '/van-phong?modal=mgr',
        payload: { proposalId: row!.id, staffUserId: user.id },
      });

      return row!;
    });

    this.hub.broadcastSync(ctx.team.id, 'proposals');
    this.hub.broadcastSync(ctx.team.id, 'notifications', [ctx.team.bossUserId]);

    return {
      id: created.id,
      userId: created.user_id,
      staffName: ctx.self.displayName,
      staffAccentColor: ctx.self.accentColor,
      content: created.content,
      status: created.status,
      seenAt: iso(created.seen_at),
      reply: created.reply,
      repliedAt: iso(created.replied_at),
      createdAt: iso(created.created_at)!,
    };
  }

  async listTeamProposals(user: AuthenticatedUser) {
    const ctx = await this.access.requireBoss(user);
    const rows = await this.database.query<ProposalDbRow>(
      `select p.id, p.user_id,
              coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as staff_name,
              coalesce(om.accent_color, '#1D6FE8') as staff_accent_color,
              p.content, p.status, p.seen_at, p.reply, p.replied_at, p.created_at
         from office_proposals p
         join users u on u.id = p.user_id
         left join tf_sacos s on s.user_id = p.user_id
         left join office_members om on om.team_id = p.team_id and om.user_id = p.user_id
        where p.team_id = $1
        order by p.created_at desc, p.id desc`,
      [ctx.team.id],
    );
    const items = rows.map(mapProposal);
    return {
      items,
      unreadCount: items.filter((item) => item.status === 'sent').length,
    };
  }

  async markProposalSeen(user: AuthenticatedUser, proposalId: string) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();

    const [updated] = await this.database.query<ProposalDbRow>(
      `update office_proposals p
          set status = case when p.status = 'sent' then 'seen' else p.status end,
              seen_at = coalesce(p.seen_at, $3)
         from users u
         left join tf_sacos s on s.user_id = u.id
         left join office_members om on om.team_id = $2 and om.user_id = u.id
        where p.id = $1 and p.team_id = $2 and u.id = p.user_id
        returning p.id, p.user_id,
                  coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as staff_name,
                  coalesce(om.accent_color, '#1D6FE8') as staff_accent_color,
                  p.content, p.status, p.seen_at, p.reply, p.replied_at, p.created_at`,
      [proposalId, ctx.team.id, now],
    );

    if (!updated) {
      throw new NotFoundException({
        code: 'OFFICE_PROPOSAL_NOT_FOUND',
        message: 'Không tìm thấy đề xuất.',
      });
    }

    this.hub.broadcastSync(ctx.team.id, 'proposals');
    return mapProposal(updated);
  }

  async replyProposal(user: AuthenticatedUser, proposalId: string, body: ReplyProposalBody) {
    const ctx = await this.access.requireBoss(user);
    const now = this.now();
    const parts = ictNowParts(now);

    const updated = await this.database.transaction(async (tx) => {
      const [existing] = await tx.query<{
        id: string;
        user_id: string;
        status: OfficeProposalStatus;
      }>(
        `select id, user_id, status
           from office_proposals
          where id = $1 and team_id = $2
          for update`,
        [proposalId, ctx.team.id],
      );
      if (!existing) {
        throw new NotFoundException({
          code: 'OFFICE_PROPOSAL_NOT_FOUND',
          message: 'Không tìm thấy đề xuất.',
        });
      }
      if (existing.status === 'replied') {
        throw new ConflictException({
          code: 'OFFICE_PROPOSAL_ALREADY_REPLIED',
          message: 'Đề xuất này đã được trả lời.',
        });
      }

      const [row] = await tx.query<ProposalDbRow>(
        `update office_proposals p
            set status = 'replied',
                seen_at = coalesce(p.seen_at, $3),
                reply = $4,
                replied_by = $5,
                replied_at = $3
           from users u
           left join tf_sacos s on s.user_id = u.id
           left join office_members om on om.team_id = $2 and om.user_id = u.id
          where p.id = $1 and p.team_id = $2 and u.id = p.user_id
          returning p.id, p.user_id,
                    coalesce(nullif(btrim(s.display_name), ''), nullif(btrim(u.full_name), ''), u.username) as staff_name,
                    coalesce(om.accent_color, '#1D6FE8') as staff_accent_color,
                    p.content, p.status, p.seen_at, p.reply, p.replied_at, p.created_at`,
        [proposalId, ctx.team.id, now, body.reply, user.id],
      );

      await this.notifier.officeNotify(tx, {
        userId: existing.user_id,
        type: 'office_proposal_replied',
        tradeDate: parts.date,
        title: 'Sếp đã trả lời đề xuất',
        body: 'Sếp đã trả lời đề xuất của bạn',
        link: '/van-phong?modal=mine',
        payload: { proposalId },
      });

      return row!;
    });

    this.hub.broadcastSync(ctx.team.id, 'proposals');
    this.hub.broadcastSync(ctx.team.id, 'notifications', [updated.user_id]);
    return mapProposal(updated);
  }

  // ───────────── Sticky Notes (Staff private, strict 403 for Boss) ─────────────

  async listStickyNotes(user: AuthenticatedUser) {
    const ctx = await this.access.requireStaff(user);
    const rows = await this.database.query<StickyDbRow>(
      `select id, color, content, created_at, updated_at
         from office_sticky_notes
        where team_id = $1 and user_id = $2
        order by created_at asc, id asc`,
      [ctx.team.id, user.id],
    );
    return {
      items: rows.map(mapSticky),
      maxNotes: OFFICE_MAX_STICKY_NOTES,
    };
  }

  async createStickyNote(user: AuthenticatedUser, body: CreateStickyNoteBody) {
    const ctx = await this.access.requireStaff(user);
    const now = this.now();

    const row = await this.database.transaction(async (tx) => {
      const [countRow] = await tx.query<{ n: string }>(
        `select count(*)::text as n
           from office_sticky_notes
          where team_id = $1 and user_id = $2`,
        [ctx.team.id, user.id],
      );
      if (Number(countRow?.n ?? 0) >= OFFICE_MAX_STICKY_NOTES) {
        throw new BadRequestException({
          code: 'OFFICE_STICKY_LIMIT_REACHED',
          message: `Bạn chỉ được tạo tối đa ${OFFICE_MAX_STICKY_NOTES} ghi chú.`,
        });
      }

      const [inserted] = await tx.query<StickyDbRow>(
        `insert into office_sticky_notes (team_id, user_id, color, content, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $5)
         returning id, color, content, created_at, updated_at`,
        [ctx.team.id, user.id, body.color, body.content, now],
      );
      return inserted!;
    });

    return mapSticky(row);
  }

  async updateStickyNote(user: AuthenticatedUser, noteId: string, body: UpdateStickyNoteBody) {
    const ctx = await this.access.requireStaff(user);
    const now = this.now();

    const [updated] = await this.database.query<StickyDbRow>(
      `update office_sticky_notes
          set color = coalesce($4, color),
              content = coalesce($5, content),
              updated_at = $6
        where id = $1 and team_id = $2 and user_id = $3
        returning id, color, content, created_at, updated_at`,
      [noteId, ctx.team.id, user.id, body.color ?? null, body.content ?? null, now],
    );

    if (!updated) {
      throw new NotFoundException({
        code: 'OFFICE_STICKY_NOT_FOUND',
        message: 'Không tìm thấy ghi chú.',
      });
    }
    return mapSticky(updated);
  }

  async deleteStickyNote(user: AuthenticatedUser, noteId: string) {
    const ctx = await this.access.requireStaff(user);
    const deleted = await this.database.query<{ id: string }>(
      `delete from office_sticky_notes
        where id = $1 and team_id = $2 and user_id = $3
        returning id`,
      [noteId, ctx.team.id, user.id],
    );
    if (deleted.length === 0) {
      throw new NotFoundException({
        code: 'OFFICE_STICKY_NOT_FOUND',
        message: 'Không tìm thấy ghi chú.',
      });
    }
    return { ok: true as const };
  }

  // ───────────── Staff Profiles & Boss Private Notes (Boss ONLY, strict 403 for Staff) ─────────────

  async listMembers(user: AuthenticatedUser, query: OfficeMembersQuery) {
    const ctx = await this.access.requireBoss(user);
    const todayDate = ictNowParts(this.now()).date;
    const needle = normalizeVietnameseSearch(query.q);

    const staff = ctx.members
      .filter((m) => m.role === 'staff')
      .filter((m) => !needle || normalizeVietnameseSearch(m.displayName).includes(needle))
      .map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        accentColor: m.accentColor,
        joinDate: m.joinDate,
        tenure: computeTenureParts(m.joinDate, todayDate),
      }));

    return { todayDate, items: staff };
  }

  async getMemberProfile(user: AuthenticatedUser, memberUserId: string) {
    const ctx = await this.access.requireBoss(user);
    const member = ctx.members.find((m) => m.role === 'staff' && m.userId === memberUserId);
    if (!member) {
      throw new NotFoundException({
        code: 'OFFICE_MEMBER_NOT_FOUND',
        message: 'Không tìm thấy nhân viên trong nhóm của bạn.',
      });
    }

    const parts = ictNowParts(this.now());
    const holidays = await this.access.loadHolidays();

    const [pointsRow] = await this.database.query<{ points: number }>(
      `select points from office_points_monthly
        where team_id = $1 and user_id = $2 and period_month = $3`,
      [ctx.team.id, memberUserId, parts.monthKey],
    );

    const [taskStats] = await this.database.query<{
      done_count: string;
      total_count: string;
      pending_count: string;
    }>(
      `select
         count(*) filter (where status = 'done')::text as done_count,
         count(*) filter (where status <> 'expired')::text as total_count,
         count(*) filter (where status = 'pending')::text as pending_count
       from office_tasks
       where team_id = $1 and user_id = $2 and period_month = $3`,
      [ctx.team.id, memberUserId, parts.monthKey],
    );

    const [attStats] = await this.database.query<{ ok_count: string; late_count: string }>(
      `select
         count(*) filter (where status = 'ok')::text as ok_count,
         count(*) filter (where status = 'late')::text as late_count
       from office_attendance
       where team_id = $1
         and user_id = $2
         and to_char(work_date, 'YYYY-MM') = $3`,
      [ctx.team.id, memberUserId, parts.monthKey],
    );

    const okCount = Number(attStats?.ok_count ?? 0);
    const lateCount = Number(attStats?.late_count ?? 0);
    const workdaysSoFar = countWorkdaysInMonthUpTo(
      parts.monthKey,
      parts.date,
      holidays,
      member.joinDate,
    );
    const absentCount = Math.max(0, workdaysSoFar - okCount - lateCount);

    const notes = await this.database.query<BossNoteDbRow>(
      `select id, content, created_at
         from office_member_notes
        where team_id = $1 and member_user_id = $2
        order by created_at desc, id desc`,
      [ctx.team.id, memberUserId],
    );

    return {
      userId: member.userId,
      displayName: member.displayName,
      email: member.email,
      accentColor: member.accentColor,
      bossName: ctx.team.bossName,
      joinDate: member.joinDate,
      todayDate: parts.date,
      tenure: computeTenureParts(member.joinDate, parts.date),
      stats: {
        monthlyPoints: Number(pointsRow?.points ?? 0),
        tasksDone: Number(taskStats?.done_count ?? 0),
        tasksTotal: Number(taskStats?.total_count ?? 0),
        pendingCount: Number(taskStats?.pending_count ?? 0),
        attendanceOk: okCount,
        attendanceLate: lateCount,
        attendanceAbsent: absentCount,
      },
      notes: notes.map(mapBossNote),
    };
  }

  async updateMemberProfile(
    user: AuthenticatedUser,
    memberUserId: string,
    body: UpdateMemberProfileBody,
  ) {
    const ctx = await this.access.requireBoss(user);
    const todayDate = ictNowParts(this.now()).date;

    if (!parseDateYmd(body.joinDate)) {
      throw new BadRequestException({
        code: 'OFFICE_INVALID_JOIN_DATE',
        message: 'Ngày vào làm không hợp lệ.',
      });
    }
    if (body.joinDate > todayDate) {
      throw new BadRequestException({
        code: 'OFFICE_INVALID_JOIN_DATE',
        message: 'Ngày vào làm không được sau hôm nay.',
      });
    }

    const updated = await this.database.query<{ id: string }>(
      `update office_members
          set join_date = $3::date, updated_at = now()
        where team_id = $1 and user_id = $2 and role = 'staff' and active = true
        returning id`,
      [ctx.team.id, memberUserId, body.joinDate],
    );
    if (updated.length === 0) {
      throw new NotFoundException({
        code: 'OFFICE_MEMBER_NOT_FOUND',
        message: 'Không tìm thấy nhân viên trong nhóm của bạn.',
      });
    }

    this.hub.broadcastSync(ctx.team.id, 'members');
    return this.getMemberProfile(user, memberUserId);
  }

  async listMemberNotes(user: AuthenticatedUser, memberUserId: string) {
    const ctx = await this.access.requireBoss(user);
    const exists = ctx.members.some((m) => m.role === 'staff' && m.userId === memberUserId);
    if (!exists) {
      throw new NotFoundException({
        code: 'OFFICE_MEMBER_NOT_FOUND',
        message: 'Không tìm thấy nhân viên trong nhóm của bạn.',
      });
    }
    const rows = await this.database.query<BossNoteDbRow>(
      `select id, content, created_at
         from office_member_notes
        where team_id = $1 and member_user_id = $2
        order by created_at desc, id desc`,
      [ctx.team.id, memberUserId],
    );
    return { items: rows.map(mapBossNote) };
  }

  async createMemberNote(
    user: AuthenticatedUser,
    memberUserId: string,
    body: CreateMemberNoteBody,
  ) {
    const ctx = await this.access.requireBoss(user);
    const exists = ctx.members.some((m) => m.role === 'staff' && m.userId === memberUserId);
    if (!exists) {
      throw new NotFoundException({
        code: 'OFFICE_MEMBER_NOT_FOUND',
        message: 'Không tìm thấy nhân viên trong nhóm của bạn.',
      });
    }
    const now = this.now();
    const [row] = await this.database.query<BossNoteDbRow>(
      `insert into office_member_notes (team_id, member_user_id, boss_user_id, content, created_at)
       values ($1, $2, $3, $4, $5)
       returning id, content, created_at`,
      [ctx.team.id, memberUserId, user.id, body.content, now],
    );
    return mapBossNote(row!);
  }

  async deleteMemberNote(user: AuthenticatedUser, memberUserId: string, noteId: string) {
    const ctx = await this.access.requireBoss(user);
    const deleted = await this.database.query<{ id: string }>(
      `delete from office_member_notes
        where id = $1 and team_id = $2 and member_user_id = $3
        returning id`,
      [noteId, ctx.team.id, memberUserId],
    );
    if (deleted.length === 0) {
      throw new NotFoundException({
        code: 'OFFICE_MEMBER_NOTE_NOT_FOUND',
        message: 'Không tìm thấy ghi chú về nhân viên.',
      });
    }
    return { ok: true as const };
  }
}
