import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
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
  screenerDefinitionSchema,
  screenerMetricsResponseSchema,
  screenerRunResponseSchema,
  type ScreenerDefinition,
} from './screener.schemas.js';
import { ScreenerService } from './screener.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Bộ lọc (bot-v2) — `.pi/botv2/CONTRACTS.md` §5. Premium; learned metrics only for rules. */
@ApiTags('Strategy screener')
@Premium()
@UseGuards(ScreenerEnabledGuard, ApiAuthGuard, PremiumGuard)
@Controller(['api/v2/strategy/screener'])
export class ScreenerController {
  constructor(private readonly screener: ScreenerService) {}

  @Get('metrics')
  @ApiOperation({
    operationId: 'screenerMetrics',
    summary: '42 fundamental registry metrics with learned/supported flags',
  })
  @ApiOkResponse({ schema: openApi(screenerMetricsResponseSchema) })
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.screener.metrics(user.id);
  }

  @Post('run')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'screenerRun',
    summary: 'Run a filter definition (filter.schema.json 2.0) over the market/sector scope',
  })
  @ApiOkResponse({ schema: openApi(screenerRunResponseSchema) })
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: screenerDefinitionSchema }) body: ScreenerDefinition,
  ) {
    return this.screener.run(user.id, body);
  }
}
