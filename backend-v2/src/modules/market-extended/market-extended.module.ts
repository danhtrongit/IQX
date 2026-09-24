import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { AiNewsProvider } from './ai-news.provider.js';
import { CommoditySheetsNewsProvider } from './commodity-sheets-news.provider.js';
import { EconomyFundsProvider } from './economy-funds.provider.js';
import { GlobalMarketProvider } from './global-market.provider.js';
import { MarketExtendedController } from './market-extended.controller.js';
import { MarketExtendedService } from './market-extended.service.js';
import { SnapshotRepository } from './snapshot.repository.js';
import { VietcapInsightProvider } from './vietcap-insight.provider.js';
import { VietcapOverviewProvider } from './vietcap-overview.provider.js';
import { MarketHttpClient } from './market-http.client.js';

@Module({
  imports: [DatabaseModule, MarketDataModule],
  controllers: [MarketExtendedController],
  providers: [
    AiNewsProvider,
    CommoditySheetsNewsProvider,
    EconomyFundsProvider,
    GlobalMarketProvider,
    SnapshotRepository,
    VietcapInsightProvider,
    VietcapOverviewProvider,
    MarketHttpClient,
    MarketExtendedService,
  ],
  exports: [
    MarketExtendedService,
    AiNewsProvider,
    CommoditySheetsNewsProvider,
    EconomyFundsProvider,
    GlobalMarketProvider,
    VietcapInsightProvider,
    VietcapOverviewProvider,
  ],
})
export class MarketExtendedModule {}
