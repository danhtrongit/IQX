import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import type { JourneyPlanResult, PersistJourneyPlanInput, TradingQuote } from './trading.types.js';

export const TRADING_JOURNEY_PORT = Symbol('TRADING_JOURNEY_PORT');

export interface TradingJourneyPort {
  getActiveLevel(tx: PersistJourneyPlanInput['tx'], userId: string): Promise<number | null>;
  validateAndPersistBuyPlan(input: PersistJourneyPlanInput): Promise<JourneyPlanResult>;
  onBuyOrderFilled?(input: {
    tx: PersistJourneyPlanInput['tx'];
    userId: string;
    orderId: string;
    symbol: string;
  }): Promise<void>;
}

export abstract class TradingMarketPort {
  abstract validateSymbol(symbol: string): Promise<boolean>;
  abstract getQuote(symbol: string): Promise<TradingQuote>;
}

/**
 * Canonical local market adapter. Market ingestion owns `symbols`; trading only
 * consumes a positive, timestamped quote and never invents a zero/fallback price.
 */
@Injectable()
export class SymbolsTradingMarketPort extends TradingMarketPort {
  constructor(
    private readonly database: DatabaseService,
    @Optional()
    private readonly marketData?: MarketDataService,
  ) {
    super();
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    if (this.marketData) return this.marketData.validateSymbol(symbol);
    const rows = await this.database.query<{ exists: boolean }>(
      `select exists(
         select 1 from symbols
         where symbol = $1 and is_active = true
           and upper(coalesce(exchange, '')) in ('HOSE', 'HNX', 'UPCOM')
       ) as exists`,
      [symbol],
    );
    return rows[0]?.exists === true;
  }

  async getQuote(symbol: string): Promise<TradingQuote> {
    if (this.marketData) {
      const quote = await this.marketData.getQuote(symbol);
      return {
        symbol: quote.symbol,
        priceVnd: BigInt(Math.trunc(quote.priceVnd)),
        source: quote.source,
        priceTime: quote.timestamp,
        obtainedAt: quote.timestamp,
      };
    }
    const rows = await this.database.query<{
      symbol: string;
      price_vnd: string | number | bigint | null;
      source: string | null;
      price_time: Date | string | null;
    }>(
      `select symbol, current_price_vnd as price_vnd,
              coalesce(source, 'market-ingest') as source,
              last_synced_at as price_time
       from symbols
       where symbol = $1 and is_active = true
       limit 1`,
      [symbol],
    );
    const row = rows[0];
    const price = row?.price_vnd == null ? 0n : BigInt(row.price_vnd);
    if (!row || price <= 0n || row.price_time == null) {
      throw new ServiceUnavailableException({
        code: 'PRICE_UNAVAILABLE',
        message: `Không có giá thị trường hợp lệ cho ${symbol}`,
      });
    }
    return {
      symbol: row.symbol,
      priceVnd: price,
      source: row.source ?? 'market-ingest',
      priceTime: new Date(row.price_time),
      obtainedAt: new Date(),
    };
  }
}
