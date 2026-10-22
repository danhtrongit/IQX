import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketDataModule } from '../market-data/index.js';
import { DashboardDataController, DashboardSettingsController } from './dashboard.controller.js';
import { DashboardSettingsRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

/**
 * Dashboard phân tích (spec Dashboard v1): thiết lập theo tài khoản, danh mục 33 chỉ tiêu và
 * số liệu theo khuôn biểu đồ. Số liệu dùng chung nguồn BCTC và công thức với Bộ lọc.
 */
@Module({
  imports: [DatabaseModule, MarketDataModule, AuthModule],
  controllers: [DashboardSettingsController, DashboardDataController],
  providers: [DashboardService, DashboardSettingsRepository],
})
export class DashboardModule {}
