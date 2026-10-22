/**
 * Dashboard phân tích (spec §1–§11): thiết lập theo tài khoản, danh mục 33 chỉ tiêu và số liệu
 * theo khuôn biểu đồ. Mã đang xem là trạng thái chung của trang, không nằm trong thiết lập.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { symbolSchema } from '../market-data/market-data.schemas.js';
import {
  dashboardCatalogSchema,
  dashboardFundamentalQuerySchema,
  dashboardFundamentalResponseSchema,
  dashboardSavedSettingsSchema,
  dashboardSettingsInputSchema,
  dashboardSettingsSchema,
  dashboardValuationQuerySchema,
  dashboardValuationResponseSchema,
  type DashboardFundamentalQuery,
  type DashboardSettingsInput,
  type DashboardValuationQuery,
} from './dashboard.schemas.js';
import { DashboardService } from './dashboard.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Thiết lập và danh mục: theo tài khoản, nên cần đăng nhập. */
@ApiTags('Dashboard phân tích')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/dashboard')
export class DashboardSettingsController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('settings')
  @ApiOperation({
    operationId: 'dashboardSettings',
    summary:
      'Dashboard settings of the account: chart list and order, quarter/year mode, periods per chart',
  })
  @ApiOkResponse({ schema: openApi(dashboardSettingsSchema) })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.settings(user.id);
  }

  @Put('settings')
  @ApiOperation({
    operationId: 'dashboardSaveSettings',
    summary: 'Save the dashboard settings of the account (server side, per account)',
  })
  @ApiOkResponse({ schema: openApi(dashboardSavedSettingsSchema) })
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: dashboardSettingsInputSchema }) body: DashboardSettingsInput,
  ) {
    return this.dashboard.saveSettings(user.id, body);
  }

  @Get('catalog')
  @ApiOperation({
    operationId: 'dashboardCatalog',
    summary: 'The 33 analysis charts in their 6 groups, with the bank not-applicable flag',
  })
  @ApiOkResponse({ schema: openApi(dashboardCatalogSchema) })
  catalog() {
    return this.dashboard.catalog();
  }
}

/** Số liệu của một mã: công khai như dữ liệu báo cáo tài chính và giá. */
@ApiTags('Dashboard phân tích')
@Controller('api/v2')
export class DashboardDataController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('fundamental/:symbol')
  @ApiOperation({
    operationId: 'dashboardFundamental',
    summary:
      'Chart data of one symbol: 20 quarters and 10 years per chart, na for the charts a bank does not have',
  })
  @ApiOkResponse({ schema: openApi(dashboardFundamentalResponseSchema) })
  fundamental(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: dashboardFundamentalQuerySchema }) query: DashboardFundamentalQuery,
  ) {
    return this.dashboard.fundamental(symbol, query);
  }

  @Get('valuation/:symbol')
  @ApiOperation({
    operationId: 'dashboardValuation',
    summary: 'Daily valuation series of one symbol, using the report published at that date',
  })
  @ApiOkResponse({ schema: openApi(dashboardValuationResponseSchema) })
  valuation(
    @Param('symbol', { schema: symbolSchema }) symbol: string,
    @Query({ schema: dashboardValuationQuerySchema }) query: DashboardValuationQuery,
  ) {
    return this.dashboard.valuation(symbol, query);
  }
}
