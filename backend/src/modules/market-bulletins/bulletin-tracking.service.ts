import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { DailyBarsService } from '../market-integration/daily-bars.service.js';
import { evaluateTracking, summarizeTracking, type TrackingSummary } from './bulletin-tracking.js';
import { BulletinRepository } from './bulletin.repository.js';
import { VNINDEX_SYMBOL, type SlotNumber } from './bulletin.constants.js';
import type { SlotSnapshot, TrackingRow } from './bulletin.types.js';

export type TrackingItem = {
  symbol: string;
  slot: SlotNumber;
  first_trade_date: string;
  entry_price: number;
  price: number | null;
  return_pct: number | null;
  sessions: number;
  is_today: boolean;
};

export type TrackingView = {
  as_of: string | null;
  slot: SlotNumber | null;
  summary: TrackingSummary;
  items: TrackingItem[];
};

export type TrackingEvaluateOutcome = { checked: number; exited: number; repriced: number };

/** Số phiên của thị trường (VN-Index) tới phiên mới nhất; đủ rộng cho 20 phiên theo dõi cộng ngày đề xuất. */
const SESSION_LOOKBACK = 140;

@Injectable()
export class BulletinTrackingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: BulletinRepository,
    private readonly dailyBars: DailyBarsService,
  ) {}

  /**
   * Thêm mã của một bản tin vừa Public vào theo dõi (spec §5.3, §9 điểm 1). Mã đang theo dõi giữ dòng cũ; mã đã rời
   * hoặc chưa từng có tạo dòng mới từ ngày bản tin. Cùng ngày ở nhiều bộ lọc: một dòng, bộ lọc số nhỏ hơn.
   */
  async addFromBulletin(
    db: SqlClient,
    date: string,
    slots: Readonly<Record<SlotNumber, SlotSnapshot | null>>,
  ): Promise<{ added: number }> {
    let added = 0;
    const seen = new Set<string>();
    for (const slot of [1, 2, 3] as const) {
      const snapshot = slots[slot];
      if (!snapshot || snapshot.trade_date !== date) continue;
      const columns = await this.dailyBars.loadColumns(snapshot.picks.map((pick) => pick.symbol));
      for (const pick of snapshot.picks) {
        if (seen.has(pick.symbol)) continue;
        seen.add(pick.symbol);
        const series = columns.get(pick.symbol);
        const index = series ? series.d.indexOf(date) : -1;
        const entry = index >= 0 ? series!.c[index]! : pick.close;
        if (!Number.isFinite(entry) || entry <= 0) continue;
        const inserted = await this.repository.insertTracking(db, {
          symbol: pick.symbol,
          slot,
          firstTradeDate: date,
          entryPrice: entry,
          sourceTradeDate: date,
        });
        if (inserted) added += 1;
      }
    }
    return { added };
  }

  /** Gỡ bản tin: các dòng do chính bản tin đó thêm rời theo dõi (`unpublished`). */
  async removeBulletin(db: SqlClient, date: string, exitDate: string): Promise<number> {
    return this.repository.exitTrackingOfBulletin(db, date, exitDate);
  }

  /** Các phiên của thị trường tới phiên mới nhất đã chốt, tăng dần. */
  private async marketSessions(db: SqlClient): Promise<string[]> {
    const latest = await this.repository.latestIndexDate(db, VNINDEX_SYMBOL);
    if (!latest) return [];
    const bars = await this.repository.loadIndexBars(db, VNINDEX_SYMBOL, latest, SESSION_LOOKBACK);
    return bars.map((bar) => bar.date);
  }

  /** Thân job: làm mới giá ngày đề xuất theo chuỗi đã điều chỉnh và đưa các mã tới hạn hoặc chạm dừng lỗ ra khỏi danh sách. */
  async evaluate(): Promise<TrackingEvaluateOutcome> {
    const sessions = await this.marketSessions(this.database);
    const rows = await this.repository.activeTracking(this.database);
    if (!sessions.length || !rows.length) return { checked: rows.length, exited: 0, repriced: 0 };
    const columns = await this.dailyBars.loadColumns([...new Set(rows.map((row) => row.symbol))]);
    let exited = 0;
    let repriced = 0;
    for (const row of rows) {
      const result = evaluateTracking(
        { firstTradeDate: row.first_trade_date, entryPrice: row.entry_price_adj },
        columns.get(row.symbol) ?? null,
        sessions,
      );
      if (Math.abs(result.entry - row.entry_price_adj) > 1e-6) {
        await this.repository.refreshEntryPrice(this.database, row.id, result.entry);
        repriced += 1;
      }
      if (result.exit) {
        await this.repository.exitTracking(
          this.database,
          row.id,
          result.exit.date,
          result.exit.reason,
        );
        exited += 1;
      }
    }
    return { checked: rows.length, exited, repriced };
  }

  /** `GET market/tracking`: chỉ các dòng đang theo dõi; mã đã rời không hiện ở đâu cả. */
  async view(slot: SlotNumber | null): Promise<TrackingView> {
    const sessions = await this.marketSessions(this.database);
    const all = await this.repository.activeTracking(this.database);
    const rows = slot ? all.filter((row) => row.slot === slot) : all;
    const asOf = sessions.at(-1) ?? null;
    if (!rows.length || !asOf)
      return { as_of: asOf, slot, summary: summarizeTracking([]), items: [] };
    const [columns, indexBars] = await Promise.all([
      this.dailyBars.loadColumns([...new Set(rows.map((row) => row.symbol))]),
      this.repository.loadIndexBars(this.database, VNINDEX_SYMBOL, asOf, SESSION_LOOKBACK),
    ]);
    const indexClose = new Map(indexBars.map((bar) => [bar.date, bar.close]));
    const latestIndex = indexClose.get(asOf) ?? null;
    const items: TrackingItem[] = [];
    const indexReturns: Array<number | null> = [];
    for (const row of rows) {
      const result = evaluateTracking(
        { firstTradeDate: row.first_trade_date, entryPrice: row.entry_price_adj },
        columns.get(row.symbol) ?? null,
        sessions,
      );
      if (result.exit) continue;
      const startIndex = indexClose.get(row.first_trade_date) ?? null;
      items.push({
        symbol: row.symbol,
        slot: row.slot,
        first_trade_date: row.first_trade_date,
        entry_price: result.entry,
        price: result.price,
        return_pct: result.returnPct,
        sessions: result.sessions,
        is_today: result.sessions === 0,
      });
      indexReturns.push(startIndex && latestIndex ? (latestIndex / startIndex - 1) * 100 : null);
    }
    return {
      as_of: asOf,
      slot,
      summary: summarizeTracking(
        items.map((item, index) => ({
          sessions: item.sessions,
          returnPct: item.return_pct,
          indexReturnPct: indexReturns[index] ?? null,
        })),
      ),
      items,
    };
  }

  /** Dùng trong test và công cụ: các dòng đang theo dõi (không lọc theo quy tắc). */
  activeRows(): Promise<TrackingRow[]> {
    return this.repository.activeTracking(this.database);
  }
}
