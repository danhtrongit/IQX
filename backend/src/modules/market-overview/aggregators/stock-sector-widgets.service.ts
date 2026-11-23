/**
 * Stock & Sector group widget aggregators (4 widgets):
 *  6. `market_heatmap`     — Bản đồ nhiệt thị trường
 *  7. `featured_stocks`    — Cổ phiếu nổi bật
 *  8. `sector_performance` — Hiệu suất ngành
 *  9. `sector_rotation`    — Chu kỳ ngành (RRG)
 */
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/database.service.js';
import { VciMarketProvider } from '../../market-data/providers/vci.provider.js';
import { VndMarketProvider } from '../../market-data/providers/vnd.provider.js';
import { VietcapInsightProvider } from '../../market-extended/vietcap-insight.provider.js';
import { VietcapOverviewProvider } from '../../market-extended/vietcap-overview.provider.js';
import { MarketOverviewCache } from '../market-overview.cache.js';
import type {
  FeaturedStocksTab,
  HeatmapMode,
  HeatmapSizeBy,
  SectorPerformancePeriod,
  SectorPerformanceTab,
} from '../market-overview.catalog.js';
import type {
  FeaturedStocksData,
  MarketHeatmapData,
  SectorPerformanceData,
  SectorRotationData,
} from '../market-overview.schemas.js';
import {
  asRecordArray,
  asString,
  formatIctDate,
  intradayElapsedFraction,
  isLikelyNonEquityTicker,
  isRecordObject,
  normalizeExchange,
  parseStoredDailyBars,
  parseUpstreamTimestamp,
  resolveSessionDate,
  roundTo,
  toDailyCloseBars,
  toFiniteNumber,
  toNumberOrZero,
  unixSecondsDaysAgo,
  vciPriceToThousands,
} from './market-overview.helpers.js';
import {
  computeSectorRotation,
  type DailyCloseBar,
  type SectorMemberSeries,
  type SectorSeriesInput,
} from './rrg-math.js';
import { VnTradingCalendarService } from './vn-trading-calendar.service.js';

interface UniverseStock {
  symbol: string;
  exchange: string;
  sectorCode: string;
  sectorName: string;
  rawPrice: number;
  rawRef: number;
  rawCeil: number;
  rawFloor: number;
  price: number;
  refPrice: number;
  ceilingPrice: number;
  floorPrice: number;
  changePct: number;
  volume: number;
  valueBillion: number;
  marketCapBillion: number;
  isCeiling: boolean;
  isFloor: boolean;
}

const HEATMAP_TOP_N = 100;
const FEATURED_MIN_VALUE_BILLION = 1;
const VOL_SPIKE_LIQUIDITY_TOP_N = 60;
const FEATURED_OUTPUT_LIMIT = 20;
const SECTOR_AVG20_CACHE_TTL_MS = 60 * 60_000;

@Injectable()
export class StockSectorWidgetsService {
  constructor(
    private readonly vietcapOverview: VietcapOverviewProvider,
    private readonly vietcapInsight: VietcapInsightProvider,
    private readonly vci: VciMarketProvider,
    private readonly vnd: VndMarketProvider,
    private readonly database: DatabaseService,
    private readonly cache: MarketOverviewCache,
    private readonly tradingCalendar: VnTradingCalendarService,
  ) {}

