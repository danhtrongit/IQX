import { Injectable } from '@nestjs/common';
import { MarketHttpTransport, MarketTransportError } from './http.transport.js';
import {
  asObjects,
  isObject,
  numberOrNull,
  numberOrZero,
  snakeObject,
  type JsonObject,
  type ProviderResult,
} from './provider.types.js';

const TRADING = 'https://trading.vietcap.com.vn/api';
const IQ = 'https://iq.vietcap.com.vn/api/iq-insight-service';
const TIME_FRAMES: Record<string, string> = {
  '1D': 'ONE_DAY',
  '1W': 'ONE_WEEK',
  '1M': 'ONE_MONTH',
  '1Q': 'ONE_QUARTER',
  '1Y': 'ONE_YEAR',
};
const FINANCE_TYPES: Record<string, string> = {
  balance_sheet: 'BALANCE_SHEET',
  income_statement: 'INCOME_STATEMENT',
  cash_flow: 'CASH_FLOW',
  ratio: 'RATIO',
};

export const VCI_GROUPS = new Set([
  'HOSE',
  'VN30',
  'VNMidCap',
  'VNSmallCap',
  'VNAllShare',
  'VN100',
  'ETF',
  'HNX',
  'HNX30',
  'HNXCon',
  'HNXFin',
  'HNXLCap',
  'HNXMSCap',
  'HNXMan',
  'UPCOM',
  'FU_INDEX',
  'CW',
  'BOND',
]);

@Injectable()
export class VciMarketProvider {
  constructor(private readonly http: MarketHttpTransport) {}

