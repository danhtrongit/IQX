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
  linkQuerySchema,
  linkResponseSchema,
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
  type LinkQuery,
  type NotesSaveRequest,
  type ScenarioChoiceRequest,
  type SubmitRequest,
} from './academy.schemas.js';
import { AcademyService } from './academy.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Học viện v4: 12 chapters, lessons, chapter exams and the optional ch3 practice. Học viện v4.1: every learner
 * sees the chapters of the Academy config of his group (renumbered from 1) in Học tự do (every item open, v4 §4.1)
 * or Học lần lượt (the v3.3 prefix rule); no tool is gated by it (v4 §4.2). The owner always comes from the
 * session: no endpoint accepts a user id, score, pass flag, capability or config, and no response carries an
 * answer key or explanation.
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
      'The chapters of the learner’s Academy config, numbered again from 1 (display_no), with their lessons, chapter exam and optional practice, the access mode, the number of required lessons N and the retired lesson names',
  })
  @ApiOkResponse({ schema: openApi(catalogResponseSchema) })
  catalog(@CurrentUser() user: AuthenticatedUser) {
    return this.academy.catalog(user.id);
  }

  @Get('progress')
  @ApiOperation({
    operationId: 'academyProgress',
    summary:
      'Server-computed state (passed/open; locked only in the sequential access mode) of every item of the learner’s chapters, course (x / N) and chapter progress, the current item (the one opened last), the next item to learn and the access mode',
  })
  @ApiOkResponse({ schema: openApi(progressResponseSchema) })
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.academy.progress(user.id);
  }

  @Get('link')
  @ApiOperation({
    operationId: 'academyLink',
    summary:
      'Deep link to the lesson of a metric among the learner’s chapters (the "Học" button): by metric_key, else exact lesson title, else a title starting with "name ·"; lesson_id and locked (sequential mode, not yet its turn). Never an error: found=false answers with the lesson the learner was last on',
  })
  @ApiOkResponse({ schema: openApi(linkResponseSchema) })
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: linkQuerySchema }) query: LinkQuery,
  ) {
    return this.academy.link(user.id, query.metric);
  }

  @Get('lessons/:lessonId')
  @ApiOperation({
    operationId: 'academyLesson',
    summary:
      'A lesson or practice (typed blocks, chart models, summary, scenario choice) or a chapter exam intro, in the learner’s chapter numbering; opening it makes it the current lesson; 404 ACADEMY_ITEM_NOT_IN_PROGRAM when its chapter is not in the learner’s config; 403 ACADEMY_ITEM_LOCKED only in the sequential access mode (no content is returned)',
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