  /** 6. Bản đồ nhiệt thị trường (`market_heatmap`) — top 100 stocks by market cap. */
  async getMarketHeatmap(params: {
    mode: HeatmapMode;
    sizeBy: HeatmapSizeBy;
  }): Promise<MarketHeatmapData> {
    const [heatmapRes, { exchangeMap, nonEquitySet }] = await Promise.all([
      this.vietcapOverview.heatmap('ALL', 'icb_code_2', params.sizeBy === 'value' ? 'VAL' : 'MKC'),
      this.loadSymbolMetadata(),
    ]);

    const universe = this.extractUniverseFromHeatmap(heatmapRes.data, exchangeMap, nonEquitySet);
    const top100 = universe
      .filter((s) => s.marketCapBillion > 0)
      .sort((a, b) => b.marketCapBillion - a.marketCapBillion || a.symbol.localeCompare(b.symbol))
      .slice(0, HEATMAP_TOP_N);

    const bySector = new Map<
      string,
      {
        code: string;
        name: string;
        stocks: MarketHeatmapData['sectors'][number]['stocks'];
        totalCap: number;
        totalVal: number;
        weightedPctNum: number;
      }
    >();

    for (const stock of top100) {
      let group = bySector.get(stock.sectorCode);
      if (!group) {
        group = {
          code: stock.sectorCode,
          name: stock.sectorName,
          stocks: [],
          totalCap: 0,
          totalVal: 0,
          weightedPctNum: 0,
        };
        bySector.set(stock.sectorCode, group);
      }

      group.stocks.push({
        symbol: stock.symbol,
        exchange: stock.exchange,
        price: stock.price,
        refPrice: stock.refPrice,
        ceilingPrice: stock.ceilingPrice,
        floorPrice: stock.floorPrice,
        changePct: stock.changePct,
        marketCapBillion: stock.marketCapBillion,
        valueBillion: stock.valueBillion,
        isCeiling: stock.isCeiling,
        isFloor: stock.isFloor,
      });
      group.totalCap += stock.marketCapBillion;
      group.totalVal += stock.valueBillion;
      group.weightedPctNum += stock.marketCapBillion * stock.changePct;
    }

    const metric = (s: { marketCapBillion: number; valueBillion: number }) =>
      params.sizeBy === 'value' ? s.valueBillion : s.marketCapBillion;

    const sectors: MarketHeatmapData['sectors'] = [...bySector.values()]
      .map((group) => {
        group.stocks.sort((a, b) => metric(b) - metric(a) || a.symbol.localeCompare(b.symbol));
        return {
          code: group.code,
          name: group.name,
          changePct: group.totalCap > 0 ? roundTo(group.weightedPctNum / group.totalCap, 2) : 0,
          marketCapBillion: roundTo(group.totalCap, 2),
          valueBillion: roundTo(group.totalVal, 2),
          stocks: group.stocks,
        };
      })
      .sort((a, b) => metric(b) - metric(a) || a.code.localeCompare(b.code));

    return {
      mode: params.mode,
      sizeBy: params.sizeBy,
      sectors,
    };
  }

  /** 7. Cổ phiếu nổi bật (`featured_stocks`). */
  async getFeaturedStocks(
    params: { tab: FeaturedStocksTab },
    now: Date = new Date(),
  ): Promise<FeaturedStocksData> {
    const [heatmapRes, { exchangeMap, nonEquitySet }, foreignMap, holidays] = await Promise.all([
      this.vietcapOverview.heatmap('ALL', 'icb_code_2', 'VAL'),
      this.loadSymbolMetadata(),
      this.loadForeignNetBySymbol(params.tab === 'foreign'),
      this.tradingCalendar.getHolidays(),
    ]);

    const universe = this.extractUniverseFromHeatmap(heatmapRes.data, exchangeMap, nonEquitySet);
    // Spec invariant: implicit filter GTGD >= 1 billion VND across ALL tabs.
    const eligible = universe.filter((s) => s.valueBillion >= FEATURED_MIN_VALUE_BILLION);

    if (params.tab === 'vol_spike') {
      // Spec invariant: vol_spike evaluated ONLY among top 60 stocks by GTGD.
      const top60ByValue = [...eligible]
        .sort((a, b) => b.valueBillion - a.valueBillion || a.symbol.localeCompare(b.symbol))
        .slice(0, VOL_SPIKE_LIQUIDITY_TOP_N);

      const volRatioMap = await this.computeVolRatio20dSameMin(top60ByValue, now, holidays);
      const ranked = top60ByValue
        .map((stock) => ({
          stock,
          volRatio20d: volRatioMap.get(stock.symbol) ?? null,
        }))
        .filter((entry) => entry.volRatio20d !== null && entry.volRatio20d > 0)
        .sort(
          (a, b) =>
            (b.volRatio20d ?? 0) - (a.volRatio20d ?? 0) ||
            b.stock.valueBillion - a.stock.valueBillion,
        )
        .slice(0, FEATURED_OUTPUT_LIMIT);

      return {
        tab: params.tab,
        rows: ranked.map(({ stock, volRatio20d }) =>
          this.toFeaturedRow(stock, foreignMap.get(stock.symbol) ?? 0, volRatio20d),
        ),
      };
    }

    let sorted: UniverseStock[];
    switch (params.tab) {
      case 'gainers':
        sorted = [...eligible].sort(
          (a, b) => b.changePct - a.changePct || b.valueBillion - a.valueBillion,
        );
        break;
      case 'losers':
        sorted = [...eligible].sort(
          (a, b) => a.changePct - b.changePct || b.valueBillion - a.valueBillion,
        );
        break;
      case 'liquidity':
        sorted = [...eligible].sort(
          (a, b) => b.valueBillion - a.valueBillion || b.changePct - a.changePct,
        );
        break;
      case 'foreign':
        sorted = [...eligible]
          .filter((s) => Math.abs(foreignMap.get(s.symbol) ?? 0) > 0)
          .sort(
            (a, b) =>
              Math.abs(foreignMap.get(b.symbol) ?? 0) - Math.abs(foreignMap.get(a.symbol) ?? 0) ||
              b.valueBillion - a.valueBillion,
          );
        break;
    }

    return {
      tab: params.tab,
      rows: sorted
        .slice(0, FEATURED_OUTPUT_LIMIT)
        .map((stock) => this.toFeaturedRow(stock, foreignMap.get(stock.symbol) ?? 0, null)),
    };
  }

