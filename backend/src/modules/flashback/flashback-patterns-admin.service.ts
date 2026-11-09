/**
 * Quản trị mẫu nến tính sẵn của kho Flashback (Candle Dojo v1.3 §7): khối "Mẫu nến" của mục "Kho dữ
 * liệu Flashback".
 *
 * - Trạng thái tính mẫu: phiên bản kho, `detector_version`, lần chạy, tổng số mẫu, số mã lỗi, cảnh báo;
 *   nút "Tính lại mẫu nến" (chạy bù hoặc đổi bộ nhận diện), đang chạy thì từ chối.
 * - Tra cứu: một mã (hoặc mọi mã) trong một khoảng ngày → số lần theo từng thẻ, nhóm theo bậc, có tổng
 *   (đúng truy vấn của v1.3 §6).
 * - Tổng quan: số lần gặp của 47 thẻ trên cả kho; thẻ có 0 lần được đánh dấu.
 *
 * Mọi số liệu đọc theo phiên bản kho đang dùng và `detector_version` của lần tính `done` mới nhất, đúng
 * cặp mà ván chơi tra.
 */

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { CD_CARDS, cdCard } from '../candle-dojo/shared/cards.js';
import { CANDLE_DETECTOR_VERSION } from '../candle-dojo/shared/detector.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import {
  FLASHBACK_DATASET_REPOSITORY,
  FlashbackDatasetRepository,
} from './flashback-dataset.repository.js';
import { FlashbackPatternsCompute, PATTERN_STALE_RUN_MS } from './flashback-patterns.compute.js';
import {
  FLASHBACK_PATTERNS_REPOSITORY,
  FlashbackPatternsRepository,
  type PatternCountRow,
  type PatternRunRow,
} from './flashback-patterns.repository.js';
import { FlashbackRoomCards } from './flashback-rooms.cards.js';

export interface PatternRunView {
  readonly id: number;
  readonly version: number;
  readonly detector_version: number;
  readonly status: PatternRunRow['status'];
  readonly trigger: PatternRunRow['trigger'];
  readonly requested_by: string | null;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly symbols_done: number;
  readonly symbols_total: number;
  readonly patterns_count: number;
  /** Số mã tính lỗi (vẫn dùng cho ván nhưng không có thẻ). */
  readonly failed_count: number;
  readonly duration_ms: number | null;
  readonly log: Record<string, unknown>;
}

export interface PatternWarningView {
  readonly code: string;
  readonly level: 'high' | 'medium';
  readonly message: string;
  readonly at: string | null;
}

export interface PatternStatusView {
  /** Phiên bản kho đang dùng; `null` khi chưa có kho. */
  readonly version: number | null;
  /** Phiên bản bộ nhận diện của mã nguồn đang chạy. */
  readonly detector_version: number;
  /** Lần chạy đang diễn ra (khoá nút "Tính lại mẫu nến"). */
  readonly running: PatternRunView | null;
  /** Lần chạy mới nhất, mọi trạng thái. */
  readonly latest: PatternRunView | null;
  /** Lần `done` mới nhất: lần ván chơi đang dùng. */
  readonly used: PatternRunView | null;
  /** Bộ nhận diện của lần đang dùng khác bộ của mã nguồn (hoặc chưa có lần nào). */
  readonly outdated: boolean;
  /** Giá gốc đang có cho 4 thẻ Việt Nam. */
  readonly raw: { readonly symbols: number; readonly sessions: number };
  readonly warnings: PatternWarningView[];
}

export interface PatternLookupRow {
  readonly card_id: string;
  readonly name: string;
  readonly tier: number;
  readonly count: number;
}

export interface PatternLookupView {
  readonly version: number | null;
  readonly detector_version: number | null;
  readonly symbol: string | null;
  readonly from: string;
  readonly to: string;
  readonly rows: PatternLookupRow[];
  readonly tiers: Array<{ tier: number; total: number }>;
  readonly total: number;
}

