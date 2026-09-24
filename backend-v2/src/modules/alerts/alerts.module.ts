import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { AdminAlertsController } from './admin-alerts.controller.js';
import { AlertsController } from './alerts.controller.js';
import { AlertService } from './alerts.service.js';
import { AlertsRepository } from './alerts.repository.js';

@Module({
  imports: [AuthModule, forwardRef(() => NotificationsModule)],
  controllers: [AlertsController, AdminAlertsController],
  providers: [AlertService, AlertsRepository],
  exports: [AlertService, AlertsRepository],
})
export class AlertsModule {}
