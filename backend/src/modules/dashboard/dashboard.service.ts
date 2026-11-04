/**
 * Dashboard phân tích v2 (spec §11): thiết lập theo tài khoản và theo ngành, danh mục 62 chỉ tiêu
 * và số liệu theo khuôn biểu đồ. Số liệu lấy từ nguồn BCTC của VCI (cùng nguồn với Bộ lọc); 33
 * chỉ tiêu chạy qua công thức của registry Bộ lọc, 29 chỉ tiêu mới của ngân hàng, chứng khoán,
 * bảo hiểm tính ở `dashboard.native.ts`. Ngành của mã lấy từ mẫu báo cáo tài chính (§1.3).
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { finite } from '../financials/financials.calculations.js';
import {
  detectIndustry,
  INDUSTRIES,
  INDUSTRY_LABELS,
  type Industry,
} from '../financials/financials.industry.js';
import { MarketDataService, MarketTransportError, VciMarketProvider } from '../market-data/index.js';
import {
  sharesAt,
  shareEventsFromVci,
  withShareHistory,
  type ShareEvent,
} from '../screener/screener.shares.js';
import {
  availableDate,
  evaluateScreenerMetric,
  type NormalizedStatements,
  type VciStatementSections,
} from '../screener/screener.statements.js';
import {
  chartInIndustry,
  DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY,
  DASHBOARD_INDUSTRY_CHAPTERS,
  DASHBOARD_INDUSTRY_CHARTS,
  DASHBOARD_INDUSTRY_COUNTS,
  dashboardChart,
  dashboardUnit,
  type DashboardChartSpec,
} from './dashboard.catalog.js';
import { normalizeIndustryStatements } from './dashboard.mapping.js';
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
} from './dashboard.series.js';
import type {
  DashboardCatalog,
  DashboardFundamentalQuery,
  DashboardIndustrySettings,
  DashboardSettings,
  DashboardSettingsInput,
  DashboardValuationQuery,
} from './dashboard.schemas.js';

/** Bộ mặc định của một ngành chưa lưu thiết lập (spec §6.3): Quý, mỗi biểu đồ 5 kỳ. */
export function defaultDashboardSettings(industry: Industry): DashboardSettings {
  return { charts: [...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY[industry]], per: 'q', nks: {} };
}

