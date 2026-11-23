import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationEmailDispatcher } from './notification-email.dispatcher.js';
import {
  BULLETIN_NOTIFIER,
  NOTIFICATION_WRITER,
  OFFICE_NOTIFIER,
} from './notification-writer.port.js';
import { NotificationWriterService } from './notification-writer.service.js';
import {
  NotificationUnsubscribeController,
  UserNotificationsController,
} from './user-notifications.controller.js';
import { UserNotificationsService } from './user-notifications.service.js';

/**
 * Thông báo người dùng (update 22-11 §8): cài đặt, hộp tin, outbox email, tắt thông báo.
 * Không phụ thuộc Telegram/Alerts nên Bot và Bản tin import được mà không tạo vòng.
 * - `NOTIFICATION_WRITER`: Bot runner gọi trong transaction commit của phiên.
 * - `BULLETIN_NOTIFIER`: Bản tin gọi khi Public lần đầu.
 * - `NotificationEmailDispatcher`: job `notifications.email-dispatch` gọi `dispatch()`.
 */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UserNotificationsController, NotificationUnsubscribeController],
  providers: [
    UserNotificationsService,
    NotificationWriterService,
    NotificationEmailDispatcher,
    { provide: NOTIFICATION_WRITER, useExisting: NotificationWriterService },
    { provide: BULLETIN_NOTIFIER, useExisting: NotificationWriterService },
    { provide: OFFICE_NOTIFIER, useExisting: NotificationWriterService },
  ],
  exports: [
    UserNotificationsService,
    NotificationEmailDispatcher,
    NOTIFICATION_WRITER,
    BULLETIN_NOTIFIER,
    OFFICE_NOTIFIER,
  ],
})
export class UserNotificationsModule {}
