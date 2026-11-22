import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/index.js';
import { MarketIntegrationModule } from '../market-integration/index.js';
import { UserNotificationsModule } from '../notifications/user-notifications.module.js';
import { PriceStoreModule } from '../price-store/price-store.module.js';
import { StrategiesModule } from '../strategies/strategies.module.js';
import { BOT_SCHEDULE_PORT } from '../strategy-rules/index.js';
import { BotHistoryController } from './bot-history.controller.js';
import { BotHistoryService } from './bot-history.service.js';
import { BotScheduleController } from './bot-schedule.controller.js';
import { BotScheduleService } from './bot-schedule.service.js';
import { BotSessionRunner } from './bot-session-runner.js';
import { BotsController } from './bots.controller.js';
import { BotService } from './bot.service.js';

/**
 * Bot v2.0. Inputs (optional injections, wired at integration):
 * - `PRICE_STORE` (price-store module, W1) — the only price source of the Bot;
 * - `STRATEGY_READER` (StrategiesModule) — resolves the strategy of a schedule row;
 * - `NOTIFICATION_WRITER` (UserNotificationsModule) — "Bot giao dịch" in the run's commit tx.
 * Exports `BOT_SCHEDULE_PORT` for W2 ("Lưu và áp dụng phiên tới", in-use checks). The
 * StrategiesModule looks the port up lazily (ModuleRef), so there is no module cycle.
 */
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MarketIntegrationModule,
    UserNotificationsModule,
    PriceStoreModule,
    StrategiesModule,
  ],
  controllers: [BotsController, BotHistoryController, BotScheduleController],
  providers: [
    BotService,
    BotHistoryService,
    BotScheduleService,
    BotSessionRunner,
    { provide: BOT_SCHEDULE_PORT, useExisting: BotScheduleService },
  ],
  exports: [BotService, BotHistoryService, BotScheduleService, BOT_SCHEDULE_PORT],
})
export class BotsModule {}
