import { Injectable, Logger } from '@nestjs/common';

import { MarketDataService } from '../market-data/market-data.service.js';
import type { HuntBar, HuntDataSource } from '../journey/cap5/cap5.types.js';
import { HoseRestrictedSecuritiesProvider } from './hose-restricted-securities.provider.js';
import { compactDate, daysBefore, finite, mapLimit, sessionDate } from './integration.utils.js';

type CacheEntry<T> = { expiresAt: number; value: T };

@Injectable()
export class MarketHuntDataSource implements HuntDataSource {
  private readonly logger = new Logger(MarketHuntDataSource.name);
  private readonly barsCache = new Map<string, CacheEntry<HuntBar[]>>();
  private readonly flowCache = new Map<string, CacheEntry<number[] | null>>();

  constructor(
    private readonly market: MarketDataService,
    private readonly restrictions: HoseRestrictedSecuritiesProvider,
  ) {}

  async dailyBars(
    symbols: readonly string[],
    candleCount: number,
  ): Promise<Map<string, HuntBar[]>> {
    return this.dailyBarsThrough(symbols, candleCount, new Date().toISOString().slice(0, 10));
  }

  async dailyBarsThrough(
    symbols: readonly string[],
    candleCount: number,
    end: string,
  ): Promise<Map<string, HuntBar[]>> {
    const normalized = [
      ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
    ];
    const start = daysBefore(end, Math.ceil(candleCount * 2.2) + 20);
    const pairs = await mapLimit(normalized, 8, async (symbol): Promise<[string, HuntBar[]]> => {
      const key = `${symbol}:${candleCount}:${end}`;
      const cached = this.barsCache.get(key);
      if (cached && cached.expiresAt > Date.now()) return [symbol, cached.value];
      try {
        const response = await this.market.getOhlcv(symbol, {
          start,
          end,
          interval: '1D',
          source: 'VCI',
        });
        const byDate = new Map<string, HuntBar>();
        for (const row of response.data) {
          const time = sessionDate(row.time);
          const close = finite(row.close);
          const open = finite(row.open);
          const high = finite(row.high);
          const low = finite(row.low);
          const volume = finite(row.volume);
          const rawValue = finite(row.value);
          if (
            !time ||
            close === null ||
            open === null ||
            high === null ||
            low === null ||
            volume === null
          )
            continue;
          if (close <= 0 || open <= 0 || high <= 0 || low <= 0 || volume < 0) continue;
          byDate.set(time, {
            time,
            open,
            high,
            low,
            close,
            volume,
            // VCI gap-chart accumulatedValue is documented by this integration
            // as million VND. Missing value remains null and fails the floor gate.
            gtgdVnd: rawValue === null || rawValue < 0 ? null : rawValue * 1_000_000,
          });
        }
        const value = [...byDate.values()]
          .sort((left, right) => left.time.localeCompare(right.time))
          .slice(-candleCount);
        this.barsCache.set(key, { value, expiresAt: Date.now() + 15 * 60_000 });
        return [symbol, value];
      } catch (error) {
        this.logger.debug(`OHLCV unavailable for ${symbol}: ${String(error)}`);
        return [symbol, []];
      }
    });
    return new Map(pairs.filter(([, bars]) => bars.length > 0));
  }

  async netFlow(
    symbols: readonly string[],
    side: 'ngoai' | 'tudoanh',
    sessions: number,
  ): Promise<Map<string, number[]> | null> {
    return this.netFlowThrough(symbols, side, sessions, new Date().toISOString().slice(0, 10));
  }

  async netFlowThrough(
    symbols: readonly string[],
    side: 'ngoai' | 'tudoanh',
    sessions: number,
    end: string,
  ): Promise<Map<string, number[]> | null> {
    if (!symbols.length || sessions < 1) return null;
    const normalized = [
      ...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
    ];
    const start = daysBefore(end, Math.ceil(sessions * 2.2) + 15);
    let successful = 0;
    const pairs = await mapLimit(
      normalized,
      8,
      async (symbol): Promise<[string, number[] | null]> => {
        const key = `${side}:${symbol}:${sessions}:${end}`;
        const cached = this.flowCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return [symbol, cached.value];
        try {
          const response =
            side === 'ngoai'
              ? await this.market.foreignTrade(symbol, start, end, Math.max(20, sessions * 3))
              : await this.market.proprietary(symbol, {
                  resolution: '1D',
                  fromDate: compactDate(start),
                  toDate: compactDate(end),
                  page: 0,
                  size: Math.max(20, sessions * 3),
                });
          const flowRows = response.data as Array<Record<string, unknown>>;
          const values = flowRows
            .flatMap((row) => {
              const date = sessionDate(row.trading_date ?? row.date);
              const direct = finite(
                row.foreign_net_value ??
                  row.foreign_net_value_total ??
                  row.total_trade_net_value ??
                  row.net_value,
              );
              const buy = finite(
                side === 'ngoai'
                  ? (row.foreign_buy_value_matched ??
                      row.foreign_buy_value ??
                      row.foreign_buy_value_total)
                  : (row.total_buy_trade_value ?? row.total_buy_value),
              );
              const sell = finite(
                side === 'ngoai'
                  ? (row.foreign_sell_value_matched ??
                      row.foreign_sell_value ??
                      row.foreign_sell_value_total)
                  : (row.total_sell_trade_value ?? row.total_sell_value),
              );
              const net = direct ?? (buy !== null && sell !== null ? buy - sell : null);
              return date && net !== null ? [{ date, net }] : [];
            })
            .sort((left, right) => left.date.localeCompare(right.date))
            .slice(-sessions)
            .map((row) => row.net);
          successful += 1;
          const value = values.length === sessions ? values : null;
          this.flowCache.set(key, { value, expiresAt: Date.now() + 10 * 60_000 });
          return [symbol, value];
        } catch (error) {
          this.logger.debug(`${side} flow unavailable for ${symbol}: ${String(error)}`);
          return [symbol, null];
        }
      },
    );
    if (successful === 0) return null;
    return new Map(
      pairs.flatMap(([symbol, values]) => (values ? [[symbol, values] as const] : [])),
    );
  }

  restrictedSymbols(): Promise<Set<string> | null> {
    return this.restrictions.current();
  }
}
