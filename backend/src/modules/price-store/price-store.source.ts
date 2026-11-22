/**
 * Vendor port of the price store: DNSE full daily history (one call per symbol, adjusted, thousand
 * VND) and the VNINDEX series — the same source as the Flashback VN100 store (D2).
 */

import { Inject, Injectable } from '@nestjs/common';

import { DnseMarketProvider } from '../market-data/index.js';
import { IndexMembershipProvider } from '../market-integration/index-membership.provider.js';

export const PRICE_STORE_SOURCE = Symbol('PRICE_STORE_SOURCE');

export interface PriceStoreSourcePort {
  /** Raw vendor rows `{time, open, high, low, close, volume}` of a stock (thousand VND). */
  stockHistory(symbol: string): Promise<readonly unknown[]>;
  /** Raw vendor rows of an index (points). */
  indexHistory(code: string): Promise<readonly unknown[]>;
  /** Current members of an index (used only when no membership snapshot exists yet). */
  currentMembers?(indexCode: string): Promise<string[]>;
}

@Injectable()
export class DnsePriceStoreSource implements PriceStoreSourcePort {
  constructor(
    @Inject(DnseMarketProvider) private readonly dnse: DnseMarketProvider,
    @Inject(IndexMembershipProvider) private readonly membership: IndexMembershipProvider,
  ) {}

  async stockHistory(symbol: string): Promise<readonly unknown[]> {
    return (await this.dnse.fetchFullHistory(symbol)).data;
  }

  async indexHistory(code: string): Promise<readonly unknown[]> {
    return (await this.dnse.fetchFullIndexHistory(code)).data;
  }

  async currentMembers(indexCode: string): Promise<string[]> {
    return (await this.membership.fetchCurrent(indexCode)).symbols;
  }
}
