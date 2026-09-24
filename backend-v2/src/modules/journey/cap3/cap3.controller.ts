import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../../auth/index.js';
import {
  cap3PlanBodySchema,
  cap3TaskBodySchema,
  orderIdParamSchema,
  riskAppetiteBodySchema,
  type Cap3PlanBody,
  type Cap3TaskBody,
  type RiskAppetiteBody,
} from './cap3.schemas.js';
import { Cap3Service } from './cap3.service.js';

@Controller(['api/v1/cap3', 'api/v2/cap3'])
export class Cap3Controller {
  constructor(private readonly service: Cap3Service) {}

  @Get('progress')
  async progress(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProgress(user.id);
  }

  @Post('enter')
  async enter(@CurrentUser() user: AuthenticatedUser) {
    return this.service.enter(user.id);
  }

  @Post('khau-vi')
  async risk(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: riskAppetiteBodySchema }) body: RiskAppetiteBody,
  ) {
    return this.service.setRiskAppetite(user.id, body.khau_vi);
  }

  @Patch('task')
  async task(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cap3TaskBodySchema }) body: Cap3TaskBody,
  ) {
    return this.service.markTask(user.id, body.task_no);
  }

  @Post('kehoach')
  async plan(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cap3PlanBodySchema }) body: Cap3PlanBody,
  ) {
    return this.service.recordPlan(user.id, body);
  }

  @Get('plans/:order_id')
  async getPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('order_id', { schema: orderIdParamSchema }) orderId: string,
  ) {
    return this.service.getPlan(user.id, orderId);
  }

  @Get('trades')
  async trades(@CurrentUser() user: AuthenticatedUser) {
    const trades = await this.service.listTrades(user.id);
    return { trades, total: trades.length };
  }

  @Get('trades/analysis')
  async tradeAnalysis(@CurrentUser() user: AuthenticatedUser) {
    return this.service.tradeAnalysis(user.id);
  }

  @Post('graduate')
  async graduate(@CurrentUser() user: AuthenticatedUser) {
    return this.service.graduate(user.id);
  }
}
