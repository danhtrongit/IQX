import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { ApiAuthGuard, CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import { PracticeEnabledGuard } from './practice-enabled.guard.js';
import {
  draftBodySchema,
  draftResponseSchema,
  historyQuerySchema,
  historyResponseSchema,
  indicatorIdParamSchema,
  indicatorsResponseSchema,
  nextBodySchema,
  previewBodySchema,
  previewResponseSchema,
  runIdParamSchema,
  runViewSchema,
  startRunBodySchema,
  stateResponseSchema,
  type DraftBody,
  type HistoryQuery,
  type NextBody,
  type PreviewBody,
  type StartRunBody,
} from './practice.schemas.js';
import { PracticeService } from './practice.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Optional mini practice: one indicator, 30 hidden cases per (user, indicator, set), locked
 * configs, next-open fills. Free for every authenticated user holding the `indicator:<id>` grant.
 * No payload of this controller carries a symbol, a company or a calendar date.
 */
@ApiTags('Practice')
@UseGuards(PracticeEnabledGuard, ApiAuthGuard)
@Controller('api/v2/practice')
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Get('indicators')
  @ApiOperation({
    operationId: 'practiceIndicators',
    summary: 'The 16 practice indicators with the learned flag and the progress summary',
  })
  @ApiOkResponse({ schema: openApi(indicatorsResponseSchema) })
  indicators(@CurrentUser() user: AuthenticatedUser) {
    return this.practice.listIndicators(user.id);
  }

  @Get('runs/:runId')
  @ApiOperation({
    operationId: 'practiceGetRun',
    summary: 'One locked run with its full immutable result (owner only)',
  })
  @ApiOkResponse({ schema: openApi(runViewSchema) })
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', { schema: runIdParamSchema }) runId: string,
  ) {
    return this.practice.getRun(user.id, runId);
  }

  @Get(':indicatorId/state')
  @ApiOperation({
    operationId: 'practiceState',
    summary: 'Cursor, server-side draft and run status of one indicator (creates the permutation)',
  })
  @ApiOkResponse({ schema: openApi(stateResponseSchema) })
  state(
    @CurrentUser() user: AuthenticatedUser,
    @Param('indicatorId', { schema: indicatorIdParamSchema }) indicatorId: string,
  ) {
    return this.practice.state(user.id, indicatorId);
  }

  @Put(':indicatorId/draft')
  @ApiOperation({
    operationId: 'practiceSaveDraft',
    summary: 'Save the draft (both sides, params, operators, max holding) with expected_revision',
  })
  @ApiOkResponse({ schema: openApi(draftResponseSchema) })
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('indicatorId', { schema: indicatorIdParamSchema }) indicatorId: string,
    @Body({ schema: draftBodySchema }) body: DraftBody,
  ) {
    return this.practice.saveDraft(user.id, indicatorId, body);
  }

  @Post(':indicatorId/preview')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'practicePreview',
    summary: 'Observation-window candles and indicator series for the given params (no future)',
  })
  @ApiOkResponse({ schema: openApi(previewResponseSchema) })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('indicatorId', { schema: indicatorIdParamSchema }) indicatorId: string,
    @Body({ schema: previewBodySchema }) body: PreviewBody,
  ) {
    return this.practice.preview(user.id, indicatorId, body);
  }

  @Post(':indicatorId/runs')
  @ApiOperation({
    operationId: 'practiceStartRun',
    summary: 'Lock the config and run the current case (idempotent per key and per case)',
  })
  @ApiCreatedResponse({ schema: openApi(runViewSchema) })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('indicatorId', { schema: indicatorIdParamSchema }) indicatorId: string,
    @Body({ schema: startRunBodySchema }) body: StartRunBody,
  ) {
    return this.practice.startRun(user.id, indicatorId, body);
  }

  @Post(':indicatorId/next')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'practiceNext',
    summary: 'Move to the next case after the current run completed (exactly one step)',
  })
  @ApiOkResponse({ schema: openApi(stateResponseSchema) })
  next(
    @CurrentUser() user: AuthenticatedUser,
    @Param('indicatorId', { schema: indicatorIdParamSchema }) indicatorId: string,
    @Body({ schema: nextBodySchema }) body: NextBody,
  ) {
    return this.practice.next(user.id, indicatorId, body);
  }

  @Get(':indicatorId/history')
  @ApiOperation({
    operationId: 'practiceHistory',
    summary: 'All completed runs of one indicator, newest case first (paginated)',
  })
  @ApiOkResponse({ schema: openApi(historyResponseSchema) })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('indicatorId', { schema: indicatorIdParamSchema }) indicatorId: string,
    @Query({ schema: historyQuerySchema }) query: HistoryQuery,
  ) {
    return this.practice.history(user.id, indicatorId, query);
  }
}