  /** 8. Hiệu suất ngành (`sector_performance`) — ICB Level 2. */
  async getSectorPerformance(
    params: { period: SectorPerformancePeriod; tab: SectorPerformanceTab },
    now: Date = new Date(),
  ): Promise<SectorPerformanceData> {
    const holidays = await this.tradingCalendar.getHolidays();
    const todayAllocPromise =
      params.period === 'today'
        ? null
        : this.vietcapOverview.sectorsAllocation('ALL', 'ONE_DAY').catch(() => null);
    const [infoRes, allocRes, todayAllocRes, industriesRes, avg20Map] = await Promise.all([
      this.vietcapInsight.sectorInformation(2).catch(() => null),
      this.fetchSectorsAllocationForPeriod(params.period, todayAllocPromise),
      todayAllocPromise ?? Promise.resolve(null),
      this.vci.fetchIndustries().catch(() => null),
      this.loadSector20dAvgValueBillion(now, holidays).catch(() => new Map<string, number>()),
    ]);

    if (!infoRes && !allocRes) {
      throw new Error('Sector performance upstreams are unavailable');
    }

    const sectorNames = new Map<string, string>();
    for (const row of asRecordArray(industriesRes?.data)) {
      const code = this.normalizeIcbCode(row.icb_code);
      const name = asString(row.icb_name || row.en_icb_name);
      if (code && name) sectorNames.set(code, name);
    }

    const infoByCode = new Map<string, Record<string, unknown>>();
    for (const row of asRecordArray(infoRes?.data)) {
      const code = this.normalizeIcbCode(row.icb_code);
      if (code) infoByCode.set(code, row);
    }

    const allocByCode = new Map<string, Record<string, unknown>>();
    for (const row of asRecordArray(allocRes?.data)) {
      const code = this.normalizeIcbCode(row.icb_code);
      if (code) allocByCode.set(code, row);
    }

    // `so TB20` compares single-day cumulative sector GTGD against the 20D same-minute
    // average, so multi-day periods (1w/1m/ytd) MUST compute `valueRatio20d` from ONE_DAY
    // allocation rather than dividing multi-day cumulative value by a single-day average.
    const effectiveTodayAllocRes = params.period === 'today' ? allocRes : todayAllocRes;
    const todayAllocByCode = new Map<string, Record<string, unknown>>();
    for (const row of asRecordArray(effectiveTodayAllocRes?.data)) {
      const code = this.normalizeIcbCode(row.icb_code);
      if (code) todayAllocByCode.set(code, row);
    }

    const allCodes = new Set<string>([...infoByCode.keys(), ...allocByCode.keys()]);
    const elapsedFrac = intradayElapsedFraction(now, holidays);

    const draftRows: Array<{
      code: string;
      name: string;
      changePct: number;
      advancing: number;
      declining: number;
      unchanged: number;
      valueBillion: number;
      valueRatio20d: number | null;
    }> = [];

    let totalMarketValueBillion = 0;

    for (const code of allCodes) {
      const info = infoByCode.get(code);
      const alloc = allocByCode.get(code);

      const changePct = this.pickPeriodChangePct(params.period, info, alloc);
      const advancing = Math.max(0, Math.round(toNumberOrZero(alloc?.total_stock_increase)));
      const declining = Math.max(0, Math.round(toNumberOrZero(alloc?.total_stock_decrease)));
      const unchanged = Math.max(0, Math.round(toNumberOrZero(alloc?.total_stock_no_change)));
      const valueBillion = roundTo(toNumberOrZero(alloc?.total_value_vnd) / 1e9, 2);
      totalMarketValueBillion += valueBillion;

      const todayAlloc = todayAllocByCode.get(code);
      const todayValueVnd = todayAlloc ? toFiniteNumber(todayAlloc.total_value_vnd) : null;
      const todayValueBillion =
        todayValueVnd !== null && todayValueVnd >= 0 ? roundTo(todayValueVnd / 1e9, 2) : null;

      const avg20Daily = avg20Map.get(code);
      const avg20SameMin =
        avg20Daily !== undefined && avg20Daily > 0 ? avg20Daily * elapsedFrac : null;
      const valueRatio20d =
        todayValueBillion !== null && avg20SameMin !== null && avg20SameMin > 0
          ? roundTo(todayValueBillion / avg20SameMin, 2)
          : null;

      draftRows.push({
        code,
        name: sectorNames.get(code) ?? `Ngành ${code}`,
        changePct: roundTo(changePct, 2),
        advancing,
        declining,
        unchanged,
        valueBillion,
        valueRatio20d,
      });
    }

    const rows: SectorPerformanceData['rows'] = draftRows.map((row) => ({
      code: row.code,
      name: row.name,
      changePct: row.changePct,
      advancing: row.advancing,
      declining: row.declining,
      unchanged: row.unchanged,
      valueSharePct:
        totalMarketValueBillion > 0
          ? roundTo((row.valueBillion / totalMarketValueBillion) * 100, 2)
          : 0,
      valueRatio20d: row.valueRatio20d,
      valueBillion: row.valueBillion,
    }));

    if (params.tab === 'flow') {
      rows.sort((a, b) => b.valueSharePct - a.valueSharePct || b.valueBillion - a.valueBillion);
    } else {
      rows.sort((a, b) => b.changePct - a.changePct || b.valueBillion - a.valueBillion);
    }

    return {
      period: params.period,
      tab: params.tab,
      rows,
    };
  }

