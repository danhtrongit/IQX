/**
 * Dashboard phân tích (spec §11): thiết lập theo tài khoản, danh mục 33 chỉ tiêu và số liệu
 * theo khuôn biểu đồ. Số liệu lấy từ nguồn BCTC của VCI (cùng nguồn với Bộ lọc) và chạy qua
 * công thức của registry Bộ lọc, nên khớp đúng số liệu đang dùng trong sản phẩm.
 */
import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { finite } from '../financials/financials.calculations.js';
import { MarketDataService, VciMarketProvider } from '../market-data/index.js';
import {
  sharesAt,
  shareEventsFromVci,
  withShareHistory,
  type ShareEvent,
} from '../screener/screener.shares.js';
import {
  availableDate,
  evaluateScreenerMetric,
  normalizeVciStatements,
  type NormalizedStatements,
  type VciStatementSections,
} from '../screener/screener.statements.js';
import {
  appliesToBank,
  DASHBOARD_CHARTS,
  DASHBOARD_DEFAULT_CHARTS,
  DASHBOARD_GROUPS,
  dashboardChart,
  dashboardUnit,
  type DashboardChartSpec,
} from './dashboard.catalog.js';
import {
  DashboardSettingsRepository,
  type DashboardSettingsStore,
  type StoredDashboardSettings,
} from './dashboard.repository.js';
import {
  annualStatements,
  buildDashboardChart,
  displayValue,
  sliceQuarters,
  type DashboardChartPayload,
  type DashboardNotApplicablePayload,
} from './dashboard.series.js';
import type {
  DashboardCatalog,
  DashboardFundamentalQuery,
  DashboardSettings,
  DashboardSettingsInput,
  DashboardValuationQuery,
} from './dashboard.schemas.js';

/** Bộ mặc định của một tài khoản chưa lưu thiết lập nào (spec §6.3). */
export const DASHBOARD_DEFAULT_SETTINGS: DashboardSettings = {
  charts: [...DASHBOARD_DEFAULT_CHARTS],
  per: 'q',
  nks: {},
};

/** Chuỗi định giá theo ngày dài tối đa 10 năm (spec §11). */
export const DASHBOARD_MAX_VALUATION_YEARS = 10;

const VN_DAY_MS = 86_400_000;

/**
 * Đơn vị giá của từng nguồn nến: VND dchart trả nghìn đồng, VCI trả đồng. Cả hai trả giá đã điều
 * chỉnh về gốc hiện tại (đã kiểm tra trên dữ liệu thật quanh các ngày GDKHQ thưởng cổ phiếu), cùng
 * gốc với EPS và số cổ phiếu điều chỉnh của `withShareHistory`.
 */
const PRICE_UNIT_VND: Readonly<Record<string, number>> = { VND: 1000, VCI: 1 };

/** Giá cuối phiên dùng cho PEG không được cũ hơn 10 ngày so với ngày cuối kỳ. */
const PEG_PRICE_MAX_GAP_DAYS = 10;

type DailyPrice = { date: string; close: number };

