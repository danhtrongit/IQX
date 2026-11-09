/**
 * Truy cập dữ liệu của kho Flashback v2.2 (bảng `fb_dataset_*`, migration 0039).
 *
 * Quy tắc đọc/ghi:
 * - Người đọc (cắt đề, trang quản trị) chỉ nhìn phiên bản `active`. Một phiên bản mới được ghi
 *   trọn vẹn khi còn `building`, rồi `activate` chuyển trạng thái trong MỘT transaction (§2.2 bước
 *   4): không có lúc nào một ván thấy kho nửa cũ nửa mới.
 * - Mỗi mã được ghi trong một transaction riêng (dòng mã + nến + mảng cộng dồn), nên một mã lỗi
 *   không để lại dữ liệu dở dang và các mã khác vẫn chạy tiếp (§2.2 bước 3).
 * - Phiên bản không được kích hoạt (lỗi hoặc bị ngắt giữa chừng) bị dọn nến và mảng cộng dồn ngay,
 *   chỉ giữ dòng phiên bản (nhật ký) và dòng mã (lý do) cho trang quản trị. Phiên bản `retired`
 *   được giữ nguyên để còn dựng lại được ván cũ từ (dataset_version, symbol, start_idx) (§3.5).
 * - Cảnh báo ghi vào `flashback_job_log` (step `alert`) theo quy ước sẵn có
 *   `alert:<mức>:<mã>: <nội dung>`, mã luôn bắt đầu bằng `dataset_` để lọc ra riêng.
 */

import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import type { FlashbackAlertLevel } from './flashback.repository.js';
import { FLASHBACK_DATASET_CONFIG_KEY } from './flashback-dataset.config.js';
import type { DatasetBar, DatasetPrefix, DatasetValueBasis } from './flashback-dataset.logic.js';

export const FLASHBACK_DATASET_REPOSITORY = Symbol('FLASHBACK_DATASET_REPOSITORY');

export type DatasetVersionStatus = 'building' | 'active' | 'retired' | 'failed';
export type DatasetTrigger = 'scheduled' | 'manual' | 'cli';

/** Giai đoạn đang chạy của một lần tạo kho, hiện trên trang quản trị. */
export type DatasetPhase = 'basket' | 'calendar' | 'symbols' | 'finalize' | 'done';

export interface DatasetProgress {
  readonly phase: DatasetPhase;
  readonly total: number;
  readonly done: number;
  readonly ok: number;
  readonly excluded: number;
}

export const EMPTY_DATASET_PROGRESS: DatasetProgress = {
  phase: 'basket',
  total: 0,
  done: 0,
  ok: 0,
  excluded: 0,
};

/** Nhật ký một lần tạo kho (§2.2 bước 5), lưu ở `fb_dataset_versions.log`. */
export interface DatasetBuildLog {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  outcome: 'active' | 'failed';
  error?: string;
  basket: { index: string; count: number; source: string };
  calendar: { sessions: number; first: string | null; last: string | null; source: string };
  symbols: { ok: number; excluded: number };
  excluded: Array<{ symbol: string; reason: string }>;
  value_basis: { matched: number; mixed: number; approx: number };
  sources: Record<string, number>;
  parameters: {
    min_symbols: number;
    min_bars: number;
    warmup_sessions: number;
    max_gap_sessions: number;
  };
  /** Số điểm cắt hợp lệ của phòng (view_bars/play_bars) tại lúc tạo kho, để quản trị ước lượng. */
  cuts?: { view_bars: number; play_bars: number; symbols_with_cut: number; total_cuts: number };
  /** Bước 2b "Tính mẫu nến" (Candle Dojo v1.3 §4); thiếu với kho dựng khi chưa có bước này. */
  patterns?: {
    run_id: number;
    detector_version: number;
    symbols_done: number;
    symbols_total: number;
    patterns_count: number;
    failed_symbols: number;
    missing_raw_sessions: number;
  };
}

