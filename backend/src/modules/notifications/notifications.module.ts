import { forwardRef, Module } from '@nestjs/common';

import { RedisModule } from '../../platform/redis/index.js';
import { TelegramService } from './telegram.service.js';
import { TelegramController } from './telegram.controller.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { UserNotificationsModule } from './user-notifications.module.js';

@Module({
  imports: [RedisModule, forwardRef(() => AlertsModule), UserNotificationsModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService, UserNotificationsModule],
})
export class NotificationsModule {}