  /** 9. Chu kỳ ngành (`sector_rotation`) — Weekly RRG vs VN-Index. */
  async getSectorRotation(now: Date = new Date()): Promise<SectorRotationData> {
    const [benchmarkBars, memberRows, icbDirRes, industriesRes] = await Promise.all([
      this.loadVnIndexDailyBars(now),
      this.loadEquityDailyBarsWithMetadata(),
      this.vci.fetchIcbDirectory().catch(() => null),
      this.vci.fetchIndustries().catch(() => null),
    ]);

    const nameByCode = new Map<string, string>();
    const codeByLowerName = new Map<string, string>();
    for (const row of asRecordArray(industriesRes?.data)) {
      const code = this.normalizeIcbCode(row.icb_code);
      const viName = asString(row.icb_name);
      const enName = asString(row.en_icb_name);
      if (code && (viName || enName)) {
        const label = viName || enName;
        nameByCode.set(code, label);
        if (viName) codeByLowerName.set(viName.toLowerCase(), code);
        if (enName) codeByLowerName.set(enName.toLowerCase(), code);
      }
    }

    const lv2BySymbol = new Map<string, string>();
    if (icbDirRes) {
      for (const entry of icbDirRes.data) {
        const code = this.normalizeIcbCode(entry.lv2);
        if (entry.symbol && code) {
          lv2BySymbol.set(entry.symbol.toUpperCase(), code);
        }
      }
    }

    const membersBySector = new Map<string, SectorMemberSeries[]>();
    for (const row of memberRows) {
      const symbol = row.symbol.toUpperCase();
      let code = lv2BySymbol.get(symbol) ?? null;
      if (!code && row.icbLv2) {
        const trimmed = row.icbLv2.trim();
        code = /^\d{3,4}$/.test(trimmed)
          ? trimmed.padStart(4, '0')
          : (codeByLowerName.get(trimmed.toLowerCase()) ?? null);
      }
      if (!code) continue;

      const columns = parseStoredDailyBars(row.bars);
      if (!columns) continue;
      const bars = toDailyCloseBars(columns);
      if (bars.length < 3) continue;

      const weight =
        row.sharesOutstanding !== null && row.sharesOutstanding > 0 ? row.sharesOutstanding : 1;
      let list = membersBySector.get(code);
      if (!list) {
        list = [];
        membersBySector.set(code, list);
      }
      list.push({ symbol, weight, bars });
    }

    const sectorInputs: SectorSeriesInput[] = [...membersBySector.entries()].map(
      ([code, members]) => ({
        code,
        name: nameByCode.get(code) ?? `Ngành ${code}`,
        members,
      }),
    );

    return computeSectorRotation(sectorInputs, benchmarkBars);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private normalizeIcbCode(raw: unknown): string | null {
    const str = asString(raw);
    if (!str) return null;
    if (/^\d+$/.test(str)) return str.padStart(4, '0');
    return str;
  }

  private pickPeriodChangePct(
    period: SectorPerformancePeriod,
    info: Record<string, unknown> | undefined,
    alloc: Record<string, unknown> | undefined,
  ): number {
    switch (period) {
      case 'today':
        return (
          toFiniteNumber(alloc?.icb_change_percent) ??
          toFiniteNumber(info?.percent_price_change_1d) ??
          0
        );
      case '1w':
        return toFiniteNumber(info?.percent_price_change_1w) ?? 0;
      case '1m':
        return toFiniteNumber(info?.percent_price_change_1m) ?? 0;
      case 'ytd':
        return toFiniteNumber(info?.percent_price_change_ytd) ?? 0;
    }
  }

  private async fetchSectorsAllocationForPeriod(
    period: SectorPerformancePeriod,
    oneDayFallbackPromise?: Promise<Awaited<
      ReturnType<VietcapOverviewProvider['sectorsAllocation']>
    > | null> | null,
  ): Promise<Awaited<ReturnType<VietcapOverviewProvider['sectorsAllocation']>> | null> {
    const timeFrameCandidates: readonly string[] =
      period === 'today'
        ? ['ONE_DAY']
        : period === '1w'
          ? ['ONE_WEEK']
          : period === '1m'
            ? ['ONE_MONTH']
            : ['ONE_YEAR', 'ONE_MONTH'];

    let lastEmptySuccess: Awaited<ReturnType<VietcapOverviewProvider['sectorsAllocation']>> | null =
      null;
    for (const timeFrame of timeFrameCandidates) {
      try {
        const res = await this.vietcapOverview.sectorsAllocation('ALL', timeFrame);
        if (asRecordArray(res.data).length > 0) {
          return res;
        }
        lastEmptySuccess = res;
      } catch {
        // Fall through to the next supported VCI allocation timeFrame.
      }
    }
    if (oneDayFallbackPromise) {
      const oneDayRes = await oneDayFallbackPromise;
      if (oneDayRes && asRecordArray(oneDayRes.data).length > 0) {
        return oneDayRes;
      }
      if (oneDayRes && !lastEmptySuccess) {
        lastEmptySuccess = oneDayRes;
      }
    }
    return lastEmptySuccess;
  }

  private extractUniverseFromHeatmap(
    rawHeatmap: unknown,
    exchangeMap: ReadonlyMap<string, string>,
    nonEquitySet: ReadonlySet<string>,
  ): UniverseStock[] {
    const bySymbol = new Map<string, UniverseStock>();

    for (const sector of asRecordArray(rawHeatmap)) {
      const sectorCode = this.normalizeIcbCode(sector.icb_code) ?? '0000';
      const sectorName = asString(sector.icb_name || sector.en_icb_name, `Ngành ${sectorCode}`);

      for (const stock of asRecordArray(sector.stocks)) {
        const symbol = asString(stock.symbol).toUpperCase();
        if (!symbol || nonEquitySet.has(symbol) || isLikelyNonEquityTicker(symbol)) continue;

        const rawRef = toNumberOrZero(stock.ref_price);
        const rawMatched = toNumberOrZero(stock.price);
        const rawPrice = rawMatched > 0 ? rawMatched : rawRef;
        const rawCeil = toNumberOrZero(stock.ceiling_price);
        const rawFloor = toNumberOrZero(stock.floor_price);
        const marketCapBillion = roundTo(toNumberOrZero(stock.market_cap_vnd) / 1e9, 2);
        const valueBillion = roundTo(toNumberOrZero(stock.value_million_vnd) / 1_000, 2);
        const volume = Math.max(0, Math.round(toNumberOrZero(stock.volume)));

        const existing = bySymbol.get(symbol);
        if (existing && existing.marketCapBillion >= marketCapBillion) continue;

        const changePct =
          rawRef > 0 && rawPrice > 0 ? roundTo(((rawPrice - rawRef) / rawRef) * 100, 2) : 0;

        bySymbol.set(symbol, {
          symbol,
          exchange: exchangeMap.get(symbol) ?? 'HOSE',
          sectorCode,
          sectorName,
          rawPrice,
          rawRef,
          rawCeil,
          rawFloor,
          price: vciPriceToThousands(rawPrice),
          refPrice: vciPriceToThousands(rawRef),
          ceilingPrice: vciPriceToThousands(rawCeil),
          floorPrice: vciPriceToThousands(rawFloor),
          changePct,
          volume,
          valueBillion,
          marketCapBillion,
          isCeiling: rawCeil > 0 && rawPrice >= rawCeil,
          isFloor: rawFloor > 0 && rawPrice > 0 && rawPrice <= rawFloor,
        });
      }
    }

    return [...bySymbol.values()];
  }

  private toFeaturedRow(
    stock: UniverseStock,
    foreignNetBillion: number,
    volRatio20d: number | null,
  ): FeaturedStocksData['rows'][number] {
    return {
      symbol: stock.symbol,
      exchange: stock.exchange,
      price: stock.price,
      refPrice: stock.refPrice,
      ceilingPrice: stock.ceilingPrice,
      floorPrice: stock.floorPrice,
      changePct: stock.changePct,
      valueBillion: stock.valueBillion,
      foreignNetBillion: roundTo(foreignNetBillion, 2),
      volRatio20d,
    };
  }

  private async loadSymbolMetadata(): Promise<{
    exchangeMap: Map<string, string>;
    nonEquitySet: Set<string>;
  }> {
    const exchangeMap = new Map<string, string>();
    const nonEquitySet = new Set<string>();
    try {
      if (!this.database.isConfigured()) return { exchangeMap, nonEquitySet };
      const [exchangeRows, nonEquityRows] = await Promise.all([
        this.database
          .query<{ symbol: string; exchange: string | null }>(
            `SELECT upper(symbol) AS symbol, exchange
               FROM symbols
              WHERE is_active = true
                AND coalesce(is_index, false) = false
                AND lower(coalesce(asset_type, 'stock')) = 'stock'`,
          )
          .catch(() => []),
        this.database
          .query<{ symbol: string }>(
            `SELECT upper(symbol) AS symbol
               FROM symbols
              WHERE is_active = true
                AND (coalesce(is_index, false) = true OR lower(coalesce(asset_type, 'stock')) <> 'stock')`,
          )
          .catch(() => []),
      ]);
      for (const row of exchangeRows) {
        exchangeMap.set(row.symbol, normalizeExchange(row.exchange));
      }
      for (const row of nonEquityRows) {
        nonEquitySet.add(row.symbol);
      }
    } catch {
      // Non-fatal: defaults to HOSE and ticker-shape equity filter.
    }
    return { exchangeMap, nonEquitySet };
  }

  private async loadForeignNetBySymbol(comprehensive: boolean): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const groups = comprehensive ? ['HOSE', 'HNX', 'UPCOM'] : ['ALL'];
    const settled = await Promise.allSettled(
      groups.map((group) => this.vietcapOverview.foreignTop({ group, timeFrame: 'ONE_DAY' })),
    );
    for (const res of settled) {
      if (res.status !== 'fulfilled' || !isRecordObject(res.value.data)) continue;
      for (const row of asRecordArray(res.value.data.net_buy)) {
        const symbol = asString(row.symbol).toUpperCase();
        const netVnd = toFiniteNumber(row.net_value_vnd);
        if (!symbol || netVnd === null) continue;
        map.set(symbol, Math.abs(netVnd) / 1e9);
      }
      for (const row of asRecordArray(res.value.data.net_sell)) {
        const symbol = asString(row.symbol).toUpperCase();
        const netVnd = toFiniteNumber(row.net_value_vnd);
        if (!symbol || netVnd === null) continue;
        map.set(symbol, -Math.abs(netVnd) / 1e9);
      }
    }
    return map;
  }

