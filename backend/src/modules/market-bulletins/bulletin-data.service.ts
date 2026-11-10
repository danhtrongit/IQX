import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { DnseMarketProvider } from '../market-data/providers/dnse.provider.js';
import {
  DailyBarsService,
  acceptBar,
  latestCompletedWeekday,
} from '../market-integration/daily-bars.service.js';
import { isCompletedVietnamSession } from '../market-integration/integration.utils.js';
import { buildVnIndexModel } from './bulletin-model.js';
import { BulletinRepository } from './bulletin.repository.js';
import { INDEX_RETAINED_SESSIONS, VNINDEX_SYMBOL } from './bulletin.constants.js';
import type { IndexBar, MarketStats, VnIndexModel } from './bulletin.types.js';

/** Nến cần đọc để SMA200 có đủ số phiên khởi động. */
const MODEL_BAR_LIMIT = 420;
/** Số ngày lịch xin DNSE: đủ cho ~520 phiên. */
const INDEX_HISTORY_DAYS = 820;
/**
 * Tỷ lệ mã HOSE đã cập nhật cho phiên T (có nến phiên T, hoặc đã tải lại sau giờ chốt mà không có nến vì không
 * giao dịch) trên tổng số mã HOSE đã lưu thì mới coi số liệu thị trường là đủ.
 */
const HOSE_COVERAGE_RATIO = 0.85;

export type DataOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'ok'; date: string; created: boolean; ready: boolean; indexBars: number };

type StatsRow = {
  n: number;
  value_bn: string | null;
  advances: number;
  unchanged: number;
  declines: number;
  hose_total: number;
  hose_covered: number;
};

/**
 * Số liệu tự động của bản tin: nến VN-Index từ DNSE (kho riêng `market_index_bars`), giá trị giao dịch và độ
 * rộng HOSE tính từ kho nến cổ phiếu đã chốt. Không có số nhập tay.
 */
@Injectable()
export class BulletinDataService {
  private readonly logger = new Logger(BulletinDataService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly repository: BulletinRepository,
    private readonly dnse: DnseMarketProvider,
    private readonly dailyBars: DailyBarsService,
  ) {}

  /** Đọc lại nến VN-Index từ DNSE (một lời gọi), ghi các phiên đã đóng cửa và dọn phiên quá cũ. */
  async refreshIndexBars(now = new Date()): Promise<number> {
    const to = Math.floor(now.getTime() / 1000);
    const fetched = await this.dnse.fetchDailyBars(
      VNINDEX_SYMBOL,
      to - INDEX_HISTORY_DAYS * 86_400,
      to,
      'index',
    );
    const bars: IndexBar[] = fetched.bars
      .filter((bar) => acceptBar(bar) && isCompletedVietnamSession(bar.date, now))
      .slice(-INDEX_RETAINED_SESSIONS)
      .map((bar) => ({
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }));
    const written = await this.repository.upsertIndexBars(this.database, VNINDEX_SYMBOL, bars);
    await this.repository.pruneIndexBars(this.database, VNINDEX_SYMBOL, INDEX_RETAINED_SESSIONS);
    return written;
  }

