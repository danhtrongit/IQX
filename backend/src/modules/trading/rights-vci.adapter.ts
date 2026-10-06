import { Injectable } from '@nestjs/common';

import { MarketDataService } from '../market-data/market-data.service.js';
import { TradingRightsEventsPort } from './rights.ports.js';
import type { VnDate } from './rights.types.js';

/**
 * VCI-backed trading rights events source. `MarketDataService.events` already
 * forwards the raw event codes to VCI and normalizes records to snake_case, so
 * the returned objects are accepted by `classifyVciEvent` unchanged.
 */
@Injectable()
export class VciTradingRightsEventsPort extends TradingRightsEventsPort {
  constructor(private readonly marketData: MarketDataService) {
    super();
  }

  async fetch(input: {
    from: VnDate;
    to: VnDate;
    codes: 'DIV,ISS' | 'AIS';
  }): Promise<readonly unknown[]> {
    const response = await this.marketData.events(input.from, input.to, input.codes);
    return response.data;
  }
}