export interface DatasetVersionRow {
  readonly version: number;
  readonly createdAt: Date;
  readonly status: DatasetVersionStatus;
  readonly symbolsCount: number;
  readonly source: string;
  readonly log: Partial<DatasetBuildLog> & Record<string, unknown>;
  readonly trigger: DatasetTrigger;
  readonly requestedBy: string | null;
  readonly heartbeatAt: Date;
  readonly progress: DatasetProgress;
  /** Ngưỡng ghi cứng vào mảng cộng dồn của phiên bản này. */
  readonly maxGapSessions: number;
  readonly finishedAt: Date | null;
  readonly activatedAt: Date | null;
  /** Ngày sớm nhất / muộn nhất trong dữ liệu của các mã `ok`. */
  readonly firstDate: string | null;
  readonly lastDate: string | null;
}

export interface DatasetSymbolRow {
  readonly version: number;
  readonly symbol: string;
  readonly barsCount: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly status: 'ok' | 'excluded';
  readonly reason: string | null;
  readonly priceSource: string | null;
  readonly valueBasis: DatasetValueBasis | null;
  readonly badCount: number;
}

/** Dòng mã ghi kèm nến và mảng cộng dồn của mã `ok`. */
export interface DatasetSymbolInput {
  readonly symbol: string;
  readonly priceSource: string;
  readonly valueBasis: DatasetValueBasis;
  readonly badCount: number;
}

/** Một phiên đọc lại từ kho để dựng ván. */
export interface DatasetCutRow {
  readonly idx: number;
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type DatasetAlertCode =
  | 'refresh_failed'
  | 'too_few_symbols'
  | 'no_cut'
  | 'no_active_version'
  | 'data_error'
  | 'pattern_failed';

export interface DatasetAlertRow {
  readonly runAt: Date;
  readonly level: FlashbackAlertLevel;
  readonly code: string;
  readonly message: string;
}

export interface DatasetFinishInput {
  readonly symbolsCount: number;
  readonly source: string;
  readonly log: DatasetBuildLog;
  readonly progress: DatasetProgress;
}

export abstract class FlashbackDatasetRepository {
  // ------------------------------------------------------------------ tham số
  abstract readConfig(): Promise<unknown>;
  abstract writeConfig(value: unknown): Promise<void>;

  // ------------------------------------------------------------------ tạo kho
  /** Đánh dấu `failed` các lần tạo kho `building` đã ngừng báo nhịp từ lâu (tiến trình bị ngắt). */
  abstract failStaleBuilds(staleMs: number): Promise<number[]>;
  /** Tạo dòng `building`; `null` nếu đang có một lần tạo kho khác (chỉ một lần chạy một lúc). */
  abstract createBuilding(input: {
    trigger: DatasetTrigger;
    requestedBy: string | null;
    maxGapSessions: number;
    progress: DatasetProgress;
  }): Promise<DatasetVersionRow | null>;
  abstract updateProgress(version: number, progress: DatasetProgress): Promise<void>;
  /** Ghi một mã `ok`: dòng mã, mọi nến và mảng cộng dồn, trong một transaction. */
  abstract saveSymbol(
    version: number,
    symbol: DatasetSymbolInput,
    bars: readonly DatasetBar[],
    prefix: DatasetPrefix,
  ): Promise<void>;
  /** Ghi một mã bị loại kèm lý do. */
  abstract saveExcluded(
    version: number,
    input: { symbol: string; barsCount: number; firstDate: string | null; lastDate: string | null; reason: string },
  ): Promise<void>;
  /** Đánh dấu phiên bản `failed` (giữ kho đang dùng). */
  abstract markFailed(version: number, input: DatasetFinishInput): Promise<void>;
  /** Chuyển phiên bản sang `active` và phiên bản đang dùng sang `retired`, trong một transaction. */
  abstract activate(version: number, input: DatasetFinishInput): Promise<void>;

