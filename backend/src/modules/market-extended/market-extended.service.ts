import { Injectable } from '@nestjs/common';
import { AiNewsProvider } from './ai-news.provider.js';
import { CommoditySheetsNewsProvider } from './commodity-sheets-news.provider.js';
import { EconomyFundsProvider } from './economy-funds.provider.js';
import { GlobalMarketProvider } from './global-market.provider.js';
import { SnapshotRepository } from './snapshot.repository.js';
import { VietcapInsightProvider } from './vietcap-insight.provider.js';
import { VietcapOverviewProvider } from './vietcap-overview.provider.js';

/** Stable application-facing facade; AI and report modules may consume providers through this service. */
@Injectable()
export class MarketExtendedService {
  constructor(
    readonly overview: VietcapOverviewProvider,
    readonly insight: VietcapInsightProvider,
    readonly economyFunds: EconomyFundsProvider,
    readonly commoditySheetsNews: CommoditySheetsNewsProvider,
    readonly aiNews: AiNewsProvider,
    readonly global: GlobalMarketProvider,
    readonly snapshots: SnapshotRepository,
  ) {}
}
