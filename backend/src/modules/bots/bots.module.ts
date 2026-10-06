import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/index.js';
import { BotMarketSnapshotProvider, MarketIntegrationModule } from '../market-integration/index.js';
import { QuantModule } from '../quant/quant.module.js';
import { StrategyConfigModule } from '../strategy-config/strategy-config.module.js';
import { BotsController } from './bots.controller.js';
import { BotService } from './bot.service.js';
import { BOT_SNAPSHOT_PROVIDER } from './bot.types.js';

// StrategyConfigModule (SHARED_CONFIG_READER) and QuantModule (QUANT_MARKET_DATA) are read-only
// inputs for the unconditional Academy activation policy; neither imports BotsModule.
@Module({
  imports: [DatabaseModule, AuthModule, MarketIntegrationModule, QuantModule, StrategyConfigModule],
  controllers: [BotsController],
  providers: [
    BotService,
    { provide: BOT_SNAPSHOT_PROVIDER, useExisting: BotMarketSnapshotProvider },
  ],
  exports: [BotService],
})
export class BotsModule {}
