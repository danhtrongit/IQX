/**
 * Derivatives group widget aggregators (3 widgets):
 *  10. `derivatives_summary` — Tổng quan phái sinh
 *  11. `vn30f_vs_vn30`       — VN30F1M so với VN30
 *  12. `futures_table`       — Bảng hợp đồng tương lai
 */
import { Injectable } from '@nestjs/common';

import { VciMarketProvider } from '../../market-data/providers/vci.provider.js';
import { VndMarketProvider } from '../../market-data/providers/vnd.provider.js';
import { VietcapOverviewProvider } from '../../market-extended/vietcap-overview.provider.js';
import type { Vn30fVsVn30Range } from '../market-overview.catalog.js';
import type {
  DerivativesSummaryData,
  FuturesTableData,
  Vn30fVsVn30Data,
} from '../market-overview.schemas.js';
import {
  classifyFuturesSlots,
  computeExpiryDate,
  countRemainingTradingSessions,
  type ClassifiedFuturesSlot,
} from './derivatives-calendar.js';
import {
  asRecordArray,
  asString,
  formatIctDate,
  formatIctTime,
  isVietnamLunchMinute,
  parseUpstreamTimestamp,
  roundTo,
  toFiniteNumber,
  toNumberOrZero,
  unixSecondsDaysAgo,
} from './market-overview.helpers.js';
import { VnTradingCalendarService } from './vn-trading-calendar.service.js';

interface SpotQuote {
  price: number;
  refPrice: number;
  change: number;
  changePct: number;
}

interface ParsedFuturesQuote {
  price: number | null;
  refPrice: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  valueBillion: number | null;
  foreignNetContracts: number | null;
  foreignNetBillion: number | null;
}

const CONTRACT_MULTIPLIER_VND = 100_000;

@Injectable()
export class DerivativesWidgetsService {
  constructor(
    private readonly vci: VciMarketProvider,
    private readonly vnd: VndMarketProvider,
    private readonly vietcapOverview: VietcapOverviewProvider,
    private readonly tradingCalendar: VnTradingCalendarService,
  ) {}

  /** 10. Tổng quan phái sinh (`derivatives_summary`). */
  async getDerivativesSummary(now: Date = new Date()): Promise<DerivativesSummaryData> {
    const todayIct = formatIctDate(now);
    const holidays = await this.loadHolidays();

    const [groupRes, spotRes] = await Promise.all([
      this.vci.fetchGroupSymbols('FU_INDEX').catch(() => null),
      this.loadSpotQuotes(['VN30'], now).catch(() => new Map<string, SpotQuote>()),
    ]);

    const rawCodes = (groupRes?.data ?? [])
      .map((r) => asString(r.symbol).toUpperCase())
      .filter((s) => s.length > 0);
    const classified = classifyFuturesSlots(rawCodes, todayIct, holidays);
    const front = classified.bySlot['VN30F1M'] ?? classified.vn30[0] ?? null;

    const vn30Spot = spotRes.get('VN30') ?? null;
    let frontQuote: ParsedFuturesQuote | null = null;

    if (front) {
      const boardRes = await this.vci.fetchPriceBoard([front.code]).catch(() => null);
      const row = boardRes?.data[0];
      if (row) {
        frontQuote = this.parseFuturesPriceBoardRow(row);
      }
    }

    if (!frontQuote && !vn30Spot && rawCodes.length === 0) {
      throw new Error('Derivatives summary upstreams are unavailable');
    }

    const fallbackExpiry = this.computeNextFrontExpiry(todayIct, holidays);
    const expiryDate = front?.expiryDate ?? fallbackExpiry;
    const remainingSessions =
      front?.remainingSessions ?? countRemainingTradingSessions(todayIct, expiryDate, holidays);

    const price = frontQuote?.price ?? null;
    const vn30Price = vn30Spot?.price ?? null;
    const basis = price !== null && vn30Price !== null ? roundTo(price - vn30Price, 2) : null;

    return {
      contract: front?.code ?? 'VN30F1M',
      price,
      refPrice: frontQuote?.refPrice ?? null,
      change: frontQuote?.change ?? null,
      changePct: frontQuote?.changePct ?? null,
      vn30Price: vn30Spot ? roundTo(vn30Spot.price, 2) : null,
      vn30Change: vn30Spot ? roundTo(vn30Spot.change, 2) : null,
      vn30ChangePct: vn30Spot ? roundTo(vn30Spot.changePct, 2) : null,
      basis,
      volume: frontQuote?.volume ?? null,
      valueBillion: frontQuote?.valueBillion ?? null,
      foreignNetContracts: frontQuote?.foreignNetContracts ?? null,
      expiryDate,
      remainingSessions,
    };
  }