export interface PatternOverviewCard {
  readonly card_id: string;
  readonly name: string;
  readonly tier: number;
  readonly candles: number;
  /** Một trong 4 thẻ Việt Nam: cần giá gốc, 0 lần thường do thiếu giá gốc. */
  readonly vn: boolean;
  readonly count: number;
  readonly zero: boolean;
}

export interface PatternOverviewView {
  readonly version: number | null;
  readonly detector_version: number | null;
  readonly total: number;
  readonly zero_count: number;
  readonly cards: PatternOverviewCard[];
}

export interface PatternRecomputeView {
  readonly accepted: true;
  readonly mode: 'inline';
  readonly version: number;
  readonly detector_version: number;
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function runView(row: PatternRunRow): PatternRunView {
  const duration = row.log.timings?.duration_ms;
  return {
    id: row.id,
    version: row.version,
    detector_version: row.detectorVersion,
    status: row.status,
    trigger: row.trigger,
    requested_by: row.requestedBy,
    started_at: row.startedAt.toISOString(),
    finished_at: iso(row.finishedAt),
    symbols_done: row.symbolsDone,
    symbols_total: row.symbolsTotal,
    patterns_count: row.patternsCount,
    failed_count: row.log.failed?.length ?? 0,
    duration_ms:
      typeof duration === 'number'
        ? duration
        : row.finishedAt
          ? row.finishedAt.getTime() - row.startedAt.getTime()
          : null,
    log: row.log as Record<string, unknown>,
  };
}

const badRequest = (code: string, message: string) => new BadRequestException({ code, message });

/** Ngày YYYY-MM-DD có thật (không phải 2025-02-30). */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

@Injectable()
export class FlashbackPatternsAdminService {
  private readonly logger = new Logger(FlashbackPatternsAdminService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(FLASHBACK_DATASET_REPOSITORY) private readonly datasets: FlashbackDatasetRepository,
    @Inject(FLASHBACK_PATTERNS_REPOSITORY) private readonly patterns: FlashbackPatternsRepository,
    private readonly compute: FlashbackPatternsCompute,
    @Optional() private readonly cards?: FlashbackRoomCards,
  ) {}