  // ------------------------------------------------------------------ đọc
  abstract activeVersion(): Promise<DatasetVersionRow | null>;
  /** Số phiên bản đang dùng (truy vấn nhẹ, gọi mỗi lần bắt đầu ván). */
  abstract activeVersionNumber(): Promise<number | null>;
  abstract buildingVersion(): Promise<DatasetVersionRow | null>;
  abstract getVersion(version: number): Promise<DatasetVersionRow | null>;
  abstract listVersions(limit: number): Promise<DatasetVersionRow[]>;
  abstract latestFailedVersion(): Promise<DatasetVersionRow | null>;
  abstract listSymbols(version: number): Promise<DatasetSymbolRow[]>;
  abstract listOkSymbols(version: number): Promise<string[]>;
  abstract loadPrefix(version: number, symbol: string): Promise<DatasetPrefix | null>;
  /** Các phiên `[from, from + count)` của một mã, theo thứ tự `idx`. */
  abstract loadBars(
    version: number,
    symbol: string,
    from: number,
    count: number,
  ): Promise<DatasetCutRow[]>;

  // ------------------------------------------------------------------ cảnh báo
  abstract appendAlert(level: FlashbackAlertLevel, code: DatasetAlertCode, message: string): Promise<void>;
  abstract hasRecentAlert(code: DatasetAlertCode, withinMinutes: number): Promise<boolean>;
  abstract countAlerts(code: DatasetAlertCode, withinHours: number): Promise<number>;
  abstract listAlerts(limit: number): Promise<DatasetAlertRow[]>;
}

// ------------------------------------------------------------------ Postgres

type Row = Record<string, unknown>;

const toInt = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new RangeError('Giá trị số không hợp lệ');
  return Math.trunc(parsed);
};
const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));
const toText = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 10);

const VERSION_COLUMNS = `v.version, v.created_at, v.status, v.symbols_count, v.source, v.log,
  v.trigger_kind, v.requested_by, v.heartbeat_at, v.progress, v.params, v.finished_at,
  v.activated_at,
  (select min(s.first_date) from fb_dataset_symbols s where s.version = v.version and s.status = 'ok') as first_date,
  (select max(s.last_date) from fb_dataset_symbols s where s.version = v.version and s.status = 'ok') as last_date`;

const SYMBOL_COLUMNS = `version, symbol, bars_count, first_date, last_date, status, reason,
  price_source, value_basis, bad_count`;

function mapProgress(value: unknown): DatasetProgress {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const phase = ['basket', 'calendar', 'symbols', 'finalize', 'done'].includes(String(raw.phase))
    ? (String(raw.phase) as DatasetPhase)
    : 'basket';
  const num = (key: string) => (Number.isFinite(Number(raw[key])) ? Number(raw[key]) : 0);
  return { phase, total: num('total'), done: num('done'), ok: num('ok'), excluded: num('excluded') };
}

function mapVersion(row: Row): DatasetVersionRow {
  const params = (typeof row.params === 'object' && row.params !== null ? row.params : {}) as Record<
    string,
    unknown
  >;
  return {
    version: toInt(row.version),
    createdAt: toDate(row.created_at),
    status: String(row.status) as DatasetVersionStatus,
    symbolsCount: toInt(row.symbols_count),
    source: String(row.source ?? ''),
    log: (typeof row.log === 'object' && row.log !== null ? row.log : {}) as DatasetVersionRow['log'],
    trigger: String(row.trigger_kind) as DatasetTrigger,
    requestedBy: row.requested_by === null ? null : String(row.requested_by),
    heartbeatAt: toDate(row.heartbeat_at),
    progress: mapProgress(row.progress),
    maxGapSessions: Number.isFinite(Number(params.max_gap_sessions))
      ? Number(params.max_gap_sessions)
      : 5,
    finishedAt: row.finished_at === null ? null : toDate(row.finished_at),
    activatedAt: row.activated_at === null ? null : toDate(row.activated_at),
    firstDate: toText(row.first_date),
    lastDate: toText(row.last_date),
  };
}

function mapSymbol(row: Row): DatasetSymbolRow {
  return {
    version: toInt(row.version),
    symbol: String(row.symbol),
    barsCount: toInt(row.bars_count),
    firstDate: toText(row.first_date),
    lastDate: toText(row.last_date),
    status: row.status === 'ok' ? 'ok' : 'excluded',
    reason: row.reason === null || row.reason === undefined ? null : String(row.reason),
    priceSource: row.price_source === null ? null : String(row.price_source),
    valueBasis:
      row.value_basis === 'matched' || row.value_basis === 'mixed' || row.value_basis === 'approx'
        ? row.value_basis
        : null,
    badCount: toInt(row.bad_count ?? 0),
  };
}

