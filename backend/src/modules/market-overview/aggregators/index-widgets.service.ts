/**
 * Index-group widget aggregators (5 widgets):
 *  1. `index_chart`      — Biểu đồ chỉ số
 *  2. `market_breadth`   — Độ rộng thị trường
 *  3. `market_liquidity` — Thanh khoản thị trường
 *  4. `foreign_flow`     — Khối ngoại và tự doanh
 *  5. `vnindex_impact`   — Tác động lên VN-Index
 */
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../platform/database/database.service.js';
import { VciMarketProvider } from '../../market-data/providers/vci.provider.js';
import { VndMarketProvider } from '../../market-data/providers/vnd.provider.js';
import { VietcapOverviewProvider } from '../../market-extended/vietcap-overview.provider.js';
import type {
  ForeignFlowExchange,
  ForeignFlowTab,
  IndexChartIndex,
  IndexChartRange,
} from '../market-overview.catalog.js';
import {
  MarketOverviewRepository,
  type LiquidityHistoryPoint,
  type StoredLiquidityHistory,
} from '../market-overview.repository.js';
import type {
  ForeignFlowData,
  IndexChartData,
  MarketBreadthData,
  MarketLiquidityData,
  VnindexImpactData,
} from '../market-overview.schemas.js';
import { classifyFuturesSlots } from './derivatives-calendar.js';
import {
  computeVnIndexImpact,
  type HoseEquityImpactInput,
  type VciImpactContributor,
} from './impact-math.js';
import {
  asRecordArray,
  asString,
  formatIctDate,
  formatIctTime,
  isLikelyNonEquityTicker,
  isRecordObject,
  isVietnamLunchMinute,
  parseUpstreamTimestamp,
  resolveSessionDate,
  roundTo,
  standardIntradayLiquidityFraction,
  toFiniteNumber,
  toNumberOrZero,
  unixSecondsDaysAgo,
  vciPriceToThousands,
} from './market-overview.helpers.js';
import { VnTradingCalendarService } from './vn-trading-calendar.service.js';

const COMPLETE_LIQUIDITY_CURVE_MIN_TIME = '14:30';

interface IndexCardMeta {
  code: IndexChartIndex;
  name: string;
  vciIndexSymbol: string | null;
  vndSymbol: string;
  vciChartSymbol: string;
}

const INDEX_CARD_LIST: readonly IndexCardMeta[] = [
  {
    code: 'VNINDEX',
    name: 'VN-Index',
    vciIndexSymbol: 'VNINDEX',
    vndSymbol: 'VNINDEX',
    vciChartSymbol: 'VNINDEX',
  },
  {
    code: 'VN30',
    name: 'VN30',
    vciIndexSymbol: 'VN30',
    vndSymbol: 'VN30',
    vciChartSymbol: 'VN30',
  },
  {
    code: 'HNX',
    name: 'HNX-Index',
    vciIndexSymbol: 'HNXIndex',
    vndSymbol: 'HNX',
    vciChartSymbol: 'HNXIndex',
  },
  {
    code: 'UPCOM',
    name: 'UPCoM',
    vciIndexSymbol: 'HNXUpcomIndex',
    vndSymbol: 'UPCOM',
    vciChartSymbol: 'HNXUpcomIndex',
  },
  {
    code: 'VN30F1M',
    name: 'VN30F1M',
    vciIndexSymbol: null,
    vndSymbol: 'VN30F1M',
    vciChartSymbol: 'VN30F1M',
  },
];

interface ParsedOhlcvBar {
  date: string;
  hhmm: string;
  close: number;
  volume: number;
}

function parseOhlcvRows(raw: unknown): ParsedOhlcvBar[] {
  const rows = asRecordArray(raw);
  const parsed: ParsedOhlcvBar[] = [];
  for (const row of rows) {
    const dt = parseUpstreamTimestamp(row.time);
    const close = toFiniteNumber(row.close);
    if (!dt || close === null || close <= 0) continue;
    const volume = Math.max(0, toNumberOrZero(row.volume));
    parsed.push({
      date: formatIctDate(dt),
      hhmm: formatIctTime(dt),
      close,
      volume,
    });
  }
  parsed.sort((a, b) => a.date.localeCompare(b.date) || a.hhmm.localeCompare(b.hhmm));
  return parsed;
}

function filterLatestIntradayBars(
  bars: readonly ParsedOhlcvBar[],
  allowPreOpen: boolean,
): ParsedOhlcvBar[] {
  if (bars.length === 0) return [];
  const latestDate = bars.at(-1)!.date;
  const startTime = allowPreOpen ? '08:45' : '09:00';
  return bars.filter(
    (bar) =>
      bar.date === latestDate &&
      bar.hhmm >= startTime &&
      bar.hhmm <= '15:00' &&
      !isVietnamLunchMinute(bar.hhmm),
  );
}

function downsampleSparkline(values: readonly number[], maxPoints = 32): number[] {
  if (values.length <= maxPoints) return values.map((v) => roundTo(v, 2));
  const out: number[] = [];
  const step = (values.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.min(values.length - 1, Math.round(i * step));
    out.push(roundTo(values[idx]!, 2));
  }
  return out;
}

function parseDateValue(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  }
  const dt = parseUpstreamTimestamp(raw);
  return dt ? formatIctDate(dt) : null;
}

