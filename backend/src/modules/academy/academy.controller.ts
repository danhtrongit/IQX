import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
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
  attemptIdParamSchema,
  attemptResponseSchema,
  attemptSubmitSchema,
  curriculumQuerySchema,
  curriculumResponseSchema,
  lessonIdParamSchema,
  lessonResponseSchema,
  submitResponseSchema,
  type AttemptCreateInput,
  type AttemptSubmitInput,
  type CurriculumQuery,
} from './academy.schemas.js';
import { AcademyService } from './academy.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** Learning is free for every authenticated user; strategy usage is gated elsewhere. */
@ApiTags('Academy')
@UseGuards(AcademyEnabledGuard, ApiAuthGuard)
@Controller(['api/v2/academy'])
export class AcademyController {
  constructor(private readonly academy: AcademyService) {}

  @Get('curriculum')
  @ApiOperation({
    operationId: 'academyCurriculum',
    summary: 'Academy chapters with per-user lesson progress',
  })
  @ApiOkResponse({ schema: openApi(curriculumResponseSchema) })
  curriculum(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: curriculumQuerySchema }) query: CurriculumQuery,
  ) {
    return this.academy.curriculum(user.id, query);
  }

  @Get('lessons/:lessonId')
  @ApiOperation({ operationId: 'academyLesson', summary: 'Lesson content without quiz answers' })
  @ApiOkResponse({ schema: openApi(lessonResponseSchema) })
  lesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', { schema: lessonIdParamSchema }) lessonId: string,
  ) {
    return this.academy.lesson(user.id, lessonId);
  }

  @Post('attempts')
  @ApiOperation({
    operationId: 'academyCreateAttempt',
    summary: 'Start (or replay by idempotency key) an 8-question lesson quiz',
  })
  @ApiCreatedResponse({ schema: openApi(attemptResponseSchema) })
  createAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: attemptCreateSchema }) body: AttemptCreateInput,
  ) {
    return this.academy.createAttempt(user.id, body);
  }

  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'academySubmitAttempt',
    summary: 'Grade an attempt server-side; 8/8 grants the lesson capabilities',
  })
  @ApiOkResponse({ schema: openApi(submitResponseSchema) })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId', { schema: attemptIdParamSchema }) attemptId: string,
    @Body({ schema: attemptSubmitSchema }) body: AttemptSubmitInput,
  ) {
    return this.academy.submit(user.id, attemptId, body);
  }
}
