import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiAuthGuard, CurrentUser, Premium, PremiumGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  backtestRunSchema,
  strategyCreateSchema,
  strategyIdSchema,
  strategyUpdateSchema,
  type BacktestRunInput,
  type StrategyCreateInput,
  type StrategyUpdateInput,
} from './quant.schemas.js';
import { QuantService } from './quant.service.js';

@Premium()
@UseGuards(ApiAuthGuard, PremiumGuard)
@Controller(['api/v2/backtest', 'api/v1/backtest'])
export class QuantController {
  constructor(private readonly quant: QuantService) {}
  @Get('catalog') catalog() {
    return this.quant.catalog();
  }
  @Post('run') run(@Body({ schema: backtestRunSchema }) body: BacktestRunInput) {
    return this.quant.run(body);
  }
  @Get('strategies') list(@CurrentUser() user: AuthenticatedUser) {
    return this.quant.listStrategies(user.id);
  }
  @Post('strategies') create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: strategyCreateSchema }) body: StrategyCreateInput,
  ) {
    return this.quant.createStrategy(user.id, body);
  }
  @Put('strategies/:strategyId') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('strategyId', { schema: strategyIdSchema }) strategyId: string,
    @Body({ schema: strategyUpdateSchema }) body: StrategyUpdateInput,
  ) {
    return this.quant.updateStrategy(user.id, strategyId, body);
  }
  @Delete('strategies/:strategyId') @HttpCode(204) async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('strategyId', { schema: strategyIdSchema }) strategyId: string,
  ): Promise<void> {
    await this.quant.deleteStrategy(user.id, strategyId);
  }
}