function buildIntradayPoints(
  bars: readonly ParsedOhlcvBar[],
  refPrice: number,
  isDaily: boolean,
): IndexChartData['selected']['points'] {
  const points: IndexChartData['selected']['points'] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const prevVal = i === 0 ? (refPrice > 0 ? refPrice : bar.close) : bars[i - 1]!.close;
    points.push({
      t: isDaily ? bar.date : bar.hhmm,
      v: roundTo(bar.close, 2),
      vol: Math.round(bar.volume),
      isUp: bar.close >= prevVal,
    });
  }
  return points;
}

function lookupCarryForward(
  series: ReadonlyMap<string, number>,
  sortedTimes: readonly string[],
  targetTime: string,
): number | null {
  const direct = series.get(targetTime);
  if (direct !== undefined) return direct;
  let last: number | null = null;
  for (const t of sortedTimes) {
    if (t > targetTime) break;
    const val = series.get(t);
    if (val !== undefined) last = val;
  }
  return last;
}

function isCompleteLiquidityCurve(sortedTimes: readonly string[]): boolean {
  const lastTime = sortedTimes.at(-1);
  return lastTime !== undefined && lastTime >= COMPLETE_LIQUIDITY_CURVE_MIN_TIME;
}

@Injectable()
export class IndexWidgetsService {
  constructor(
    private readonly vci: VciMarketProvider,
    private readonly vnd: VndMarketProvider,
    private readonly vietcapOverview: VietcapOverviewProvider,
    private readonly repository: MarketOverviewRepository,
    private readonly database: DatabaseService,
    private readonly tradingCalendar: VnTradingCalendarService,
  ) {}

  /** 1. Biểu đồ chỉ số (`index_chart`). */
  async getIndexChart(
    params: { index: IndexChartIndex; range: IndexChartRange },
    now: Date = new Date(),
  ): Promise<IndexChartData> {
    const nowSec = Math.floor(now.getTime() / 1_000);
    const intradayFromSec = unixSecondsDaysAgo(now, 6);
    const dailyFromSec = unixSecondsDaysAgo(now, params.range === '1y' ? 375 : 105);
    const todayIct = formatIctDate(now);
    const holidays = await this.tradingCalendar.getHolidays();

    const [marketIndexRes, frontFuturesRes, sparklineResults, selectedHistoryRes] =
      await Promise.all([
        this.vietcapOverview
          .marketIndex(['VNINDEX', 'VN30', 'HNXIndex', 'HNXUpcomIndex'])
          .catch(() => null),
        this.fetchActiveVn30FrontQuote(todayIct, holidays).catch(() => null),
        Promise.allSettled(
          INDEX_CARD_LIST.map((card) =>
            this.vnd.fetchOhlcv(
              card.vndSymbol,
              intradayFromSec,
              nowSec,
              card.code === params.index && params.range === 'intraday' ? '1m' : '5m',
            ),
          ),
        ),
        params.range === 'intraday'
          ? Promise.resolve(null)
          : this.fetchDailyIndexSeries(
              INDEX_CARD_LIST.find((c) => c.code === params.index)!,
              dailyFromSec,
              nowSec,
            ).catch(() => null),
      ]);

    const indexByVciSymbol = new Map<string, Record<string, unknown>>();
    if (marketIndexRes) {
      for (const row of asRecordArray(marketIndexRes.data)) {
        const sym = asString(row.symbol);
        if (sym) indexByVciSymbol.set(sym.toUpperCase(), row);
      }
    }

    const sparkBarsByCode = new Map<IndexChartIndex, ParsedOhlcvBar[]>();
    for (let i = 0; i < INDEX_CARD_LIST.length; i += 1) {
      const card = INDEX_CARD_LIST[i]!;
      const settled = sparklineResults[i];
      if (settled && settled.status === 'fulfilled') {
        sparkBarsByCode.set(card.code, parseOhlcvRows(settled.value.data));
      }
    }

    const hasAnyData =
      indexByVciSymbol.size > 0 ||
      frontFuturesRes !== null ||
      [...sparkBarsByCode.values()].some((bars) => bars.length > 0) ||
      (selectedHistoryRes !== null && selectedHistoryRes.length > 0);

    if (!hasAnyData) {
      throw new Error('All index data upstreams are unavailable');
    }

    const cards: IndexChartData['cards'] = INDEX_CARD_LIST.map((meta) => {
      const rawBars = sparkBarsByCode.get(meta.code) ?? [];
      const intradayBars = filterLatestIntradayBars(rawBars, meta.code === 'VN30F1M');
      const sparkline = downsampleSparkline(intradayBars.map((b) => b.close));

      let price = 0;
      let refPrice = 0;
      let change = 0;
      let changePct = 0;
      let volume = 0;
      let valueBillion = 0;

      if (meta.code === 'VN30F1M') {
        if (frontFuturesRes) {
          price = frontFuturesRes.price;
          refPrice = frontFuturesRes.refPrice;
          change = frontFuturesRes.change;
          changePct = frontFuturesRes.changePct;
          volume = frontFuturesRes.volume;
          valueBillion = frontFuturesRes.valueBillion;
        }
      } else if (meta.vciIndexSymbol) {
        const row = indexByVciSymbol.get(meta.vciIndexSymbol.toUpperCase());
        if (row) {
          price = toNumberOrZero(row.price);
          refPrice = toNumberOrZero(row.ref_price);
          change = toFiniteNumber(row.change) ?? (refPrice > 0 ? price - refPrice : 0);
          changePct =
            toFiniteNumber(row.change_percent) ??
            (refPrice > 0 ? ((price - refPrice) / refPrice) * 100 : 0);
          volume = toNumberOrZero(row.total_shares);
          valueBillion = toNumberOrZero(row.total_value_million_vnd) / 1_000;
        }
      }

      // Derive fallback quote from OHLCV bars when live snapshot is missing.
      if (price <= 0 && intradayBars.length > 0) {
        const latestDate = intradayBars.at(-1)!.date;
        price = intradayBars.at(-1)!.close;
        const priorDayBars = rawBars.filter((b) => b.date < latestDate);
        refPrice = priorDayBars.at(-1)?.close ?? intradayBars[0]!.close;
        change = price - refPrice;
        changePct = refPrice > 0 ? (change / refPrice) * 100 : 0;
        if (volume <= 0) {
          volume = intradayBars.reduce((acc, b) => acc + b.volume, 0);
        }
      }

      return {
        code: meta.code,
        name: meta.name,
        price: roundTo(price, 2),
        refPrice: roundTo(refPrice, 2),
        change: roundTo(change, 2),
        changePct: roundTo(changePct, 2),
        volume: Math.round(volume),
        valueBillion: roundTo(valueBillion, 2),
        sparkline,
      };
    });

    const selectedCard = cards.find((card) => card.code === params.index) ?? cards[0]!;
    const selectedPoints =
      params.range === 'intraday'
        ? buildIntradayPoints(
            filterLatestIntradayBars(
              sparkBarsByCode.get(params.index) ?? [],
              params.index === 'VN30F1M',
            ),
            selectedCard.refPrice,
            false,
          )
        : buildIntradayPoints(selectedHistoryRes ?? [], selectedCard.refPrice, true);

    return {
      cards,
      selected: {
        code: selectedCard.code,
        name: selectedCard.name,
        price: selectedCard.price,
        refPrice: selectedCard.refPrice,
        change: selectedCard.change,
        changePct: selectedCard.changePct,
        volume: selectedCard.volume,
        valueBillion: selectedCard.valueBillion,
        range: params.range,
        points: selectedPoints,
      },
    };
  }

