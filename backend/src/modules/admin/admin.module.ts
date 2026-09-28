import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminMetricsController } from './admin-metrics.controller.js';
import { AdminMetricsService } from './admin-metrics.service.js';
import { AdminSystemController } from './admin-system.controller.js';
import { AdminSystemService } from './admin-system.service.js';
import { AdminVTController, LegacyVirtualTradingAdminController } from './admin-vt.controller.js';
import { AdminVTService } from './admin-vt.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    AdminMetricsController,
    AdminAuditController,
    AdminSystemController,
    AdminVTController,
    LegacyVirtualTradingAdminController,
  ],
  providers: [AdminAuditService, AdminMetricsService, AdminSystemService, AdminVTService],
  exports: [AdminAuditService, AdminMetricsService, AdminSystemService, AdminVTService],
})
export class AdminModule {}
