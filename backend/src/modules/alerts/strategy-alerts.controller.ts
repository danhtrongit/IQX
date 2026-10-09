import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, Premium, PremiumGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { StrategyAlertsEnabledGuard } from './strategy-alerts-enabled.guard.js';
import {
  strategyAlertCreateSchema,
  strategyAlertDetailSchema,
  strategyAlertEventListSchema,
  strategyAlertEventSchema,
  strategyAlertEventsQuerySchema,
  strategyAlertIdSchema,
  strategyAlertListSchema,
  strategyAlertSourcePreviewResponseSchema,
  strategyAlertSourcePreviewSchema,
  strategyAlertUpdateSchema,
  type StrategyAlertCreateInput,
  type StrategyAlertEventsQuery,
  type StrategyAlertSourcePreviewInput,
  type StrategyAlertUpdateInput,
} from './strategy-alerts.schemas.js';
import { StrategyAlertsService } from './strategy-alerts.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Strategy-page alerts: pinned condition snapshots over the 16-indicator registry, end-of-session
 * checks, web history only. The legacy rule routes under /api/v{1,2}/alerts are unchanged.
 */
@ApiTags('Strategy alerts')
@Premium()
@UseGuards(StrategyAlertsEnabledGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy/alerts')
export class StrategyAlertsController {
  constructor(private readonly alerts: StrategyAlertsService) {}

  @Get()
  @ApiOperation({ operationId: 'strategyAlertsList', summary: 'Alerts of the current user' })
  @ApiOkResponse({ schema: openApi(strategyAlertListSchema) })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.list(user.id);
  }

  @Post()
  @ApiOperation({
    operationId: 'strategyAlertsCreate',
    summary: 'Create an alert pinned to a saved config revision or to one backtest run',
  })
  @ApiCreatedResponse({ schema: openApi(strategyAlertDetailSchema) })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: strategyAlertCreateSchema }) body: StrategyAlertCreateInput,
  ) {
    return this.alerts.create(user.id, body);
  }

  @Post('source-preview')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'strategyAlertsSourcePreview',
    summary: 'Which sides a source would pin (valid, non-empty condition sets) before saving',
  })
  @ApiOkResponse({ schema: openApi(strategyAlertSourcePreviewResponseSchema) })
  sourcePreview(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: strategyAlertSourcePreviewSchema }) body: StrategyAlertSourcePreviewInput,
  ) {
    return this.alerts.previewSource(user.id, body.source);
  }

  @Get('events')
  @ApiOperation({
    operationId: 'strategyAlertEventsList',
    summary: 'Signal history ("Thỏa điều kiện Mua/Bán"), newest session first, fully paged',
  })
  @ApiOkResponse({ schema: openApi(strategyAlertEventListSchema) })
  listEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: strategyAlertEventsQuerySchema }) query: StrategyAlertEventsQuery,
  ) {
    return this.alerts.listEvents(user.id, query);
  }

  @Get('events/:eventId')
  @ApiOperation({
    operationId: 'strategyAlertEventGet',
    summary: 'One signal with the values, operators and params recorded at that session',
  })
  @ApiOkResponse({ schema: openApi(strategyAlertEventSchema) })
  getEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', { schema: strategyAlertIdSchema }) eventId: string,
  ) {
    return this.alerts.getEvent(user.id, eventId);
  }

  @Get(':alertId')
  @ApiOperation({
    operationId: 'strategyAlertGet',
    summary: 'One alert with its immutable versions',
  })
  @ApiOkResponse({ schema: openApi(strategyAlertDetailSchema) })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId', { schema: strategyAlertIdSchema }) alertId: string,
  ) {
    return this.alerts.get(user.id, alertId);
  }

  @Patch(':alertId')
  @ApiOperation({
    operationId: 'strategyAlertUpdate',
    summary:
      'Rename, pause/resume, or change source/scope/sides (a definition change creates a new version)',
  })
  @ApiOkResponse({ schema: openApi(strategyAlertDetailSchema) })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId', { schema: strategyAlertIdSchema }) alertId: string,
    @Body({ schema: strategyAlertUpdateSchema }) body: StrategyAlertUpdateInput,
  ) {
    return this.alerts.update(user.id, alertId, body);
  }

  @Delete(':alertId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'strategyAlertDelete',
    summary: 'Stop and soft-delete an alert; its history and versions are kept',
  })
  @ApiNoContentResponse({ description: 'Đã xóa cảnh báo' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('alertId', { schema: strategyAlertIdSchema }) alertId: string,
  ): Promise<void> {
    await this.alerts.remove(user.id, alertId);
  }
}
