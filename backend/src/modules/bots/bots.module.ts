import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { BotMarketSnapshotProvider, MarketIntegrationModule } from '../market-integration/index.js';
import { QuantModule } from '../quant/quant.module.js';
import { StrategyConfigModule } from '../strategy-config/strategy-config.module.js';
import { BotHistoryController } from './bot-history.controller.js';
import { BotHistoryService } from './bot-history.service.js';
import { BotUniverseController } from './bot-universe.controller.js';
import { BotUniverseService } from './bot-universe.service.js';
import { BotsController } from './bots.controller.js';
import { BotService } from './bot.service.js';
import { BOT_SNAPSHOT_PROVIDER, BOT_UNIVERSE } from './bot.types.js';

// StrategyConfigModule (SHARED_CONFIG_READER) and QuantModule (QUANT_MARKET_DATA) are read-only
// inputs for the Bot policy; neither imports BotsModule. AcademyModule supplies ACADEMY_GRANTS
// for checking the metric grants behind an applied list.
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AcademyModule,
    MarketIntegrationModule,
    QuantModule,
    StrategyConfigModule,
  ],
  controllers: [BotsController, BotHistoryController, BotUniverseController],
  providers: [
    BotService,
    BotHistoryService,
    BotUniverseService,
    { provide: BOT_SNAPSHOT_PROVIDER, useExisting: BotMarketSnapshotProvider },
    { provide: BOT_UNIVERSE, useExisting: BotUniverseService },
  ],
  exports: [BotService, BotHistoryService, BotUniverseService],
})
export class BotsModule {}
