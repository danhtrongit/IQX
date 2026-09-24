import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../../auth/index.js';
import {
  cap4OrderIdParamSchema,
  cap4PlanBodySchema,
  cap4TaskBodySchema,
  type Cap4PlanBody,
} from './cap4.schemas.js';
import { Cap4Service } from './cap4.service.js';

@Controller(['api/v1/cap4', 'api/v2/cap4'])
export class Cap4Controller {
  constructor(private readonly service: Cap4Service) {}

  @Get('progress')
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProgress(user.id);
  }
  @Post('enter')
  enter(@CurrentUser() user: AuthenticatedUser) {
    return this.service.enter(user.id);
  }
  @Patch('task')
  task(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cap4TaskBodySchema }) body: { task_no: 1 },
  ) {
    return this.service.markTask(user.id, body.task_no);
  }
  @Post('kehoach')
  plan(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cap4PlanBodySchema }) body: Cap4PlanBody,
  ) {
    return this.service.recordPlan(user.id, body);
  }
  @Get('plans/:order_id')
  getPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('order_id', { schema: cap4OrderIdParamSchema }) orderId: string,
  ) {
    return this.service.getPlan(user.id, orderId);
  }
  @Get('vu-khi-diem-mu')
  weapons(@CurrentUser() user: AuthenticatedUser) {
    return this.service.weapons(user.id);
  }
  @Get('phan-tich')
  analysis(@CurrentUser() user: AuthenticatedUser) {
    return this.service.analysis(user.id);
  }
  @Post('graduate')
  graduate(@CurrentUser() user: AuthenticatedUser) {
    return this.service.graduate(user.id);
  }
}
