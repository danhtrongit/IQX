import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { KbsMarketProvider } from './providers/kbs.provider.js';
import { MarketTransportError } from './providers/http.transport.js';
import { VciMarketProvider } from './providers/vci.provider.js';
import { VndMarketProvider } from './providers/vnd.provider.js';
import type { JsonObject, ProviderResult } from './providers/provider.types.js';
import type {
  OhlcvQuery,
  StatsQuery,
  StatsSummaryQuery,
  SymbolsQuery,
} from './market-data.schemas.js';

export interface MarketDataMeta {
  source: string;
  source_priority: number;
  fallback_used: boolean;
  as_of: string;
  raw_endpoint: string;
}
export interface MarketDataResponse<T = unknown> {
  data: T;
  meta: MarketDataMeta;
}
export interface MarketQuote {
  symbol: string;
  priceVnd: number;
  source: string;
  timestamp: Date;
}

@Injectable()
export class MarketDataService {
  constructor(
    readonly vci: VciMarketProvider,
    readonly vnd: VndMarketProvider,
    readonly kbs: KbsMarketProvider,
  ) {}

  async symbols(query: SymbolsQuery): Promise<MarketDataResponse<JsonObject[]>> {
    const source = query.source?.toUpperCase();
    const chain = source && source !== 'AUTO' ? [source] : ['VCI', 'VND'];
    return this.fallback(chain, async (current) => {
      const result =
        current === 'VCI'
          ? await this.vci.fetchSymbols()
          : await this.vnd.fetchSymbols(query.exchange ?? 'HOSE,HNX,UPCOM');
      return { ...result, data: this.filterSymbols(result.data, query.exchange, query.asset_type) };
    });
  }
  industries() {
    return this.one('VCI', () => this.vci.fetchIndustries());
  }
  indices(group?: string): MarketDataResponse<JsonObject[]> {
    let data = [
      { code: 'VNINDEX', name: 'VN-Index', exchange: 'HOSE' },
      { code: 'HNXIndex', name: 'HNX-Index', exchange: 'HNX' },
      { code: 'UPCOMIndex', name: 'UPCOM-Index', exchange: 'UPCOM' },
      { code: 'VN30', name: 'VN30', exchange: 'HOSE' },
      { code: 'VN100', name: 'VN100', exchange: 'HOSE' },
      { code: 'VNMID', name: 'VN Mid Cap', exchange: 'HOSE' },
      { code: 'VNSML', name: 'VN Small Cap', exchange: 'HOSE' },
      { code: 'VNALL', name: 'VN All Share', exchange: 'HOSE' },
      { code: 'HNX30', name: 'HNX30', exchange: 'HNX' },
    ];
    if (group) data = data.filter((item) => item.exchange === group);
    return this.envelope(data, 'STATIC', 'static_mapping', 1);
  }
  groupSymbols(group: string) {
    return this.one('VCI', () => this.vci.fetchGroupSymbols(group));
  }
  async ohlcv(symbol: string, query: OhlcvQuery) {
    // The API accepts calendar dates. Upstream `to` is exclusive, so include the
    // entire requested end date (including the current trading session).
    const end = query.end ? this.timestamp(query.end) + 86_400 : Math.floor(Date.now() / 1000);
    const start = query.start
      ? this.timestamp(query.start)
      : Math.floor(
          new Date(new Date().setUTCFullYear(new Date().getUTCFullYear() - 1)).getTime() / 1000,
        );
    if (start > end || (query.end && start === end))
      throw new UnprocessableEntityException({
        code: 'INVALID_DATE_RANGE',
        message: 'Ngày bắt đầu phải trước ngày kết thúc',
      });
    const source = query.source?.toUpperCase();
    const chain = source && source !== 'AUTO' ? [source] : ['VND', 'VCI'];
    return this.fallback(chain, (current) =>
      current === 'VND'
        ? this.vnd.fetchOhlcv(symbol, start, end, query.interval)
        : this.vci.fetchOhlcv(symbol, start, end, query.interval),
    );
  }

