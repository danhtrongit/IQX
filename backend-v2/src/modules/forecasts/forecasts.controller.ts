import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthGuard } from '../auth/auth.guard.js';
import { Premium } from '../auth/auth.decorators.js';
import { PremiumGuard } from '../auth/premium.guard.js';
import {
  forecastRankingSchema,
  forecastSymbolSchema,
  type ForecastRanking,
} from './forecasts.schemas.js';
import { ForecastsService } from './forecasts.service.js';

@ApiTags('AI Forecasts')
@Controller(['api/v2/ai/forecast', 'api/v1/ai/forecast'])
@UseGuards(ApiAuthGuard, PremiumGuard)
@Premium()
export class ForecastsController {
  constructor(private readonly forecasts: ForecastsService) {}

  @Get('ranking')
  @ApiOperation({ operationId: 'getForecastRankingV2' })
  ranking(@Query({ schema: forecastRankingSchema }) query: ForecastRanking) {
    return this.forecasts.ranking(query.horizon, query.limit);
  }

  @Get('symbols/:symbol')
  @ApiOperation({ operationId: 'getForecastForSymbolV2' })
  symbol(@Param('symbol', { schema: forecastSymbolSchema }) symbol: string) {
    return this.forecasts.symbol(symbol);
  }
}
