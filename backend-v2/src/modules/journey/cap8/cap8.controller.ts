import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../auth/auth.decorators.js';
import { ApiAuthGuard } from '../../auth/auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { Cap8Service } from './cap8.service.js';
import {
  cap8SymbolSchema,
  dynamicStopRequestSchema,
  exitRecordRequestSchema,
  proposedSaleQuantitySchema,
  syncPlanRequestSchema,
  type DynamicStopRequest,
  type ExitRecordRequest,
  type SyncPlanRequest,
} from './cap8.schemas.js';

function symbolParam(value: string): string {
  const parsed = cap8SymbolSchema.safeParse(value);
  if (!parsed.success) {
    throw new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'Mã chứng khoán không hợp lệ',
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

function parseRequest<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false; error: { issues: unknown[] } };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new UnprocessableEntityException({
      code: 'VALIDATION_ERROR',
      message: 'Dữ liệu yêu cầu không hợp lệ',
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}

@ApiTags('Journey: Cấp 8')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/cap8')
export class Cap8Controller {
  constructor(private readonly cap8: Cap8Service) {}

  @Get('progress')
  @ApiOperation({ operationId: 'getCap8ProgressV2' })
  async progress(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.cap8.getProgress(user.id), meta: {} };
  }

  @Post('enter')
  @ApiOperation({ operationId: 'enterCap8V2' })
  async enter(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.cap8.enter(user.id), meta: {} };
  }

  @Post('graduate')
  @ApiOperation({ operationId: 'graduateCap8V2' })
  async graduate(@CurrentUser() user: AuthenticatedUser) {
    return { data: await this.cap8.graduate(user.id), meta: {} };
  }

  @Get('positions/:symbol/exit-context')
  @ApiOperation({ operationId: 'getCap8ExitContextV2' })
  async exitContext(
    @Param('symbol') symbol: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('proposed_sale_quantity') proposedSaleQuantity?: string,
  ) {
    const parsed = parseRequest(proposedSaleQuantitySchema, proposedSaleQuantity);
    return {
      data: await this.cap8.exitContext(user.id, symbolParam(symbol), parsed),
      meta: {},
    };
  }

  @Post('positions/:symbol/sync-plan')
  @ApiOperation({ operationId: 'syncCap8PlanV2' })
  async syncPlan(
    @Param('symbol') symbol: string,
    @Body() body: SyncPlanRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = parseRequest(syncPlanRequestSchema, body);
    return {
      data: await this.cap8.syncPlan(user.id, symbolParam(symbol), parsed.buy_order_id),
      meta: {},
    };
  }

  @Patch('positions/:symbol/dynamic-stop')
  @ApiOperation({ operationId: 'setCap8DynamicStopV2' })
  async dynamicStop(
    @Param('symbol') symbol: string,
    @Body() body: DynamicStopRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = parseRequest(dynamicStopRequestSchema, body);
    return {
      data: await this.cap8.setDynamicStop(user.id, symbolParam(symbol), parsed.dynamic_stop_vnd),
      meta: {},
    };
  }

  @Post('exits')
  @ApiOperation({ operationId: 'recordCap8ExitV2' })
  async recordExit(@Body() body: ExitRecordRequest, @CurrentUser() user: AuthenticatedUser) {
    const parsed = parseRequest(exitRecordRequestSchema, body);
    return { data: await this.cap8.recordExit(user.id, parsed.sell_order_id), meta: {} };
  }
}

@ApiTags('Compatibility: Journey Cấp 8 v1')
@UseGuards(ApiAuthGuard)
@Controller('api/v1/cap8')
export class Cap8V1Controller {
  constructor(private readonly cap8: Cap8Service) {}

  @Get('progress')
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.cap8.getProgress(user.id);
  }

  @Post('enter')
  enter(@CurrentUser() user: AuthenticatedUser) {
    return this.cap8.enter(user.id);
  }

  @Post('graduate')
  graduate(@CurrentUser() user: AuthenticatedUser) {
    return this.cap8.graduate(user.id);
  }

  @Get('positions/:symbol/exit-context')
  exitContext(
    @Param('symbol') symbol: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('proposed_sale_quantity') proposedSaleQuantity?: string,
  ) {
    const parsed = parseRequest(proposedSaleQuantitySchema, proposedSaleQuantity);
    return this.cap8.exitContext(user.id, symbolParam(symbol), parsed);
  }

  @Post('positions/:symbol/sync-plan')
  syncPlan(
    @Param('symbol') symbol: string,
    @Body() body: SyncPlanRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = parseRequest(syncPlanRequestSchema, body);
    return this.cap8.syncPlan(user.id, symbolParam(symbol), parsed.buy_order_id);
  }

  @Patch('positions/:symbol/dynamic-stop')
  dynamicStop(
    @Param('symbol') symbol: string,
    @Body() body: DynamicStopRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = parseRequest(dynamicStopRequestSchema, body);
    return this.cap8.setDynamicStop(user.id, symbolParam(symbol), parsed.dynamic_stop_vnd);
  }

  @Post('exits')
  recordExit(@Body() body: ExitRecordRequest, @CurrentUser() user: AuthenticatedUser) {
    const parsed = parseRequest(exitRecordRequestSchema, body);
    return this.cap8.recordExit(user.id, parsed.sell_order_id);
  }
}