  /** 2. Độ rộng thị trường (`market_breadth`), equity-only across HOSE / HNX / UPCoM. */
  async getMarketBreadth(): Promise<MarketBreadthData> {
    const exchanges = ['HOSE', 'HNX', 'UPCOM'] as const;
    const [hoseRes, hnxRes, upcomRes, marketIndexRes, nonEquitySet] = await Promise.all([
      this.vietcapOverview.heatmap('HOSE', 'icb_code_2', 'MKC').catch(() => null),
      this.vietcapOverview.heatmap('HNX', 'icb_code_2', 'MKC').catch(() => null),
      this.vietcapOverview.heatmap('UPCOM', 'icb_code_2', 'MKC').catch(() => null),
      this.vietcapOverview.marketIndex(['VNINDEX', 'HNXIndex', 'HNXUpcomIndex']).catch(() => null),
      this.loadNonEquitySymbols().catch(() => new Set<string>()),
    ]);

    const heatmaps: Record<(typeof exchanges)[number], unknown> = {
      HOSE: hoseRes?.data ?? null,
      HNX: hnxRes?.data ?? null,
      UPCOM: upcomRes?.data ?? null,
    };

    const indexMap = new Map<string, Record<string, unknown>>();
    if (marketIndexRes) {
      for (const row of asRecordArray(marketIndexRes.data)) {
        const sym = asString(row.symbol).toUpperCase();
        if (sym === 'VNINDEX') indexMap.set('HOSE', row);
        else if (sym === 'HNXINDEX') indexMap.set('HNX', row);
        else if (sym === 'HNXUPCOMINDEX') indexMap.set('UPCOM', row);
      }
    }

    if (!hoseRes && !hnxRes && !upcomRes && !marketIndexRes) {
      throw new Error('Market breadth upstreams are unavailable');
    }

    const rows: MarketBreadthData['exchanges'] = exchanges.map((exchange) => {
      const fromHeatmap = this.computeEquityBreadthFromHeatmap(heatmaps[exchange], nonEquitySet);
      if (fromHeatmap && fromHeatmap.total > 0) {
        return { exchange, ...fromHeatmap };
      }

      const fallback = indexMap.get(exchange);
      if (fallback) {
        const rawInc = Math.max(0, Math.round(toNumberOrZero(fallback.total_stock_increase)));
        const rawDec = Math.max(0, Math.round(toNumberOrZero(fallback.total_stock_decline)));
        const unchanged = Math.max(0, Math.round(toNumberOrZero(fallback.total_stock_no_change)));
        const ceiling = Math.max(0, Math.round(toNumberOrZero(fallback.total_stock_ceiling)));
        const floor = Math.max(0, Math.round(toNumberOrZero(fallback.total_stock_floor)));

        const advancing = Math.max(0, rawInc - ceiling);
        const declining = Math.max(0, rawDec - floor);
        const advancingTotal = ceiling + advancing;
        const decliningTotal = floor + declining;
        const total = advancingTotal + unchanged + decliningTotal;

        return {
          exchange,
          ceiling,
          advancing,
          unchanged,
          declining,
          floor,
          total,
          advancingTotal,
          decliningTotal,
        };
      }

      return {
        exchange,
        ceiling: 0,
        advancing: 0,
        unchanged: 0,
        declining: 0,
        floor: 0,
        total: 0,
        advancingTotal: 0,
        decliningTotal: 0,
      };
    });

    return { exchanges: rows };
  }

