import { createHash } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { vnToday } from '../market-integration/integration.utils.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { recordAudit, type AuditContext } from '../users/audit.js';
import { runBulletinChecks } from './bulletin-checks.js';
import { BulletinDataService } from './bulletin-data.service.js';
import {
  autoMetrics,
  suggestLevels,
  type AutoMetrics,
  type LevelSuggestion,
} from './bulletin-model.js';
import { BulletinTrackingService } from './bulletin-tracking.service.js';
import {
  BULLETIN_RETENTION_MONTHS,
  PAGE_SIZES,
  type BulletinVariant,
  type SlotNumber,
} from './bulletin.constants.js';
import { dmy } from './bulletin.format.js';
import { BulletinRepository, type BulletinListItem, type FileMeta } from './bulletin.repository.js';
import type { BulletinContentInput } from './bulletin.schemas.js';
import {
  COMMENT_KEYS,
  EMPTY_LEVELS,
  type BulletinChecks,
  type BulletinContent,
  type BulletinHistoryEntry,
  type BulletinRow,
  type CommentKey,
  type Levels,
  type PublishedSummary,
  type SlotSnapshot,
  type VnIndexModel,
} from './bulletin.types.js';
import {
  renderBulletin,
  renderBulletinPdf,
  renderBulletinSvgs,
  type BulletinRenderInput,
} from './render/index.js';

export type Slots = Record<SlotNumber, SlotSnapshot | null>;

export type BulletinListEntry = {
  trade_date: string;
  status: BulletinRow['status'];
  data_ready: boolean;
  published_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  actor_name: string | null;
  error_count: number | null;
};

export type PublishedFileInfo = {
  variant: BulletinVariant;
  revision: number;
  file_name: string;
  byte_size: number;
  page_count: number;
  page_width: number;
  page_height: number;
  url: string;
  download_url: string;
};

export type BulletinDetail = {
  trade_date: string;
  status: BulletinRow['status'];
  data_ready: boolean;
  data_ready_at: string | null;
  content: BulletinContent;
  metrics: AutoMetrics | null;
  suggestions: LevelSuggestion[];
  /** Mô hình có nến nhưng số liệu thị trường chưa đủ: vẫn xem trước được, chưa Public được. */
  model_available: boolean;
  slots: Array<{ slot: SlotNumber; snapshot: SlotSnapshot | null }>;
  slots_locked: boolean;
  checks: BulletinChecks;
  has_changes: boolean;
  can_publish: boolean;
  published_revision: number | null;
  published_at: string | null;
  updated_at: string | null;
  published_by_name: string | null;
  files: PublishedFileInfo[];
  history: BulletinHistoryEntry[];
  retention_months: number;
};

export type PreviewResult = {
  variant: BulletinVariant;
  ready: boolean;
  pages: Array<{ svg: string; width: number; height: number }>;
  overflow: CommentKey[];
};

export type PushContext = {
  trade_date: string | null;
  status: BulletinRow['status'] | null;
  locked: boolean;
  slots: Array<{
    slot: SlotNumber;
    default_name: string | null;
    pushed: { pushed_at: string; display_name: string; picks: number; passed_count: number } | null;
  }>;
};

/** Bốn mã lỗi của thao tác Public để giao diện hiện đúng thông báo. */
const checksFailed = (checks: BulletinChecks) =>
  new UnprocessableEntityException({
    code: 'BULLETIN_CHECKS_FAILED',
    message: 'Sửa hết lỗi đỏ để Public.',
    details: checks,
  });

const notFound = (date: string) =>
  new NotFoundException({
    code: 'BULLETIN_NOT_FOUND',
    message: `Không có bản tin phiên ${dmy(date)}.`,
  });

export const fileUrl = (date: string, variant: BulletinVariant, revision: number): string =>
  `/api/v2/market/bulletins/${date}/files/${variant}/${revision}`;