  /**
   * Giá trị giao dịch (tỷ đồng) và độ rộng của HOSE ở phiên `date`, từ kho nến ngày đã điều chỉnh. Giá phiên
   * mới nhất chưa bị điều chỉnh nên giá × khối lượng là giá trị khớp thật. Null khi chưa đủ mã có nến phiên đó.
   */
  async computeStats(date: string, now = new Date()): Promise<MarketStats | null> {
    const rows = await this.database.query<StatsRow>(
      `with hose as (
         select b.symbol, b.last_date, b.bar_count, b.bars, b.fetched_at
           from market_daily_bars b
           join symbols s on upper(s.symbol) = b.symbol
          where s.is_active = true
            and coalesce(s.is_index, false) = false
            and lower(s.asset_type) = 'stock'
            and upper(coalesce(s.exchange, '')) = 'HOSE'
       ), today as (
         select symbol,
                (bars->'c'->>(bar_count - 1))::numeric as c,
                (bars->'c'->>(bar_count - 2))::numeric as p,
                (bars->'v'->>(bar_count - 1))::numeric as v
           from hose
          where last_date = $1::date and bar_count >= 2
       )
       select count(*)::int as n,
              sum(c * v) / 1e6 as value_bn,
              count(*) filter (where round(c, 3) > round(p, 3))::int as advances,
              count(*) filter (where round(c, 3) = round(p, 3))::int as unchanged,
              count(*) filter (where round(c, 3) < round(p, 3))::int as declines,
              (select count(*) from hose)::int as hose_total,
              (select count(*) from hose
                where last_date >= $1::date
                   or fetched_at >= (($1::date + time '15:15') at time zone 'Asia/Ho_Chi_Minh'))::int as hose_covered
         from today`,
      [date],
    );
    const row = rows[0];
    if (!row || Number(row.n) === 0 || row.value_bn === null) return null;
    if (Number(row.hose_covered) < HOSE_COVERAGE_RATIO * Number(row.hose_total)) return null;
    return {
      value_bn: Number(row.value_bn),
      advances: Number(row.advances),
      unchanged: Number(row.unchanged),
      declines: Number(row.declines),
      symbols: Number(row.n),
      source: 'market_daily_bars',
      computed_at: now.toISOString(),
    };
  }

  /** Mô hình VN-Index của phiên `date` (null khi chưa đủ nến hoặc nến cuối không phải ngày đó). */
  async buildModel(
    db: SqlClient,
    date: string,
    stats: MarketStats | null,
  ): Promise<VnIndexModel | null> {
    const bars = await this.repository.loadIndexBars(db, VNINDEX_SYMBOL, date, MODEL_BAR_LIMIT);
    return buildVnIndexModel(bars, date, stats);
  }

  /**
   * Thân job `market.bulletin-draft`: idempotent, rẻ khi không có gì mới. Khi VN-Index đã có nến của phiên đã đóng
   * cửa (cùng mốc "dữ liệu chốt" với Bot, 15:15) thì tạo bản nháp, rồi điền số liệu thị trường khi kho nến cổ
   * phiếu đã đủ. Phiên nghỉ lễ không có nến nên không sinh bản nháp.
   */
  async ensureDraftAndData(now = new Date()): Promise<DataOutcome> {
    const expected = latestCompletedWeekday(now);
    let latest = await this.repository.latestIndexDate(this.database, VNINDEX_SYMBOL);
    const draft = latest ? await this.repository.find(this.database, latest) : null;
    const needsIndex = !latest || latest < expected || !draft;
    let written = 0;
    if (needsIndex) {
      try {
        written = await this.refreshIndexBars(now);
      } catch (error) {
        this.logger.warn(
          `VN-Index bars unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (!latest) return { status: 'skipped', reason: 'index_unavailable' };
      }
      latest = await this.repository.latestIndexDate(this.database, VNINDEX_SYMBOL);
    }
    if (!latest) return { status: 'skipped', reason: 'no_index_bars' };
    if (!isCompletedVietnamSession(latest, now))
      return { status: 'skipped', reason: 'session_open' };

    const created = await this.repository.ensureDraft(this.database, latest);
    const bulletin = await this.repository.find(this.database, latest);
    let ready = Boolean(bulletin?.data_ready_at);
    if (bulletin && !ready) {
      const session = await this.dailyBars.resolveSession(now);
      if (session && session.session === latest) {
        const stats = await this.computeStats(latest, now);
        const model = stats ? await this.buildModel(this.database, latest, stats) : null;
        if (stats && model) {
          await this.repository.setData(this.database, latest, stats, now);
          ready = true;
        }
      }
    }
    if (ready) await this.repository.deleteStaleEmptyDrafts(this.database, latest);
    return { status: 'ok', date: latest, created, ready, indexBars: written };
  }
}
