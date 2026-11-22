import { Body, Controller, Get, HttpCode, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import {
  dueImpactSchema,
  impactQuerySchema,
  keepLastSchema,
  putNextSchema,
  scheduleViewSchema,
  strategyOptionsSchema,
  type ImpactQuery,
  type KeepLastInput,
  type PutNextInput,
} from './bot-schedule.schemas.js';
import { BotScheduleService } from './bot-schedule.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Bot v2.0: the Bot only chooses a strategy (spec §5, §6). Every write targets the next
 * session's unlocked Lịch phiên row; none of them places an order or sells anything (§3.7).
 * ApiAuthGuard only (no Premium): every Bot user picks IQX or own strategies (PLAN D15).
 */
@ApiTags('Bot')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/bot')
export class BotScheduleController {
  constructor(private readonly schedule: BotScheduleService) {}

  @Get('strategy-options')
  @ApiOperation({
    operationId: 'getBotStrategyOptions',
    summary: 'IQX strategies and the user own strategies the Bot can run',
  })
  @ApiOkResponse({ schema: openApi(strategyOptionsSchema) })
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.schedule.strategyOptions(user.id);
  }

  @Get('schedule')
  @ApiOperation({
    operationId: 'getBotSchedule',
    summary: 'Lịch phiên: strategy and version of the last and the next session',
  })
  @ApiOkResponse({ schema: openApi(scheduleViewSchema) })
  view(@CurrentUser() user: AuthenticatedUser) {
    return this.schedule.view(user.id);
  }

  @Get('schedule/next/impact')
  @ApiOperation({
    operationId: 'getBotScheduleImpact',
    summary: 'Positions that would become due at the next session if this strategy is used',
  })
  @ApiOkResponse({ schema: openApi(dueImpactSchema) })
  impact(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: impactQuerySchema }) query: ImpactQuery,
  ) {
    return this.schedule.impact(user.id, {
      source: query.source,
      id: query.id,
      ...(query.version ? { version: query.version } : {}),
    });
  }

  @Put('schedule/next')
  @ApiOperation({
    operationId: 'putBotScheduleNext',
    summary: 'Use a strategy from the next session (no order is created)',
  })
  @ApiOkResponse({ schema: openApi(scheduleViewSchema) })
  putNext(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: putNextSchema }) body: PutNextInput,
  ) {
    return this.schedule.putNext(user.id, body);
  }

  @Post('schedule/next/keep-last')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'keepBotScheduleLast',
    summary: 'Run the next session exactly like the last one (pinned version)',
  })
  @ApiOkResponse({ schema: openApi(scheduleViewSchema) })
  keepLast(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: keepLastSchema }) body: KeepLastInput,
  ) {
    return this.schedule.keepLast(user.id, body);
  }
}