  private async computeVolRatio20dSameMin(
    candidates: readonly UniverseStock[],
    now: Date,
    holidays: ReadonlySet<string>,
  ): Promise<Map<string, number>> {
    const ratios = new Map<string, number>();
    if (candidates.length === 0) return ratios;

    const sessionDate = resolveSessionDate(now, holidays);
    const elapsedFrac = intradayElapsedFraction(now, holidays);
    const symbols = candidates.map((c) => c.symbol);

    // Primary: exact 20D average volume from local `market_daily_bars` adjusted by elapsed fraction.
    try {
      if (this.database.isConfigured()) {
        const rows = await this.database.query<{ symbol: string; bars: unknown }>(
          `SELECT upper(symbol) AS symbol, bars
             FROM market_daily_bars
            WHERE upper(symbol) = ANY($1::text[])`,
          [symbols],
        );
        const avg20BySymbol = new Map<string, number>();
        for (const row of rows) {
          const cols = parseStoredDailyBars(row.bars);
          if (!cols) continue;
          const priorVolumes: number[] = [];
          for (let i = 0; i < cols.d.length; i += 1) {
            if (cols.d[i]! < sessionDate) {
              priorVolumes.push(cols.v[i]!);
            }
          }
          const tail = priorVolumes.slice(-20).filter((v) => v > 0);
          if (tail.length === 0) continue;
          const avg = tail.reduce((acc, v) => acc + v, 0) / tail.length;
          if (avg > 0) avg20BySymbol.set(row.symbol, avg);
        }

        for (const stock of candidates) {
          const avg20 = avg20BySymbol.get(stock.symbol);
          if (avg20 && avg20 > 0 && stock.volume > 0) {
            const avg20SameMin = avg20 * elapsedFrac;
            ratios.set(stock.symbol, roundTo(stock.volume / avg20SameMin, 2));
          }
        }
      }
    } catch {
      // Fallback below if DB query unavailable.
    }

    // Fallback: VND `top_stocks` volume spike ratio if DB had no history for candidates.
    if (ratios.size === 0) {
      const candidateSet = new Set(symbols);
      const settled = await Promise.allSettled([
        this.vnd.fetchRanking('volume', 'VNINDEX', 60),
        this.vnd.fetchRanking('volume', 'HNX', 40),
      ]);
      for (const res of settled) {
        if (res.status !== 'fulfilled') continue;
        for (const row of asRecordArray(res.value.data)) {
          const symbol = asString(row.symbol).toUpperCase();
          if (!candidateSet.has(symbol)) continue;
          const pct = toFiniteNumber(row.volume_spike_20d_pct);
          if (pct !== null && pct > 0) {
            ratios.set(symbol, roundTo(pct / 100, 2));
          }
        }
      }
    }

    return ratios;
  }