  /** Trạng thái tính mẫu của phiên bản kho đang dùng (v1.3 §7, khối đầu). */
  async status(now: Date = new Date()): Promise<PatternStatusView> {
    const active = await this.datasets.activeVersion();
    if (!active) {
      return {
        version: null,
        detector_version: CANDLE_DETECTOR_VERSION,
        running: null,
        latest: null,
        used: null,
        outdated: false,
        raw: { symbols: 0, sessions: 0 },
        warnings: [],
      };
    }
    const [latest, used, raw] = await Promise.all([
      this.patterns.latestRun(active.version),
      this.patterns.latestDoneRun(active.version),
      this.patterns.rawCoverage(active.version),
    ]);
    const running =
      latest?.status === 'running' && now.getTime() - latest.heartbeatAt.getTime() < PATTERN_STALE_RUN_MS
        ? latest
        : null;
    const outdated = !used || used.detectorVersion !== CANDLE_DETECTOR_VERSION;
    const warnings: PatternWarningView[] = [];

    if (!used) {
      warnings.push({
        code: 'pattern_missing',
        level: 'medium',
        message: `Phiên bản kho ${active.version} chưa có mẫu nến tính sẵn: ván vẫn chơi bình thường nhưng chưa hiện thẻ nào. Bấm "Tính lại mẫu nến".`,
        at: null,
      });
    } else if (used.detectorVersion !== CANDLE_DETECTOR_VERSION) {
      warnings.push({
        code: 'pattern_detector_outdated',
        level: 'medium',
        message: `Mẫu nến đang dùng tính bằng bộ nhận diện ${used.detectorVersion}, mã nguồn hiện là ${CANDLE_DETECTOR_VERSION}. Bấm "Tính lại mẫu nến".`,
        at: iso(used.finishedAt),
      });
    }
    if (latest?.status === 'failed' && (!used || latest.id > used.id)) {
      warnings.push({
        code: 'pattern_failed',
        level: 'high',
        message: `Tính mẫu nến thất bại (bộ nhận diện ${latest.detectorVersion}): ${latest.log.error ?? 'không rõ lý do'}`,
        at: iso(latest.finishedAt ?? latest.startedAt),
      });
    }
    if (used) {
      const failed = used.log.failed ?? [];
      if (failed.length > 0) {
        warnings.push({
          code: 'pattern_symbols_failed',
          level: 'medium',
          message: `${failed.length} mã tính mẫu lỗi, vẫn dùng cho ván nhưng không có thẻ: ${failed
            .slice(0, 10)
            .map((item) => item.symbol)
            .join(', ')}${failed.length > 10 ? ', ...' : ''}.`,
          at: iso(used.finishedAt),
        });
      }
      const withoutRaw = used.log.raw?.symbols_without_raw ?? 0;
      const missingSessions = used.log.missing_raw_sessions ?? 0;
      if (used.log.raw && raw.symbols === 0) {
        warnings.push({
          code: 'pattern_raw_missing',
          level: 'high',
          message:
            'Không có giá gốc của mã nào: 4 thẻ Việt Nam (Limit Up/Down Lock, Limit Up/Down Close) không hiện trong Flashback. Shop vẫn bán các thẻ này.',
          at: iso(used.finishedAt),
        });
      } else if (withoutRaw > 0 || missingSessions > 0) {
        warnings.push({
          code: 'pattern_raw_missing',
          level: 'medium',
          message: `Thiếu giá gốc nên 4 thẻ Việt Nam không xét được ở ${withoutRaw} mã và ${missingSessions} phiên.`,
          at: iso(used.finishedAt),
        });
      }
    }

    return {
      version: active.version,
      detector_version: CANDLE_DETECTOR_VERSION,
      running: running ? runView(running) : null,
      latest: latest ? runView(latest) : null,
      used: used ? runView(used) : null,
      outdated,
      raw,
      warnings,
    };
  }

