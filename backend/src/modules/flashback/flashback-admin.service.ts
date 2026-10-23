/**
 * Nghiệp vụ quản trị của Flashback (spec v1.2 §7).
 *
 * Quản trị chỉ xem: danh sách đề, cảnh báo, tài khoản bị nghi vấn, bảng tham số và tạm dừng
 * Flashback, xem mã/giai đoạn của một đề đã đóng (có ghi nhật ký kiểm tra).
 *
 * Bản 22-10:
 * - FB-07: duyệt thưởng đang giữ của tài khoản bị đánh dấu (trả hoặc huỷ).
 * - FB-08: xem mã và tạm dừng chỉ dành cho quản trị viên cao nhất (`SUPER_ADMIN_USER_IDS`).
 * - FB-11i: bảng tham số §9 ở dạng chỉ đọc; sửa bằng SQL (xem `backend/docs`).
 */

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import { auditContext, recordAudit, type AuditContext } from '../users/audit.js';
import {
  FLASHBACK_CONFIG_KEY,
  FLASHBACK_DEFAULT_SETTINGS,
  FLASHBACK_PAUSED_KEY,
  flashbackRewardLedgerKey,
} from './flashback.constants.js';
import {
  FLASHBACK_ALERT_LEVEL_LABELS,
  FLASHBACK_REPOSITORY,
  FlashbackRepository,
  type FlashbackAlertLevel,
} from './flashback.repository.js';
import { flashbackSuspectGroups } from './flashback.suspects.js';
import type { FlashbackRewardHoldRow, FlashbackRewardHoldStatus } from './flashback.types.js';

/** Token danh sách quản trị viên cao nhất (uuid, từ `SUPER_ADMIN_USER_IDS`). */
export const FLASHBACK_SUPER_ADMINS = Symbol('FLASHBACK_SUPER_ADMINS');

/** Một đề trong danh sách quản trị. */
export interface FlashbackAdminRoundView {
  /** uuid của đề (dùng cho endpoint `rounds/{id}/reveal`). */
  readonly id: string;
  readonly round_no: number;
  readonly status: string;
  readonly scheduled_open_at: string;
  readonly opens_at: string | null;
  readonly closes_at: string | null;
  readonly player_count: number;
  readonly total_fee_xu: number;
  /** Xu đã trả thật (không tính phần đang giữ hoặc đã huỷ). */
  readonly total_reward_xu: number;
  /** Xu đang giữ chờ duyệt (FB-07). */
  readonly held_reward_xu: number;
  readonly fallback_level: number;
  /** Luôn ẩn trong danh sách; chỉ hiện qua endpoint reveal kèm ghi nhật ký (spec v1.2 §7). */
  readonly symbol: string | null;
  readonly start_date: string | null;
}

/** Một cảnh báo của tác vụ. */
export interface FlashbackAdminAlertView {
  readonly run_at: string;
  readonly step: string;
  readonly round_id: string | null;
  readonly result: string;
  readonly error: string | null;
  /** Mức độ cảnh báo (spec v1.2 §6.1): high = Cao, medium = Trung bình, low = Thấp. */
  readonly level: FlashbackAlertLevel | null;
  readonly level_label: string | null;
}

/** Một nhóm tài khoản bị nghi vấn. */
export interface FlashbackAdminSuspectView {
  readonly round_id: string;
  readonly reason: string;
  readonly shared: string;
  readonly user_count: number;
  readonly usernames: string[];
}

/** Một khoản thưởng đang giữ hoặc đã duyệt (FB-07). */
export interface FlashbackAdminRewardHoldView {
  readonly id: string;
  readonly round_id: string;
  readonly round_no: number;
  readonly user_id: string;
  readonly username: string;
  readonly amount: number;
  readonly reason: string;
  readonly status: FlashbackRewardHoldStatus;
  readonly decided_by: string | null;
  readonly decided_at: string | null;
  readonly created_at: string;
}

/** Một tham số vận hành (spec v1.2 §9), chỉ đọc. */
export interface FlashbackAdminSettingView {
  readonly key: string;
  readonly label: string;
  readonly value: string | number;
  readonly default_value: string | number;
}

