import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import {
  ApiAuthGuard,
  CurrentUser,
  Premium,
  PremiumGuard,
  type AuthenticatedUser,
} from '../auth/index.js';
import { ScreenerEnabledGuard } from './screener-enabled.guard.js';
import {
  screenerMetricsResponseSchema,
  screenerResultIdSchema,
  screenerResultPageSchema,
  screenerResultQuerySchema,
  screenerRunInputSchema,
  screenerRunResponseSchema,
  type ScreenerResultQuery,
  type ScreenerRunInput,
} from './screener.schemas.js';
import { ScreenerService } from './screener.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Bộ lọc (bot-v2) — Premium; learned metrics only for rules and reference columns. */
@ApiTags('Strategy screener')
@Premium()
@UseGuards(ScreenerEnabledGuard, ApiAuthGuard, PremiumGuard)
@Controller(['api/v2/strategy/screener'])
export class ScreenerController {
  constructor(private readonly screener: ScreenerService) {}

  @Get('metrics')
  @ApiOperation({
    operationId: 'screenerMetrics',
    summary: '42 fundamental registry metrics with learned/readiness flags and period policy',
  })
  @ApiOkResponse({ schema: openApi(screenerMetricsResponseSchema) })
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.screener.metrics(user.id);
  }

  @Post('run')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'screenerRun',
    summary:
      'Run a filter definition 4.0 (Thị trường + Cơ bản + Kỹ thuật; 3.0 and 2.0 are mapped) on the last closed session and the latest published reports',
  })
  @ApiOkResponse({ schema: openApi(screenerRunResponseSchema) })
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: screenerRunInputSchema }) body: ScreenerRunInput,
  ) {
    return this.screener.run(user.id, body);
  }

  @Get('results/:resultId')
  @ApiOperation({
    operationId: 'screenerResultGet',
    summary:
      'One page of a stored run, sorted over the whole result by `sort`/`order` (same as_of on every page; owner only)',
  })
  @ApiOkResponse({ schema: openApi(screenerResultPageSchema) })
  result(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resultId', { schema: screenerResultIdSchema }) resultId: string,
    @Query({ schema: screenerResultQuerySchema }) query: ScreenerResultQuery,
  ) {
    return this.screener.getResult(user.id, resultId, query);
  }
}
