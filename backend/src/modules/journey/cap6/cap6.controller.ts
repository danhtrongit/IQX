import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthGuard } from '../../auth/auth.guard.js';
import { CurrentUser } from '../../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { Cap6Service } from './cap6.service.js';
import {
  conflictBodySchema,
  orderParamSchema,
  skipBodySchema,
  symbolParamSchema,
  type ConflictBody,
  type SkipBody,
} from './cap6.schemas.js';

@ApiTags('Cap6')
@UseGuards(ApiAuthGuard)
@Controller(['api/v2/cap6', 'api/v1/cap6'])
export class Cap6Controller {
  constructor(private readonly service: Cap6Service) {}
  @Get('progress') @ApiOperation({ operationId: 'cap6Progress' }) progress(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getProgress(user.id);
  }
  @Post('enter') @ApiOperation({ operationId: 'cap6Enter' }) enter(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.enter(user.id);
  }
  @Post('tour-mauthuan') @ApiOperation({ operationId: 'cap6TourMauThuan' }) tour(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.markTour(user.id);
  }
  @Get('mau-thuan/:symbol') @ApiOperation({ operationId: 'cap6Conflict' }) conflict(
    @Param({ schema: symbolParamSchema }) params: { symbol: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.conflict(user.id, params.symbol);
  }
  @Post('kehoach') @ApiOperation({ operationId: 'cap6RecordPlan' }) plan(
    @Body({ schema: conflictBodySchema }) body: ConflictBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.record(user.id, body.order_id, body.conflict_level);
  }
  @Get('kehoach/:order_id') @ApiOperation({ operationId: 'cap6GetPlan' }) getPlan(
    @Param({ schema: orderParamSchema }) params: { order_id: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getPlan(user.id, params.order_id);
  }
  @Get('plans/:order_id') @ApiOperation({ operationId: 'cap6CumulativePlan' }) cumulative(
    @Param({ schema: orderParamSchema }) params: { order_id: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getPlan(user.id, params.order_id, true);
  }
  @Post('skip') @ApiOperation({ operationId: 'cap6Skip' }) skip(
    @Body({ schema: skipBodySchema }) body: SkipBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.skip(user.id, body.symbol, body.conflict_level);
  }
  @Get('phan-tich') @ApiOperation({ operationId: 'cap6Analysis' }) analysis(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.analysis(user.id);
  }
  @Post('graduate') @ApiOperation({ operationId: 'cap6Graduate' }) graduate(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.graduate(user.id);
  }
}
