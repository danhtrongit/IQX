import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketDataModule } from '../market-data/index.js';
import { ScreenerEnabledGuard } from './screener-enabled.guard.js';
import { ScreenerController } from './screener.controller.js';
import { ScreenerRunRepository } from './screener.repository.js';
import { ScreenerService } from './screener.service.js';

// Bộ lọc (bot-v2) fundamental screener; see .pi/botv2/CONTRACTS.md §5.
@Module({
  imports: [DatabaseModule, MarketDataModule, AuthModule, AcademyModule],
  controllers: [ScreenerController],
  providers: [ScreenerService, ScreenerEnabledGuard, ScreenerRunRepository],
})
export class ScreenerModule {}