  private async loadSector20dAvgValueBillion(
    now: Date,
    holidays: ReadonlySet<string>,
  ): Promise<Map<string, number>> {
    const sessionDate = resolveSessionDate(now, holidays);
    const cacheKey = `sector_avg20_value:${sessionDate}`;
    const cached = await this.cache.getOrFetch(
      cacheKey,
      async () => {
        const result = new Map<string, number>();
        if (!this.database.isConfigured()) return result;

        const [barRows, icbDirRes] = await Promise.all([
          this.database.query<{ symbol: string; bars: unknown }>(
            `SELECT upper(b.symbol) AS symbol, b.bars
               FROM market_daily_bars b
               JOIN symbols s ON upper(s.symbol) = upper(b.symbol)
              WHERE s.is_active = true
                AND coalesce(s.is_index, false) = false
                AND lower(coalesce(s.asset_type, 'stock')) = 'stock'`,
          ),
          this.vci.fetchIcbDirectory().catch(() => null),
        ]);

        const lv2BySymbol = new Map<string, string>();
        if (icbDirRes) {
          for (const item of icbDirRes.data) {
            const code = this.normalizeIcbCode(item.lv2);
            if (item.symbol && code) lv2BySymbol.set(item.symbol.toUpperCase(), code);
          }
        }
        if (lv2BySymbol.size === 0) return result;

        // Accumulate daily sector GTGD (billion VND = close_thousand * volume / 1e6).
        const dailySectorTotals = new Map<string, Map<string, number>>();
        const allDates = new Set<string>();

        for (const row of barRows) {
          const code = lv2BySymbol.get(row.symbol);
          if (!code) continue;
          const cols = parseStoredDailyBars(row.bars);
          if (!cols) continue;
          const startIdx = Math.max(0, cols.d.length - 25);
          for (let i = startIdx; i < cols.d.length; i += 1) {
            const date = cols.d[i]!;
            if (date >= sessionDate) continue;
            const close = cols.c[i]!;
            const vol = cols.v[i]!;
            if (close <= 0 || vol <= 0) continue;
            allDates.add(date);
            let dateMap = dailySectorTotals.get(date);
            if (!dateMap) {
              dateMap = new Map<string, number>();
              dailySectorTotals.set(date, dateMap);
            }
            dateMap.set(code, (dateMap.get(code) ?? 0) + (close * vol) / 1e6);
          }
        }

        const recent20Dates = [...allDates].sort().slice(-20);
        if (recent20Dates.length === 0) return result;

        const sumBySector = new Map<string, number>();
        for (const date of recent20Dates) {
          const dateMap = dailySectorTotals.get(date);
          if (!dateMap) continue;
          for (const [code, val] of dateMap) {
            sumBySector.set(code, (sumBySector.get(code) ?? 0) + val);
          }
        }
        for (const [code, sum] of sumBySector) {
          result.set(code, sum / recent20Dates.length);
        }
        return result;
      },
      { ttlMs: SECTOR_AVG20_CACHE_TTL_MS },
    );

    return cached.value;
  }

