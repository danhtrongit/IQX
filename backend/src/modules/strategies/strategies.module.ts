import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { PriceStoreModule } from '../price-store/price-store.module.js';
import { StrategyBacktestsEnabledGuard } from '../strategy-backtests/strategy-backtests-enabled.guard.js';
import { STRATEGY_READER } from '../strategy-rules/index.js';
import { StrategiesController } from './strategies.controller.js';
import { StrategiesService } from './strategies.service.js';
import { StrategyReaderService } from './strategy-reader.service.js';

/**
 * Chiến lược của người dùng (update 22-11, W2). Exports `STRATEGY_READER` (bots, backtests) and
 * re-exports `PriceStoreModule` (`PRICE_STORE`). `BOT_SCHEDULE_PORT` is looked up lazily (see
 * bot-schedule.port.ts) so this module does not import the bots module (no cycle).
 */
@Module({
  imports: [DatabaseModule, AuthModule, PriceStoreModule],
  controllers: [StrategiesController],
  providers: [
    StrategiesService,
    StrategyReaderService,
    StrategyBacktestsEnabledGuard,
    { provide: STRATEGY_READER, useExisting: StrategyReaderService },
  ],
  exports: [STRATEGY_READER, StrategiesService, StrategyReaderService, PriceStoreModule],
})
export class StrategiesModule {}
