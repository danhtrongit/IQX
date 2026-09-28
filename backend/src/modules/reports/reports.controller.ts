import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthGuard, Public, Roles, RolesGuard } from '../auth/index.js';
import {
  reportListQuerySchema,
  reportTypeSchema,
  sessionDateSchema,
  type ReportListQuery,
} from './reports.schemas.js';
import { MarketReportsService } from './reports.service.js';
import type { ReportType } from './reports.types.js';

function typeOf(value: string): ReportType {
  const result = reportTypeSchema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'INVALID_REPORT_TYPE',
      message: 'Loại báo cáo không hợp lệ',
    });
  return result.data;
}
function dateOf(value: string): string {
  const result = sessionDateSchema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'INVALID_SESSION_DATE',
      message: 'Ngày phiên không hợp lệ',
    });
  return result.data;
}
function limitOf(value: ReportListQuery): number {
  const result = reportListQuerySchema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'INVALID_REPORT_QUERY',
      message: 'Tham số phân trang không hợp lệ',
    });
  return result.data.limit;
}

@ApiTags('Market analysis')
@Controller('api/v2/market-analysis')
export class ReportsController {
  constructor(private readonly reports: MarketReportsService) {}

  @Public()
  @Get(':type/latest')
  @ApiOperation({ operationId: 'getMarketReportLatestV2' })
  latest(@Param('type') type: string) {
    return this.reports.getLatest(typeOf(type));
  }

  @Public()
  @Get(':type')
  @ApiOperation({ operationId: 'listMarketReportsV2' })
  list(@Param('type') type: string, @Query() query: ReportListQuery) {
    return this.reports.list(typeOf(type), limitOf(query));
  }

  @Public()
  @Get(':type/:sessionDate')
  @ApiOperation({ operationId: 'getMarketReportByDateV2' })
  byDate(@Param('type') type: string, @Param('sessionDate') sessionDate: string) {
    return this.reports.getByDate(typeOf(type), dateOf(sessionDate));
  }

  @UseGuards(ApiAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':type/run')
  @ApiOperation({ operationId: 'runMarketReportV2' })
  run(@Param('type') type: string, @Body() body: { session_date?: string }) {
    return this.reports.generate(
      typeOf(type),
      body?.session_date ? dateOf(body.session_date) : undefined,
    );
  }
}

@ApiTags('Compatibility: Market analysis v1')
@Controller('api/v1/market-analysis')
export class ReportsV1Controller {
  constructor(private readonly reports: MarketReportsService) {}
  private legacy(row: Awaited<ReturnType<MarketReportsService['getLatest']>>) {
    return {
      id: row.id,
      session_date: row.sessionDate,
      session_type: row.sessionType,
      session_type_display: row.meta?.session_type_display ?? null,
      generated_at: row.generatedAt,
      headline: row.headline,
      tagline: row.tagline,
      paragraphs: row.paragraphs,
      scenarios: row.scenarios,
      watchlist: row.watchlist,
      unexplained: row.unexplained,
      meta: row.meta,
      charts: row.meta?.charts ?? null,
      pulse: row.meta?.pulse ?? null,
    };
  }
  @Public() @Get(':type/latest') async latest(@Param('type') type: string) {
    return this.legacy(await this.reports.getLatest(typeOf(type)));
  }
  @Public() @Get(':type') async list(@Param('type') type: string, @Query() query: ReportListQuery) {
    return (await this.reports.list(typeOf(type), limitOf(query))).map((row) => ({
      id: row.id,
      session_date: row.sessionDate,
      session_type: row.sessionType,
      headline: row.headline,
      tagline: row.tagline,
    }));
  }
  @Public() @Get(':type/:sessionDate') async byDate(
    @Param('type') type: string,
    @Param('sessionDate') date: string,
  ) {
    return this.legacy(await this.reports.getByDate(typeOf(type), dateOf(date)));
  }
  @UseGuards(ApiAuthGuard, RolesGuard) @Roles('admin') @Post(':type/run') run(
    @Param('type') type: string,
    @Body() body: { session_date?: string },
  ) {
    return this.reports.generate(
      typeOf(type),
      body?.session_date ? dateOf(body.session_date) : undefined,
    );
  }
}