  private async loadVnIndexDailyBars(now: Date): Promise<DailyCloseBar[]> {
    try {
      if (this.database.isConfigured()) {
        const rows = await this.database.query<{
          trade_date: Date | string;
          close: string | number;
        }>(
          `SELECT trade_date, close
             FROM market_index_bars
            WHERE symbol = 'VNINDEX'
            ORDER BY trade_date ASC`,
        );
        const bars: DailyCloseBar[] = [];
        for (const row of rows) {
          const d =
            row.trade_date instanceof Date
              ? row.trade_date.toISOString().slice(0, 10)
              : String(row.trade_date).slice(0, 10);
          const c = toFiniteNumber(row.close);
          if (d && c !== null && c > 0) bars.push({ d, c });
        }
        if (bars.length >= 20) return bars;
      }
    } catch {
      // Fallback to VND daily bars below.
    }

    const nowSec = Math.floor(now.getTime() / 1_000);
    const fromSec = unixSecondsDaysAgo(now, 600);
    const vndRes = await this.vnd.fetchOhlcv('VNINDEX', fromSec, nowSec, '1D');
    const bars: DailyCloseBar[] = [];
    for (const row of asRecordArray(vndRes.data)) {
      const dt = parseUpstreamTimestamp(row.time);
      const close = toFiniteNumber(row.close);
      if (dt && close !== null && close > 0) {
        bars.push({ d: formatIctDate(dt), c: close });
      }
    }
    return bars;
  }

  private async loadEquityDailyBarsWithMetadata(): Promise<
    Array<{
      symbol: string;
      bars: unknown;
      sharesOutstanding: number | null;
      icbLv2: string | null;
    }>
  > {
    if (!this.database.isConfigured()) return [];
    const rows = await this.database.query<{
      symbol: string;
      bars: unknown;
      shares_outstanding: string | number | null;
      icb_lv2: string | null;
    }>(
      `SELECT upper(b.symbol) AS symbol,
              b.bars,
              s.shares_outstanding,
              s.icb_lv2
         FROM market_daily_bars b
         JOIN symbols s ON upper(s.symbol) = upper(b.symbol)
        WHERE s.is_active = true
          AND coalesce(s.is_index, false) = false
          AND lower(coalesce(s.asset_type, 'stock')) = 'stock'`,
    );
    return rows.map((row) => ({
      symbol: row.symbol,
      bars: row.bars,
      sharesOutstanding: toFiniteNumber(row.shares_outstanding),
      icbLv2: row.icb_lv2,
    }));
  }
}
