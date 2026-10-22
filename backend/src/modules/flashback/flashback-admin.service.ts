/**
 * Nghiệp vụ quản trị của Flashback (spec v1.2 §7).
 *
 * Quản trị chỉ xem: danh sách đề, cảnh báo, tài khoản bị nghi vấn, tạm dừng Flashback và
 * xem mã/giai đoạn của một đề đã đóng (có ghi nhật ký kiểm tra).
 */

import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/database.service.js';
import { auditContext, recordAudit, type AuditContext } from '../users/audit.js';
import { FLASHBACK_PAUSED_KEY } from './flashback.constants.js';
import {
  FLASHBACK_ALERT_LEVEL_LABELS,
  FLASHBACK_REPOSITORY,
  FlashbackRepository,
  type FlashbackAlertLevel,
} from './flashback.repository.js';

type Row = Record<string, unknown>;

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
  readonly total_reward_xu: number;
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

@Injectable()
export class FlashbackAdminService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_REPOSITORY) private readonly repository: FlashbackRepository,
  ) {}

  /** Danh sách đề (không lộ mã/giai đoạn trong danh sách; chỉ xem qua reveal). */
  async rounds(limit = 50): Promise<FlashbackAdminRoundView[]> {
    const rounds = await this.repository.listRounds(this.database, limit);
    const views: FlashbackAdminRoundView[] = [];
    for (const round of rounds) {
      const entries = await this.repository.listEntriesByRound(this.database, round.id);
      const totalFee = entries.reduce((sum, entry) => sum + entry.feeXu, 0);
      const totalReward = entries.reduce((sum, entry) => sum + entry.rewardXu, 0);
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
   * Tài khoản bị nghi vấn: nhiều tài khoản cùng dùng một địa chỉ IP, một thiết bị (user-agent)
   * hoặc một số điện thoại cùng tham gia một đề.
   */
  async suspects(roundId?: string): Promise<FlashbackAdminSuspectView[]> {
    const round = roundId
      ? await this.repository.roundById(this.database, roundId)
      : ((await this.repository.openRound(this.database)) ??
        (await this.repository.listRounds(this.database, 1))[0] ??
        null);
    if (!round) return [];
    const rows = await this.database.query<Row>(
      `select lh.ip, lh.user_agent,
              e.user_id::text as user_id,
              e.round_id::text as entry_round_id,
              coalesce(u.username, u.email) as username,
              coalesce(u.phone_e164, u.phone_number) as phone_e164
         from flashback_entries e
         join users u on u.id = e.user_id
         left join user_login_history lh on lh.user_id = e.user_id
        where e.round_id = $1
        limit 5000`,
      [round.id],
    );
    const byIp = new Map<string, { users: Set<string>; names: Set<string> }>();
    const byAgent = new Map<string, { users: Set<string>; names: Set<string> }>();
    const byPhone = new Map<string, { users: Set<string>; names: Set<string> }>();
    for (const row of rows) {
      const userId = String(row.user_id ?? '');
      const username = String(row.username ?? '');
      const ip = row.ip ? String(row.ip) : '';
      const agent = row.user_agent ? String(row.user_agent) : '';
      const phone = String(row.phone_e164 ?? row.phone_number ?? row.phone ?? '').trim();
      if (ip) {
        const bucket = byIp.get(ip) ?? { users: new Set<string>(), names: new Set<string>() };
        bucket.users.add(userId);
        bucket.names.add(username);
        byIp.set(ip, bucket);
      }
      if (agent) {
        const bucket = byAgent.get(agent) ?? { users: new Set<string>(), names: new Set<string>() };
        bucket.users.add(userId);
        bucket.names.add(username);
        byAgent.set(agent, bucket);
      }
      if (phone) {
        const bucket = byPhone.get(phone) ?? { users: new Set<string>(), names: new Set<string>() };
        bucket.users.add(userId);
        bucket.names.add(username);
        byPhone.set(phone, bucket);
      }
    }
    const entries = await this.repository.leaderboardEntries(this.database, round.id);
    for (const entry of entries) {
      const phone = entry.phoneE164 ? entry.phoneE164.trim() : '';
      if (phone) {
        const bucket = byPhone.get(phone) ?? { users: new Set<string>(), names: new Set<string>() };
        bucket.users.add(entry.userId);
        bucket.names.add(entry.username);
        byPhone.set(phone, bucket);
      }
    }
    const suspects: FlashbackAdminSuspectView[] = [];
    for (const [ip, bucket] of byIp) {
      if (bucket.users.size > 1)
        suspects.push({
          round_id: round.id,
          reason: 'same_ip',
          shared: ip,
          user_count: bucket.users.size,
          usernames: [...bucket.names],
        });
    }
    for (const [agent, bucket] of byAgent) {
      if (bucket.users.size > 1)
        suspects.push({
          round_id: round.id,
          reason: 'same_device',
          shared: agent.slice(0, 120),
          user_count: bucket.users.size,
          usernames: [...bucket.names],
        });
    }
    for (const [phone, bucket] of byPhone) {
      if (bucket.users.size > 1)
        suspects.push({
          round_id: round.id,
          reason: 'same_phone',
          shared: phone,
          user_count: bucket.users.size,
          usernames: [...bucket.names],
        });
    }
    return suspects.sort((left, right) => right.user_count - left.user_count).slice(0, 100);
  }

  /** Tạm dừng hoặc chạy lại Flashback (đề đang mở vẫn chạy). */
  async setPaused(paused: boolean): Promise<{ paused: boolean }> {
    await this.database.transaction(async (tx) => {
      await this.repository.setSetting(tx, FLASHBACK_PAUSED_KEY, paused);
    });
    return { paused };
  }

  /** Trạng thái tạm dừng hiện tại. */
  async paused(): Promise<boolean> {
    const stored = await this.repository.getSetting(this.database, FLASHBACK_PAUSED_KEY);
    return stored === true;
  }

  /** Xem mã và giai đoạn của một đề đã đóng (chỉ quản trị viên cao nhất, ghi nhật ký kiểm tra). */
  async reveal(
    roundId: string,
    context: Partial<AuditContext> & { readonly id?: string; readonly role?: string },
    request?: { ip?: string | null; userAgent?: string | null; requestId?: string | null },
  ): Promise<{ round_no: number; symbol: string; start_date: string; session_range: string }> {
    const role = context.role ?? context.actorRole ?? 'admin';
    if (role !== 'admin' && role !== 'superadmin') {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Chỉ quản trị viên cao nhất mới được xem mã và giai đoạn của đề đã đóng.',
      });
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
    const adminId = context.adminId ?? context.id ?? 'admin';
    const ip = request?.ip ?? context.ip ?? null;
    const fullAudit: AuditContext = {
      adminId,
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
  static context(admin: Parameters<typeof auditContext>[0], request: Parameters<typeof auditContext>[1]): AuditContext {
    return auditContext(admin, request);
  }
}