  /** Stable adapter contract for quant/trading modules. */
  getOhlcv(symbol: string, options: OhlcvQuery = { interval: '1D' }) {
    return this.ohlcv(symbol, options);
  }
  intraday(symbol: string, pageSize: number) {
    return this.one('VCI', () => this.vci.fetchIntraday(symbol, pageSize), true);
  }
  priceDepth(symbol: string) {
    return this.one('VCI', () => this.vci.fetchPriceDepth(symbol), true);
  }
  priceBoard(symbols: string[]) {
    return this.one('VCI', () => this.vci.fetchPriceBoard(symbols));
  }

  getPriceBoard(symbols: string[], source?: string) {
    if (source && !['AUTO', 'VCI'].includes(source.toUpperCase()))
      throw new UnprocessableEntityException({
        code: 'UNSUPPORTED_SOURCE',
        message: 'Nguồn bảng giá chỉ hỗ trợ auto hoặc VCI',
      });
    return this.priceBoard(symbols);
  }
  ranking(kind: string, index: string, limit: number, date?: string) {
    return this.one('VND', () => this.vnd.fetchRanking(kind, index, limit, date));
  }

  async companyOverview(symbol: string): Promise<MarketDataResponse<JsonObject>> {
    try {
      return await this.one('KBS', async () => {
        const profile = await this.kbs.fetchProfile(symbol);
        const overview = this.kbs.normalizeOverview(profile.data);
        const [details, year, week] = await Promise.allSettled([
          this.vci.fetchCompanyDetails(symbol),
          this.vci.fetchTradingHistory(symbol, { resolution: '1Y', size: 1 }),
          this.vci.fetchTradingHistory(symbol, { resolution: '1W', size: 2 }),
        ]);
        if (details.status === 'fulfilled')
          this.mergeMissing(overview, details.value.data, {
            vi_organ_short_name: 'organ_short_name',
            vi_organ_name: 'organ_name',
            highest_price1_year: 'highest_price_1y',
            lowest_price1_year: 'lowest_price_1y',
            average_match_volume1_month: 'average_match_volume_1_month',
            average_match_value1_month: 'average_match_value_1_month',
            free_float_percentage: 'free_float_percentage',
            free_float: 'free_float',
            market_cap: 'market_cap',
            current_price: 'current_price',
            number_of_shares_mkt_cap: 'issue_share',
            is_bank: 'is_bank',
            sector: 'sector',
            sector_vn: 'sector_vn',
          });
        if (year.status === 'fulfilled' && year.value.data[0])
          this.mergeMissing(overview, year.value.data[0], {
            highest_price: 'highest_price_1y',
            lowest_price: 'lowest_price_1y',
            foreign_current_room: 'foreign_current_room',
            foreign_total_room: 'foreign_total_room',
            foreign_room_percentage: 'foreign_room_percentage',
            market_cap: 'market_cap',
          });
        if (week.status === 'fulfilled') {
          const volumes = week.value.data
            .map((row) => Number(row.total_match_volume))
            .filter(Number.isFinite);
          if (volumes.length)
            overview.average_match_volume_2_week =
              volumes.reduce((a, b) => a + b, 0) / volumes.length;
        }
        return { data: overview, rawEndpoint: profile.rawEndpoint };
      });
    } catch {
      // KBS occasionally rejects requests from a new edge; VCI details has a
      // compatible subset and is the declared registry fallback.
      return this.one('VCI', () => this.vci.fetchCompanyDetails(symbol));
    }
  }