/** Số dòng nến mỗi câu lệnh ghi (giữ mỗi câu lệnh dưới giới hạn thời gian của pool). */
const BAR_INSERT_CHUNK = 1_000;

const jsonArray = (values: ArrayLike<number>): number[] => Array.from(values);

/** Ghi chú trên các mã `ok` của một phiên bản không được kích hoạt, vì nến của chúng đã được dọn. */
export const DATASET_PURGED_NOTE = 'Dữ liệu đã được dọn vì phiên bản không được kích hoạt';

@Injectable()
export class PgFlashbackDatasetRepository extends FlashbackDatasetRepository {
  private readonly logger = new Logger(PgFlashbackDatasetRepository.name);

  constructor(private readonly database: DatabaseService) {
    super();
  }

  /**
   * Dọn nến và mảng cộng dồn của một phiên bản KHÔNG được kích hoạt (lỗi hoặc bị ngắt giữa chừng):
   * chỉ giữ dòng phiên bản (nhật ký) và dòng mã (lý do) để quản trị xem. Phiên bản chưa từng
   * `active` nên chưa ván nào tham chiếu tới nó. Mỗi mã một transaction nhỏ để không vượt giới hạn
   * thời gian của pool; lỗi dọn dẹp chỉ ghi log vì không ảnh hưởng kho đang dùng.
   */
  private async purgeData(version: number): Promise<void> {
    try {
      const symbols = await this.database.query<{ symbol: string }>(
        `select symbol from fb_dataset_symbols where version = $1 and status = 'ok'`,
        [version],
      );
      for (const { symbol } of symbols) {
        await this.database.transaction(async (tx) => {
          await tx.query(`delete from fb_dataset_prefix where version = $1 and symbol = $2`, [version, symbol]);
          // Mẫu nến tính sẵn (0046) trỏ tới dòng mã chứ không tới nến; `fb_dataset_raw` tự xoá cùng nến.
          await tx.query(`delete from fb_dataset_patterns where version = $1 and symbol = $2`, [version, symbol]);
          await tx.query(`delete from fb_dataset_bars where version = $1 and symbol = $2`, [version, symbol]);
        });
      }
      await this.database.query(
        `update fb_dataset_symbols set reason = $2 where version = $1 and status = 'ok'`,
        [version, DATASET_PURGED_NOTE],
      );
    } catch (error) {
      this.logger.warn(
        `Flashback dataset: không dọn được dữ liệu của phiên bản ${version} (${error instanceof Error ? error.message : 'lỗi'})`,
      );
    }
  }

  async readConfig(): Promise<unknown> {
    const rows = await this.database.query<{ value: unknown }>(
      `select value from flashback_settings where key = $1 limit 1`,
      [FLASHBACK_DATASET_CONFIG_KEY],
    );
    return rows[0]?.value ?? null;
  }