  async fetchSymbols(): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${TRADING}/price/symbols/getAll`;
    const raw = await this.http.requestJson<unknown>(endpoint, this.headers(), {
      cacheTtlMs: 300_000,
    });
    return {
      data: asObjects(raw).map((item) => ({
        symbol: item.symbol ?? '',
        name: item.organName ?? item.organ_name ?? '',
        exchange: this.exchange(item.board),
        asset_type: typeof item.type === 'string' ? item.type.toLowerCase() : null,
      })),
      rawEndpoint: endpoint,
    };
  }
  async fetchIndustries(): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${IQ}/v1/sectors/icb-codes`;
    const raw = await this.get(endpoint, 300_000);
    const rows = isObject(raw) ? asObjects(raw.data) : asObjects(raw);
    return {
      data: rows.map((item) => ({
        icb_code: item.name ?? '',
        icb_name: item.viSector ?? '',
        en_icb_name: item.enSector ?? '',
        level: item.icbLevel ?? null,
      })),
      rawEndpoint: endpoint,
    };
  }
  async fetchGroupSymbols(group: string): Promise<ProviderResult<JsonObject[]>> {
    const url = new URL(`${TRADING}/price/symbols/getByGroup`);
    url.searchParams.set('group', group);
    const raw = await this.get(url.toString(), 300_000);
    return {
      data: (Array.isArray(raw) ? raw : []).map((item) => ({
        symbol: isObject(item) ? item.symbol : String(item),
      })),
      rawEndpoint: `${TRADING}/price/symbols/getByGroup`,
    };
  }
  async fetchOhlcv(
    symbol: string,
    startTs: number,
    endTs: number,
    interval: string,
  ): Promise<ProviderResult<JsonObject[]>> {
    const timeFrame = TIME_FRAMES[interval];
    if (!timeFrame)
      throw new MarketTransportError(`VCI does not support OHLCV interval ${interval}`);
    const endpoint = `${TRADING}/chart/OHLCChart/gap-chart`;
    const raw = await this.http.requestJson<unknown>(
      endpoint,
      {
        ...this.headers(),
        method: 'POST',
        body: JSON.stringify({
          timeFrame,
          symbols: [symbol],
          to: endTs,
          countBack: 1000,
        }),
      },
      { cacheTtlMs: 15_000, cacheKey: `vci:ohlcv:${symbol}:${startTs}:${endTs}:${interval}` },
    );
    const chart = asObjects(raw)[0] ?? {};
    const times = Array.isArray(chart.t) ? chart.t : [];
    const arr = (key: string) => (Array.isArray(chart[key]) ? chart[key] : []);
    const [o, h, l, c, v, value] = ['o', 'h', 'l', 'c', 'v', 'accumulatedValue'].map(arr);
    return {
      data: times.flatMap((time, i) => {
        const rawTimestamp =
          typeof time === 'string' && !/^\d+$/.test(time) ? Date.parse(time) / 1000 : Number(time);
        const timestamp = rawTimestamp > 1e11 ? rawTimestamp / 1000 : rawTimestamp;
        if (!Number.isFinite(timestamp) || timestamp < startTs || timestamp >= endTs) return [];
        return [
          {
            time,
            open: o?.[i] ?? 0,
            high: h?.[i] ?? 0,
            low: l?.[i] ?? 0,
            close: c?.[i] ?? 0,
            volume: v?.[i] ?? 0,
            value: value?.[i] ?? null,
          },
        ];
      }),
      rawEndpoint: endpoint,
    };
  }
  async fetchIntraday(symbol: string, pageSize: number): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${TRADING}/market-watch/LEData/getAll`;
    const raw = await this.post(
      endpoint,
      { symbol, limit: pageSize },
      5_000,
      `vci:intraday:${symbol}:${pageSize}`,
    );
    return {
      data: asObjects(raw).map((item) => ({
        time: item.truncTime ?? '',
        price: numberOrZero(item.matchPrice),
        volume: numberOrZero(item.matchVol),
        side: item.matchType ?? '',
        accumulated_volume: numberOrZero(item.accumulatedVolume),
        accumulated_value: numberOrZero(item.accumulatedValue),
      })),
      rawEndpoint: endpoint,
    };
  }
  async fetchPriceDepth(symbol: string): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${TRADING}/market-watch/AccumulatedPriceStepVol/getSymbolData`;
    const raw = await this.post(endpoint, { symbol }, 5_000, `vci:depth:${symbol}`);
    return {
      data: asObjects(raw).map((item) => ({
        price: numberOrZero(item.priceStep),
        volume: numberOrZero(item.accumulatedVolume),
        buy_volume: numberOrZero(item.accumulatedBuyVolume),
        sell_volume: numberOrZero(item.accumulatedSellVolume),
        undefined_volume: numberOrZero(item.accumulatedUndefinedVolume),
      })),
      rawEndpoint: endpoint,
    };
  }
  async fetchPriceBoard(symbols: string[]): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${TRADING}/price/symbols/getList`;
    const raw = await this.post(
      endpoint,
      { symbols },
      3_000,
      `vci:board:${[...symbols].sort().join(',')}`,
    );
    return {
      data: asObjects(raw).map((item) => {
        const listing = isObject(item.listingInfo) ? item.listingInfo : {};
        const match = isObject(item.matchPrice) ? item.matchPrice : {};
        const bidAsk = isObject(item.bidAsk) ? item.bidAsk : {};
        const ref = numberOrNull(listing.refPrice);
        const close = numberOrNull(match.matchPrice);
        const change = ref !== null && close !== null ? close - ref : null;
        const levels = (value: unknown) =>
          asObjects(value)
            .slice(0, 3)
            .map((row) => ({ price: row.price ?? null, volume: row.volume ?? null }));
        return {
          symbol: listing.symbol ?? '',
          exchange: this.exchange(listing.board),
          ceiling_price: listing.ceiling ?? null,
          floor_price: listing.floor ?? null,
          reference_price: ref,
          open_price: match.openPrice ?? null,
          high_price: match.highest ?? null,
          low_price: match.lowest ?? null,
          close_price: close,
          average_price: match.avgMatchPrice ?? null,
          total_volume: match.accumulatedVolume ?? null,
          total_value:
            match.accumulatedValue === null || match.accumulatedValue === undefined
              ? null
              : Number(match.accumulatedValue) * 1_000_000,
          bid_prices: levels(bidAsk.bidPrices),
          ask_prices: levels(bidAsk.askPrices),
          foreign_buy_volume: match.foreignBuyVolume ?? null,
          foreign_sell_volume: match.foreignSellVolume ?? null,
          foreign_buy_value: match.foreignBuyValue ?? null,
          foreign_sell_value: match.foreignSellValue ?? null,
          foreign_remaining_room: match.currentRoom ?? null,
          foreign_total_room: match.totalRoom ?? null,
          price_change: change,
          percent_change: change !== null && ref ? (change / ref) * 100 : null,
        };
      }),
      rawEndpoint: endpoint,
    };
  }

  async fetchTradingHistory(
    symbol: string,
    options: { resolution: string; start?: string; end?: string; page?: number; size?: number },
  ): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${IQ}/v1/company/${symbol}/price-history`;
    const raw = await this.get(
      this.query(endpoint, {
        timeFrame: TIME_FRAMES[options.resolution] ?? 'ONE_DAY',
        page: options.page ?? 0,
        size: options.size ?? 50,
        ...this.dateRange(options),
      }),
      15_000,
    );
    return { data: this.content(raw).map(snakeObject), rawEndpoint: endpoint };
  }
  async fetchTradingSummary(
    symbol: string,
    options: { resolution: string; start?: string; end?: string },
  ): Promise<ProviderResult<JsonObject>> {
    const endpoint = `${IQ}/v1/company/${symbol}/price-history-summary`;
    const raw = await this.get(
      this.query(endpoint, {
        timeFrame: TIME_FRAMES[options.resolution] ?? 'ONE_DAY',
        ...this.dateRange(options),
      }),
      15_000,
    );
    const data = isObject(raw) && isObject(raw.data) ? raw.data : {};
    return { data: snakeObject(data), rawEndpoint: endpoint };
  }
  async fetchInsiderDeals(symbol: string, limit: number): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${IQ}/v1/company/${symbol}/insider-transaction`;
    const raw = await this.get(this.query(endpoint, { page: 0, size: limit }), 30_000);
    return { data: this.content(raw).map(snakeObject), rawEndpoint: endpoint };
  }
  async fetchProprietaryHistory(
    symbol: string,
    options: { resolution: string; start?: string; end?: string; page?: number; size?: number },
  ): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${IQ}/v1/company/${symbol}/proprietary-history`;
    const raw = await this.get(
      this.query(endpoint, {
        timeFrame: TIME_FRAMES[options.resolution] ?? 'ONE_DAY',
        page: options.page ?? 0,
        size: options.size ?? 50,
        ...this.dateRange(options),
      }),
      15_000,
    );
    return { data: this.content(raw).map(snakeObject), rawEndpoint: endpoint };
  }
  async fetchProprietarySummary(
    symbol: string,
    options: { resolution: string; start?: string; end?: string },
  ): Promise<ProviderResult<JsonObject>> {
    const endpoint = `${IQ}/v1/company/${symbol}/proprietary-history-summary`;
    const raw = await this.get(
      this.query(endpoint, {
        timeFrame: TIME_FRAMES[options.resolution] ?? 'ONE_DAY',
        ...this.dateRange(options),
      }),
      15_000,
    );
    const data = isObject(raw) && isObject(raw.data) ? raw.data : {};
    return { data: snakeObject(data), rawEndpoint: endpoint };
  }
  async fetchCompanyDetails(symbol: string): Promise<ProviderResult<JsonObject>> {
    const endpoint = `${IQ}/v1/company/details`;
    const raw = await this.get(this.query(endpoint, { ticker: symbol }), 300_000);
    return {
      data: snakeObject(isObject(raw) && isObject(raw.data) ? raw.data : {}),
      rawEndpoint: endpoint,
    };
  }
  async fetchPriceChart(symbol: string, length: number): Promise<ProviderResult<JsonObject[]>> {
    const endpoint = `${IQ}/v1/company/${symbol}/price-chart`;
    const raw = await this.get(this.query(endpoint, { lengthReport: length }), 15_000);
    const items = isObject(raw) ? (Array.isArray(raw.data) ? raw.data : []) : [];
    return {
      data: asObjects(items).map((item) => ({
        open_price: numberOrZero(item.openPrice),
        high_price: numberOrZero(item.highPrice),
        low_price: numberOrZero(item.lowPrice),
        closing_price: numberOrZero(item.closingPrice),
        trading_time: item.tradingTime ?? null,
      })),
      rawEndpoint: endpoint,
    };
  }
  async fetchEvents(
    start: string,
    end?: string,
    eventType?: string,
  ): Promise<ProviderResult<JsonObject[]>> {
    const eventMap: Record<string, string> = {
      dividend: 'ISS,DIV',
      insider: 'DDIND,DDRP,DDINS',
      agm: 'EGME,AGME,AGMR',
      others: 'MOVE,MA,NLIS,AIS,RETU,OTHE,SUSP',
    };
    const endpoint = `${IQ}/v1/events`;
    const raw = await this.get(
      this.query(endpoint, {
        fromDate: start.replaceAll('-', ''),
        toDate: (end ?? start).replaceAll('-', ''),
        page: 0,
        size: 20000,
        ...(eventType ? { eventCode: eventMap[eventType] ?? eventType } : {}),
      }),
      300_000,
    );
    return { data: this.content(raw).map(snakeObject), rawEndpoint: endpoint };
  }

  async fetchFinancialRaw(
    symbol: string,
    section: string,
  ): Promise<ProviderResult<Record<string, JsonObject[]>>> {
    const endpoint = `${IQ}/v1/company/${symbol}/financial-statement`;
    const raw = await this.get(this.query(endpoint, { section }), 300_000);
    const data = isObject(raw) && isObject(raw.data) ? raw.data : {};
    return {
      data: Object.fromEntries(
        Object.entries(data)
          .filter(([, v]) => Array.isArray(v))
          .map(([key, v]) => [key, asObjects(v).map(snakeObject)]),
      ),
      rawEndpoint: endpoint,
    };
  }
  async fetchFinancialMetrics(symbol: string): Promise<Record<string, JsonObject[]>> {
    const raw = await this.get(`${IQ}/v1/company/${symbol}/financial-statement/metrics`, 300_000);
    const data = isObject(raw) && isObject(raw.data) ? raw.data : {};
    return Object.fromEntries(
      Object.entries(data)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, asObjects(v)]),
    );
  }
  async fetchFinancialReport(
    symbol: string,
    reportType: string,
    options: { termType?: number; pageSize?: number; period?: 'Q' | 'Y' } = {},
  ): Promise<ProviderResult<unknown>> {
    const section = FINANCE_TYPES[reportType] ?? 'BALANCE_SHEET';
    if (section === 'RATIO') {
      const endpoint = `${IQ}/v1/company/${symbol}/statistics-financial`;
      const raw = await this.get(endpoint, 300_000);
      const rows = (isObject(raw) ? asObjects(raw.data) : asObjects(raw)).map(snakeObject);
      const period = options.period ?? 'Q';
      return { data: this.filterRatio(rows, period), rawEndpoint: endpoint };
    }
    const [raw, metrics] = await Promise.all([
      this.fetchFinancialRaw(symbol, section),
      this.fetchFinancialMetrics(symbol),
    ]);
    return {
      data: this.toReportShape(
        raw.data,
        metrics[section] ?? [],
        section,
        options.termType ?? 2,
        options.pageSize ?? 8,
      ),
      rawEndpoint: raw.rawEndpoint,
    };
  }
  async fetchBctcStatements(
    symbol: string,
    termType = 1,
  ): Promise<ProviderResult<Record<string, JsonObject[]>>> {
    const sections = {
      balance_sheet: 'BALANCE_SHEET',
      income_statement: 'INCOME_STATEMENT',
      cash_flow: 'CASH_FLOW',
    };
    const results = await Promise.all(
      Object.entries(sections).map(
        async ([key, section]) => [key, await this.fetchFinancialRaw(symbol, section)] as const,
      ),
    );
    return {
      data: Object.fromEntries(
        results.map(([key, result]) => [
          key,
          result.data[termType === 1 ? 'years' : 'quarters'] ?? [],
        ]),
      ),
      rawEndpoint: results.at(-1)?.[1].rawEndpoint ?? '',
    };
  }

  private toReportShape(
    raw: Record<string, JsonObject[]>,
    metrics: JsonObject[],
    section: string,
    termType: number,
    pageSize: number,
  ): JsonObject {
    let periods = raw[termType === 2 ? 'quarters' : 'years'] ?? [];
    periods = periods
      .filter((row) => {
        const length = Number(row.length_report);
        return termType === 1 ? length === 5 : [1, 2, 3, 4].includes(length);
      })
      .sort(
        (a, b) =>
          Number(b.year_report) - Number(a.year_report) ||
          Number(b.length_report) - Number(a.length_report),
      )
      .slice(0, pageSize);
    const head = periods.map((row) => {
      const year = Number(row.year_report) || 0;
      const length = Number(row.length_report) || 0;
      return {
        TermCode: termType === 1 || length === 5 ? 'Y' : `Q${length}`,
        YearPeriod: year,
        TermName: termType === 1 || length === 5 ? String(year) : `Q${length}/${year}`,
      };
    });
    const normalized = metrics
      .filter((row) => row.field)
      .map((row) => ({
        field: String(row.field).toLowerCase(),
        name: String(row.titleVi ?? row.fullTitleVi ?? ''),
        level: Math.max(Number(row.level ?? 1) - 1, 0),
        parent: typeof row.parent === 'string' ? row.parent.toLowerCase() : null,
      }));
    const indices = new Map(normalized.map((row, index) => [row.field, index + 1]));
    const counts = new Map<string, number>();
    for (const row of normalized)
      if (row.parent) counts.set(row.parent, (counts.get(row.parent) ?? 0) + 1);
    const rows = normalized.map((row, index) => ({
      Name: row.name,
      Levels: row.level,
      CssStyle: row.level === 0 ? 'B' : '',
      ChildTotal: counts.get(row.field) ?? 0,
      ReportNormID: index + 1,
      ParentReportNormID: row.parent ? (indices.get(row.parent) ?? null) : null,
      FieldCode: row.field,
      ...Object.fromEntries(periods.map((period, i) => [`Value${i + 1}`, period[row.field]])),
    }));
    const label: { [key: string]: string } = {
      BALANCE_SHEET: 'CDKT',
      INCOME_STATEMENT: 'KQKD',
      CASH_FLOW: 'LCTT',
    };
    return { Head: head, Content: { [label[section] ?? section.toLowerCase()]: rows } };
  }
  private filterRatio(rows: JsonObject[], period: 'Q' | 'Y'): JsonObject[] {
    const sorted = [...rows].sort(
      (a, b) =>
        Number(b.year_report ?? b.year) - Number(a.year_report ?? a.year) ||
        Number(b.length_report ?? b.quarter) - Number(a.length_report ?? a.quarter),
    );
    if (period === 'Q')
      return sorted.filter((row) =>
        [1, 2, 3, 4].includes(Number(row.length_report ?? row.quarter)),
      );
    const yearEnds = new Set(
      sorted
        .filter((row) => Number(row.length_report ?? row.quarter) === 5)
        .map((row) => Number(row.year_report ?? row.year)),
    );
    return sorted.filter((row) => {
      const y = Number(row.year_report ?? row.year),
        l = Number(row.length_report ?? row.quarter);
      return l === 5 || (l === 4 && !yearEnds.has(y));
    });
  }
  private dateRange(options: { start?: string; end?: string }): JsonObject {
    return options.start && options.end
      ? { fromDate: options.start.replaceAll('-', ''), toDate: options.end.replaceAll('-', '') }
      : {};
  }
  private content(raw: unknown): JsonObject[] {
    if (!isObject(raw)) return [];
    const data = raw.data;
    if (Array.isArray(data)) return asObjects(data);
    return isObject(data) ? asObjects(data.content) : [];
  }
  private query(endpoint: string, params: JsonObject): string {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    return url.toString();
  }
  private async get(endpoint: string, ttl: number): Promise<unknown> {
    return this.http.requestJson(endpoint, this.headers(), { cacheTtlMs: ttl });
  }
  private async post(
    endpoint: string,
    body: JsonObject,
    ttl: number,
    key: string,
  ): Promise<unknown> {
    return this.http.requestJson(
      endpoint,
      { ...this.headers(), method: 'POST', body: JSON.stringify(body) },
      { cacheTtlMs: ttl, cacheKey: key },
    );
  }
  private exchange(value: unknown): unknown {
    return typeof value === 'string'
      ? (({ HSX: 'HOSE' } as Record<string, string>)[value] ?? value)
      : value;
  }
  private headers(): RequestInit {
    return {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://trading.vietcap.com.vn',
        Referer: 'https://trading.vietcap.com.vn/',
      },
    };
  }
}
