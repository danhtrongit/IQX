import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, Premium, PremiumGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { StrategyBacktestsEnabledGuard } from './strategy-backtests-enabled.guard.js';
import {
  backtestListQuerySchema,
  backtestRunBodySchema,
  backtestRunIdSchema,
  backtestRunListSchema,
  backtestRunResponseSchema,
  type BacktestListQuery,
  type BacktestRunBody,
} from './strategy-backtests.schemas.js';
import { StrategyBacktestsService } from './strategy-backtests.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Immutable v2 backtest runs over a saved shared-config revision (never the form draft). */
@ApiTags('Strategy backtests')
@Premium()
@UseGuards(StrategyBacktestsEnabledGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy/backtests')
export class StrategyBacktestsController {
  constructor(private readonly backtests: StrategyBacktestsService) {}

  @Post()
  @ApiOperation({
    operationId: 'strategyBacktestsCreate',
    summary: 'Run a backtest (optionally research or portfolio) on a saved shared-config revision',
  })
  @ApiCreatedResponse({ schema: openApi(backtestRunResponseSchema) })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: backtestRunBodySchema }) body: BacktestRunBody,
  ) {
    return this.backtests.create(user.id, body);
  }

  @Get()
  @ApiOperation({
    operationId: 'strategyBacktestsList',
    summary: 'Latest backtest runs of the current user',
  })
  @ApiOkResponse({ schema: openApi(backtestRunListSchema) })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: backtestListQuerySchema }) query: BacktestListQuery,
  ) {
    return this.backtests.list(user.id, query.limit);
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'strategyBacktestsGet',
    summary: 'One stored backtest run (owner only)',
  })
  @ApiOkResponse({ schema: openApi(backtestRunResponseSchema) })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: backtestRunIdSchema }) id: string,
  ) {
    return this.backtests.get(user.id, id);
  }
}