/** Nhãn tiếng Việt của các tham số §9 (thứ tự hiển thị). */
const SETTING_LABELS: Record<keyof typeof FLASHBACK_DEFAULT_SETTINGS, string> = {
  round_duration_hours: 'Thời lượng một đề (giờ)',
  change_hour_utc7: 'Giờ đổi đề (giờ Việt Nam)',
  rounds_before_symbol_repeat: 'Số đề trước khi lặp lại mã',
  earliest_start_date: 'Ngày lịch sử sớm nhất',
  min_months_ago: 'Phiên chơi cuối cách hiện tại tối thiểu (tháng)',
  warmup_sessions: 'Số phiên khởi tạo chỉ báo',
  history_sessions: 'Số phiên lịch sử hiển thị',
  play_sessions: 'Số phiên chơi',
  min_liquidity_vnd: 'Thanh khoản bình quân tối thiểu (đồng/phiên)',
  min_daily_volatility: 'Độ biến động ngày tối thiểu',
  min_max_profit: 'Lợi nhuận tối đa của đề, cận dưới',
  max_max_profit: 'Lợi nhuận tối đa của đề, cận trên',
  max_start_attempts: 'Số lần thử ngày bắt đầu mỗi mã',
  entry_fee_xu: 'Phí tham gia từ lần thứ hai (xu)',
};

const forbiddenSuperAdmin = (message: string) =>
  new ForbiddenException({ code: 'SUPER_ADMIN_REQUIRED', message });

/** Che bớt mã thiết bị khi hiển thị (đủ để đối chiếu, không lộ toàn bộ). */
function maskShared(reason: string, shared: string): string {
  if (reason === 'same_device') return shared.length > 12 ? `${shared.slice(0, 12)}…` : shared;
  return shared.slice(0, 120);
}