/** Giá đóng cửa của phiên cuối cùng không sau `date` (null khi không có phiên nào gần đó). */
export function closeOnOrBefore(prices: readonly DailyPrice[], date: string): number | null {
  let low = 0;
  let high = prices.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (prices[mid]!.date <= date) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  if (found < 0) return null;
  const gap = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${prices[found]!.date}T00:00:00Z`)) / VN_DAY_MS;
  return gap <= PEG_PRICE_MAX_GAP_DAYS ? prices[found]!.close : null;
}

/** Một báo cáo dùng được từ ngày VN kế tiếp ngày công bố (quy tắc của Bộ lọc). */
const usableFrom = (published: string): string =>
  new Date(Date.parse(`${published}T00:00:00Z`) + VN_DAY_MS).toISOString().slice(0, 10);

/** Ngày giao dịch của một dòng giá (unix timestamp hoặc chuỗi ngày). */
const tradingDate = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 1e11 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.length > 0) {
    if (/^\d+$/.test(value)) return tradingDate(Number(value));
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
};

export interface DashboardFundamentalResponse {
  symbol: string;
  is_bank: boolean;
  per: 'q' | 'y';
  charts: Record<string, DashboardChartPayload | DashboardNotApplicablePayload>;
}

export interface DashboardValuationChart {
  name: string;
  kind: 'F';
  unit: string;
  v: (number | null)[];
}

export interface DashboardValuationResponse {
  symbol: string;
  dates: string[];
  charts: Record<string, DashboardValuationChart | { name: string; na: 1 }>;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly vci: VciMarketProvider,
    private readonly market: MarketDataService,
    @Inject(DashboardSettingsRepository)
    private readonly store: DashboardSettingsStore,
  ) {}

  /** Thiết lập của tài khoản; chưa lưu thì trả bộ mặc định (spec §6.3). */
  async settings(userId: string): Promise<DashboardSettings> {
    const stored = await this.store.find(userId);
    if (!stored)
      return { charts: [...DASHBOARD_DEFAULT_SETTINGS.charts], per: 'q', nks: {} };
    return { charts: stored.charts, per: stored.per, nks: stored.nks };
  }

  /** Lưu thiết lập theo tài khoản (spec §6.2). */
  async saveSettings(
    userId: string,
    input: DashboardSettingsInput,
  ): Promise<StoredDashboardSettings> {
    return this.store.save(userId, {
      charts: input.charts,
      per: input.per,
      nks: input.nks,
    });
  }

  /** Danh mục 33 chỉ tiêu theo 6 nhóm, kèm cờ không áp dụng cho ngân hàng (spec §7, §8). */
  catalog(): DashboardCatalog {
    return DASHBOARD_GROUPS.map((group) => ({
      group: group.group,
      items: group.items.map((item) => ({
        name: item.name,
        kind: item.kind,
        na_for_bank: !appliesToBank(item.metric_id),
      })),
    }));
  }

  /**
   * Số liệu các biểu đồ được hỏi: đủ 20 quý và 10 năm để client tự cắt theo số kỳ (spec §11).
   * Mã ngân hàng nhận cờ `na` cho 22 chỉ tiêu không áp dụng (spec §7).
   */
  async fundamental(
    symbol: string,
    query: DashboardFundamentalQuery,
  ): Promise<DashboardFundamentalResponse> {
    const sym = symbol.toUpperCase();
    const specs = this.resolveCharts(query.charts);
    const now = new Date();
    const [raw, events] = await Promise.all([this.statements(sym, now), this.shareEvents(sym, now)]);
    const statements = withShareHistory(raw, events);
    const prices = specs.some((spec) => spec.metric_id === 'peg')
      ? await this.dailyPrices(sym, undefined, now)
      : [];
    const context = {
      statements: annualStatements(statements),
      market: { price: null, shares: null },
      priceAt: (date: string) => closeOnOrBefore(prices, date),
    };
    const charts: DashboardFundamentalResponse['charts'] = {};
    for (const spec of specs) {
      if (statements.financial && !appliesToBank(spec.metric_id)) {
        charts[spec.name] = { name: spec.name, na: 1 };
        continue;
      }
      charts[spec.name] = buildDashboardChart(spec, context);
    }
    return { symbol: sym, is_bank: statements.financial, per: query.per, charts };
  }

  /**
   * Chuỗi định giá theo ngày (khuôn F): mỗi ngày dùng báo cáo quý gần nhất ĐÃ công bố tại ngày đó.
   */
  async valuation(
    symbol: string,
    query: DashboardValuationQuery,
  ): Promise<DashboardValuationResponse> {
    const sym = symbol.toUpperCase();
    const specs = this.resolveValuationCharts(query.charts);
    const now = new Date();
    const [raw, events, prices] = await Promise.all([
      this.statements(sym, now),
      this.shareEvents(sym, now),
      this.dailyPrices(sym, query.from, now),
    ]);
    const statements = withShareHistory(raw, events);
    // Point-in-time share count (DB-03); without the event history, the current share count.
    const current = events === null ? await this.shares(sym) : null;
    const shares = (date: string) => (events === null ? current : sharesAt(statements.quarters, date));
    const charts: DashboardValuationResponse['charts'] = {};
    for (const spec of specs) {
      if (statements.financial && !appliesToBank(spec.metric_id)) {
        charts[spec.name] = { name: spec.name, na: 1 };
        continue;
      }
      charts[spec.name] = this.valuationSeries(spec, statements, prices, shares);
    }
    return {
      symbol: sym,
      dates: prices.map((price) => price.date),
      charts,
    };
  }

  /** Danh sách chỉ tiêu được hỏi; không có thì trả cả 33 chỉ tiêu. */
  private resolveCharts(raw: string | undefined): DashboardChartSpec[] {
    const names = (raw ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (!names.length) return [...DASHBOARD_CHARTS];
    return names.map((name) => {
      const spec = dashboardChart(name);
      if (!spec)
        throw new UnprocessableEntityException({
          code: 'UNKNOWN_DASHBOARD_CHART',
          message: `Chỉ tiêu '${name}' không có trong danh mục 33 chỉ tiêu của dashboard`,
        });
      return spec;
    });
  }

  /** Chỉ các chỉ tiêu định giá theo ngày (khuôn F) được hỏi ở endpoint định giá. */
  private resolveValuationCharts(raw: string | undefined): DashboardChartSpec[] {
    const names = (raw ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const specs = names.length
      ? this.resolveCharts(raw)
      : DASHBOARD_CHARTS.filter((spec) => spec.kind === 'F');
    const valuation = specs.filter((spec) => spec.kind === 'F');
    if (valuation.length !== specs.length)
      throw new UnprocessableEntityException({
        code: 'UNKNOWN_DASHBOARD_CHART',
        message:
          'Endpoint định giá chỉ trả các chỉ tiêu định giá theo ngày (P/E, P/B, P/S, EV/EBITDA, FCF Yield)',
      });
    return valuation;
  }

  /** Báo cáo tài chính đã công bố của một mã, chuẩn hoá theo adapter của Bộ lọc. */
  private async statements(symbol: string, now: Date): Promise<NormalizedStatements> {
    const [balance, income, cash] = await Promise.all(
      (['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'] as const).map((section) =>
        this.vci.fetchFinancialRaw(symbol, section),
      ),
    );
    const sections: VciStatementSections = {
      balance_sheet: balance!.data,
      income_statement: income!.data,
      cash_flow: cash!.data,
    };
    return normalizeVciStatements(sections, now);
  }

  /** Sự kiện tách/thưởng cổ phiếu (VCI `/v1/events` ISS); null khi nguồn lỗi. */
  private async shareEvents(symbol: string, now: Date): Promise<ShareEvent[] | null> {
    try {
      const events = await this.vci.fetchShareEvents(symbol);
      return shareEventsFromVci(events.data, now);
    } catch (error) {
      this.logger.warn(
        `Dashboard share events unavailable for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Số cổ phiếu theo cơ sở vốn hoá hiện tại của VCI (cùng nguồn với Bộ lọc). */
  private async shares(symbol: string): Promise<number | null> {
    try {
      const report = await this.vci.fetchFinancialReport(symbol, 'ratio', { period: 'Q' });
      const rows = Array.isArray(report.data) ? (report.data as Record<string, unknown>[]) : [];
      const shares = finite(rows[0]?.number_of_shares_mkt_cap);
      return shares !== undefined && shares > 0 ? shares : null;
    } catch (error) {
      this.logger.warn(
        `Dashboard share count unavailable for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Giá đóng cửa đã điều chỉnh (đồng) theo ngày giao dịch, tối đa 10 năm. */
  private async dailyPrices(
    symbol: string,
    from: string | undefined,
    now: Date,
  ): Promise<DailyPrice[]> {
    const earliest = new Date(now);
    earliest.setUTCFullYear(earliest.getUTCFullYear() - DASHBOARD_MAX_VALUATION_YEARS);
    const requested = from ? new Date(`${from}T00:00:00Z`) : earliest;
    const start = requested > earliest ? requested : earliest;
    const response = await this.market.ohlcv(symbol, {
      start: start.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
      interval: '1D',
    });
    const unit = PRICE_UNIT_VND[response.meta.source.toUpperCase()] ?? 1;
    const prices: DailyPrice[] = [];
    for (const row of response.data) {
      const date = tradingDate(row.time);
      const close = finite(row.close);
      if (!date || close === undefined || close <= 0) continue;
      prices.push({ date, close: close * unit });
    }
    prices.sort((left, right) => left.date.localeCompare(right.date));
    return prices;
  }

  /**
   * Một chuỗi định giá: tại mỗi ngày, giá trị tính trên báo cáo quý gần nhất đã công bố tại ngày đó
   * (quý chưa có ngày công bố coi như công bố 45 ngày sau ngày kết thúc quý — DB-04), với giá đã
   * điều chỉnh và số cổ phiếu đã điều chỉnh tại chính ngày đó (DB-03).
   */
  private valuationSeries(
    spec: DashboardChartSpec,
    statements: NormalizedStatements,
    prices: readonly DailyPrice[],
    shares: (date: string) => number | null,
  ): DashboardValuationChart {
    const ordinal = (index: number) => {
      const quarter = statements.quarters[index]!;
      return quarter.year * 4 + (quarter.quarter ?? 1);
    };
    // Quarters in the order they became usable; the latest period wins among the usable ones.
    const availability = statements.quarters
      .map((quarter, index) => ({ index, from: usableFrom(availableDate(quarter)) }))
      .sort((left, right) => left.from.localeCompare(right.from));
    const sliced = new Map<number, NormalizedStatements>();
    const values: (number | null)[] = [];
    let pointer = 0;
    let latest: number | null = null;
    for (const price of prices) {
      while (pointer < availability.length && availability[pointer]!.from <= price.date) {
        const candidate = availability[pointer]!.index;
        if (latest === null || ordinal(candidate) > ordinal(latest)) latest = candidate;
        pointer += 1;
      }
      if (latest === null) {
        values.push(null);
        continue;
      }
      let view = sliced.get(latest);
      if (!view) {
        view = sliceQuarters(statements, latest);
        sliced.set(latest, view);
      }
      const result = evaluateScreenerMetric(
        spec.metric_id,
        view,
        { price: price.close, shares: shares(price.date) },
        'ttm',
      );
      values.push(result.status === 'ok' ? displayValue(spec.metric_id, result.value) : null);
    }
    return { name: spec.name, kind: 'F', unit: dashboardUnit(spec.metric_id), v: values };
  }
}
