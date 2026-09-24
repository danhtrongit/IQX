import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/index.js';
import { BotMarketSnapshotProvider, MarketIntegrationModule } from '../market-integration/index.js';
import { BotsController } from './bots.controller.js';
import { BotService } from './bot.service.js';
import { BOT_SNAPSHOT_PROVIDER } from './bot.types.js';

@Module({
  imports: [DatabaseModule, AuthModule, MarketIntegrationModule],
  controllers: [BotsController],
  providers: [
    BotService,
    { provide: BOT_SNAPSHOT_PROVIDER, useExisting: BotMarketSnapshotProvider },
  ],
  exports: [BotService],
})
export class BotsModule {}