  /** 3. Thanh khoản thị trường (`market_liquidity`) — HOSE matched cumulative value. */
  async getMarketLiquidity(now: Date = new Date()): Promise<MarketLiquidityData> {
    const nowSec = Math.floor(now.getTime() / 1_000);
    const holidays = await this.tradingCalendar.getHolidays();
    const sessionDate = resolveSessionDate(now, holidays);

    const [minuteRes, dailyRes, historyRows] = await Promise.all([
      this.vietcapOverview
        .liquidity({
          symbols: 'VNINDEX',
          timeFrame: 'ONE_MINUTE',
          from: unixSecondsDaysAgo(now, 7),
          to: nowSec,
        })
        .catch(() => null),
      this.vietcapOverview
        .liquidity({
          symbols: 'VNINDEX',
          timeFrame: 'ONE_DAY',
          from: unixSecondsDaysAgo(now, 45),
          to: nowSec,
        })
        .catch(() => null),
      this.loadRecentLiquidityHistorySafe('HOSE', sessionDate, 30),
    ]);

    const curvesByDate = this.extractLiquidityCurvesByDate(minuteRes?.data);
    const sortedDates = [...curvesByDate.keys()].sort();

    if (sortedDates.length === 0 && historyRows.length === 0) {
      throw new Error('Market liquidity upstream is unavailable');
    }

    const latestDate = sortedDates.at(-1) ?? historyRows[0]?.sessionDate ?? sessionDate;
    const todayCurve = curvesByDate.get(latestDate) ?? new Map<string, number>();

    let prevDate = sortedDates.length >= 2 ? sortedDates[sortedDates.length - 2]! : null;
    let prevCurve: Map<string, number> = prevDate
      ? (curvesByDate.get(prevDate) ?? new Map<string, number>())
      : new Map<string, number>();

    if (prevCurve.size === 0) {
      const dbPrev =
        historyRows.find(
          (row) =>
            row.sessionDate < latestDate &&
            row.points.length > 0 &&
            isCompleteLiquidityCurve(row.points.map((p) => p.t).sort()),
        ) ?? historyRows.find((row) => row.sessionDate < latestDate && row.points.length > 0);
      if (dbPrev) {
        prevDate = dbPrev.sessionDate;
        prevCurve = new Map(dbPrev.points.map((p) => [p.t, p.v]));
      }
    }

    // Persist complete session curves best-effort to grow the 20-session DB history.
    this.persistLiquidityCurvesAsync(latestDate, todayCurve, prevDate, prevCurve, historyRows);

    // Combine prior DB curves + any earlier minute curves from VCI (excluding latestDate).
    const historicalCurves = new Map<string, Map<string, number>>();
    for (const row of historyRows) {
      if (row.sessionDate < latestDate && row.points.length > 0) {
        historicalCurves.set(row.sessionDate, new Map(row.points.map((p) => [p.t, p.v])));
      }
    }
    for (const date of sortedDates) {
      if (date < latestDate && !historicalCurves.has(date)) {
        const curve = curvesByDate.get(date);
        if (curve && curve.size > 0) historicalCurves.set(date, curve);
      }
    }

    const completeHistoricalList = [...historicalCurves.entries()]
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([, curve]) => {
        const sorted = [...curve.keys()].sort();
        return { curve, sorted, isComplete: isCompleteLiquidityCurve(sorted) };
      })
      .filter((item) => item.isComplete)
      .slice(0, 20);

    const avg20EodBillion = this.computeAvg20DailyBillion(dailyRes?.data, latestDate);

    // Collect unified timeline of trading minutes (skipping lunch break).
    const timeSet = new Set<string>();
    for (const t of todayCurve.keys()) timeSet.add(t);
    for (const t of prevCurve.keys()) timeSet.add(t);
    for (const item of completeHistoricalList) {
      for (const t of item.sorted) timeSet.add(t);
    }
    if (timeSet.size === 0) {
      for (const t of ['09:15', '10:00', '11:00', '11:30', '13:30', '14:00', '14:45']) {
        timeSet.add(t);
      }
    }

    const sortedTimes = [...timeSet]
      .filter((t) => t >= '09:00' && t <= '15:00' && !isVietnamLunchMinute(t))
      .sort();

    const todayTimes = [...todayCurve.keys()].sort();
    const latestTodayTime = todayTimes.at(-1) ?? null;
    const prevTimes = [...prevCurve.keys()].sort();
    const prevEndVal = prevTimes.length > 0 ? (prevCurve.get(prevTimes.at(-1)!) ?? 0) : 0;

