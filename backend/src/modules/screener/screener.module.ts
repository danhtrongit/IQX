import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketDataModule } from '../market-data/index.js';
import { ScreenerEnabledGuard } from './screener-enabled.guard.js';
import { ScreenerMarketDataService } from './screener-market-data.service.js';
import { ScreenerController } from './screener.controller.js';
import { SCREENER_MARKET_DATA } from './screener.ports.js';
import { ScreenerRunRepository } from './screener.repository.js';
import { ScreenerService } from './screener.service.js';

// Bộ lọc (bot-v2) screener: Cơ bản (VCI) + Thị trường and Kỹ thuật (stored DNSE daily bars, Bộ lọc 4.0).
// DailyBarsService / IndexMembershipService come from the global MarketIntegrationModule.
@Module({
  imports: [DatabaseModule, MarketDataModule, AuthModule, AcademyModule],
  controllers: [ScreenerController],
  providers: [
    ScreenerService,
    ScreenerEnabledGuard,
    ScreenerRunRepository,
    ScreenerMarketDataService,
    { provide: SCREENER_MARKET_DATA, useExisting: ScreenerMarketDataService },
  ],
})
export class ScreenerModule {}
