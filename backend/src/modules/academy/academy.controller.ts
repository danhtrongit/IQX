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
  attemptCreateSchema,
  attemptHistoryResponseSchema,
  attemptIdParamSchema,
  attemptResponseSchema,
  attemptResumeResponseSchema,
  attemptSubmitSchema,
  catalogResponseSchema,
  draftSaveResponseSchema,
  draftSaveSchema,
  guideCompleteResponseSchema,
  guideCompleteSchema,
  historyQuerySchema,
  lessonIdParamSchema,
  lessonResponseSchema,
  progressResponseSchema,
  submitResponseSchema,
  type AttemptCreateInput,
  type AttemptSubmitInput,
  type DraftSaveInput,
  type GuideCompleteInput,
  type HistoryQuery,
} from './academy.schemas.js';
import { AcademyService } from './academy.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Learning is free for every authenticated user; strategy usage is gated elsewhere. The owner
 * always comes from the session: no endpoint accepts a user id, score, pass flag or capability.
 */
@ApiTags('Academy')
@UseGuards(AcademyEnabledGuard, ApiAuthGuard)
@Controller(['api/v2/academy'])
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

  @Get('catalog')
  @ApiOperation({
    operationId: 'academyCatalog',
    summary: 'The 13-chapter / 71-lesson catalog with completion mode, binding and content status',
  })
  @ApiOkResponse({ schema: openApi(catalogResponseSchema) })
  catalog() {
    return this.academy.catalog();
  }

  @Get('progress')
  @ApiOperation({
    operationId: 'academyProgress',
    summary: 'Completed lessons, per-chapter and course progress and opened capabilities',
  })
  @ApiOkResponse({ schema: openApi(progressResponseSchema) })
  progress(@CurrentUser() user: AuthenticatedUser) {
    return this.academy.progress(user.id);
  }

  @Get('lessons/:lessonId')
  @ApiOperation({
    operationId: 'academyLesson',
    summary:
      'Typed lesson sections, chart models and nav labels (never questions or answers), plus completion info',
  })
  @ApiOkResponse({ schema: openApi(lessonResponseSchema) })
  lesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
  ) {
    return this.academy.lesson(user.id, lessonId);
  }

  @Get('lessons/:lessonId/attempt')
  @ApiOperation({
    operationId: 'academyResumeAttempt',
    summary:
      'Resume the latest open attempt of a lesson: questions and options in the stored order (no answer key) plus the saved draft selections; attempt is null when there is none',
  })
  @ApiOkResponse({ schema: openApi(attemptResumeResponseSchema) })
  resumeAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
  ) {
    return this.academy.resumeAttempt(user.id, lessonId);
  }

  @Get('lessons/:lessonId/attempts')
  @ApiOperation({
    operationId: 'academyLessonAttempts',
    summary: 'The learner’s submitted attempts of a lesson, newest first, paginated (limit/offset)',
  })
  @ApiOkResponse({ schema: openApi(attemptHistoryResponseSchema) })
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
      'Start (or replay by idempotency key) a quiz attempt: the 8 questions in a per-attempt order, no answer key',
  })
  @ApiCreatedResponse({ schema: openApi(attemptResponseSchema) })
  createAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: attemptCreateSchema }) body: AttemptCreateInput,
  ) {
    return this.academy.createAttempt(user.id, body);
  }

  @Get('attempts/:attemptId')
  @ApiOperation({
    operationId: 'academyAttemptReview',
    summary:
      'The committed result and review of a submitted attempt of the learner (same body as a submit replay); 409 ATTEMPT_NOT_SUBMITTED while the attempt is open',
  })
  @ApiOkResponse({ schema: openApi(submitResponseSchema) })
  attemptReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', { schema: attemptIdParamSchema }) attemptId: string,
  ) {
    return this.academy.attemptReview(user.id, attemptId);
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
    @Body({ schema: draftSaveSchema }) body: DraftSaveInput,
  ) {
    return this.academy.saveDraft(user.id, attemptId, body);
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'academySubmitAttempt',
    summary:
      'Grade an attempt server-side against its pinned bank; returns the review. 8/8 records the lesson completion once',
  })
  @ApiOkResponse({ schema: openApi(submitResponseSchema) })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', { schema: attemptIdParamSchema }) attemptId: string,
    @Body({ schema: attemptSubmitSchema }) body: AttemptSubmitInput,
  ) {
    return this.academy.submit(user.id, attemptId, body);
  }

  @Post('lessons/:lessonId/complete')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'academyCompleteGuide',
    summary: 'Complete a published guide lesson (Hoàn thành bài học); idempotent per request id',
  })
  @ApiOkResponse({ schema: openApi(guideCompleteResponseSchema) })
  completeGuide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
    @Body({ schema: guideCompleteSchema }) body: GuideCompleteInput,
  ) {
    return this.academy.completeGuide(user.id, lessonId, body);
  }
}