  /** 11. VN30F1M so với VN30 (`vn30f_vs_vn30`). */
  async getVn30fVsVn30(
    params: { range: Vn30fVsVn30Range },
    now: Date = new Date(),
  ): Promise<Vn30fVsVn30Data> {
    const nowSec = Math.floor(now.getTime() / 1_000);
    const isIntraday = params.range === 'intraday';
    const interval = isIntraday ? '1m' : '1D';
    const fromSec = unixSecondsDaysAgo(
      now,
      params.range === 'intraday' ? 6 : params.range === '1m' ? 35 : 100,
    );

    const [futuresRes, spotRes] = await Promise.allSettled([
      this.vnd.fetchOhlcv('VN30F1M', fromSec, nowSec, interval),
      this.fetchSpotOhlcv('VN30', fromSec, nowSec, interval),
    ]);

    const futuresBars =
      futuresRes.status === 'fulfilled' ? this.parseChartBars(futuresRes.value.data) : [];
    const spotBars = spotRes.status === 'fulfilled' ? this.parseChartBars(spotRes.value) : [];

    if (futuresBars.length === 0 && spotBars.length === 0) {
      throw new Error('VN30F vs VN30 chart upstreams are unavailable');
    }

    const points: Vn30fVsVn30Data['points'] = isIntraday
      ? this.alignIntradaySeries(futuresBars, spotBars)
      : this.alignDailySeries(futuresBars, spotBars);

    const latestVn30 = [...points].reverse().find((p) => p.vn30 !== null)?.vn30 ?? null;
    const latestVn30f = [...points].reverse().find((p) => p.vn30f !== null)?.vn30f ?? null;
    const latestBasis =
      latestVn30 !== null && latestVn30f !== null ? roundTo(latestVn30f - latestVn30, 2) : null;

    return {
      range: params.range,
      latestVn30,
      latestVn30f,
      latestBasis,
      points,
    };
  }