/** Bộ mặc định của từng ngành (spec §6.3). */
export const DASHBOARD_DEFAULT_SETTINGS: Readonly<Record<Industry, DashboardSettings>> = {
  thuong: defaultDashboardSettings('thuong'),
  nh: defaultDashboardSettings('nh'),
  ck: defaultDashboardSettings('ck'),
  bh: defaultDashboardSettings('bh'),
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

export interface DashboardIndustryResponse {
  symbol: string;
  nganh: Industry;
  label: string;
}

export interface DashboardFundamentalResponse {
  symbol: string;
  nganh: Industry;
  per: 'q' | 'y';
  charts: Record<string, DashboardChartPayload>;
}

export interface DashboardValuationChart {
  name: string;
  kind: 'F';
  unit: string;
  v: (number | null)[];
}

export interface DashboardValuationResponse {
  symbol: string;
  nganh: Industry;
  dates: string[];
  charts: Record<string, DashboardValuationChart>;
}

/** Danh sách tên chỉ tiêu trong query: phân tách bằng dấu phẩy, bỏ ô trống. */
function chartNames(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Tên chỉ tiêu → chỉ tiêu; tên ngoài danh mục 62 chỉ tiêu là lỗi 422. */
function lookupCharts(names: readonly string[]): DashboardChartSpec[] {
  return names.map((name) => {
    const spec = dashboardChart(name);
    if (!spec)
      throw new UnprocessableEntityException({
        code: 'UNKNOWN_DASHBOARD_CHART',
        message: `Chỉ tiêu '${name}' không có trong danh mục 62 chỉ tiêu của dashboard`,
      });
    return spec;
  });
}

/** Chỉ tiêu của ngành khác với ngành của mã là lỗi 400 (spec §11). */
function assertInIndustry(names: readonly string[], industry: Industry): void {
  const foreign = lookupCharts(names).filter((spec) => !chartInIndustry(spec, industry));
  if (foreign.length > 0)
    throw new BadRequestException({
      code: 'CHART_NOT_IN_INDUSTRY',
      message: `Chỉ tiêu ${foreign.map((spec) => `'${spec.name}'`).join(', ')} không thuộc ngành ${INDUSTRY_LABELS[industry]} của mã`,
    });
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

  /**
   * Thiết lập của tài khoản theo ngành (spec §6.1); ngành chưa lưu thì trả bộ mặc định của ngành
   * đó (§6.3). Dòng đã lưu có biểu đồ ngoài danh mục của ngành không đáng tin: dùng bộ mặc định.
   */
  async settings(userId: string): Promise<DashboardIndustrySettings> {
    const stored = await this.store.findAll(userId);
    const result = {} as DashboardIndustrySettings;
    for (const industry of INDUSTRIES) {
      const saved = stored[industry];
      const names = new Set(DASHBOARD_INDUSTRY_CHARTS[industry].map((chart) => chart.name));
      result[industry] =
        saved && saved.charts.every((name) => names.has(name))
          ? {
              charts: saved.charts,
              per: saved.per,
              nks: Object.fromEntries(
                Object.entries(saved.nks).filter(([name]) => names.has(name)),
              ) as DashboardSettings['nks'],
            }
          : defaultDashboardSettings(industry);
    }
    return result;
  }

  /** Lưu thiết lập của MỘT ngành theo tài khoản (spec §6.2). */
  async saveSettings(
    userId: string,
    industry: Industry,
    input: DashboardSettingsInput,
  ): Promise<StoredDashboardSettings> {
    assertInIndustry([...input.charts, ...Object.keys(input.nks)], industry);
    return this.store.save(userId, industry, {
      charts: input.charts,
      per: input.per,
      nks: input.nks,
    });
  }

  /**
   * Danh mục 62 chỉ tiêu theo ngành (spec §3.2, §8): mỗi ngành gồm chương chung và chương riêng,
   * mỗi chương chia nhóm, kèm `metric_key` cho nút "Học" và bộ mặc định 6 biểu đồ (§6.3).
   */
  catalog(): DashboardCatalog {
    return {
      industries: INDUSTRIES.map((industry) => ({
        nganh: industry,
        label: INDUSTRY_LABELS[industry],
        total: DASHBOARD_INDUSTRY_COUNTS[industry],
        default_charts: [...DASHBOARD_DEFAULT_CHARTS_BY_INDUSTRY[industry]],
        chapters: DASHBOARD_INDUSTRY_CHAPTERS[industry].map((chapter) => ({
          chapter: chapter.title,
          academy_chapter: chapter.academy_chapter,
          groups: chapter.groups.map((group) => ({
            group: group.group,
            items: group.items.map((item) => ({
              name: item.name,
              metric_key: item.metric_key,
              kind: item.kind,
            })),
          })),
        })),
      })),
    };
  }

  /** Ngành của một mã theo mẫu báo cáo tài chính (spec §1.3); chưa rõ mẫu thì `thuong` (§13). */
  async industry(symbol: string): Promise<DashboardIndustryResponse> {
    const sym = symbol.toUpperCase();
    const income = await this.financialRaw(sym, 'INCOME_STATEMENT');
    const nganh = detectIndustry(income.data);
    return { symbol: sym, nganh, label: INDUSTRY_LABELS[nganh] };
  }

  /**
   * Số liệu các biểu đồ được hỏi: đủ 20 quý và 10 năm để client tự cắt theo số kỳ (spec §11).
   * Không có `charts` thì trả mọi chỉ tiêu của ngành; chỉ tiêu ngoài ngành của mã là lỗi 400.
   */
  async fundamental(
    symbol: string,
    query: DashboardFundamentalQuery,
  ): Promise<DashboardFundamentalResponse> {
    const sym = symbol.toUpperCase();
    const names = chartNames(query.charts);
    lookupCharts(names);
    const now = new Date();
    const [sections, events] = await Promise.all([this.sections(sym), this.shareEvents(sym, now)]);
    const industry = detectIndustry(sections.income_statement);
    assertInIndustry(names, industry);
    const specs = names.length ? lookupCharts(names) : [...DASHBOARD_INDUSTRY_CHARTS[industry]];
    const statements = withShareHistory(
      normalizeIndustryStatements(sections, now, industry),
      events,
    );
    const prices = specs.some((spec) => spec.registry_id === 'peg')
      ? await this.dailyPrices(sym, undefined, now)
      : [];
    const context = {
      statements: annualStatements(statements, industry),
      industry,
      market: { price: null, shares: null },
      priceAt: (date: string) => closeOnOrBefore(prices, date),
    };
    const charts: DashboardFundamentalResponse['charts'] = {};
    for (const spec of specs) charts[spec.name] = buildDashboardChart(spec, context);
    return { symbol: sym, nganh: industry, per: query.per, charts };
  }

  /**
   * Chuỗi định giá theo ngày (khuôn F): mỗi ngày dùng báo cáo quý gần nhất ĐÃ công bố tại ngày đó.
   */
  async valuation(
    symbol: string,
    query: DashboardValuationQuery,
  ): Promise<DashboardValuationResponse> {
    const sym = symbol.toUpperCase();
    const names = chartNames(query.charts);
    lookupCharts(names);
    const now = new Date();
    const [sections, events, prices] = await Promise.all([
      this.sections(sym),
      this.shareEvents(sym, now),
      this.dailyPrices(sym, query.from, now),
    ]);
    const industry = detectIndustry(sections.income_statement);
    const specs = this.resolveValuationCharts(names, industry);
    const statements = withShareHistory(
      normalizeIndustryStatements(sections, now, industry),
      events,
    );
    // Point-in-time share count (DB-03); without the event history, the current share count.
    const current = events === null ? await this.shares(sym) : null;
    const shares = (date: string) =>
      events === null ? current : sharesAt(statements.quarters, date);
    const charts: DashboardValuationResponse['charts'] = {};
    for (const spec of specs)
      charts[spec.name] = this.valuationSeries(spec, statements, prices, shares);
    return {
      symbol: sym,
      nganh: industry,
      dates: prices.map((price) => price.date),
      charts,
    };
  }

  /** Chỉ các chỉ tiêu định giá theo ngày (khuôn F) của ngành được hỏi ở endpoint định giá. */
  private resolveValuationCharts(
    names: readonly string[],
    industry: Industry,
  ): DashboardChartSpec[] {
    assertInIndustry(names, industry);
    const specs = names.length
      ? lookupCharts(names)
      : DASHBOARD_INDUSTRY_CHARTS[industry].filter((spec) => spec.kind === 'F');
    const valuation = specs.filter((spec) => spec.kind === 'F');
    if (valuation.length !== specs.length)
      throw new UnprocessableEntityException({
        code: 'UNKNOWN_DASHBOARD_CHART',
        message:
          'Endpoint định giá chỉ trả các chỉ tiêu định giá theo ngày (P/E, P/B, P/S, EV/EBITDA, FCF Yield)',
      });
    return valuation;
  }

  /** VCI financial statements; an upstream transport failure is a 503, like FinancialsService. */
  private financialRaw(
    symbol: string,
    section: 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASH_FLOW',
  ): ReturnType<VciMarketProvider['fetchFinancialRaw']> {
    return this.vci.fetchFinancialRaw(symbol, section).catch((error: unknown) => {
      if (error instanceof MarketTransportError)
        throw new ServiceUnavailableException({
          code: 'FINANCIAL_PROVIDER_UNAVAILABLE',
          message: 'Dữ liệu báo cáo tài chính tạm thời không khả dụng',
        });
      throw error;
    });
  }

  /** Ba báo cáo tài chính của một mã (bảng cân đối, kết quả kinh doanh, lưu chuyển tiền tệ). */
  private async sections(symbol: string): Promise<VciStatementSections> {
    const [balance, income, cash] = await Promise.all(
      (['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'] as const).map((section) =>
        this.financialRaw(symbol, section),
      ),
    );
    return {
      balance_sheet: balance!.data,
      income_statement: income!.data,
      cash_flow: cash!.data,
    };
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
    const metricId = spec.registry_id!;
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
        metricId,
        view,
        { price: price.close, shares: shares(price.date) },
        'ttm',
      );
      values.push(result.status === 'ok' ? displayValue(metricId, result.value) : null);
    }
    return { name: spec.name, kind: 'F', unit: dashboardUnit(spec), v: values };
  }
}
