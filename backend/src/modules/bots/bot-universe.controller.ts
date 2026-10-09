import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import {
  applyListSchema,
  cancelPendingSchema,
  revertVn30Schema,
  universeMutationSchema,
  universeStateSchema,
  type ApplyListInput,
  type CancelPendingInput,
  type RevertVn30Input,
} from './bot-universe.schemas.js';
import { BotUniverseService } from './bot-universe.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Bot buy universe. Every write only records a revision that becomes effective at the first
 * trading session after the server save date; none of them places an order or sells anything.
 */
@ApiTags('Bot universe')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/bot/universe')
export class BotUniverseController {
  constructor(private readonly universe: BotUniverseService) {}

  @Get()
  @ApiOperation({
    operationId: 'getBotUniverse',
    summary: 'Effective and pending Bot buy universe with the revision token',
  })
  @ApiOkResponse({ schema: openApi(universeStateSchema) })
  state(@CurrentUser() user: AuthenticatedUser) {
    return this.universe.state(user.id);
  }

  @Post('apply-list')
  @ApiOperation({
    operationId: 'applyBotUniverseList',
    summary: 'Apply a selection of a saved list as the pending buy universe (no order is created)',
  })
  @ApiCreatedResponse({ schema: openApi(universeMutationSchema) })
  applyList(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: applyListSchema }) body: ApplyListInput,
  ) {
    return this.universe.applyList(user.id, body);
  }

  @Post('revert-vn30')
  @ApiOperation({
    operationId: 'revertBotUniverseToVn30',
    summary: 'Request the VN30 buy universe again (held positions are kept)',
  })
  @ApiCreatedResponse({ schema: openApi(universeMutationSchema) })
  revertVn30(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: revertVn30Schema }) body: RevertVn30Input,
  ) {
    return this.universe.revertToVn30(user.id, body);
  }

  @Post('pending/cancel')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'cancelBotUniversePending',
    summary: 'Cancel the pending buy-universe change; 409 once it is effective or consumed',
  })
  @ApiOkResponse({ schema: openApi(universeMutationSchema) })
  cancelPending(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: cancelPendingSchema }) body: CancelPendingInput,
  ) {
    return this.universe.cancelPending(user.id, body);
  }
}
