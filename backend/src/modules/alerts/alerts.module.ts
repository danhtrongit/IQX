import { forwardRef, Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { QuantModule } from '../quant/quant.module.js';
import { StrategyConfigModule } from '../strategy-config/strategy-config.module.js';
import { AdminAlertsController } from './admin-alerts.controller.js';
import { AlertsController } from './alerts.controller.js';
import { AlertService } from './alerts.service.js';
import { AlertsRepository } from './alerts.repository.js';
import { StrategyAlertsEnabledGuard } from './strategy-alerts-enabled.guard.js';
import { StrategyAlertsController } from './strategy-alerts.controller.js';
import { StrategyAlertEvaluator } from './strategy-alerts.evaluator.js';
import { StrategyAlertsRepository } from './strategy-alerts.repository.js';
import { StrategyAlertsService } from './strategy-alerts.service.js';

// Legacy rules (v1/v2 /alerts, 38-factor engine, Telegram) are untouched. The Strategy alerts
// (/api/v2/strategy/alerts) run on the 16-indicator registry over pinned snapshots and are
// evaluated once per completed session by StrategyAlertEvaluator (web history only).
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AcademyModule,
    StrategyConfigModule,
    QuantModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [AlertsController, AdminAlertsController, StrategyAlertsController],
  providers: [
    AlertService,
    AlertsRepository,
    StrategyAlertsRepository,
    StrategyAlertsService,
    StrategyAlertEvaluator,
    StrategyAlertsEnabledGuard,
  ],
  exports: [AlertService, AlertsRepository, StrategyAlertEvaluator],
})
export class AlertsModule {}
