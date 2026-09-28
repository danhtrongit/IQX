import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  ApiAuthGuard,
  CurrentUser,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '../auth/index.js';
import { LearningService } from './learning.service.js';
import {
  courseCreateSchema,
  courseListQuerySchema,
  courseUpdateSchema,
  episodeCreateSchema,
  episodeUpdateSchema,
  reorderSchema,
  type CourseCreate,
  type CourseListQuery,
  type CourseUpdate,
  type EpisodeCreate,
  type EpisodeUpdate,
  type ReorderInput,
} from './learning.schemas.js';

type MultipartFile = { mimetype?: string; file: AsyncIterable<Buffer | Uint8Array> };
type MultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
  file(): Promise<MultipartFile | undefined>;
};

@UseGuards(ApiAuthGuard, RolesGuard)
@Roles('admin')
@Controller(['api/v1/admin/lessons', 'api/v2/admin/lessons'])
export class AdminLearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('courses')
  async courses(@Query({ schema: courseListQuerySchema }) query: CourseListQuery) {
    const result = await this.learning.list(query, false);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      page_size: query.page_size,
      total_pages: result.total_pages,
    };
  }
  @Post('courses')
  createCourse(
    @Body({ schema: courseCreateSchema }) body: CourseCreate,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learning.createCourse(body, user.id);
  }
  @Get('courses/:courseId')
  course(@Param('courseId', new ParseUUIDPipe()) id: string) {
    return this.learning.adminCourse(id);
  }
  @Patch('courses/:courseId')
  updateCourse(
    @Param('courseId', new ParseUUIDPipe()) id: string,
    @Body({ schema: courseUpdateSchema }) body: CourseUpdate,
  ) {
    return this.learning.updateCourse(id, body);
  }
  @Delete('courses/:courseId')
  deleteCourse(@Param('courseId', new ParseUUIDPipe()) id: string) {
    return this.learning.deleteCourse(id);
  }
  @Post('courses/:courseId/thumbnail')
  async thumbnail(
    @Param('courseId', new ParseUUIDPipe()) id: string,
    @Req() request: MultipartRequest,
  ) {
    if (!request.isMultipart())
      throw new BadRequestException({
        code: 'MULTIPART_REQUIRED',
        message: 'Content-Type phải là multipart/form-data',
      });
    const file = await request.file();
    if (!file)
      throw new BadRequestException({
        code: 'MULTIPART_FILE_REQUIRED',
        message: 'Yêu cầu một file multipart',
      });
    return this.learning.uploadThumbnail(id, file.file, file.mimetype);
  }
  @Post('courses/:courseId/episodes')
  createEpisode(
    @Param('courseId', new ParseUUIDPipe()) id: string,
    @Body({ schema: episodeCreateSchema }) body: EpisodeCreate,
  ) {
    return this.learning.createEpisode(id, body);
  }
  @Patch('episodes/:episodeId')
  updateEpisode(
    @Param('episodeId', new ParseUUIDPipe()) id: string,
    @Body({ schema: episodeUpdateSchema }) body: EpisodeUpdate,
  ) {
    return this.learning.updateEpisode(id, body);
  }
  @Delete('episodes/:episodeId')
  @HttpCode(204)
  deleteEpisode(@Param('episodeId', new ParseUUIDPipe()) id: string) {
    return this.learning.deleteEpisode(id);
  }
  @Post('episodes/:episodeId/file')
  async episodeFile(
    @Param('episodeId', new ParseUUIDPipe()) id: string,
    @Req() request: MultipartRequest,
  ) {
    if (!request.isMultipart())
      throw new BadRequestException({
        code: 'MULTIPART_REQUIRED',
        message: 'Content-Type phải là multipart/form-data',
      });
    const file = await request.file();
    if (!file)
      throw new BadRequestException({
        code: 'MULTIPART_FILE_REQUIRED',
        message: 'Yêu cầu một file multipart',
      });
    return this.learning.uploadEpisode(id, file.file, file.mimetype);
  }
  @Post('courses/:courseId/reorder')
  @HttpCode(200)
  async reorder(
    @Param('courseId', new ParseUUIDPipe()) id: string,
    @Body({ schema: reorderSchema }) body: ReorderInput,
  ) {
    await this.learning.reorder(id, body);
    return { message: 'Đã cập nhật thứ tự tập học' };
  }
}
