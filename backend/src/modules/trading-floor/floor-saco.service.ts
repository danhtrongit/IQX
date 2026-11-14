/**
 * Quyền SACO và màn Quản trị SACO (spec nhắn tin với SACO, mục "Quản trị SACO"): trưởng nhóm gán và gỡ
 * quyền cho tài khoản của nhóm mình, quản trị viên làm được ở mọi nhóm; hàng khớp là một thứ tự 1..n
 * dùng chung cho cả sàn; nhật ký lời mời và lịch sử chat theo phạm vi nhóm.
 *
 * Trưởng nhóm luôn bị giới hạn ở SACO có `lead_user_id` là chính mình (kể cả SACO đã gỡ). Mọi thao tác
 * ghi `admin_audit_log` cùng transaction.
 */

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import {
  CHAT_RULES,
  cleanSacoName,
  moveInOrder,
  pickSacoIcon,
} from './floor-chat.logic.js';
import { FLOOR_CHAT_REPOSITORY, type FloorChatRepository } from './floor-chat.repository.js';
import { FloorChatService } from './floor-chat.service.js';
import { FLOOR_CLOCK, type FloorClock } from './floor-clock.js';
import { FloorEvents } from './floor-events.js';
import { FloorPresence } from './floor-presence.js';
import { suggestName } from './floor-profile.logic.js';
import {
  FLOOR_SACO_REPOSITORY,
  type FloorCandidate,
  type FloorLead,
  type FloorSacoManageRow,
  type FloorSacoRepository,
  type FloorSacoRow,
} from './floor-saco.repository.js';
import type {
  ManageConv,
  ManageConvDetail,
  ManageInvite,
  ManageSaco,
} from './floor-types.js';

/** Người gọi đã được phân quyền: `leadId` null là quản trị viên, ngược lại là nhóm của trưởng nhóm. */
interface Scope {
  readonly actor: AuthenticatedUser;
  readonly leadId: string | null;
}

export interface ManageList {
  items: ManageSaco[];
  leads: FloorLead[];
}

const sacoNotFound = () =>
  new NotFoundException({ code: 'SACO_NOT_FOUND', message: 'Không tìm thấy SACO' });
const userNotFound = () =>
  new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy người dùng' });
const invalidName = () =>
  new UnprocessableEntityException({
    code: 'INVALID_NAME',
    message: 'Tên SACO cần từ 2 đến 40 ký tự',
  });

