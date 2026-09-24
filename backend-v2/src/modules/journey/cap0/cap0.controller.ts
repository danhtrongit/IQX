import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthenticatedUser } from '../../auth/index.js';
import {
  kehoachQuerySchema,
  kehoachSchema,
  placementSchema,
  taskSchema,
  tourParamSchema,
  tourSchema,
  type KehoachInput,
  type PlacementInput,
  type TaskInput,
  type TourInput,
} from './cap0.schemas.js';
import { Cap0Service } from './cap0.service.js';

@ApiTags('Cấp 0')
@ApiBearerAuth()
@Controller({ path: ['api/v1/cap0', 'api/v2/cap0'] })
export class Cap0Controller {
  constructor(private readonly service: Cap0Service) {}

  @Get('progress')
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProgress(user.id);
  }

  @Post('enter')
  enter(@CurrentUser() user: AuthenticatedUser) {
    return this.service.enter(user.id);
  }

  @Post('placement')
  placement(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: placementSchema }) body: PlacementInput,
  ) {
    return this.service.setPlacement(user.id, body);
  }

  @Get('placement')
  getPlacement(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getPlacement(user.id);
  }

  @Post('tours/:tour/complete')
  completeTour(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tour', { schema: tourParamSchema }) tour: 'bantin' | 'phantich' | 'bctc',
    @Body({ schema: tourSchema }) body: TourInput,
  ) {
    return this.service.completeTour(user.id, tour, body.skipped);
  }

  @Patch('task')
  task(@CurrentUser() user: AuthenticatedUser, @Body({ schema: taskSchema }) body: TaskInput) {
    return this.service.completeTask(user.id, body);
  }

  @Post('kehoach')
  kehoach(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: kehoachSchema }) body: KehoachInput,
  ) {
    return this.service.recordKehoach(user.id, body);
  }

  @Get('kehoach')
  getKehoach(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: kehoachQuerySchema }) query: { order_id: string },
  ) {
    return this.service.getKehoach(user.id, query.order_id);
  }

  @Post('graduate')
  graduate(@CurrentUser() user: AuthenticatedUser) {
    return this.service.graduate(user.id);
  }
}
