/**
 * Daily price store of Bot và Chiến lược v2.0 (§2.1, D1–D4, D8).
 *
 * Reads (`PriceStorePort`): calendar = VNINDEX dates, `data_as_of` = last VNINDEX date, eligibility =
 * latest VN30/VN100 membership snapshot ∩ symbols with bars, columnar series loads.
 *
 * Refresh (job `strategy.price-store-refresh`, build script): refresh set = VN100 ∪ VN30 ∪ symbols of
 * open Bot positions, plus VNINDEX. Each symbol re-fetches its FULL DNSE series (one call): new dates
 * are appended, a changed older bar replaces the changed bars and bumps `series_rev` (adjustment),
 * nothing is ever deleted. VNINDEX — hence `data_as_of` and the Bot's session D — is written LAST and
 * only when the stock refresh succeeded well enough, so the Bot never sees session D with stock bars
 * still missing. Idempotent: a second run on the same vendor data writes nothing and keeps revisions.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';

import { DATA_STORE_NAME, MARKET_INDEX_SYMBOL } from '../strategy-rules/constants.js';
import type {
  PriceSeriesBundle,
  PriceStoreMeta,
  PriceStorePort,
  StoreEligibility,
} from '../strategy-rules/contracts.js';
import { earliestStart } from '../strategy-rules/universe.js';
import {
  INDEX_SOURCE,
  STOCK_SOURCE,
  eligibleMembers,
  finalBeforeDate,
  normalizeIndexRows,
  normalizeStockRows,
  planRefresh,
  readyInstant,
  seriesHash,
  type StoreBar,
} from './price-store.logic.js';
import { PRICE_STORE_REPOSITORY, type PriceStoreRepository } from './price-store.repository.js';
import { PRICE_STORE_SOURCE, type PriceStoreSourcePort } from './price-store.source.js';

export type RefreshOptions = {
  now?: Date;
  /** Refresh every symbol of the set even if it already holds the latest session. */
  force?: boolean;
  /** Extra symbols to include (e.g. a manual backfill). */
  extraSymbols?: readonly string[];
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  /**
   * Largest number of stock failures that still lets VNINDEX (data_as_of) advance; default
   * max(2, 5% of the set). Above it the run is `partial` and the calendar stays at the previous day.
   */
  maxFailures?: number;
};

export type SymbolRefreshOutcome = {
  symbol: string;
  status: 'unchanged' | 'appended' | 'adjusted' | 'created' | 'failed' | 'skipped';
  new_dates?: number;
  changed_dates?: number;
  series_rev?: number;
  error?: string;
};

export type RefreshResult = {
  status: 'up_to_date' | 'refreshed' | 'partial' | 'failed';
  latest_session: string | null;
  data_as_of_before: string | null;
  data_as_of: string | null;
  set_size: number;
  refreshed: number;
  adjusted: string[];
  failed: Array<{ symbol: string; error: string }>;
  outcomes: SymbolRefreshOutcome[];
  duration_ms: number;
};

const message = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 300);

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

@Injectable()
export class PriceStoreService implements PriceStorePort {
  private readonly logger = new Logger(PriceStoreService.name);

  constructor(
    @Inject(PRICE_STORE_REPOSITORY) private readonly repository: PriceStoreRepository,
    @Inject(PRICE_STORE_SOURCE) private readonly source: PriceStoreSourcePort,
  ) {}

  // ------------------------------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------------------------------

  async meta(): Promise<PriceStoreMeta> {
    const calendar = await this.repository.calendar();
    return {
      data_store: DATA_STORE_NAME,
      data_as_of: calendar.at(-1) ?? null,
      earliest_start: earliestStart(calendar),
      price_unit: 'VND',
      adjusted: true,
      sessions: calendar.length,
    };
  }

  calendar(): Promise<string[]> {
    return this.repository.calendar();
  }

  private async storedStocks(): Promise<Set<string>> {
    const rows = await this.repository.symbols();
    return new Set(
      rows.filter((row) => row.kind === 'stock' && row.bars_count > 0).map((row) => row.symbol),
    );
  }