  async writeConfig(value: unknown): Promise<void> {
    await this.database.query(
      `insert into flashback_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [FLASHBACK_DATASET_CONFIG_KEY, JSON.stringify(value)],
    );
  }

  async failStaleBuilds(staleMs: number): Promise<number[]> {
    const rows = await this.database.query<Row>(
      `update fb_dataset_versions
          set status = 'failed', finished_at = now(),
              log = coalesce(log, '{}'::jsonb) || jsonb_build_object(
                'outcome', 'failed',
                'error', 'Lần tạo kho bị ngắt giữa chừng (tiến trình dừng, không còn báo nhịp)')
        where status = 'building'
          and heartbeat_at < now() - make_interval(secs => $1::double precision)
        returning version`,
      [staleMs / 1000],
    );
    const versions = rows.map((row) => toInt(row.version));
    for (const version of versions) await this.purgeData(version);
    return versions;
  }

  async createBuilding(input: {
    trigger: DatasetTrigger;
    requestedBy: string | null;
    maxGapSessions: number;
    progress: DatasetProgress;
  }): Promise<DatasetVersionRow | null> {
    const rows = await this.database.query<Row>(
      `with created as (
         insert into fb_dataset_versions (status, trigger_kind, requested_by, params, progress)
         values ('building', $1, $2, $3::jsonb, $4::jsonb)
         on conflict do nothing
         returning *
       )
       select ${VERSION_COLUMNS} from created v`,
      [
        input.trigger,
        input.requestedBy,
        JSON.stringify({ max_gap_sessions: input.maxGapSessions }),
        JSON.stringify(input.progress),
      ],
    );
    return rows[0] ? mapVersion(rows[0]) : null;
  }

  async updateProgress(version: number, progress: DatasetProgress): Promise<void> {
    await this.database.query(
      `update fb_dataset_versions set progress = $2::jsonb, heartbeat_at = now()
        where version = $1 and status = 'building'`,
      [version, JSON.stringify(progress)],
    );
  }

  async saveSymbol(
    version: number,
    symbol: DatasetSymbolInput,
    bars: readonly DatasetBar[],
    prefix: DatasetPrefix,
  ): Promise<void> {
    if (bars.length === 0) throw new RangeError('Không có nến để ghi');
    await this.database.transaction(async (tx) => {
      await tx.query(
        `insert into fb_dataset_symbols
           (version, symbol, bars_count, first_date, last_date, status, reason, price_source,
            value_basis, bad_count)
         values ($1, $2, $3, $4::date, $5::date, 'ok', null, $6, $7, $8)`,
        [
          version,
          symbol.symbol,
          bars.length,
          bars[0]!.date,
          bars[bars.length - 1]!.date,
          symbol.priceSource,
          symbol.valueBasis,
          symbol.badCount,
        ],
      );
      for (let from = 0; from < bars.length; from += BAR_INSERT_CHUNK) {
        const chunk = bars.slice(from, from + BAR_INSERT_CHUNK);
        await tx.query(
          `insert into fb_dataset_bars
             (version, symbol, idx, date, open, high, low, close, volume, value_raw, gap_before, bad, ret)
           select $1, $2, t.idx, t.date, t.open, t.high, t.low, t.close, t.volume, t.value_raw,
                  t.gap_before, t.bad, t.ret
             from unnest($3::int[], $4::date[], $5::bigint[], $6::bigint[], $7::bigint[],
                         $8::bigint[], $9::bigint[], $10::bigint[], $11::smallint[],
                         $12::smallint[], $13::float8[])
               as t(idx, date, open, high, low, close, volume, value_raw, gap_before, bad, ret)`,
          [
            version,
            symbol.symbol,
            chunk.map((bar) => bar.idx),
            chunk.map((bar) => bar.date),
            chunk.map((bar) => bar.open),
            chunk.map((bar) => bar.high),
            chunk.map((bar) => bar.low),
            chunk.map((bar) => bar.close),
            chunk.map((bar) => bar.volume),
            chunk.map((bar) => bar.valueRaw),
            chunk.map((bar) => bar.gapBefore),
            chunk.map((bar) => bar.bad),
            chunk.map((bar) => bar.ret),
          ],
        );
      }
      await tx.query(
        `insert into fb_dataset_prefix
           (version, symbol, n, days, p_gap, p_bad, p_zero, p_val, p_r, p_r2)
         values ($1, $2, $3, $4::int[], $5::int[], $6::int[], $7::int[], $8::float8[],
                 $9::float8[], $10::float8[])`,
        [
          version,
          symbol.symbol,
          prefix.n,
          jsonArray(prefix.days),
          jsonArray(prefix.pGap),
          jsonArray(prefix.pBad),
          jsonArray(prefix.pZero),
          jsonArray(prefix.pVal),
          jsonArray(prefix.pR),
          jsonArray(prefix.pR2),
        ],
      );
    });
  }

  async saveExcluded(
    version: number,
    input: {
      symbol: string;
      barsCount: number;
      firstDate: string | null;
      lastDate: string | null;
      reason: string;
    },
  ): Promise<void> {
    await this.database.query(
      `insert into fb_dataset_symbols
         (version, symbol, bars_count, first_date, last_date, status, reason)
       values ($1, $2, $3, $4::date, $5::date, 'excluded', $6)
       on conflict (version, symbol) do nothing`,
      [version, input.symbol, input.barsCount, input.firstDate, input.lastDate, input.reason],
    );
  }

  async markFailed(version: number, input: DatasetFinishInput): Promise<void> {
    const rows = await this.database.query<Row>(
      `update fb_dataset_versions
          set status = 'failed', finished_at = now(), symbols_count = $2, source = $3,
              log = $4::jsonb, progress = $5::jsonb
        where version = $1 and status = 'building'
        returning version`,
      [
        version,
        input.symbolsCount,
        input.source.slice(0, 160),
        JSON.stringify(input.log),
        JSON.stringify(input.progress),
      ],
    );
    // Chỉ dọn khi chính lệnh này vừa chuyển phiên bản sang failed (không bao giờ dọn bản active).
    if (rows.length > 0) await this.purgeData(version);
  }

  async activate(version: number, input: DatasetFinishInput): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.query(`update fb_dataset_versions set status = 'retired' where status = 'active'`);
      const rows = await tx.query<Row>(
        `update fb_dataset_versions
            set status = 'active', activated_at = now(), finished_at = now(), symbols_count = $2,
                source = $3, log = $4::jsonb, progress = $5::jsonb
          where version = $1 and status = 'building'
          returning version`,
        [
          version,
          input.symbolsCount,
          input.source.slice(0, 160),
          JSON.stringify(input.log),
          JSON.stringify(input.progress),
        ],
      );
      // Phiên bản không còn `building` (bị đánh dấu lỗi vì mất nhịp): huỷ cả transaction để kho
      // đang dùng vẫn được giữ.
      if (rows.length === 0) throw new Error(`Phiên bản kho ${version} không còn ở trạng thái building`);
    });
  }

  async activeVersion(): Promise<DatasetVersionRow | null> {
    const rows = await this.database.query<Row>(
      `select ${VERSION_COLUMNS} from fb_dataset_versions v where v.status = 'active' limit 1`,
    );
    return rows[0] ? mapVersion(rows[0]) : null;
  }

  async activeVersionNumber(): Promise<number | null> {
    const rows = await this.database.query<{ version: number }>(
      `select version from fb_dataset_versions where status = 'active' limit 1`,
    );
    return rows[0] ? toInt(rows[0].version) : null;
  }

  async buildingVersion(): Promise<DatasetVersionRow | null> {
    const rows = await this.database.query<Row>(
      `select ${VERSION_COLUMNS} from fb_dataset_versions v where v.status = 'building' limit 1`,
    );
    return rows[0] ? mapVersion(rows[0]) : null;
  }

  async getVersion(version: number): Promise<DatasetVersionRow | null> {
    const rows = await this.database.query<Row>(
      `select ${VERSION_COLUMNS} from fb_dataset_versions v where v.version = $1 limit 1`,
      [version],
    );
    return rows[0] ? mapVersion(rows[0]) : null;
  }

  async listVersions(limit: number): Promise<DatasetVersionRow[]> {
    const rows = await this.database.query<Row>(
      `select ${VERSION_COLUMNS} from fb_dataset_versions v order by v.version desc limit $1`,
      [limit],
    );
    return rows.map(mapVersion);
  }

  async latestFailedVersion(): Promise<DatasetVersionRow | null> {
    const rows = await this.database.query<Row>(
      `select ${VERSION_COLUMNS} from fb_dataset_versions v where v.status = 'failed'
        order by v.version desc limit 1`,
    );
    return rows[0] ? mapVersion(rows[0]) : null;
  }

  async listSymbols(version: number): Promise<DatasetSymbolRow[]> {
    const rows = await this.database.query<Row>(
      `select ${SYMBOL_COLUMNS} from fb_dataset_symbols where version = $1
        order by (status = 'ok') desc, symbol`,
      [version],
    );
    return rows.map(mapSymbol);
  }

  async listOkSymbols(version: number): Promise<string[]> {
    const rows = await this.database.query<{ symbol: string }>(
      `select symbol from fb_dataset_symbols where version = $1 and status = 'ok' order by symbol`,
      [version],
    );
    return rows.map((row) => row.symbol);
  }

  async loadPrefix(version: number, symbol: string): Promise<DatasetPrefix | null> {
    // to_json: pg trả kiểu json đã parse bằng JSON.parse, nhanh hơn nhiều so với bộ phân tích mảng
    // của pg khi mỗi mã có hàng chục nghìn phần tử.
    const rows = await this.database.query<Row>(
      `select n, to_json(days) as days, to_json(p_gap) as p_gap, to_json(p_bad) as p_bad,
              to_json(p_zero) as p_zero, to_json(p_val) as p_val, to_json(p_r) as p_r,
              to_json(p_r2) as p_r2
         from fb_dataset_prefix where version = $1 and symbol = $2`,
      [version, symbol],
    );
    const row = rows[0];
    if (!row) return null;
    const ints = (value: unknown) => Int32Array.from(value as number[]);
    const floats = (value: unknown) => Float64Array.from(value as number[]);
    return {
      n: toInt(row.n),
      days: ints(row.days),
      pGap: ints(row.p_gap),
      pBad: ints(row.p_bad),
      pZero: ints(row.p_zero),
      pVal: floats(row.p_val),
      pR: floats(row.p_r),
      pR2: floats(row.p_r2),
    };
  }

  async loadBars(
    version: number,
    symbol: string,
    from: number,
    count: number,
  ): Promise<DatasetCutRow[]> {
    const rows = await this.database.query<Row>(
      `select idx, date, open, high, low, close, volume from fb_dataset_bars
        where version = $1 and symbol = $2 and idx >= $3 and idx < $4 order by idx`,
      [version, symbol, from, from + count],
    );
    return rows.map((row) => ({
      idx: toInt(row.idx),
      date: String(row.date).slice(0, 10),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));
  }

  async appendAlert(
    level: FlashbackAlertLevel,
    code: DatasetAlertCode,
    message: string,
  ): Promise<void> {
    await this.database.query(
      `insert into flashback_job_log (run_at, step, round_id, result, error, level)
       values (now(), 'alert', null, $1, null, $2)`,
      [`alert:${level}:dataset_${code}: ${message}`.slice(0, 2_000), level],
    );
  }

  async hasRecentAlert(code: DatasetAlertCode, withinMinutes: number): Promise<boolean> {
    const rows = await this.database.query<{ found: boolean }>(
      `select exists(
         select 1 from flashback_job_log
          where step = 'alert' and result ~ $1
            and run_at > now() - make_interval(mins => $2::int)
       ) as found`,
      [`^alert:[a-z]+:dataset_${code}:`, withinMinutes],
    );
    return rows[0]?.found === true;
  }

  async countAlerts(code: DatasetAlertCode, withinHours: number): Promise<number> {
    const rows = await this.database.query<{ total: string }>(
      `select count(*)::text as total from flashback_job_log
        where step = 'alert' and result ~ $1
          and run_at > now() - make_interval(hours => $2::int)`,
      [`^alert:[a-z]+:dataset_${code}:`, withinHours],
    );
    return toInt(rows[0]?.total ?? 0);
  }

  async listAlerts(limit: number): Promise<DatasetAlertRow[]> {
    const rows = await this.database.query<Row>(
      `select run_at, result, level from flashback_job_log
        where step = 'alert' and result ~ '^alert:[a-z]+:dataset_'
        order by run_at desc, id desc limit $1`,
      [limit],
    );
    return rows.flatMap((row) => {
      const match = /^alert:([a-z]+):dataset_([a-z_]+): ?([\s\S]*)$/.exec(String(row.result ?? ''));
      if (!match) return [];
      const level = match[1] === 'high' || match[1] === 'medium' || match[1] === 'low' ? match[1] : 'high';
      return [{ runAt: toDate(row.run_at), level, code: match[2]!, message: match[3]! }];
    });
  }
}
