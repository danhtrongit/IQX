import { Injectable } from '@nestjs/common';

import { MarketDataService } from '../market-data/market-data.service.js';
import type { ResearchPricePort } from './research-engine.service.js';

/** Live price from the market-data quote (VCI price board); null when unavailable. */
@Injectable()
export class ResearchPriceAdapter implements ResearchPricePort {
  constructor(private readonly market: MarketDataService) {}

  async currentPrice(symbol: string): Promise<number | null> {
    try {
      return (await this.market.getQuote(symbol)).priceVnd;
    } catch {
      return null;
    }
  }
}