  /** 12. Bảng hợp đồng tương lai (`futures_table`) — VN30 & VN100 groups. */
  async getFuturesTable(now: Date = new Date()): Promise<FuturesTableData> {
    const todayIct = formatIctDate(now);
    const holidays = await this.loadHolidays();

    const [groupRes, spotMap] = await Promise.all([
      this.vci.fetchGroupSymbols('FU_INDEX').catch(() => null),
      this.loadSpotQuotes(['VN30', 'VN100'], now).catch(() => new Map<string, SpotQuote>()),
    ]);

    const rawCodes = (groupRes?.data ?? [])
      .map((r) => asString(r.symbol).toUpperCase())
      .filter((s) => s.length > 0);
    const classified = classifyFuturesSlots(rawCodes, todayIct, holidays);

    const activeCodes = classified.all.map((slot) => slot.code);
    const quotesByCode = new Map<string, ParsedFuturesQuote>();

    if (activeCodes.length > 0) {
      const boardRes = await this.vci.fetchPriceBoard(activeCodes).catch(() => null);
      for (const row of boardRes?.data ?? []) {
        const sym = asString(row.symbol).toUpperCase();
        if (sym) {
          quotesByCode.set(sym, this.parseFuturesPriceBoardRow(row));
        }
      }
    }

    if (activeCodes.length === 0 && spotMap.size === 0) {
      throw new Error('Futures table upstreams are unavailable');
    }

    const buildGroup = (
      underlying: 'VN30' | 'VN100',
      slots: readonly ClassifiedFuturesSlot[],
    ): FuturesTableData['groups'][number] => {
      const spot = spotMap.get(underlying) ?? null;
      const spotPrice = spot ? roundTo(spot.price, 2) : null;
      const spotChangePct = spot ? roundTo(spot.changePct, 2) : null;

      return {
        underlying,
        spotPrice,
        spotChangePct,
        contracts: slots.slice(0, 4).map((slot) => {
          const q = quotesByCode.get(slot.code);
          const price = q?.price ?? null;
          const basis = price !== null && spotPrice !== null ? roundTo(price - spotPrice, 2) : null;

          return {
            code: slot.code,
            displayCode: slot.slot,
            expiryDate: slot.expiryDate,
            remainingSessions: slot.remainingSessions,
            price,
            refPrice: q?.refPrice ?? null,
            changePct: q?.changePct ?? null,
            basis,
            volume: q?.volume ?? null,
            valueBillion: q?.valueBillion ?? null,
            foreignNetBillion: q?.foreignNetBillion ?? null,
          };
        }),
      };
    };

    const groups: FuturesTableData['groups'] = [
      buildGroup('VN30', classified.vn30),
      buildGroup('VN100', classified.vn100),
    ];

    return { groups };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  async loadHolidays(): Promise<ReadonlySet<string>> {
    return this.tradingCalendar.getHolidays();
  }

  private parseFuturesPriceBoardRow(row: Record<string, unknown>): ParsedFuturesQuote {
    const refRaw = toFiniteNumber(row.reference_price);
    const closeRaw = toFiniteNumber(row.close_price);
    const price =
      closeRaw !== null && closeRaw > 0
        ? roundTo(closeRaw, 2)
        : refRaw !== null
          ? roundTo(refRaw, 2)
          : null;
    const refPrice = refRaw !== null && refRaw > 0 ? roundTo(refRaw, 2) : null;
    const change = price !== null && refPrice !== null ? roundTo(price - refPrice, 2) : null;
    const changePct =
      change !== null && refPrice !== null && refPrice > 0
        ? roundTo((change / refPrice) * 100, 2)
        : null;

    const volumeRaw = toFiniteNumber(row.total_volume);
    const volume = volumeRaw !== null ? Math.round(volumeRaw) : null;

    const totalValVnd = toFiniteNumber(row.total_value);
    let valueBillion: number | null = null;
    if (totalValVnd !== null && totalValVnd > 0) {
      valueBillion = roundTo(totalValVnd / 1e9, 2);
    } else if (price !== null && volume !== null && volume > 0) {
      valueBillion = roundTo((price * CONTRACT_MULTIPLIER_VND * volume) / 1e9, 2);
    } else if (volume === 0) {
      valueBillion = 0;
    }

    const fbVol = toFiniteNumber(row.foreign_buy_volume);
    const fsVol = toFiniteNumber(row.foreign_sell_volume);
    const foreignNetContracts =
      fbVol !== null || fsVol !== null ? Math.round((fbVol ?? 0) - (fsVol ?? 0)) : null;

    const fbVal = toFiniteNumber(row.foreign_buy_value);
    const fsVal = toFiniteNumber(row.foreign_sell_value);
    const hasPositiveForeignValue = (fbVal ?? 0) > 0 || (fsVal ?? 0) > 0;
    let foreignNetBillion: number | null = null;
    if (
      (fbVal !== null || fsVal !== null) &&
      (hasPositiveForeignValue || foreignNetContracts === 0)
    ) {
      foreignNetBillion = roundTo(((fbVal ?? 0) - (fsVal ?? 0)) / 1e9, 2);
    } else if (foreignNetContracts !== null && price !== null) {
      foreignNetBillion = roundTo((foreignNetContracts * price * CONTRACT_MULTIPLIER_VND) / 1e9, 2);
    }

    return {
      price,
      refPrice,
      change,
      changePct,
      volume,
      valueBillion,
      foreignNetContracts,
      foreignNetBillion,
    };
  }

  private async loadSpotQuotes(
    symbols: readonly ('VN30' | 'VN100')[],
    now: Date,
  ): Promise<Map<string, SpotQuote>> {
    const map = new Map<string, SpotQuote>();
    const vciRes = await this.vietcapOverview.marketIndex([...symbols]).catch(() => null);
    if (vciRes) {
      for (const row of asRecordArray(vciRes.data)) {
        const sym = asString(row.symbol).toUpperCase();
        const price = toNumberOrZero(row.price);
        const refPrice = toNumberOrZero(row.ref_price);
        if (!sym || price <= 0) continue;
        const change = toFiniteNumber(row.change) ?? (refPrice > 0 ? price - refPrice : 0);
        const changePct =
          toFiniteNumber(row.change_percent) ??
          (refPrice > 0 ? ((price - refPrice) / refPrice) * 100 : 0);
        map.set(sym, { price, refPrice, change, changePct });
      }
    }

    // Fallback to VND daily OHLCV for any missing underlying (notably VN100).
    const missing = symbols.filter((s) => !map.has(s));
    if (missing.length > 0) {
      const nowSec = Math.floor(now.getTime() / 1_000);
      const fromSec = unixSecondsDaysAgo(now, 14);
      const settled = await Promise.allSettled(
        missing.map(async (sym) => ({
          sym,
          res: await this.vnd.fetchOhlcv(sym, fromSec, nowSec, '1D'),
        })),
      );
      for (const item of settled) {
        if (item.status !== 'fulfilled') continue;
        const bars = this.parseChartBars(item.value.res.data);
        const last = bars.at(-1);
        if (!last) continue;
        const prev = bars.at(-2)?.close ?? last.close;
        const change = last.close - prev;
        const changePct = prev > 0 ? (change / prev) * 100 : 0;
        map.set(item.value.sym, {
          price: last.close,
          refPrice: prev,
          change,
          changePct,
        });
      }
    }
    return map;
  }

  private async fetchSpotOhlcv(
    symbol: string,
    fromSec: number,
    toSec: number,
    interval: string,
  ): Promise<unknown[]> {
    try {
      const res = await this.vnd.fetchOhlcv(symbol, fromSec, toSec, interval);
      if (res.data.length > 0) return res.data;
    } catch {
      if (interval === '1m') throw new Error(`VND 1m OHLCV unavailable for ${symbol}`);
    }
    if (interval !== '1m') {
      const vciRes = await this.vci.fetchOhlcv(symbol, fromSec, toSec, interval);
      return vciRes.data;
    }
    return [];
  }

  private parseChartBars(raw: unknown): Array<{ date: string; hhmm: string; close: number }> {
    const out: Array<{ date: string; hhmm: string; close: number }> = [];
    for (const row of asRecordArray(raw)) {
      const dt = parseUpstreamTimestamp(row.time);
      const close = toFiniteNumber(row.close);
      if (!dt || close === null || close <= 0) continue;
      out.push({
        date: formatIctDate(dt),
        hhmm: formatIctTime(dt),
        close,
      });
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || a.hhmm.localeCompare(b.hhmm));
    return out;
  }

  private alignIntradaySeries(
    futuresBars: readonly { date: string; hhmm: string; close: number }[],
    spotBars: readonly { date: string; hhmm: string; close: number }[],
  ): Vn30fVsVn30Data['points'] {
    const latestFutDate = futuresBars.at(-1)?.date ?? '';
    const latestSpotDate = spotBars.at(-1)?.date ?? '';
    const targetDate = latestFutDate >= latestSpotDate ? latestFutDate : latestSpotDate;
    if (!targetDate) return [];

    const futMap = new Map<string, number>();
    for (const bar of futuresBars) {
      if (
        bar.date === targetDate &&
        bar.hhmm >= '08:45' &&
        bar.hhmm <= '14:45' &&
        !isVietnamLunchMinute(bar.hhmm)
      ) {
        futMap.set(bar.hhmm, bar.close);
      }
    }

    const spotMap = new Map<string, number>();
    for (const bar of spotBars) {
      if (
        bar.date === targetDate &&
        bar.hhmm >= '09:00' &&
        bar.hhmm <= '14:45' &&
        !isVietnamLunchMinute(bar.hhmm)
      ) {
        spotMap.set(bar.hhmm, bar.close);
      }
    }

    const times = [...new Set([...futMap.keys(), ...spotMap.keys()])].sort();
    let lastFut: number | null = null;
    let lastSpot: number | null = null;

    return times.map((t) => {
      const f = futMap.get(t);
      if (f !== undefined) lastFut = f;
      const s = spotMap.get(t);
      if (s !== undefined) lastSpot = s;

      // Preserve pre-open 08:45-08:59 window with vn30: null cleanly.
      const vn30 = t < '09:00' ? null : lastSpot !== null ? roundTo(lastSpot, 2) : null;
      const vn30f = lastFut !== null ? roundTo(lastFut, 2) : null;
      const basis = vn30 !== null && vn30f !== null ? roundTo(vn30f - vn30, 2) : null;
      return { t, vn30, vn30f, basis };
    });
  }

  private alignDailySeries(
    futuresBars: readonly { date: string; hhmm: string; close: number }[],
    spotBars: readonly { date: string; hhmm: string; close: number }[],
  ): Vn30fVsVn30Data['points'] {
    const futByDate = new Map<string, number>();
    for (const bar of futuresBars) futByDate.set(bar.date, bar.close);

    const spotByDate = new Map<string, number>();
    for (const bar of spotBars) spotByDate.set(bar.date, bar.close);

    const dates = [...new Set([...futByDate.keys(), ...spotByDate.keys()])].sort();
    return dates.map((d) => {
      const f = futByDate.get(d);
      const s = spotByDate.get(d);
      const vn30 = s !== undefined ? roundTo(s, 2) : null;
      const vn30f = f !== undefined ? roundTo(f, 2) : null;
      const basis = vn30 !== null && vn30f !== null ? roundTo(vn30f - vn30, 2) : null;
      return { t: d, vn30, vn30f, basis };
    });
  }

  private computeNextFrontExpiry(todayIct: string, holidays: ReadonlySet<string>): string {
    const year = Number(todayIct.slice(0, 4));
    const month = Number(todayIct.slice(5, 7));
    const thisMonthExpiry = computeExpiryDate(year, month, holidays);
    if (thisMonthExpiry >= todayIct) return thisMonthExpiry;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return computeExpiryDate(nextYear, nextMonth, holidays);
  }
}