  getCompanyOverview(symbol: string) {
    return this.companyOverview(symbol);
  }
  async shareholders(symbol: string) {
    return this.profilePart(symbol, (raw) => this.kbs.normalizeShareholders(raw));
  }
  async officers(symbol: string) {
    return this.profilePart(symbol, (raw) => this.kbs.normalizeOfficers(raw));
  }
  async subsidiaries(symbol: string) {
    return this.profilePart(symbol, (raw) => this.kbs.normalizeSubsidiaries(raw));
  }
  companyNews(symbol: string) {
    return this.one('KBS', () => this.kbs.fetchNews(symbol), true);
  }
  companyDetails(symbol: string) {
    return this.one('VCI', () => this.vci.fetchCompanyDetails(symbol));
  }
  priceChart(symbol: string, length: number) {
    return this.one('VCI', () => this.vci.fetchPriceChart(symbol, length));
  }
  financialReport(
    symbol: string,
    type: string,
    options: { termType: number; pageSize: number; period: 'Q' | 'Y' },
  ) {
    return this.one('VCI', () => this.vci.fetchFinancialReport(symbol, type, options));
  }

  getFinancialStatements(
    symbol: string,
    options: { reportType?: string; termType?: number; pageSize?: number; period?: 'Q' | 'Y' } = {},
  ) {
    return this.financialReport(symbol, options.reportType ?? 'balance_sheet', {
      termType: options.termType ?? 2,
      pageSize: options.pageSize ?? 8,
      period: options.period ?? 'Q',
    });
  }
  foreignTrade(symbol: string, start: string | undefined, end: string | undefined, limit: number) {
    return this.one('VCI', async () => {
      const result = await this.vci.fetchTradingHistory(symbol, {
        resolution: '1D',
        start,
        end,
        size: limit,
      });
      return {
        ...result,
        data: result.data.map((row) => ({
          trading_date: row.trading_date,
          ...Object.fromEntries(Object.entries(row).filter(([key]) => key.startsWith('foreign'))),
        })),
      };
    });
  }
  insiderDeals(symbol: string, limit: number) {
    return this.one('VCI', () => this.vci.fetchInsiderDeals(symbol, limit));
  }
  tradingHistory(symbol: string, q: StatsQuery) {
    return this.one('VCI', () =>
      this.vci.fetchTradingHistory(symbol, {
        resolution: q.resolution,
        start: q.fromDate,
        end: q.toDate,
        page: q.page,
        size: q.size,
      }),
    );
  }
  tradingSummary(symbol: string, q: StatsSummaryQuery) {
    return this.one('VCI', () =>
      this.vci.fetchTradingSummary(symbol, {
        resolution: q.resolution,
        start: q.fromDate,
        end: q.toDate,
      }),
    );
  }
  foreignSummary(symbol: string, q: StatsSummaryQuery) {
    return this.one('VCI', async () => {
      const result = await this.vci.fetchTradingSummary(symbol, {
        resolution: q.resolution,
        start: q.fromDate,
        end: q.toDate,
      });
      return {
        ...result,
        data: Object.fromEntries(
          Object.entries(result.data).filter(([key]) => key.startsWith('foreign')),
        ),
      };
    });
  }
  supplyDemand(symbol: string, q: StatsQuery) {
    return this.one('VCI', async () => {
      const result = await this.vci.fetchTradingHistory(symbol, {
        resolution: q.resolution,
        start: q.fromDate,
        end: q.toDate,
        page: q.page,
        size: q.size,
      });
      return { ...result, data: result.data.map((row) => this.supplyFields(row)) };
    });
  }
  supplyDemandSummary(symbol: string, q: StatsSummaryQuery) {
    return this.one('VCI', async () => {
      const result = await this.vci.fetchTradingSummary(symbol, {
        resolution: q.resolution,
        start: q.fromDate,
        end: q.toDate,
      });
      return { ...result, data: this.supplyFields(result.data) };
    });
  }
  proprietary(symbol: string, q: StatsQuery) {
    return this.one('VCI', () =>
      this.vci.fetchProprietaryHistory(symbol, {
        resolution: q.resolution,
        start: q.fromDate,
        end: q.toDate,
        page: q.page,
        size: q.size,
      }),
    );
  }
  proprietarySummary(symbol: string, q: StatsSummaryQuery) {
    return this.one('VCI', () =>
      this.vci.fetchProprietarySummary(symbol, {
        resolution: q.resolution,
        start: q.fromDate,
        end: q.toDate,
      }),
    );
  }
  events(start: string, end?: string, type?: string) {
    return this.one('VCI', () => this.vci.fetchEvents(start, end, type));
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    try {
      const result = await this.vci.fetchPriceBoard([symbol.toUpperCase()]);
      return result.data.some((row) => row.symbol === symbol.toUpperCase());
    } catch {
      return false;
    }
  }
  async getQuote(symbol: string): Promise<MarketQuote> {
    const normalized = symbol.toUpperCase();
    const result = await this.vci.fetchPriceBoard([normalized]);
    const row = result.data.find((item) => item.symbol === normalized);
    const price = Number(row?.close_price);
    if (!row || !Number.isFinite(price) || price <= 0)
      throw new ServiceUnavailableException({
        code: 'QUOTE_UNAVAILABLE',
        message: `Không có giá giao dịch hợp lệ cho ${normalized}`,
      });
    return { symbol: normalized, priceVnd: price, source: 'VCI', timestamp: new Date() };
  }

