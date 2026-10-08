import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import {
  botSessionDecisionsPageSchema,
  botSessionsPageSchema,
  botTradesPageSchema,
  sessionDecisionsQuerySchema,
  sessionParamSchema,
  sessionsQuerySchema,
  tradesQuerySchema,
  type SessionDecisionsQuery,
  type SessionParam,
  type SessionsQuery,
  type TradesQuery,
} from './bot-history.schemas.js';
import { BotHistoryService } from './bot-history.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Read-only Bot history computed server-side from the immutable ledger (Bot SPEC 8.6): closed
 * round trips and a per-session journal. Every route is owner-scoped and paginated to the full
 * history; none of them writes or starts a run.
 */
@ApiTags('Bot')
@UseGuards(ApiAuthGuard)
@Controller('api/v2/bot')
export class BotHistoryController {
  constructor(private readonly history: BotHistoryService) {}

  @Get('trades')
  @ApiOperation({
    operationId: 'getBotTrades',
    summary: 'Closed Bot round trips (buy + sell, fees, tax, realized P&L), newest first',
  })
  @ApiOkResponse({ schema: openApi(botTradesPageSchema) })
  trades(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: tradesQuerySchema }) query: TradesQuery,
  ) {
    return this.history.trades(user.id, query);
  }

  @Get('journal/sessions')
  @ApiOperation({
    operationId: 'listBotJournalSessions',
    summary: 'One row per Bot session: run status, universe, config revision, decision counts',
  })
  @ApiOkResponse({ schema: openApi(botSessionsPageSchema) })
  sessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: sessionsQuerySchema }) query: SessionsQuery,
  ) {
    return this.history.sessions(user.id, query);
  }

  @Get('journal/sessions/:session')
  @ApiOperation({
    operationId: 'getBotJournalSession',
    summary: 'Decisions of one Bot session (executed first, then by symbol), paginated',
  })
  @ApiOkResponse({ schema: openApi(botSessionDecisionsPageSchema) })
  session(
    @CurrentUser() user: AuthenticatedUser,
    @Param({ schema: sessionParamSchema }) params: SessionParam,
    @Query({ schema: sessionDecisionsQuerySchema }) query: SessionDecisionsQuery,
  ) {
    return this.history.session(user.id, params.session, query);
  }
}