@Injectable()
export class FlashbackAdminService {
  private readonly superAdmins: ReadonlySet<string>;

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY) private readonly repository: FlashbackRepository,
    @Optional() @Inject(FLASHBACK_SUPER_ADMINS) superAdmins?: readonly string[],
  ) {
    this.superAdmins = new Set((superAdmins ?? []).map((id) => id.toLowerCase()));
  }

  /** Người dùng có trong danh sách quản trị viên cao nhất (FB-08). */
  isSuperAdmin(userId: string | null | undefined): boolean {
    return typeof userId === 'string' && this.superAdmins.has(userId.toLowerCase());
  }

  /** Danh sách đề (không lộ mã/giai đoạn trong danh sách; chỉ xem qua reveal). */
  async rounds(limit = 50): Promise<FlashbackAdminRoundView[]> {
    const rounds = await this.repository.listRounds(this.database, limit);
    const views: FlashbackAdminRoundView[] = [];
    for (const round of rounds) {
      const entries = await this.repository.listEntriesByRound(this.database, round.id);
      const holds = await this.repository.listRewardHolds(this.database, {
        roundId: round.id,
        limit: 10_000,
      });
      const notPaid = new Map(
        holds.filter((hold) => hold.status !== 'released').map((hold) => [hold.userId, hold]),
      );
      const totalFee = entries.reduce((sum, entry) => sum + entry.feeXu, 0);
      const totalReward = entries
        .filter((entry) => !notPaid.has(entry.userId))
        .reduce((sum, entry) => sum + entry.rewardXu, 0);
      const held = holds
        .filter((hold) => hold.status === 'held')
        .reduce((sum, hold) => sum + hold.amount, 0);
      views.push({
        id: round.id,
        round_no: round.roundNo,
        status: round.status,
        scheduled_open_at: round.scheduledOpenAt.toISOString(),
        opens_at: round.opensAt ? round.opensAt.toISOString() : null,
        closes_at: round.closesAt ? round.closesAt.toISOString() : null,
        player_count: entries.length,
        total_fee_xu: totalFee,
        total_reward_xu: totalReward,
        held_reward_xu: held,
        fallback_level: round.fallbackLevel,
        symbol: null,
        start_date: null,
      });
    }
    return views;
  }

  /** Cảnh báo đã ghi trong nhật ký tác vụ. */
  async alerts(limit = 100): Promise<FlashbackAdminAlertView[]> {
    const rows = await this.repository.listJobLog(this.database, limit);
    return rows
      .filter((row) => row.step === 'alert')
      .map((row) => ({
        run_at: row.runAt.toISOString(),
        step: row.step,
        round_id: row.roundId,
        result: row.result,
        error: row.error,
        level: row.level,
        level_label: row.level === null ? null : FLASHBACK_ALERT_LEVEL_LABELS[row.level],
      }));
  }

  /**
   * Tài khoản bị nghi vấn (v1.1 §2.10.5, FB-07): nhiều tài khoản cùng tham gia một đề và dùng
   * chung một mã thiết bị, một số điện thoại hoặc một địa chỉ IP lúc tham gia. Cùng một luật với
   * bước trả thưởng của tác vụ (`flashbackSuspectGroups`).
   */
  async suspects(roundId?: string): Promise<FlashbackAdminSuspectView[]> {
    const round = roundId
      ? await this.repository.roundById(this.database, roundId)
      : ((await this.repository.openRound(this.database)) ??
        (await this.repository.listRounds(this.database, 1))[0] ??
        null);
    if (!round) return [];
    const groups = flashbackSuspectGroups(
      await this.repository.entrySignals(this.database, round.id),
    );
    return groups.slice(0, 100).map((group) => ({
      round_id: round.id,
      reason: group.reason,
      shared: maskShared(group.reason, group.shared),
      user_count: group.userIds.length,
      usernames: [...group.usernames],
    }));
  }

  /** Bảng tham số §9 (chỉ đọc). Thiếu khoá trong `flashback_settings` thì hiện giá trị mặc định. */
  async settings(): Promise<FlashbackAdminSettingView[]> {
    const stored = await this.repository.getSetting(this.database, FLASHBACK_CONFIG_KEY);
    const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
    return (Object.keys(SETTING_LABELS) as (keyof typeof FLASHBACK_DEFAULT_SETTINGS)[]).map(
      (key) => {
        const fallback = FLASHBACK_DEFAULT_SETTINGS[key];
        const value = raw[key];
        return {
          key,
          label: SETTING_LABELS[key],
          value: typeof value === 'number' || typeof value === 'string' ? value : fallback,
          default_value: fallback,
        };
      },
    );
  }

  /** Tạm dừng hoặc chạy lại Flashback (đề đang mở vẫn chạy). Chỉ quản trị viên cao nhất. */
  async setPaused(paused: boolean, audit?: AuditContext): Promise<{ paused: boolean }> {
    if (audit && !this.isSuperAdmin(audit.adminId))
      throw forbiddenSuperAdmin('Chỉ quản trị viên cao nhất mới được tạm dừng Flashback.');
    await this.database.transaction(async (tx) => {
      await this.repository.setSetting(tx, FLASHBACK_PAUSED_KEY, paused);
      if (audit) {
        await recordAudit(tx, audit, {
          action: paused ? 'flashback.pause' : 'flashback.resume',
          targetEntity: 'flashback_settings',
          targetId: FLASHBACK_PAUSED_KEY,
          after: { paused },
          note: paused ? 'Tạm dừng Flashback' : 'Chạy lại Flashback',
        });
      }
    });
    return { paused };
  }

  /** Trạng thái tạm dừng hiện tại. */
  async paused(): Promise<boolean> {
    const stored = await this.repository.getSetting(this.database, FLASHBACK_PAUSED_KEY);
    return stored === true;
  }

  // ------------------------------------------------------- thưởng đang giữ

  async rewardHolds(status?: FlashbackRewardHoldStatus): Promise<FlashbackAdminRewardHoldView[]> {
    const holds = await this.repository.listRewardHolds(this.database, { status, limit: 200 });
    return holds.map(holdView);
  }

  /**
   * Trả một khoản thưởng đang giữ (FB-07): ghi `coin_ledger` với cùng khoá
   * `flashback_reward:{round}:{user}` nên không bao giờ trả hai lần.
   */
  async releaseRewardHold(id: string, audit: AuditContext): Promise<FlashbackAdminRewardHoldView> {
    return this.decide(id, 'released', audit);
  }

  /** Huỷ một khoản thưởng đang giữ: không cộng xu. */
  async voidRewardHold(id: string, audit: AuditContext): Promise<FlashbackAdminRewardHoldView> {
    return this.decide(id, 'voided', audit);
  }

  private async decide(
    id: string,
    status: 'released' | 'voided',
    audit: AuditContext,
  ): Promise<FlashbackAdminRewardHoldView> {
    const decidedAt = new Date();
    return this.database.transaction(async (tx) => {
      const hold = await this.repository.lockRewardHold(tx, id);
      if (!hold)
        throw new NotFoundException({
          code: 'FLASHBACK_HOLD_NOT_FOUND',
          message: 'Không tìm thấy khoản thưởng đang giữ.',
        });
      if (hold.status !== 'held')
        throw new ConflictException({
          code: 'FLASHBACK_HOLD_DECIDED',
          message: 'Khoản thưởng này đã được duyệt.',
        });
      if (status === 'released') {
        const wallet = await this.repository.lockWallet(tx, hold.userId);
        const seq = wallet.lastSeq + 1;
        const balanceAfter = wallet.balance + hold.amount;
        const appended = await this.repository.appendLedger(tx, {
          userId: hold.userId,
          seq,
          kind: 'flashback_reward',
          delta: hold.amount,
          balanceAfter,
          uniqueKey: flashbackRewardLedgerKey(hold.roundId, hold.userId),
          ref: { round_id: hold.roundId, round_no: hold.roundNo, hold_id: hold.id },
          policyVersion: 'iqx-flashback-v1',
        });
        if (appended) await this.repository.saveWallet(tx, hold.userId, balanceAfter, seq);
      }
      const changed = await this.repository.decideRewardHold(
        tx,
        hold.id,
        status,
        audit.adminId,
        decidedAt,
      );
      if (!changed)
        throw new ConflictException({
          code: 'FLASHBACK_HOLD_DECIDED',
          message: 'Khoản thưởng này đã được duyệt.',
        });
      await recordAudit(tx, audit, {
        action: status === 'released' ? 'flashback.reward.release' : 'flashback.reward.void',
        targetEntity: 'flashback_reward_hold',
        targetId: hold.id,
        before: { status: 'held', amount: hold.amount },
        after: { status },
        note: `${status === 'released' ? 'Trả' : 'Huỷ'} thưởng đề ${hold.roundNo}`,
      });
      return holdView({ ...hold, status, decidedBy: audit.adminId, decidedAt });
    });
  }

  /** Xem mã và giai đoạn của một đề đã đóng (chỉ quản trị viên cao nhất, ghi nhật ký kiểm tra). */
  async reveal(
    roundId: string,
    context: Partial<AuditContext> & { readonly id?: string; readonly role?: string },
    request?: { ip?: string | null; userAgent?: string | null; requestId?: string | null },
  ): Promise<{ round_no: number; symbol: string; start_date: string; session_range: string }> {
    const adminId = context.adminId ?? context.id ?? null;
    if (!this.isSuperAdmin(adminId)) {
      throw forbiddenSuperAdmin(
        'Chỉ quản trị viên cao nhất mới được xem mã và giai đoạn của đề đã đóng.',
      );
    }
    const round = await this.repository.roundById(this.database, roundId);
    if (!round)
      throw new ConflictException({
        code: 'FLASHBACK_ROUND_NOT_FOUND',
        message: 'Không tìm thấy đề.',
      });
    if (round.status !== 'closed' && round.status !== 'paid')
      throw new ConflictException({
        code: 'FLASHBACK_ROUND_NOT_REVEALABLE',
        message: 'Chỉ xem được mã của đề đã đóng.',
      });
    const bars = round.bars;
    const first = bars[0]?.d ?? '';
    const last = bars[bars.length - 1]?.d ?? '';
    const ip = request?.ip ?? context.ip ?? null;
    const fullAudit: AuditContext = {
      adminId: adminId!,
      actorRole: 'admin',
      ip,
      userAgent: request?.userAgent ?? context.userAgent ?? null,
      requestId: request?.requestId ?? context.requestId ?? null,
    };
    await this.database.transaction(async (tx: SqlClient) => {
      await recordAudit(tx, fullAudit, {
        action: 'flashback.round.reveal',
        targetEntity: 'flashback_round',
        targetId: round.id,
        after: { symbol: round.symbol, start_date: round.startDate },
        note: `Xem mã đề ${round.roundNo}`,
      });
      await this.repository.appendJobLog(tx, {
        step: 'reveal',
        roundId: round.id,
        result: `quản trị ${adminId} xem mã đề ${round.roundNo}`,
        error: ip,
      });
    });
    return {
      round_no: round.roundNo,
      symbol: round.symbol,
      start_date: round.startDate,
      session_range: `${first}..${last}`,
    };
  }

  /** Alias cho `reveal` (spec v1.2 §7). */
  async revealRound(
    roundId: string,
    context: Partial<AuditContext> & { readonly id?: string; readonly role?: string },
    request?: { ip?: string | null; userAgent?: string | null; requestId?: string | null },
  ): Promise<{ round_no: number; symbol: string; start_date: string; session_range: string }> {
    return this.reveal(roundId, context, request);
  }
  /** Audit context từ request của quản trị. */
  static context(
    admin: Parameters<typeof auditContext>[0],
    request: Parameters<typeof auditContext>[1],
  ): AuditContext {
    return auditContext(admin, request);
  }
}

function holdView(hold: FlashbackRewardHoldRow): FlashbackAdminRewardHoldView {
  return {
    id: hold.id,
    round_id: hold.roundId,
    round_no: hold.roundNo,
    user_id: hold.userId,
    username: hold.username,
    amount: hold.amount,
    reason: hold.reason,
    status: hold.status,
    decided_by: hold.decidedBy,
    decided_at: hold.decidedAt ? hold.decidedAt.toISOString() : null,
    created_at: hold.createdAt.toISOString(),
  };
}