    const useEmpiricalAvg20 = completeHistoricalList.length >= 10;
    const effectiveAvg20Eod =
      avg20EodBillion ??
      (completeHistoricalList.length > 0
        ? completeHistoricalList.reduce(
            (acc, item) => acc + (item.curve.get(item.sorted.at(-1)!) ?? 0),
            0,
          ) / completeHistoricalList.length
        : prevEndVal > 0
          ? prevEndVal
          : null);

    const points: MarketLiquidityData['points'] = sortedTimes.map((t) => {
      const todayVal =
        latestTodayTime !== null && t <= latestTodayTime
          ? lookupCarryForward(todayCurve, todayTimes, t)
          : null;
      const prevVal = prevTimes.length > 0 ? lookupCarryForward(prevCurve, prevTimes, t) : null;

      let avg20Val: number | null = null;
      if (useEmpiricalAvg20) {
        let sum = 0;
        let count = 0;
        for (const hist of completeHistoricalList) {
          const val = lookupCarryForward(hist.curve, hist.sorted, t);
          if (val !== null) {
            sum += val;
            count += 1;
          }
        }
        if (count > 0) avg20Val = sum / count;
      } else if (effectiveAvg20Eod !== null && effectiveAvg20Eod > 0) {
        const stdFrac = standardIntradayLiquidityFraction(t);
        const shapeFrac =
          prevVal !== null && prevEndVal > 0
            ? 0.5 * Math.min(1, prevVal / prevEndVal) + 0.5 * stdFrac
            : stdFrac;
        avg20Val = effectiveAvg20Eod * shapeFrac;
      }

      return {
        t,
        today: todayVal !== null ? roundTo(todayVal, 2) : null,
        prev: prevVal !== null ? roundTo(prevVal, 2) : null,
        avg20: avg20Val !== null ? roundTo(avg20Val, 2) : null,
      };
    });

    const latestPointWithToday = [...points].reverse().find((p) => p.today !== null) ?? null;
    const currentValueBillion = latestPointWithToday?.today ?? 0;
    const prevSameTime = latestPointWithToday?.prev ?? null;
    const avg20SameTime = latestPointWithToday?.avg20 ?? null;

    const pctVsPrevSameTime =
      prevSameTime !== null && prevSameTime > 0
        ? roundTo((currentValueBillion / prevSameTime) * 100, 1)
        : null;
    const pctVsAvg20SameTime =
      avg20SameTime !== null && avg20SameTime > 0
        ? roundTo((currentValueBillion / avg20SameTime) * 100, 1)
        : null;

