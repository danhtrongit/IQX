import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketDataModule } from '../market-data/index.js';
import { MarketExtendedModule } from '../market-extended/index.js';
import { DerivativesWidgetsService } from './aggregators/derivatives-widgets.service.js';
import { GlobalEventsWidgetsService } from './aggregators/global-events-widgets.service.js';
import { IndexWidgetsService } from './aggregators/index-widgets.service.js';
import { StockSectorWidgetsService } from './aggregators/stock-sector-widgets.service.js';
import { VnTradingCalendarService } from './aggregators/vn-trading-calendar.service.js';
import { MarketOverviewWidgetDispatcherService } from './aggregators/widget-dispatcher.service.js';
import { MarketOverviewCache } from './market-overview.cache.js';
import { MarketOverviewController } from './market-overview.controller.js';
import {
  MARKET_OVERVIEW_PAGES_OPTIONS,
  MarketOverviewPagesService,
  resolveMarketOverviewNewsEnabled,
  type MarketOverviewPagesOptions,
} from './market-overview.pages.service.js';
import { MarketOverviewRepository } from './market-overview.repository.js';

@Module({
  imports: [DatabaseModule, AuthModule, MarketDataModule, MarketExtendedModule],
  controllers: [MarketOverviewController],
  providers: [
    {
      provide: MarketOverviewCache,
      useFactory: () => new MarketOverviewCache(),
    },
    {
      provide: MARKET_OVERVIEW_PAGES_OPTIONS,
      useFactory: (): MarketOverviewPagesOptions => ({
        newsEnabled: resolveMarketOverviewNewsEnabled(),
      }),
    },
    VnTradingCalendarService,
    MarketOverviewRepository,
    MarketOverviewPagesService,
    IndexWidgetsService,
    StockSectorWidgetsService,
    DerivativesWidgetsService,
    GlobalEventsWidgetsService,
    MarketOverviewWidgetDispatcherService,
  ],
  exports: [MarketOverviewPagesService, MarketOverviewWidgetDispatcherService],
})
export class MarketOverviewModule {}
