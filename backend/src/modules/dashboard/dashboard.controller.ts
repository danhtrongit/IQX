/**
 * Dashboard phân tích v2 (spec §1–§11): thiết lập theo tài khoản và theo ngành, danh mục 62 chỉ
 * tiêu và số liệu theo khuôn biểu đồ. Mã đang xem là trạng thái chung của trang, không nằm trong
 * thiết lập; ngành của mã (§1.3) lấy từ mẫu báo cáo tài chính.
 */
import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, Public, type AuthenticatedUser } from '../auth/index.js';
import type { Industry } from '../financials/financials.industry.js';
import { symbolSchema } from '../market-data/market-data.schemas.js';
import {
  dashboardCatalogSchema,
  dashboardFundamentalQuerySchema,
  dashboardFundamentalResponseSchema,
  dashboardIndustryResponseSchema,
  dashboardIndustrySchema,
  dashboardIndustrySettingsSchema,
  dashboardSavedSettingsSchema,
  dashboardSettingsInputSchema,
  dashboardValuationQuerySchema,
  dashboardValuationResponseSchema,
  type DashboardFundamentalQuery,
  type DashboardSettingsInput,
  type DashboardValuationQuery,
} from './dashboard.schemas.js';
import { DashboardService } from './dashboard.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Thiết lập: theo tài khoản, nên cần đăng nhập. */
@ApiTags('Dashboard phân tích')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/dashboard')
export class DashboardSettingsController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('settings')
  @ApiOperation({
    operationId: 'dashboardSettings',
    summary:
      'Dashboard settings of the account per industry {thuong, nh, ck, bh}: chart list and order, quarter/year mode, periods per chart; an industry never saved returns its default set',
  })
  @ApiOkResponse({ schema: openApi(dashboardIndustrySettingsSchema) })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.settings(user.id);
  }

  @Put('settings/:nganh')
  @ApiOperation({
    operationId: 'dashboardSaveSettings',
    summary:
      'Save the dashboard settings of ONE industry of the account (server side); a chart outside that industry is rejected with 400',
  })
  @ApiOkResponse({ schema: openApi(dashboardSavedSettingsSchema) })
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nganh', { schema: dashboardIndustrySchema }) industry: Industry,
    @Body({ schema: dashboardSettingsInputSchema }) body: DashboardSettingsInput,
  ) {
    return this.dashboard.saveSettings(user.id, industry, body);
  }
}

/**
 * Danh mục và số liệu của một mã: công khai như dữ liệu báo cáo tài chính và giá. Khách chưa đăng
 * nhập xem được bộ mặc định (spec cập nhật 22-10 §3.7); chỉ lưu thiết lập mới cần đăng nhập.
 */
@ApiTags('Dashboard phân tích')
@Public()
@Controller('api/v2')
export class DashboardDataController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard/catalog')
  @ApiOperation({
    operationId: 'dashboardCatalog',
    summary:
      'The 62 analysis charts by industry: 17 common + 16 manufacturing + 11 bank + 10 securities + 8 insurance, in chapters and groups, with the Academy lesson key and the default set of each industry',
  })
  @ApiOkResponse({ schema: openApi(dashboardCatalogSchema) })
  catalog() {
    return this.dashboard.catalog();
  }

  @Get('dashboard/industry/:symbol')
  @ApiOperation({
    operationId: 'dashboardIndustry',
    summary:
      'Industry of one symbol from its financial statement template: thuong, nh (banks and finance companies), ck or bh; unknown template counts as thuong',
  })
  @ApiOkResponse({ schema: openApi(dashboardIndustryResponseSchema) })
  industry(@Param('symbol', { schema: symbolSchema }) symbol: string) {
    return this.dashboard.industry(symbol);
  }

  @Get('fundamental/:symbol')
  @ApiOperation({
    operationId: 'dashboardFundamental',
    summary:
      'Chart data of one symbol and its industry (nganh): 20 quarters and 10 years per chart; a chart outside the industry of the symbol is rejected with 400',
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