    return {
      exchange: 'HOSE',
      currentValueBillion: roundTo(currentValueBillion, 2),
      pctVsPrevSameTime,
      pctVsAvg20SameTime,
      points,
    };
  }

  /** 4. Khối ngoại và tự doanh (`foreign_flow`). */
  async getForeignFlow(
    params: { exchange: ForeignFlowExchange; tab: ForeignFlowTab },
    now: Date = new Date(),
  ): Promise<ForeignFlowData> {
    if (params.tab === 'prop') {
      return this.getProprietaryFlow(params.exchange);
    }

    const nowSec = Math.floor(now.getTime() / 1_000);
    const fromSec = unixSecondsDaysAgo(now, 45);

    const [seriesRes, topRes] = await Promise.all([
      this.vietcapOverview
        .foreign({
          group: params.exchange,
          timeFrame: 'ONE_DAY',
          from: fromSec,
          to: nowSec,
        })
        .catch(() => null),
      this.vietcapOverview
        .foreignTop({
          group: params.exchange,
          timeFrame: 'ONE_DAY',
        })
        .catch(() => null),
    ]);

    if (!seriesRes && !topRes) {
      throw new Error(`Foreign flow upstreams unavailable for ${params.exchange}`);
    }

    const sessions: ForeignFlowData['sessions'] = [];
    for (const row of asRecordArray(seriesRes?.data)) {
      const date = parseDateValue(row.trading_date ?? row.trunc_time);
      if (!date) continue;
      const buyBillion = roundTo(toNumberOrZero(row.foreign_buy_value_vnd) / 1e9, 2);
      const sellBillion = roundTo(toNumberOrZero(row.foreign_sell_value_vnd) / 1e9, 2);
      const netBillion = roundTo(buyBillion - sellBillion, 2);
      sessions.push({ date, buyBillion, sellBillion, netBillion });
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date));
    const recent20 = sessions.slice(-20);

    const latest = recent20.at(-1);
    const topData = isRecordObject(topRes?.data) ? topRes.data : {};

    const topBuy = asRecordArray(topData.net_buy)
      .map((row) => ({
        symbol: asString(row.symbol).toUpperCase(),
        netBillion: roundTo(Math.abs(toNumberOrZero(row.net_value_vnd)) / 1e9, 2),
      }))
      .filter((item) => item.symbol.length > 0 && item.netBillion > 0)
      .sort((a, b) => b.netBillion - a.netBillion)
      .slice(0, 3);

    const topSell = asRecordArray(topData.net_sell)
      .map((row) => ({
        symbol: asString(row.symbol).toUpperCase(),
        netBillion: roundTo(-Math.abs(toNumberOrZero(row.net_value_vnd)) / 1e9, 2),
      }))
      .filter((item) => item.symbol.length > 0 && item.netBillion < 0)
      .sort((a, b) => a.netBillion - b.netBillion)
      .slice(0, 3);

    return {
      exchange: params.exchange,
      tab: 'foreign',
      propSupported: params.exchange === 'HOSE',
      netBillion: latest?.netBillion ?? 0,
      buyBillion: latest?.buyBillion ?? 0,
      sellBillion: latest?.sellBillion ?? 0,
      sessions: recent20,
      topBuy,
      topSell,
    };
  }

  /** 5. Tác động lên VN-Index (`vnindex_impact`). */
  async getVnIndexImpact(): Promise<VnindexImpactData> {
    const [indexRes, heatmapRes, impactRes, nonEquitySet] = await Promise.all([
      this.vietcapOverview.marketIndex(['VNINDEX']).catch(() => null),
      this.vietcapOverview.heatmap('HOSE', 'icb_code_2', 'MKC').catch(() => null),
      this.vietcapOverview.indexImpact('HOSE', 'ONE_DAY').catch(() => null),
      this.loadNonEquitySymbols().catch(() => new Set<string>()),
    ]);

    if (!indexRes && !heatmapRes && !impactRes) {
      throw new Error('VN-Index impact upstreams are unavailable');
    }

    const vnIndexRow = asRecordArray(indexRes?.data).find(
      (r) => asString(r.symbol).toUpperCase() === 'VNINDEX',
    );
    const vnIndexNow = toNumberOrZero(vnIndexRow?.price);
    const vnIndexRef = toNumberOrZero(vnIndexRow?.ref_price);
    const vnIndexChange =
      toFiniteNumber(vnIndexRow?.change) ?? (vnIndexRef > 0 ? vnIndexNow - vnIndexRef : 0);

    const equities: HoseEquityImpactInput[] = [];
    for (const sector of asRecordArray(heatmapRes?.data)) {
      for (const stock of asRecordArray(sector.stocks)) {
        const symbol = asString(stock.symbol).toUpperCase();
        if (!symbol || nonEquitySet.has(symbol) || isLikelyNonEquityTicker(symbol)) continue;
        const rawRef = toNumberOrZero(stock.ref_price);
        const rawPrice = toNumberOrZero(stock.price);
        const marketCapVnd = toNumberOrZero(stock.market_cap_vnd);
        if (rawRef <= 0 || marketCapVnd <= 0) continue;
        equities.push({
          symbol,
          price: vciPriceToThousands(rawPrice > 0 ? rawPrice : rawRef),
          refPrice: vciPriceToThousands(rawRef),
          marketCapVnd,
        });
      }
    }

    const vciContributors: VciImpactContributor[] = [];
    const impactData = isRecordObject(impactRes?.data) ? impactRes.data : {};
    for (const row of [
      ...asRecordArray(impactData.top_up),
      ...asRecordArray(impactData.top_down),
    ]) {
      const symbol = asString(row.symbol).toUpperCase();
      const impact = toFiniteNumber(row.impact);
      if (!symbol || impact === null || nonEquitySet.has(symbol) || isLikelyNonEquityTicker(symbol))
        continue;
      const rawMatch = toFiniteNumber(row.match_price);
      const rawRef = toFiniteNumber(row.ref_price);
      vciContributors.push({
        symbol,
        impact,
        matchPrice: rawMatch !== null && rawMatch > 0 ? vciPriceToThousands(rawMatch) : null,
        refPrice: rawRef !== null && rawRef > 0 ? vciPriceToThousands(rawRef) : null,
      });
    }

    return computeVnIndexImpact({
      equities,
      vnIndexRef,
      vnIndexNow,
      vnIndexChange,
      vciContributors,
      limit: 8,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async getProprietaryFlow(exchange: ForeignFlowExchange): Promise<ForeignFlowData> {
    const candidates = exchange === 'HOSE' ? ['HOSE', 'HSX'] : [exchange];

    let seriesRows: Record<string, unknown>[] = [];
    let topPayload: Record<string, unknown> = {};
    let hadSuccess = false;

    for (const market of candidates) {
      const [seriesRes, topRes] = await Promise.all([
        this.vietcapOverview.proprietary(market, 'ONE_MONTH').catch(() => null),
        this.vietcapOverview.proprietaryTop(market, 'ONE_DAY').catch(() => null),
      ]);
      if (seriesRes) {
        hadSuccess = true;
        const rows = asRecordArray(seriesRes.data);
        if (rows.length > 0) {
          seriesRows = rows;
          if (topRes && isRecordObject(topRes.data)) {
            topPayload = topRes.data;
          }
          break;
        }
      }
      if (topRes && isRecordObject(topRes.data) && Object.keys(topPayload).length === 0) {
        hadSuccess = true;
        topPayload = topRes.data;
      }
    }

    // HNX & UPCoM often do not publish proprietary data -> clean unsupported payload.
    if (seriesRows.length === 0 && exchange !== 'HOSE') {
      return {
        exchange,
        tab: 'prop',
        propSupported: false,
        netBillion: 0,
        buyBillion: 0,
        sellBillion: 0,
        sessions: [],
        topBuy: [],
        topSell: [],
      };
    }

    if (!hadSuccess && exchange === 'HOSE') {
      throw new Error('Proprietary trading upstream is unavailable for HOSE');
    }

    const sessionByDate = new Map<string, ForeignFlowData['sessions'][number]>();
    for (const row of seriesRows) {
      const date = parseDateValue(row.trading_date);
      if (!date) continue;
      const buyBillion = roundTo(toNumberOrZero(row.total_buy_value_vnd) / 1e9, 2);
      const sellBillion = roundTo(toNumberOrZero(row.total_sell_value_vnd) / 1e9, 2);
      const netBillion = roundTo(buyBillion - sellBillion, 2);
      sessionByDate.set(date, { date, buyBillion, sellBillion, netBillion });
    }
    const sessions = [...sessionByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const recent20 = sessions.slice(-20);
    const latest = recent20.at(-1);

    const topBuy = asRecordArray(topPayload.buy)
      .map((row) => ({
        symbol: asString(row.ticker ?? row.symbol).toUpperCase(),
        netBillion: roundTo(Math.abs(toNumberOrZero(row.total_value_vnd)) / 1e9, 2),
      }))
      .filter((item) => item.symbol.length > 0 && item.netBillion > 0)
      .sort((a, b) => b.netBillion - a.netBillion)
      .slice(0, 3);

    const topSell = asRecordArray(topPayload.sell)
      .map((row) => ({
        symbol: asString(row.ticker ?? row.symbol).toUpperCase(),
        netBillion: roundTo(-Math.abs(toNumberOrZero(row.total_value_vnd)) / 1e9, 2),
      }))
      .filter((item) => item.symbol.length > 0 && item.netBillion < 0)
      .sort((a, b) => a.netBillion - b.netBillion)
      .slice(0, 3);

    return {
      exchange,
      tab: 'prop',
      propSupported: true,
      netBillion: latest?.netBillion ?? 0,
      buyBillion: latest?.buyBillion ?? 0,
      sellBillion: latest?.sellBillion ?? 0,
      sessions: recent20,
      topBuy,
      topSell,
    };
  }

  private async fetchActiveVn30FrontQuote(
    todayIct: string,
    holidays: ReadonlySet<string>,
  ): Promise<{
    price: number;
    refPrice: number;
    change: number;
    changePct: number;
    volume: number;
    valueBillion: number;
  } | null> {
    const groupRes = await this.vci.fetchGroupSymbols('FU_INDEX');
    const codes = groupRes.data
      .map((row) => asString(row.symbol).toUpperCase())
      .filter((code) => code.length > 0);
    const classified = classifyFuturesSlots(codes, todayIct, holidays);
    const front = classified.bySlot['VN30F1M'] ?? classified.vn30[0];
    if (!front) return null;

    const boardRes = await this.vci.fetchPriceBoard([front.code]);
    const row = boardRes.data[0];
    if (!row) return null;

    const refPrice = toNumberOrZero(row.reference_price);
    const closePrice = toFiniteNumber(row.close_price);
    const price = closePrice !== null && closePrice > 0 ? closePrice : refPrice;
    const change = refPrice > 0 ? price - refPrice : 0;
    const changePct = refPrice > 0 ? (change / refPrice) * 100 : 0;
    const volume = toNumberOrZero(row.total_volume);
    const rawTotalVal = toNumberOrZero(row.total_value);
    const valueBillion = rawTotalVal > 0 ? rawTotalVal / 1e9 : (price * 100_000 * volume) / 1e9;

    return { price, refPrice, change, changePct, volume, valueBillion };
  }

  private async fetchDailyIndexSeries(
    meta: IndexCardMeta,
    fromSec: number,
    toSec: number,
  ): Promise<ParsedOhlcvBar[]> {
    try {
      const vndRes = await this.vnd.fetchOhlcv(meta.vndSymbol, fromSec, toSec, '1D');
      const parsed = parseOhlcvRows(vndRes.data);
      if (parsed.length > 0) return parsed;
    } catch {
      // Fall back to VCI daily chart below.
    }
    const vciRes = await this.vci.fetchOhlcv(meta.vciChartSymbol, fromSec, toSec, '1D');
    return parseOhlcvRows(vciRes.data);
  }

  private async loadNonEquitySymbols(): Promise<Set<string>> {
    if (!this.database.isConfigured()) return new Set<string>();
    const rows = await this.database.query<{ symbol: string }>(
      `SELECT upper(symbol) AS symbol
         FROM symbols
        WHERE is_active = true
          AND (coalesce(is_index, false) = true OR lower(coalesce(asset_type, 'stock')) <> 'stock')`,
    );
    return new Set(rows.map((r) => r.symbol));
  }

  private computeEquityBreadthFromHeatmap(
    rawHeatmap: unknown,
    nonEquitySet: ReadonlySet<string>,
  ): Omit<MarketBreadthData['exchanges'][number], 'exchange'> | null {
    const sectors = asRecordArray(rawHeatmap);
    if (sectors.length === 0) return null;

    const seen = new Set<string>();
    let ceiling = 0;
    let advancing = 0;
    let unchanged = 0;
    let declining = 0;
    let floor = 0;

    for (const sector of sectors) {
      for (const stock of asRecordArray(sector.stocks)) {
        const symbol = asString(stock.symbol).toUpperCase();
        if (!symbol || seen.has(symbol)) continue;
        if (nonEquitySet.has(symbol) || isLikelyNonEquityTicker(symbol)) continue;
        seen.add(symbol);

        const ref = toNumberOrZero(stock.ref_price);
        const price = toNumberOrZero(stock.price);
        const ceil = toNumberOrZero(stock.ceiling_price);
        const flr = toNumberOrZero(stock.floor_price);

        if (ref <= 0 || price <= 0 || Math.abs(price - ref) < 1e-6) {
          unchanged += 1;
        } else if (ceil > 0 && price >= ceil) {
          ceiling += 1;
        } else if (flr > 0 && price <= flr) {
          floor += 1;
        } else if (price > ref) {
          advancing += 1;
        } else {
          declining += 1;
        }
      }
    }

    const advancingTotal = ceiling + advancing;
    const decliningTotal = floor + declining;
    const total = advancingTotal + unchanged + decliningTotal;
    return {
      ceiling,
      advancing,
      unchanged,
      declining,
      floor,
      total,
      advancingTotal,
      decliningTotal,
    };
  }

  private extractLiquidityCurvesByDate(raw: unknown): Map<string, Map<string, number>> {
    const curves = new Map<string, Map<string, number>>();
    const first = asRecordArray(raw)[0];
    if (!first) return curves;

    const timestamps = Array.isArray(first.timestamps) ? first.timestamps : [];
    const values = Array.isArray(first.accumulated_value_million_vnd)
      ? first.accumulated_value_million_vnd
      : [];
    const len = Math.min(timestamps.length, values.length);

    for (let i = 0; i < len; i += 1) {
      const dt = parseUpstreamTimestamp(timestamps[i]);
      const valMillion = toFiniteNumber(values[i]);
      if (!dt || valMillion === null || valMillion < 0) continue;
      const dateStr = formatIctDate(dt);
      const hhmm = formatIctTime(dt);
      if (hhmm < '09:00' || hhmm > '15:00' || isVietnamLunchMinute(hhmm)) continue;

      let dayMap = curves.get(dateStr);
      if (!dayMap) {
        dayMap = new Map<string, number>();
        curves.set(dateStr, dayMap);
      }
      const valBillion = valMillion / 1_000;
      const existing = dayMap.get(hhmm) ?? 0;
      if (valBillion >= existing) {
        dayMap.set(hhmm, valBillion);
      }
    }
    return curves;
  }

  private computeAvg20DailyBillion(raw: unknown, excludeDate: string): number | null {
    const first = asRecordArray(raw)[0];
    if (!first) return null;
    const timestamps = Array.isArray(first.timestamps) ? first.timestamps : [];
    const values = Array.isArray(first.accumulated_value_million_vnd)
      ? first.accumulated_value_million_vnd
      : [];
    const len = Math.min(timestamps.length, values.length);

    const dailyVals: Array<{ date: string; valBillion: number }> = [];
    for (let i = 0; i < len; i += 1) {
      const dt = parseUpstreamTimestamp(timestamps[i]);
      const valMillion = toFiniteNumber(values[i]);
      if (!dt || valMillion === null || valMillion <= 0) continue;
      const dateStr = formatIctDate(dt);
      if (dateStr >= excludeDate) continue;
      dailyVals.push({ date: dateStr, valBillion: valMillion / 1_000 });
    }
    if (dailyVals.length === 0) return null;
    dailyVals.sort((a, b) => a.date.localeCompare(b.date));
    const window = dailyVals.slice(-20);
    const sum = window.reduce((acc, item) => acc + item.valBillion, 0);
    return sum / window.length;
  }

  private async loadRecentLiquidityHistorySafe(
    exchange: string,
    beforeSessionDate: string,
    limit: number,
  ): Promise<StoredLiquidityHistory[]> {
    try {
      if (!this.database.isConfigured()) return [];
      return await this.repository.getRecentLiquidityHistory(exchange, beforeSessionDate, limit);
    } catch {
      return [];
    }
  }

  private persistLiquidityCurvesAsync(
    latestDate: string,
    todayCurve: ReadonlyMap<string, number>,
    prevDate: string | null,
    prevCurve: ReadonlyMap<string, number>,
    existingHistory: readonly StoredLiquidityHistory[],
  ): void {
    if (!this.database.isConfigured()) return;
    const toPoints = (curve: ReadonlyMap<string, number>): LiquidityHistoryPoint[] =>
      [...curve.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([t, v]) => ({ t, v: roundTo(v, 2) }));

    const todayTimes = [...todayCurve.keys()].sort();
    if (todayCurve.size >= 5 && isCompleteLiquidityCurve(todayTimes)) {
      void this.repository
        .upsertLiquidityHistory(latestDate, 'HOSE', toPoints(todayCurve))
        .catch(() => undefined);
    }
    const prevTimes = [...prevCurve.keys()].sort();
    if (prevDate && prevCurve.size >= 5 && isCompleteLiquidityCurve(prevTimes)) {
      const storedPrev = existingHistory.find((h) => h.sessionDate === prevDate);
      const storedPrevComplete = storedPrev
        ? isCompleteLiquidityCurve(storedPrev.points.map((p) => p.t).sort())
        : false;
      if (!storedPrev || !storedPrevComplete || storedPrev.points.length < prevCurve.size) {
        void this.repository
          .upsertLiquidityHistory(prevDate, 'HOSE', toPoints(prevCurve))
          .catch(() => undefined);
      }
    }
  }
}