  /** Số lần theo từng thẻ của một mã (hoặc mọi mã) trong một khoảng ngày (v1.3 §6, §7). */
  async lookup(query: {
    symbol?: string | null;
    from: string;
    to: string;
    version?: number;
  }): Promise<PatternLookupView> {
    if (!isRealDate(query.from) || !isRealDate(query.to))
      throw badRequest('INVALID_DATE', 'Ngày phải có dạng YYYY-MM-DD');
    if (query.from > query.to) throw badRequest('INVALID_RANGE', 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc');
    const symbol = query.symbol && query.symbol.toLowerCase() !== 'all' ? query.symbol.toUpperCase() : null;
    const target = await this.target(query.version);
    const base = { symbol, from: query.from, to: query.to };
    if (!target.used) {
      return { version: target.version, detector_version: null, ...base, rows: [], tiers: [], total: 0 };
    }
    const counts = await this.patterns.countByCard({
      version: target.used.version,
      detectorVersion: target.used.detectorVersion,
      ...base,
    });
    const rows = counts.map(lookupRow);
    const tiers = new Map<number, number>();
    for (const row of rows) tiers.set(row.tier, (tiers.get(row.tier) ?? 0) + row.count);
    return {
      version: target.used.version,
      detector_version: target.used.detectorVersion,
      ...base,
      rows,
      tiers: [...tiers.entries()].sort((a, b) => a[0] - b[0]).map(([tier, total]) => ({ tier, total })),
      total: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }

  /** Số lần gặp của 47 thẻ trên cả kho; thẻ có 0 lần được đánh dấu (v1.3 §7). */
  async overview(query: { version?: number } = {}): Promise<PatternOverviewView> {
    const target = await this.target(query.version);
    const counts = target.used
      ? new Map(
          (await this.patterns.overview(target.used.version, target.used.detectorVersion)).map((row) => [
            row.cardId,
            row.count,
          ]),
        )
      : new Map<string, number>();
    const cards: PatternOverviewCard[] = CD_CARDS.map((card) => {
      const count = counts.get(card.id) ?? 0;
      return {
        card_id: card.id,
        name: card.name,
        tier: card.tier,
        candles: card.candles,
        vn: card.vn !== null,
        count,
        zero: count === 0,
      };
    });
    return {
      version: target.used?.version ?? target.version,
      detector_version: target.used?.detectorVersion ?? null,
      total: cards.reduce((sum, card) => sum + card.count, 0),
      zero_count: cards.filter((card) => card.zero).length,
      cards,
    };
  }

  /**
   * "Tính lại mẫu nến" (v1.3 §4): chạy bù trên phiên bản đang dùng, hoặc chạy lại sau khi đổi bộ nhận
   * diện. Chạy nền trong tiến trình API (dưới vài phút cho cả kho); không cho chạy hai lần cùng lúc.
   */
  async recompute(audit: AuditContext, now: Date = new Date()): Promise<PatternRecomputeView> {
    const active = await this.datasets.activeVersion();
    if (!active)
      throw new ConflictException({
        code: 'PATTERN_NO_ACTIVE_DATASET',
        message: 'Chưa có phiên bản kho đang dùng để tính mẫu nến',
      });
    const [latest, used] = await Promise.all([
      this.patterns.latestRun(active.version),
      this.patterns.latestDoneRun(active.version),
    ]);
    if (
      latest?.status === 'running' &&
      now.getTime() - latest.heartbeatAt.getTime() < PATTERN_STALE_RUN_MS
    )
      throw new ConflictException({
        code: 'PATTERN_RUN_RUNNING',
        message: `Đang có một lần tính mẫu nến chạy (phiên bản kho ${active.version}), hãy chờ cho tới khi xong`,
      });
    await this.database.transaction((tx) =>
      recordAudit(tx, audit, {
        action: 'flashback.pattern_recompute',
        targetEntity: 'fb_dataset_pattern_runs',
        targetId: String(active.version),
        note: 'Tính lại mẫu nến của kho dữ liệu Flashback',
      }),
    );
    const trigger = used && used.detectorVersion !== CANDLE_DETECTOR_VERSION ? 'detector' : 'admin';
    void this.compute
      .run({ version: active.version, trigger, requestedBy: audit.adminId, now })
      .then((result) => {
        // Có hiệu lực ngay cho ván đang chơi thay vì chờ hết thời gian ghi nhớ.
        this.cards?.invalidate();
        if (result.status === 'already_running')
          this.logger.warn(`Flashback patterns: phiên bản ${active.version} đã có một lần tính khác`);
      })
      .catch((error: unknown) =>
        this.logger.error(
          `Flashback patterns: tính lại thủ công lỗi (${error instanceof Error ? error.message : 'không rõ'})`,
        ),
      );
    return {
      accepted: true,
      mode: 'inline',
      version: active.version,
      detector_version: CANDLE_DETECTOR_VERSION,
    };
  }

  /** Phiên bản kho cần xem và lần tính được dùng (mặc định: kho đang dùng). */
  private async target(
    version?: number,
  ): Promise<{ version: number | null; used: PatternRunRow | null }> {
    const row =
      version !== undefined ? await this.datasets.getVersion(version) : await this.datasets.activeVersion();
    if (version !== undefined && !row)
      throw new NotFoundException({
        code: 'DATASET_VERSION_NOT_FOUND',
        message: `Không tìm thấy phiên bản kho ${version}`,
      });
    if (!row) return { version: null, used: null };
    return { version: row.version, used: await this.patterns.latestDoneRun(row.version) };
  }
}

function lookupRow(row: PatternCountRow): PatternLookupRow {
  return {
    card_id: row.cardId,
    name: cdCard(row.cardId)?.name ?? row.cardId,
    tier: row.tier,
    count: row.count,
  };
}