  private async profilePart(symbol: string, mapper: (raw: JsonObject) => JsonObject[]) {
    return this.one('KBS', async () => {
      const result = await this.kbs.fetchProfile(symbol);
      return { ...result, data: mapper(result.data) };
    });
  }
  private async one<T>(
    source: string,
    fetcher: () => Promise<ProviderResult<T>>,
    _allowEmpty = false,
  ): Promise<MarketDataResponse<T>> {
    try {
      const result = await fetcher();
      return this.envelope(result.data, source, result.rawEndpoint, 1);
    } catch (error) {
      throw this.upstreamError(error, source);
    }
  }
  private async fallback<T>(
    chain: string[],
    fetcher: (source: string) => Promise<ProviderResult<T>>,
  ): Promise<MarketDataResponse<T>> {
    let last: unknown;
    for (let i = 0; i < chain.length; i += 1) {
      const source = chain[i];
      if (!source) continue;
      try {
        const result = await fetcher(source);
        return this.envelope(result.data, source, result.rawEndpoint, i + 1);
      } catch (error) {
        last = error;
      }
    }
    throw this.upstreamError(last, chain.join('/'));
  }
  private envelope<T>(
    data: T,
    source: string,
    raw: string,
    priority: number,
  ): MarketDataResponse<T> {
    return {
      data,
      meta: {
        source,
        source_priority: priority,
        fallback_used: priority > 1,
        as_of: new Date().toISOString(),
        raw_endpoint: raw,
      },
    };
  }
  private upstreamError(error: unknown, source: string): BadGatewayException {
    const status = error instanceof MarketTransportError ? error.status : undefined;
    return new BadGatewayException({
      code: 'MARKET_UPSTREAM_ERROR',
      message: `Nguồn dữ liệu ${source} không khả dụng${status ? ` (HTTP ${status})` : ''}`,
    });
  }
  private filterSymbols(rows: JsonObject[], exchange?: string, asset?: string): JsonObject[] {
    return rows.filter(
      (row) =>
        (!exchange || String(row.exchange ?? '').toUpperCase() === exchange.toUpperCase()) &&
        (!asset || row.asset_type === asset),
    );
  }
  private timestamp(date: string): number {
    const value = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(value))
      throw new UnprocessableEntityException({
        code: 'INVALID_DATE',
        message: `Ngày không hợp lệ: ${date}`,
      });
    return Math.floor(value / 1000);
  }
  private mergeMissing(target: JsonObject, source: JsonObject, map: Record<string, string>): void {
    for (const [from, to] of Object.entries(map))
      if (
        (target[to] === undefined || target[to] === null || target[to] === '') &&
        source[from] !== undefined &&
        source[from] !== null &&
        source[from] !== ''
      )
        target[to] = source[from];
  }
  private supplyFields(row: JsonObject): JsonObject {
    return Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          key === 'trading_date' ||
          [
            'total_buy_trade',
            'total_sell_trade',
            'total_net_trade',
            'average_buy_trade',
            'average_sell_trade',
            'total_buy_unmatched',
            'total_sell_unmatched',
          ].some((prefix) => key.startsWith(prefix)),
      ),
    );
  }
}