  async eligibility(): Promise<StoreEligibility> {
    const [stored, vn30, vn100] = await Promise.all([
      this.storedStocks(),
      this.repository.latestMembership('VN30'),
      this.repository.latestMembership('VN100'),
    ]);
    const vn100Members = eligibleMembers(vn100?.symbols ?? [], stored);
    const vn100Set = new Set(vn100Members);
    return {
      // VN30 ⊂ VN100 (D4): a VN30 member must also be in the store's VN100.
      vn30: eligibleMembers(vn30?.symbols ?? [], stored).filter(
        (symbol) => vn100Set.size === 0 || vn100Set.has(symbol),
      ),
      vn100: vn100Members,
      membership_session: { vn30: vn30?.session_date ?? null, vn100: vn100?.session_date ?? null },
    };
  }

  async membersAt(index: 'VN30' | 'VN100', session: string): Promise<string[]> {
    const [stored, snapshot] = await Promise.all([
      this.storedStocks(),
      this.repository.membershipAt(index, session),
    ]);
    return eligibleMembers(snapshot?.symbols ?? [], stored);
  }

  loadSeries(
    symbols: readonly string[],
    options: { until?: string } = {},
  ): Promise<PriceSeriesBundle> {
    return this.repository.loadSeries(symbols, options.until ?? null);
  }

  // ------------------------------------------------------------------------------------------
  // Refresh
  // ------------------------------------------------------------------------------------------

  /** VN100 ∪ VN30 (latest snapshots; vendor list when none) ∪ open Bot positions ∪ extras. */
  async refreshSet(extra: readonly string[] = []): Promise<string[]> {
    const members = async (code: string): Promise<string[]> => {
      const snapshot = await this.repository.latestMembership(code);
      if (snapshot) return snapshot.symbols;
      if (!this.source.currentMembers) return [];
      try {
        return await this.source.currentMembers(code);
      } catch (error) {
        this.logger.warn(`Không đọc được rổ ${code}: ${message(error)}`);
        return [];
      }
    };
    const [vn100, vn30, held] = await Promise.all([
      members('VN100'),
      members('VN30'),
      this.repository.openPositionSymbols(),
    ]);
    return [
      ...new Set(
        [...vn100, ...vn30, ...held, ...extra].map((s) => s.trim().toUpperCase()).filter(Boolean),
      ),
    ]
      .filter((symbol) => symbol !== MARKET_INDEX_SYMBOL)
      .sort();
  }

  private async refreshOne(
    symbol: string,
    kind: 'stock' | 'index',
    bars: StoreBar[],
    now: Date,
  ): Promise<SymbolRefreshOutcome> {
    const existing = await this.repository.symbol(symbol);
    const stored = existing && existing.bars_count > 0 ? await this.repository.bars(symbol) : [];
    const plan = planRefresh(stored, bars);
    const hash = seriesHash(plan.merged);
    if (
      existing &&
      plan.upserts.length === 0 &&
      existing.series_hash === hash &&
      existing.last_error === null
    ) {
      // Nothing changed: only the refresh time moves (the symbol is known to be current).
      await this.repository.writeSymbol({
        symbol,
        kind,
        source: kind === 'index' ? INDEX_SOURCE : STOCK_SOURCE,
        upserts: [],
        bump_rev: false,
        series_hash: hash,
        refreshed_at: now,
      });
      return { symbol, status: 'unchanged', series_rev: existing.series_rev };
    }
    const written = await this.repository.writeSymbol({
      symbol,
      kind,
      source: kind === 'index' ? INDEX_SOURCE : STOCK_SOURCE,
      upserts: plan.upserts,
      bump_rev: Boolean(existing && existing.bars_count > 0 && plan.adjusted),
      series_hash: hash,
      refreshed_at: now,
    });
    return {
      symbol,
      status:
        !existing || existing.bars_count === 0
          ? 'created'
          : plan.adjusted
            ? 'adjusted'
            : 'appended',
      new_dates: plan.new_dates,
      changed_dates: plan.changed_dates,
      series_rev: written.series_rev,
    };
  }

