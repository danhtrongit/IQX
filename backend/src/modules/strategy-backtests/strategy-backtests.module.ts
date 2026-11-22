import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { StrategiesModule } from '../strategies/strategies.module.js';
import { StrategyBacktestsEnabledGuard } from './strategy-backtests-enabled.guard.js';
import { StrategyBacktestsController } from './strategy-backtests.controller.js';
import { StrategyBacktestExecutor } from './strategy-backtests.executor.js';
import { StrategyBacktestRepository } from './strategy-backtests.repository.js';
import { StrategyBacktestsService } from './strategy-backtests.service.js';

// Basket Backtest runs (update 22-11). Consumes STRATEGY_READER + StrategiesService
// (StrategiesModule), ACADEMY_GRANTS (AcademyModule); PRICE_STORE and BOT_SCHEDULE_PORT are
// looked up lazily from the app (see strategies/bot-schedule.port.ts).
@Module({
  imports: [DatabaseModule, AuthModule, AcademyModule, StrategiesModule],
  controllers: [StrategyBacktestsController],
  providers: [
    StrategyBacktestRepository,
    StrategyBacktestExecutor,
    StrategyBacktestsService,
    StrategyBacktestsEnabledGuard,
  ],
})
export class StrategyBacktestsModule {}
