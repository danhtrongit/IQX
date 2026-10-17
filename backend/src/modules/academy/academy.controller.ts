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
import { AcademyEnabledGuard } from './academy-enabled.guard.js';
import {
  attemptCreateRequestSchema,
  attemptIdParamSchema,
  attemptResponseSchema,
  catalogResponseSchema,
  draftSaveRequestSchema,
  draftSaveResponseSchema,
  historyQuerySchema,
  historyResponseSchema,
  itemResponseSchema,
  lessonIdParamSchema,
  notesResponseSchema,
  notesSaveRequestSchema,
  progressResponseSchema,
  resumeResponseSchema,
  scenarioChoiceRequestSchema,
  scenarioChoiceResponseSchema,
  submitRequestSchema,
  submitResponseSchema,
  type AttemptCreateRequest,
  type DraftSaveRequest,
  type HistoryQuery,
  type NotesSaveRequest,
  type ScenarioChoiceRequest,
  type SubmitRequest,
} from './academy.schemas.js';
import { AcademyService } from './academy.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Học viện v3.2: 14 chapters (1-5 published), lessons, chapter exams and the optional ch3 practice
 * in one prefix-unlocked chain. Learning is free for every authenticated user; strategy usage is
 * gated elsewhere. The owner always comes from the session: no endpoint accepts a user id, score,
 * pass flag or capability, and no response carries an answer key or explanation.
 */
@ApiTags('Academy')
@UseGuards(AcademyEnabledGuard, ApiAuthGuard)
@Controller(['api/v2/academy'])
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

  @Get('catalog')
  @ApiOperation({
    operationId: 'academyCatalog',
    summary:
      'The published chapters with their lessons, chapter exam and optional practice, plus retired lesson names',
  })
  @ApiOkResponse({ schema: openApi(catalogResponseSchema) })
  catalog() {
    return this.academy.catalog();
  }

  @Get('progress')
  @ApiOperation({
    operationId: 'academyProgress',
    summary:
      'Server-computed state (passed/open/locked) of every item, course and chapter progress, current item and opened capabilities',
  })
  @ApiOkResponse({ schema: openApi(progressResponseSchema) })
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.academy.progress(user.id);
  }

  @Get('lessons/:lessonId')
  @ApiOperation({
    operationId: 'academyLesson',
    summary:
      'A lesson or practice (typed blocks, chart models, summary, scenario choice) or a chapter exam intro; 403 ACADEMY_ITEM_LOCKED when locked',
  })
  @ApiOkResponse({ schema: openApi(itemResponseSchema) })
  lesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
  ) {
    return this.academy.lesson(user.id, lessonId);
  }

  @Post('lessons/:lessonId/scenario')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'academyChooseScenario',
    summary:
      'Store the learner’s scenario choice once (a replay returns the first choice; a stale row is replaced once); 422 NO_SCENARIO',
  })
  @ApiOkResponse({ schema: openApi(scenarioChoiceResponseSchema) })
  chooseScenario(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
    @Body({ schema: scenarioChoiceRequestSchema }) body: ScenarioChoiceRequest,
  ) {
    return this.academy.chooseScenario(user.id, lessonId, body);
  }

  @Get('lessons/:lessonId/notes')
  @ApiOperation({
    operationId: 'academyLessonNotes',
    summary:
      'The learner’s saved workpads, checklists and roleplay scores of a lesson (revision 0 when none); 404 NOTES_NOT_AVAILABLE',
  })
  @ApiOkResponse({ schema: openApi(notesResponseSchema) })
  lessonNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
  ) {
    return this.academy.lessonNotes(user.id, lessonId);
  }

  @Put('lessons/:lessonId/notes')
  @ApiOperation({
    operationId: 'academySaveLessonNotes',
    summary:
      'Merge partial notes by key with an optional revision guard; 409 NOTES_REVISION_CONFLICT, 422 INVALID_NOTES / NOTES_TOO_LARGE',
  })
  @ApiOkResponse({ schema: openApi(notesResponseSchema) })
  saveLessonNotes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
    @Body({ schema: notesSaveRequestSchema }) body: NotesSaveRequest,
  ) {
    return this.academy.saveLessonNotes(user.id, lessonId, body);
  }

  @Get('lessons/:lessonId/attempt')
  @ApiOperation({
    operationId: 'academyResumeAttempt',
    summary:
      'Resume the latest open attempt of an item in the current catalog: questions and options in the stored order (no answer key) plus the saved draft; attempt is null when there is none',
  })
  @ApiOkResponse({ schema: openApi(resumeResponseSchema) })
  resumeAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
  ) {
    return this.academy.resumeAttempt(user.id, lessonId);
  }

  @Get('lessons/:lessonId/attempts')
  @ApiOperation({
    operationId: 'academyLessonAttempts',
    summary:
      'The learner’s submitted attempts of an item (score only, current catalog), newest first, paginated (limit/offset)',
  })
  @ApiOkResponse({ schema: openApi(historyResponseSchema) })
  lessonAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
    @Query({ schema: historyQuerySchema }) query: HistoryQuery,
  ) {
    return this.academy.attemptHistory(user.id, lessonId, query);
  }

  @Post('attempts')
  @ApiOperation({
    operationId: 'academyCreateAttempt',
    summary:
      'Start (or replay by idempotency key) a quiz or chapter exam attempt: every question of the bank in a server-shuffled order, no answer key',
  })
  @ApiCreatedResponse({ schema: openApi(attemptResponseSchema) })
  createAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: attemptCreateRequestSchema }) body: AttemptCreateRequest,
  ) {
    return this.academy.createAttempt(user.id, body);
  }

  @Put('attempts/:attemptId/answers')
  @ApiOperation({
    operationId: 'academySaveDraftAnswers',
    summary:
      'Save the current (partial) selections of an open attempt as a server-side draft with a revision; never grades or reveals correctness',
  })
  @ApiOkResponse({ schema: openApi(draftSaveResponseSchema) })
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', { schema: attemptIdParamSchema }) attemptId: string,
    @Body({ schema: draftSaveRequestSchema }) body: DraftSaveRequest,
  ) {
    return this.academy.saveDraft(user.id, attemptId, body);
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'academySubmitAttempt',
    summary:
      'Grade an attempt server-side against its pinned bank; returns the score only. All correct records the completion once',
  })
  @ApiOkResponse({ schema: openApi(submitResponseSchema) })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', { schema: attemptIdParamSchema }) attemptId: string,
    @Body({ schema: submitRequestSchema }) body: SubmitRequest,
  ) {
    return this.academy.submit(user.id, attemptId, body);
  }
}