@Injectable()
export class FloorSacoService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(FLOOR_SACO_REPOSITORY) private readonly sacos: FloorSacoRepository,
    @Inject(FLOOR_CHAT_REPOSITORY) private readonly chat: FloorChatRepository,
    private readonly chatService: FloorChatService,
    private readonly presence: FloorPresence,
    private readonly events: FloorEvents,
    @Inject(FLOOR_CLOCK) private readonly clock: FloorClock,
  ) {}

  // ================================================================== danh sách

  async list(user: AuthenticatedUser): Promise<ManageList> {
    return this.listFor(await this.scopeOf(user));
  }

  async candidates(
    user: AuthenticatedUser,
    query: string,
  ): Promise<{ items: FloorCandidate[] }> {
    const scope = await this.scopeOf(user);
    return { items: await this.sacos.candidates(this.database, query, scope.leadId) };
  }

  // ================================================================== gán, sửa, đổi chỗ, gỡ

  async grant(
    user: AuthenticatedUser,
    input: { userId: string; leadUserId?: string | undefined; displayName?: string | undefined },
    context: AuditContext,
  ): Promise<ManageSaco> {
    const scope = await this.scopeOf(user);
    const target = await this.sacos.grantUser(this.database, input.userId);
    if (!target) throw userNotFound();
    // Trưởng nhóm chỉ thấy tài khoản của nhóm mình: ngoài nhóm coi như không tồn tại.
    if (scope.leadId && target.groupLeadId !== scope.leadId) throw userNotFound();
    if (target.status !== 'active' || !['user', 'premium'].includes(target.role)) {
      throw new UnprocessableEntityException({
        code: 'USER_NOT_ELIGIBLE',
        message: 'Chỉ tài khoản người dùng đang hoạt động mới được làm SACO',
      });
    }
    const leadId = scope.leadId ?? input.leadUserId ?? target.groupLeadId;
    if (!leadId) {
      throw new UnprocessableEntityException({
        code: 'LEAD_REQUIRED',
        message: 'Cần chọn nhóm (trưởng nhóm) cho SACO',
      });
    }
    const lead = await this.sacos.activeLead(this.database, leadId);
    if (!lead) {
      throw new UnprocessableEntityException({
        code: 'LEAD_NOT_FOUND',
        message: 'Không tìm thấy trưởng nhóm đang hoạt động',
      });
    }
    const requestedName =
      input.displayName === undefined || input.displayName.trim() === ''
        ? null
        : cleanSacoName(input.displayName);
    if (input.displayName !== undefined && input.displayName.trim() !== '' && !requestedName) {
      throw invalidName();
    }
    const now = this.clock.now();
    const { id, restored } = await this.database.transaction(async (tx) => {
      await this.sacos.lockOrder(tx);
      const existing = await this.sacos.findByUser(tx, target.id);
      if (existing?.active) {
        throw new ConflictException({
          code: 'SACO_EXISTS',
          message: 'Tài khoản này đã là SACO',
        });
      }
      const position = (await this.sacos.maxActivePosition(tx)) + 1;
      let sacoId: string;
      if (existing) {
        sacoId = existing.id;
        await this.sacos.restore(tx, sacoId, {
          leadUserId: lead.id,
          name: requestedName,
          position,
          at: now,
          by: user.id,
        });
      } else {
        sacoId = await this.sacos.insert(tx, {
          userId: target.id,
          leadUserId: lead.id,
          name: requestedName ?? suggestName(target.fullName, target.username),
          icon: pickSacoIcon(await this.sacos.totalCount(tx)),
          position,
          at: now,
          by: user.id,
        });
      }
      await this.compact(tx, now);
      await recordAudit(tx, context, {
        action: 'trading_floor.saco_grant',
        targetEntity: 'tf_sacos',
        targetId: sacoId,
        before: existing
          ? { active: false, lead_user_id: existing.leadUserId, name: existing.name }
          : null,
        after: { user_id: target.id, lead_user_id: lead.id, active: true },
        note: existing ? 'Khôi phục quyền SACO' : 'Gán quyền SACO',
      });
      return { id: sacoId, restored: Boolean(existing) };
    });
    this.presence.bindSaco(id, target.id);
    this.events.toUser(target.id, { type: 'chat:inbox' });
    if (restored) await this.chatService.notifyPeers(id);
    return this.manageRow(scope, id);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    input: { displayName?: string | undefined; leadUserId?: string | undefined },
    context: AuditContext,
  ): Promise<ManageSaco> {
    const scope = await this.scopeOf(user);
    const row = await this.sacoInScope(scope, id);
    if (input.leadUserId !== undefined && scope.leadId) {
      throw new ForbiddenException({
        code: 'ADMIN_ONLY',
        message: 'Chỉ quản trị viên được đổi nhóm của SACO',
      });
    }
    let name = row.name;
    if (input.displayName !== undefined) {
      const cleaned = cleanSacoName(input.displayName);
      if (!cleaned) throw invalidName();
      name = cleaned;
    }
    let leadUserId = row.leadUserId;
    if (input.leadUserId !== undefined && input.leadUserId !== row.leadUserId) {
      const lead = await this.sacos.activeLead(this.database, input.leadUserId);
      if (!lead) {
        throw new UnprocessableEntityException({
          code: 'LEAD_NOT_FOUND',
          message: 'Không tìm thấy trưởng nhóm đang hoạt động',
        });
      }
      leadUserId = lead.id;
    }
    if (name !== row.name || leadUserId !== row.leadUserId) {
      const now = this.clock.now();
      await this.database.transaction(async (tx) => {
        await this.sacos.updateMeta(tx, id, { name, leadUserId, at: now });
        await recordAudit(tx, context, {
          action: 'trading_floor.saco_update',
          targetEntity: 'tf_sacos',
          targetId: id,
          before: { name: row.name, lead_user_id: row.leadUserId },
          after: { name, lead_user_id: leadUserId },
        });
      });
      await this.chatService.notifyPeers(id);
    }
    return this.manageRow(scope, id);
  }

  /** ▲▼ trong hàng khớp; áp dụng ngay cho lượt tìm kế tiếp. Trả cả danh sách vì nhiều dòng đổi thứ hạng. */
  async move(
    user: AuthenticatedUser,
    id: string,
    dir: 'up' | 'down',
    context: AuditContext,
  ): Promise<ManageList> {
    const scope = await this.scopeOf(user);
    const now = this.clock.now();
    await this.database.transaction(async (tx) => {
      await this.sacos.lockOrder(tx);
      const active = await this.sacos.listActive(tx);
      const row = active.find((item) => item.id === id);
      if (!row || (scope.leadId && row.leadUserId !== scope.leadId)) throw sacoNotFound();
      const next = moveInOrder(
        active.map((item) => ({ id: item.id, leadUserId: item.leadUserId })),
        id,
        dir,
        scope.leadId,
      );
      if (next.every((value, index) => value === active[index]!.id)) return;
      await this.sacos.renumber(tx, next, now);
      await recordAudit(tx, context, {
        action: 'trading_floor.saco_move',
        targetEntity: 'tf_sacos',
        targetId: id,
        before: { position: row.rank },
        after: { position: next.indexOf(id) + 1, dir },
      });
    });
    return this.listFor(scope);
  }

  /**
   * Gỡ quyền: ra khỏi hàng khớp (thứ tự dồn lại), mọi cuộc chat cũ thành chỉ đọc kèm dòng hệ thống,
   * lời mời đang chờ bị thu hồi, các bên liên quan được báo làm mới hộp thư.
   */
  async remove(
    user: AuthenticatedUser,
    id: string,
    context: AuditContext,
  ): Promise<ManageList> {
    const scope = await this.scopeOf(user);
    const row = await this.sacoInScope(scope, id);
    if (!row.active) return this.listFor(scope);
    const now = this.clock.now();
    const posted = await this.database.transaction(async (tx) => {
      await this.sacos.lockOrder(tx);
      const fresh = await this.sacos.findById(tx, id);
      if (!fresh || !fresh.active) return null;
      await this.sacos.deactivate(tx, id, now, user.id);
      await this.compact(tx, now);
      const messages: Array<{ convId: string; userId: string; message: Awaited<ReturnType<FloorChatRepository['insertMessage']>> }> = [];
      for (const conv of await this.chat.convIdsOfSaco(tx, id)) {
        messages.push({
          convId: conv.id,
          userId: conv.userId,
          message: await this.chat.insertMessage(
            tx,
            conv.id,
            'x',
            `${row.name} không còn hoạt động`,
            now,
          ),
        });
      }
      await recordAudit(tx, context, {
        action: 'trading_floor.saco_remove',
        targetEntity: 'tf_sacos',
        targetId: id,
        before: { active: true, position: fresh.rank, user_id: fresh.userId },
        after: { active: false },
        note: 'Gỡ quyền SACO',
      });
      return messages;
    });
    if (posted) {
      this.chatService.revokeInvite(id);
      for (const item of posted) {
        const event = { type: 'chat:msg', convId: item.convId, message: item.message };
        this.events.toUser(item.userId, event);
        this.events.toSaco(id, event);
      }
      // Chủ tài khoản còn nhận sự kiện của SACO này lần cuối, rồi mới ngắt liên kết.
      await this.chatService.notifyPeers(id);
      this.presence.bindSaco(id, null);
      this.events.toUser(row.userId, { type: 'chat:inbox' });
    }
    return this.listFor(scope);
  }

  // ================================================================== nhật ký và lịch sử chat

  async invites(
    user: AuthenticatedUser,
    limit: number = CHAT_RULES.staffLimit,
  ): Promise<{ items: ManageInvite[] }> {
    const scope = await this.scopeOf(user);
    return { items: await this.chat.staffInvites(this.database, scope.leadId, limit) };
  }

  async convs(user: AuthenticatedUser): Promise<{ items: ManageConv[] }> {
    const scope = await this.scopeOf(user);
    return { items: await this.chat.staffConvs(this.database, scope.leadId, CHAT_RULES.staffLimit) };
  }

  /** Chỉ xem: không bao giờ đổi trạng thái đã xem hay chưa đọc của hai bên. */
  async conv(user: AuthenticatedUser, convId: string): Promise<ManageConvDetail> {
    const scope = await this.scopeOf(user);
    const conv = await this.chat.staffConv(this.database, convId, scope.leadId);
    if (!conv) {
      throw new NotFoundException({
        code: 'CONV_NOT_FOUND',
        message: 'Không tìm thấy cuộc trò chuyện.',
      });
    }
    return {
      ...conv,
      messages: await this.chat.messages(this.database, convId, CHAT_RULES.staffHistory),
    };
  }

  // ================================================================== nội bộ

  private async scopeOf(user: AuthenticatedUser): Promise<Scope> {
    if (user.role === 'admin') return { actor: user, leadId: null };
    if (user.role === 'team_lead') {
      const lead = await this.sacos.activeLead(this.database, user.id);
      if (lead) return { actor: user, leadId: user.id };
      throw new ForbiddenException({
        code: 'TEAM_LEAD_NOT_ACTIVE',
        message: 'Bạn không còn là trưởng nhóm',
      });
    }
    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: 'Bạn không có quyền thực hiện thao tác này',
    });
  }

  private async sacoInScope(scope: Scope, id: string): Promise<FloorSacoRow> {
    const row = await this.sacos.findById(this.database, id);
    if (!row || (scope.leadId && row.leadUserId !== scope.leadId)) throw sacoNotFound();
    return row;
  }

  /** Giữ cột `position` liền 1..n giữa các SACO còn hoạt động. */
  private async compact(tx: Parameters<FloorSacoRepository['renumber']>[0], at: Date): Promise<void> {
    const active = await this.sacos.listActive(tx);
    await this.sacos.renumber(
      tx,
      active.map((item) => item.id),
      at,
    );
  }

  private async listFor(scope: Scope): Promise<ManageList> {
    const [rows, leads] = await Promise.all([
      this.sacos.listManage(this.database, scope.leadId),
      scope.leadId
        ? this.sacos
            .activeLead(this.database, scope.leadId)
            .then((lead) => (lead ? [lead] : []))
        : this.sacos.activeLeads(this.database),
    ]);
    return { items: rows.map((row) => this.manageView(row, scope)), leads };
  }

  private async manageRow(scope: Scope, id: string): Promise<ManageSaco> {
    const rows = await this.sacos.listManage(this.database, scope.leadId);
    const row = rows.find((item) => item.id === id);
    if (!row) throw sacoNotFound();
    return this.manageView(row, scope);
  }

  /** Dòng của nhóm khác (chỉ trưởng nhóm thấy) bị che email, id tài khoản và số liệu. */
  private manageView(row: FloorSacoManageRow, scope: Scope): ManageSaco {
    const mine = scope.leadId === null || row.leadUserId === scope.leadId;
    return {
      id: row.id,
      userId: mine ? row.userId : '',
      name: row.name,
      email: mine ? row.email : '',
      icon: row.icon,
      leadUserId: row.leadUserId,
      leadName: row.leadName,
      active: row.active,
      onDuty: row.onDuty,
      online: row.active && this.presence.userOnline(row.userId),
      position: row.active ? row.rank : null,
      convs: mine ? row.convs : 0,
      accepted: mine ? row.accepted : 0,
      declined: mine ? row.declined : 0,
      timedOut: mine ? row.timedOut : 0,
      mine,
    };
  }
}
