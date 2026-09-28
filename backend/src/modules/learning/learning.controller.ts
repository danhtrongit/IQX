import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  ApiAuthGuard,
  AuthService,
  CurrentUser,
  Public,
  type AuthenticatedUser,
} from '../auth/index.js';
import { LearningService } from './learning.service.js';
import {
  courseListQuerySchema,
  progressQuerySchema,
  progressUpdateSchema,
  type CourseListQuery,
  type ProgressUpdate,
} from './learning.schemas.js';

@UseGuards(ApiAuthGuard)
@Controller(['api/v1/lessons', 'api/v2/lessons'])
export class LearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly auth: AuthService,
  ) {}

  @Public()
  @Get('courses')
  async courses(@Query({ schema: courseListQuerySchema }) query: CourseListQuery) {
    const result = await this.learning.list(query, true);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      page_size: query.page_size,
      total_pages: result.total_pages,
    };
  }

  @Public()
  @Get('courses/:slug')
  async course(@Param('slug') slug: string, @Req() request: FastifyRequest) {
    return this.learning.publicCourse(slug, await this.optionalUser(request));
  }

  @Get('episodes/:episodeId/content')
  content(
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learning.content(episodeId, user);
  }

  @Post('episodes/:episodeId/progress')
  updateProgress(
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
    @Body({ schema: progressUpdateSchema }) body: ProgressUpdate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learning.updateProgress(user, episodeId, body);
  }

  @Get('me/progress')
  progress(
    @Query({ schema: progressQuerySchema }) query: { course_id: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learning.progress(user.id, query.course_id);
  }

  private async optionalUser(request: FastifyRequest): Promise<AuthenticatedUser | undefined> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      return await this.auth.authenticate(header.slice(7).trim());
    } catch {
      return undefined;
    }
  }
}
