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
  backtestTradesQuerySchema,
  backtestTradesResponseSchema,
  type BacktestListQuery,
  type BacktestRunBody,
  type BacktestTradesQuery,
} from './strategy-backtests.schemas.js';
import { StrategyBacktestsService } from './strategy-backtests.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Immutable basket Backtest runs (update 22-11); pre-22-11 runs are read-only (`legacy`). */
@ApiTags('Strategy backtests')
@Premium()
@UseGuards(StrategyBacktestsEnabledGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy/backtests')
export class StrategyBacktestsController {
  constructor(private readonly backtests: StrategyBacktestsService) {}

  @Post()
  @ApiOperation({
    operationId: 'strategyBacktestsCreate',
    summary:
      'Chạy Backtest theo rổ của một chiến lược (IQX, của tôi hoặc bản nháp) và lưu lần chạy',
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
    summary: 'Lần chạy đã lưu, lọc theo chiến lược; lần chạy cũ có legacy: true',
  })
  @ApiOkResponse({ schema: openApi(backtestRunListSchema) })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: backtestListQuerySchema }) query: BacktestListQuery,
  ) {
    return this.backtests.list(user.id, query);
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

  @Get(':id/trades')
  @ApiOperation({
    operationId: 'strategyBacktestsTrades',
    summary: 'Giao dịch của một lần chạy, mới nhất trước (total = cả lần chạy)',
  })
  @ApiOkResponse({ schema: openApi(backtestTradesResponseSchema) })
  trades(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: backtestRunIdSchema }) id: string,
    @Query({ schema: backtestTradesQuerySchema }) query: BacktestTradesQuery,
  ) {
    return this.backtests.trades(user.id, id, query.offset, query.limit);
  }
}
