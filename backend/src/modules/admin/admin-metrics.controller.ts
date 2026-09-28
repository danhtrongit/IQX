import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Roles } from '../auth/index.js';
import { metricsRevenueQuerySchema } from './admin.schemas.js';
import { AdminMetricsService } from './admin-metrics.service.js';

@ApiTags('Quản trị: Số liệu')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: ['api/v1/admin/metrics', 'api/v2/admin/metrics'] })
export class AdminMetricsController {
  constructor(private readonly service: AdminMetricsService) {}

  @Get('overview')
  overview() {
    return this.service.overview();
  }

  @Get('revenue')
  revenue(@Query({ schema: metricsRevenueQuerySchema }) query: { days: number }) {
    return this.service.dailyRevenue(query.days);
  }

  @Get('plan-distribution')
  planDistribution() {
    return this.service.planDistribution();
  }
}
