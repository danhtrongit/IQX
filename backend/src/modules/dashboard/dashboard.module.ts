import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketDataModule } from '../market-data/index.js';
import { DashboardDataController, DashboardSettingsController } from './dashboard.controller.js';
import { IcbDirectory } from './dashboard.icb.js';
import { DashboardSettingsRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

/**
 * Dashboard phân tích (spec v3): thiết lập theo tài khoản và 9 ngành, danh mục theo cặp (ngành,
 * tên) và số liệu theo khuôn biểu đồ. Số liệu dùng chung nguồn BCTC và công thức với Bộ lọc; ngành
 * của mẫu doanh nghiệp lấy từ phân ngành ICB của VCI (`IcbDirectory`, cache trong bộ nhớ).
 */
@Module({
  imports: [DatabaseModule, MarketDataModule, AuthModule],
  controllers: [DashboardSettingsController, DashboardDataController],
  providers: [DashboardService, DashboardSettingsRepository, IcbDirectory],
})
export class DashboardModule {}
