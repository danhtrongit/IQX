import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import {
  ChartDrawingsController,
  LegacyChartDrawingsController,
} from './chart-drawings.controller.js';
import { ChartDrawingsService } from './chart-drawings.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LegacyChartDrawingsController, ChartDrawingsController],
  providers: [ChartDrawingsService],
  exports: [ChartDrawingsService],
})
export class ChartDrawingsModule {}