  async refresh(options: RefreshOptions = {}): Promise<RefreshResult> {
    const started = Date.now();
    const now = options.now ?? new Date();
    const before = finalBeforeDate(now);
    const previous = await this.repository.symbol(MARKET_INDEX_SYMBOL);
    const dataAsOfBefore = previous?.last_date ?? null;
    const result = (
      partial: Partial<RefreshResult> & Pick<RefreshResult, 'status'>,
    ): RefreshResult => ({
      latest_session: null,
      data_as_of_before: dataAsOfBefore,
      data_as_of: dataAsOfBefore,
      set_size: 0,
      refreshed: 0,
      adjusted: [],
      failed: [],
      outcomes: [],
      duration_ms: Date.now() - started,
      ...partial,
    });

    // 1. VNINDEX first (read only): the latest final session decides what has to be refreshed.
    let indexBars: StoreBar[];
    try {
      indexBars = normalizeIndexRows(await this.source.indexHistory(MARKET_INDEX_SYMBOL), before);
      if (indexBars.length === 0) throw new Error('DNSE không trả nến VNINDEX nào');
    } catch (error) {
      const text = message(error);
      await this.repository.markError(MARKET_INDEX_SYMBOL, 'index', INDEX_SOURCE, text, now);
      return result({ status: 'failed', failed: [{ symbol: MARKET_INDEX_SYMBOL, error: text }] });
    }
    const latest = indexBars.at(-1)!.date;
    const ready = readyInstant(latest);

    // 2. Stocks that do not yet hold the latest session's final data.
    const set = await this.refreshSet(options.extraSymbols);
    const rows = new Map((await this.repository.symbols()).map((row) => [row.symbol, row]));
    const due = set.filter((symbol) => {
      if (options.force) return true;
      const row = rows.get(symbol);
      return (
        !row ||
        row.bars_count === 0 ||
        row.last_error !== null ||
        !row.refreshed_at ||
        row.refreshed_at < ready
      );
    });
    const indexRow = rows.get(MARKET_INDEX_SYMBOL);
    const indexCurrent =
      indexRow?.last_date === latest &&
      indexRow.last_error === null &&
      Boolean(indexRow.refreshed_at && indexRow.refreshed_at >= ready);
    if (due.length === 0 && indexCurrent && !options.force) {
      return result({ status: 'up_to_date', latest_session: latest, set_size: set.length });
    }

    let done = 0;
    const outcomes = await mapLimit(
      due,
      options.concurrency ?? 4,
      async (symbol): Promise<SymbolRefreshOutcome> => {
        try {
          const bars = normalizeStockRows(await this.source.stockHistory(symbol), before);
          if (bars.length === 0) throw new Error('DNSE không trả nến nào');
          return await this.refreshOne(symbol, 'stock', bars, now);
        } catch (error) {
          const text = message(error);
          await this.repository
            .markError(symbol, 'stock', STOCK_SOURCE, text, now)
            .catch(() => undefined);
          return { symbol, status: 'failed', error: text };
        } finally {
          done += 1;
          options.onProgress?.(done, due.length);
        }
      },
    );
    const failed = outcomes
      .filter((outcome) => outcome.status === 'failed')
      .map((outcome) => ({ symbol: outcome.symbol, error: outcome.error ?? '' }));
    const maxFailures = options.maxFailures ?? Math.max(2, Math.floor(set.length * 0.05));

    // 3. VNINDEX last: advancing it publishes session `latest` to the Bot and the Backtest.
    let dataAsOf = dataAsOfBefore;
    if (failed.length <= maxFailures) {
      try {
        const outcome = await this.refreshOne(MARKET_INDEX_SYMBOL, 'index', indexBars, now);
        outcomes.push(outcome);
        dataAsOf = latest;
      } catch (error) {
        const text = message(error);
        failed.push({ symbol: MARKET_INDEX_SYMBOL, error: text });
        await this.repository
          .markError(MARKET_INDEX_SYMBOL, 'index', INDEX_SOURCE, text, now)
          .catch(() => undefined);
      }
    } else {
      this.logger.warn(
        `Kho giá: ${failed.length} mã lỗi > ${maxFailures}; giữ data_as_of ${dataAsOfBefore ?? '-'}`,
      );
    }
    const advanced = dataAsOf === latest;
    return result({
      status: advanced ? (failed.length ? 'partial' : 'refreshed') : 'partial',
      latest_session: latest,
      data_as_of: dataAsOf,
      set_size: set.length,
      refreshed: outcomes.filter((outcome) => outcome.status !== 'failed').length,
      adjusted: outcomes
        .filter((outcome) => outcome.status === 'adjusted')
        .map((outcome) => outcome.symbol),
      failed,
      outcomes,
    });
  }
}
