import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { QuantModule } from '../quant/quant.module.js';
import { StrategyConfigModule } from '../strategy-config/strategy-config.module.js';
import { StrategyBacktestsEnabledGuard } from './strategy-backtests-enabled.guard.js';
import { StrategyBacktestsController } from './strategy-backtests.controller.js';
import { StrategyBacktestExecutor } from './strategy-backtests.executor.js';
import { StrategyBacktestRepository } from './strategy-backtests.repository.js';
import { StrategyBacktestsService } from './strategy-backtests.service.js';

// v2 backtest runs over a saved shared-config revision (bot-v2). See .pi/botv2/CONTRACTS.md §4.
// Consumes SHARED_CONFIG_READER (StrategyConfigModule), ACADEMY_GRANTS (AcademyModule) and
// QUANT_MARKET_DATA (QuantModule); never writes shared config.
@Module({
  imports: [DatabaseModule, AuthModule, AcademyModule, StrategyConfigModule, QuantModule],
  controllers: [StrategyBacktestsController],
  providers: [
    StrategyBacktestRepository,
    StrategyBacktestExecutor,
    StrategyBacktestsService,
    StrategyBacktestsEnabledGuard,
  ],
})
export class StrategyBacktestsModule {}
