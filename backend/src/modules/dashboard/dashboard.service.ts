/**
 * Dashboard phân tích (spec §11): thiết lập theo tài khoản, danh mục 33 chỉ tiêu và số liệu
 * theo khuôn biểu đồ. Số liệu lấy từ nguồn BCTC của VCI (cùng nguồn với Bộ lọc) và chạy qua
 * công thức của registry Bộ lọc, nên khớp đúng số liệu đang dùng trong sản phẩm.
 */
import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { finite } from '../financials/financials.calculations.js';
import { MarketDataService, VciMarketProvider } from '../market-data/index.js';
import {
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
    const statements = await this.statements(sym, new Date());
    const context = {
      statements: annualStatements(statements),
      market: { price: null, shares: null },
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
    const statements = await this.statements(sym, now);
    const prices = await this.dailyPrices(sym, query.from, now);
    const shares = await this.shares(sym);
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

  /** Giá đóng cửa theo ngày giao dịch, tối đa 10 năm. */
  private async dailyPrices(
    symbol: string,
    from: string | undefined,
    now: Date,
  ): Promise<{ date: string; close: number }[]> {
    const earliest = new Date(now);
    earliest.setUTCFullYear(earliest.getUTCFullYear() - DASHBOARD_MAX_VALUATION_YEARS);
    const requested = from ? new Date(`${from}T00:00:00Z`) : earliest;
    const start = requested > earliest ? requested : earliest;
    const response = await this.market.ohlcv(symbol, {
      start: start.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
      interval: '1D',
    });
    const prices: { date: string; close: number }[] = [];
    for (const row of response.data) {
      const date = tradingDate(row.time);
      const close = finite(row.close);
      if (!date || close === undefined || close <= 0) continue;
      prices.push({ date, close });
    }
    prices.sort((left, right) => left.date.localeCompare(right.date));
    return prices;
  }

  /**
   * Một chuỗi định giá: tại mỗi ngày, giá trị tính trên báo cáo quý gần nhất đã công bố tại ngày đó.
   */
  private valuationSeries(
    spec: DashboardChartSpec,
    statements: NormalizedStatements,
    prices: { date: string; close: number }[],
    shares: number | null,
  ): DashboardValuationChart {
    const availability = statements.quarters.map((quarter, index) => ({
      index,
      from: quarter.published_at ? usableFrom(quarter.published_at) : null,
    }));
    const sliced = new Map<number, NormalizedStatements>();
    const values: (number | null)[] = [];
    let pointer = 0;
    for (const price of prices) {
      while (pointer < availability.length) {
        const candidate = availability[pointer]!;
        if (candidate.from === null || candidate.from <= price.date) break;
        pointer += 1;
      }
      if (pointer >= availability.length) {
        values.push(null);
        continue;
      }
      const index = availability[pointer]!.index;
      let view = sliced.get(index);
      if (!view) {
        view = sliceQuarters(statements, index);
        sliced.set(index, view);
      }
      const result = evaluateScreenerMetric(
        spec.metric_id,
        view,
        { price: price.close, shares },
        'ttm',
      );
      values.push(result.status === 'ok' ? displayValue(spec.metric_id, result.value) : null);
    }
    return { name: spec.name, kind: 'F', unit: dashboardUnit(spec.metric_id), v: values };
  }
}