/** Băm nội dung quyết định bản tin in ra gì: nhận định, mức, và danh sách mã của ba ô. */
export function bulletinContentHash(content: BulletinContent, slots: Readonly<Slots>): string {
  const levels: Levels = { ...EMPTY_LEVELS, ...content.levels };
  const canonical = {
    trend: content.trend,
    momentum: content.momentum,
    liquidity: content.liquidity,
    levels: [
      levels.r1,
      levels.r2,
      levels.s1,
      levels.s2,
      levels.pa,
      levels.pt,
      levels.na,
      levels.nt,
    ],
    slots: ([1, 2, 3] as const).map((slot) => {
      const snapshot = slots[slot];
      return snapshot
        ? {
            date: snapshot.trade_date,
            name: snapshot.display_name,
            conditions: snapshot.conditions,
            passed: snapshot.passed_count,
            picks: snapshot.picks.map((pick) => [
              pick.symbol,
              pick.close,
              pick.change_pct,
              pick.value_bn,
            ]),
            chart: snapshot.chart?.symbol ?? null,
            result: snapshot.result_id,
            version: snapshot.filter_version,
          }
        : null;
    }),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function retentionCutoff(now = new Date()): string {
  const today = vnToday(now);
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 - BULLETIN_RETENTION_MONTHS, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

const contentOf = (row: BulletinRow): BulletinContent => ({
  trend: row.trend,
  momentum: row.momentum,
  liquidity: row.liquidity,
  levels: row.levels,
});

@Injectable()
export class MarketBulletinsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: BulletinRepository,
    private readonly data: BulletinDataService,
    private readonly tracking: BulletinTrackingService,
  ) {}

  // ───────────── danh sách ─────────────

  async list(now = new Date()): Promise<{ items: BulletinListEntry[]; retention_months: number }> {
    const rows = await this.repository.list(this.database, retentionCutoff(now));
    return {
      items: rows.map((row: BulletinListItem) => ({
        trade_date: row.trade_date,
        status: row.status,
        data_ready: row.data_ready_at !== null,
        published_at: row.published_at,
        updated_at: row.updated_at,
        edited_at: row.edited_at,
        actor_name: row.actor_name,
        error_count: row.checks ? row.checks.errors : null,
      })),
      retention_months: BULLETIN_RETENTION_MONTHS,
    };
  }

  // ───────────── dựng đầu vào và kiểm tra ─────────────

  private async load(db: SqlClient, date: string) {
    const row = await this.repository.find(db, date);
    if (!row) throw notFound(date);
    const slots = await this.repository.slots(db, date);
    const ready = row.data_ready_at !== null;
    const model = await this.data.buildModel(db, date, row.market_stats);
    return { row, slots, ready, model };
  }

  private renderInput(
    date: string,
    model: VnIndexModel,
    content: BulletinContent,
    slots: Slots,
  ): BulletinRenderInput {
    return { date, model, content, slots };
  }

  /** Ô nhận định tràn khung ở bản máy tính hoặc điện thoại. */
  private overflowOf(input: BulletinRenderInput): CommentKey[] {
    const out = new Set<CommentKey>();
    for (const variant of ['desktop', 'mobile'] as const)
      for (const key of renderBulletin(input, variant).overflow) out.add(key);
    return COMMENT_KEYS.filter((key) => out.has(key));
  }

  computeChecks(
    date: string,
    content: BulletinContent,
    slots: Slots,
    model: VnIndexModel | null,
    ready: boolean,
    dataReadyAt: string | null,
    now = new Date(),
  ): BulletinChecks {
    const overflow = model ? this.overflowOf(this.renderInput(date, model, content, slots)) : [];
    return runBulletinChecks({
      tradeDate: date,
      content,
      model: ready ? model : null,
      dataReadyAt,
      slots,
      overflow,
      now,
    });
  }

  /** Chạy lại kiểm tra theo nội dung đã lưu và lưu kết quả. */
  async refreshChecks(db: SqlClient, date: string): Promise<BulletinChecks> {
    const { row, slots, ready, model } = await this.load(db, date);
    const checks = this.computeChecks(date, contentOf(row), slots, model, ready, row.data_ready_at);
    await this.repository.saveChecks(db, date, checks);
    return checks;
  }

  // ───────────── chi tiết ─────────────

  async detail(date: string, now = new Date()): Promise<BulletinDetail> {
    const { row, slots, ready, model } = await this.load(this.database, date);
    const content = contentOf(row);
    const checks = this.computeChecks(date, content, slots, model, ready, row.data_ready_at, now);
    const hash = bulletinContentHash(content, slots);
    const hasChanges = row.status !== 'public' || row.published_hash !== hash;
    const files =
      row.published_revision === null
        ? []
        : (await this.repository.fileMetas(this.database, date, row.published_revision)).map(
            (meta) => this.fileInfo(meta),
          );
    const actor = row.published_by
      ? await this.database.query<{ name: string | null }>(
          `select coalesce(nullif(full_name, ''), email) as name from users where id = $1::uuid`,
          [row.published_by],
        )
      : [];
    return {
      trade_date: date,
      status: row.status,
      data_ready: ready,
      data_ready_at: row.data_ready_at,
      content,
      metrics: model && ready ? autoMetrics(model) : null,
      suggestions: model && ready ? suggestLevels(model) : [],
      model_available: model !== null,
      slots: ([1, 2, 3] as const).map((slot) => ({ slot, snapshot: slots[slot] })),
      slots_locked: row.slots_locked,
      checks,
      has_changes: hasChanges,
      can_publish: checks.errors === 0 && hasChanges,
      published_revision: row.published_revision,
      published_at: row.published_at,
      updated_at: row.updated_at,
      published_by_name: actor[0]?.name ?? null,
      files,
      history: row.history,
      retention_months: BULLETIN_RETENTION_MONTHS,
    };
  }

  fileInfo(meta: FileMeta): PublishedFileInfo {
    const size = PAGE_SIZES[meta.variant];
    return {
      variant: meta.variant,
      revision: meta.revision,
      file_name: meta.file_name,
      byte_size: meta.byte_size,
      page_count: meta.page_count,
      page_width: size.width,
      page_height: size.height,
      url: fileUrl(meta.trade_date, meta.variant, meta.revision),
      download_url: `${fileUrl(meta.trade_date, meta.variant, meta.revision)}?download=1`,
    };
  }

  // ───────────── sửa nội dung ─────────────

  /** Tự lưu khi gõ: ghi nhận định và mức, trả về kiểm tra mới. Sửa được cả sau Public (thành "Public lại"). */
  async saveContent(
    user: AuthenticatedUser,
    date: string,
    input: BulletinContentInput,
  ): Promise<BulletinDetail> {
    await this.database.transaction(async (tx) => {
      const row = await this.repository.find(tx, date, true);
      if (!row) throw notFound(date);
      await this.repository.saveContent(
        tx,
        date,
        {
          trend: input.trend.trim(),
          momentum: input.momentum.trim(),
          liquidity: input.liquidity.trim(),
          levels: { ...EMPTY_LEVELS, ...input.levels },
        },
        user.id,
      );
    });
    await this.refreshChecks(this.database, date);
    return this.detail(date);
  }

  // ───────────── xem trước ─────────────

  /** Các trang SVG của một bản, dựng bằng đúng bộ vẽ của PDF; nhận nội dung đang gõ để cập nhật ngay. */
  async preview(
    date: string,
    variant: BulletinVariant,
    draft?: BulletinContentInput,
  ): Promise<PreviewResult> {
    const { row, slots, model } = await this.load(this.database, date);
    if (!model) return { variant, ready: false, pages: [], overflow: [] };
    const content: BulletinContent = draft
      ? {
          trend: draft.trend.trim(),
          momentum: draft.momentum.trim(),
          liquidity: draft.liquidity.trim(),
          levels: { ...EMPTY_LEVELS, ...draft.levels },
        }
      : contentOf(row);
    const { svgs, overflow } = renderBulletinSvgs(
      this.renderInput(date, model, content, slots),
      variant,
    );
    const size = PAGE_SIZES[variant];
    return {
      variant,
      ready: true,
      pages: svgs.map((svg) => ({ svg, width: size.width, height: size.height })),
      overflow,
    };
  }

  // ───────────── Public, Public lại, gỡ ─────────────

  /**
   * Public hoặc Public lại. Server kiểm lại toàn bộ (§3.5), dựng cả hai PDF bằng cùng bộ vẽ với xem trước rồi ghi
   * file, trạng thái và theo dõi trong MỘT giao dịch: lỗi giữa chừng thì giữ nguyên trạng thái cũ.
   */
  async publish(
    user: AuthenticatedUser,
    date: string,
    audit: AuditContext,
    now = new Date(),
  ): Promise<BulletinDetail> {
    const loaded = await this.load(this.database, date);
    const { row, slots, ready, model } = loaded;
    if (!ready || !model) {
      throw checksFailed(
        this.computeChecks(date, contentOf(row), slots, model, ready, row.data_ready_at, now),
      );
    }
    const content = contentOf(row);
    const checks = this.computeChecks(date, content, slots, model, ready, row.data_ready_at, now);
    if (checks.errors > 0) throw checksFailed(checks);
    const hash = bulletinContentHash(content, slots);
    if (row.status === 'public' && row.published_hash === hash)
      throw new ConflictException({
        code: 'BULLETIN_NO_CHANGES',
        message: 'Chưa có thay đổi nào để Public lại.',
      });

    const input = this.renderInput(date, model, content, slots);
    const [desktop, mobile] = await Promise.all([
      renderBulletinPdf(input, 'desktop', now),
      renderBulletinPdf(input, 'mobile', now),
    ]);
    const summary: PublishedSummary = {
      close: model.close,
      change: model.change,
      change_pct: model.changePct,
      pick_count: ([1, 2, 3] as const).reduce(
        (sum, slot) => sum + (slots[slot]?.picks.length ?? 0),
        0,
      ),
      slot_counts: [1, 2, 3].map((slot) => slots[slot as SlotNumber]?.picks.length ?? 0) as [
        number,
        number,
        number,
      ],
    };
    const pageCount = { desktop: 2, mobile: 5 } as const;
    const names = {
      desktop: `IQX-Ban-Tin-${date}.pdf`,
      mobile: `IQX-Ban-Tin-${date}-Dien-Thoai.pdf`,
    } as const;

    await this.database.transaction(async (tx) => {
      const locked = await this.repository.find(tx, date, true);
      if (!locked) throw notFound(date);
      const currentSlots = await this.repository.slots(tx, date);
      if (bulletinContentHash(contentOf(locked), currentSlots) !== hash)
        throw new ConflictException({
          code: 'BULLETIN_CHANGED',
          message: 'Nội dung vừa được sửa trong lúc dựng PDF. Hãy bấm Public lại.',
        });
      const revision = locked.revision + 1;
      const first = locked.published_at === null;
      const previous = locked.published_revision;
      for (const [variant, rendered] of [
        ['desktop', desktop],
        ['mobile', mobile],
      ] as const) {
        await this.repository.insertFile(tx, {
          trade_date: date,
          variant,
          revision,
          file_name: names[variant],
          sha256: createHash('sha256').update(rendered.pdf).digest('hex'),
          byte_size: rendered.pdf.byteLength,
          page_count: pageCount[variant],
          content: rendered.pdf,
        });
      }
      const action = previous === null ? 'publish' : 'republish';
      const history: BulletinHistoryEntry[] = [
        ...locked.history,
        { action, by: user.id, at: now.toISOString(), previous_revision: previous, revision },
      ];
      await this.repository.markPublished(tx, date, {
        revision,
        hash,
        summary,
        checks,
        by: user.id,
        first,
        history,
      });
      const added = await this.tracking.addFromBulletin(tx, date, currentSlots);
      await recordAudit(tx, audit, {
        action: action === 'publish' ? 'bulletin.publish' : 'bulletin.republish',
        targetEntity: 'market_bulletin',
        targetId: date,
        after: {
          revision,
          previous_revision: previous,
          picks: summary.pick_count,
          tracking_added: added.added,
        },
        note: `${action === 'publish' ? 'Public' : 'Public lại'} bản tin phiên ${dmy(date)}`,
      });
    });
    // Dòng theo dõi vừa thêm có thể đã tới hạn (Public lại bản cũ): áp ngay quy tắc, lỗi không làm hỏng Public.
    await this.tracking.evaluate().catch(() => undefined);
    return this.detail(date, now);
  }

  async unpublish(
    user: AuthenticatedUser,
    date: string,
    audit: AuditContext,
    now = new Date(),
  ): Promise<BulletinDetail> {
    await this.database.transaction(async (tx) => {
      const row = await this.repository.find(tx, date, true);
      if (!row) throw notFound(date);
      if (row.status !== 'public')
        throw new ConflictException({
          code: 'BULLETIN_NOT_PUBLIC',
          message: 'Bản tin này không đang trên web.',
        });
      const history: BulletinHistoryEntry[] = [
        ...row.history,
        {
          action: 'unpublish',
          by: user.id,
          at: now.toISOString(),
          previous_revision: row.published_revision,
          revision: null,
        },
      ];
      await this.repository.markUnpublished(tx, date, history);
      const exitDate = (await this.repository.latestIndexDate(tx, 'VNINDEX')) ?? date;
      const removed = await this.tracking.removeBulletin(tx, date, exitDate);
      await recordAudit(tx, audit, {
        action: 'bulletin.unpublish',
        targetEntity: 'market_bulletin',
        targetId: date,
        before: { revision: row.published_revision },
        after: { tracking_removed: removed },
        note: `Gỡ bản tin phiên ${dmy(date)} khỏi web`,
      });
    });
    return this.detail(date, now);
  }

  // ───────────── cho Bộ lọc ─────────────

  /** Bản tin đang chờ đẩy mã: phiên mới nhất đã có bản ghi, cùng trạng thái 3 ô. */
  async pushContext(): Promise<PushContext> {
    const [latest] = await this.database.query<{ trade_date: string }>(
      `select trade_date from market_bulletins order by trade_date desc limit 1`,
    );
    const date = latest ? String(latest.trade_date).slice(0, 10) : null;
    const row = date ? await this.repository.find(this.database, date) : null;
    const slots = date
      ? await this.repository.slots(this.database, date)
      : { 1: null, 2: null, 3: null };
    const out: PushContext['slots'] = [];
    for (const slot of [1, 2, 3] as const) {
      const snapshot = slots[slot];
      out.push({
        slot,
        default_name:
          snapshot?.display_name ??
          (date ? await this.repository.lastSlotName(this.database, slot, date) : null),
        pushed: snapshot
          ? {
              pushed_at: snapshot.pushed_at,
              display_name: snapshot.display_name,
              picks: snapshot.picks.length,
              passed_count: snapshot.passed_count,
            }
          : null,
      });
    }
    return {
      trade_date: date,
      status: row?.status ?? null,
      locked: row?.slots_locked ?? false,
      slots: out,
    };
  }

  // ───────────── job ─────────────

  /** Dọn bản tin quá 6 tháng (xoá luôn file PDF và ô bộ lọc theo khoá ngoại). */
  async sweepExpired(now = new Date()): Promise<string[]> {
    return this.repository.deleteOlderThan(this.database, retentionCutoff(now));
  }
}
