/**
 * API của SACO tác giả: nháp, đăng bài, ảnh, "Bài của tôi" và báo cáo bình luận dưới bài của mình.
 * Tài khoản không còn quyền SACO nhận 403 SACO_REQUIRED ở mọi đường dẫn này.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser } from '../auth/index.js';
import {
  commentReportsResponseSchema,
  draftBodySchema,
  imageResponseSchema,
  myPostDetailSchema,
  myPostsResponseSchema,
  okSchema,
  openapi,
  saveDraftResponseSchema,
  uuidParamSchema,
} from './saco-posts.schemas.js';
import { SacoPostsService } from './saco-posts.service.js';

type MultipartFile = { file: AsyncIterable<Buffer | Uint8Array> };
type MultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
  file(): Promise<MultipartFile | undefined>;
};

@ApiTags('Trading Floor Posts')
@Controller('api/v2/trading-floor/saco')
export class SacoPostsAuthorController {
  constructor(private readonly posts: SacoPostsService) {}

  @Get('posts')
  @ApiOperation({ operationId: 'tradingFloorSacoPosts', summary: 'Bài của tôi, mới nhất trước' })
  @ApiOkResponse({ schema: openapi(myPostsResponseSchema) })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.posts.minePosts(user);
  }

  @Post('posts')
  @HttpCode(200)
  @ApiOperation({ operationId: 'tradingFloorSacoPostCreate', summary: 'Tạo bản nháp trống' })
  @ApiOkResponse({ schema: openapi(myPostDetailSchema) })
  create(@CurrentUser() user: AuthenticatedUser) {
    return this.posts.createPost(user);
  }

  @Get('comment-reports')
  @ApiOperation({
    operationId: 'tradingFloorSacoCommentReports',
    summary: 'Bình luận bị báo cáo dưới bài của tôi',
  })
  @ApiOkResponse({ schema: openapi(commentReportsResponseSchema) })
  commentReports(@CurrentUser() user: AuthenticatedUser) {
    return this.posts.mineCommentReports(user);
  }

  @Get('posts/:id')
  @ApiOperation({
    operationId: 'tradingFloorSacoPost',
    summary: 'Một bài của tôi, mọi trạng thái',
  })
  @ApiOkResponse({ schema: openapi(myPostDetailSchema) })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.minePost(user, id);
  }

  @Put('posts/:id')
  @ApiOperation({
    operationId: 'tradingFloorSacoPostSave',
    summary: 'Lưu nháp; baseRevision cũ trả 409 DRAFT_STALE',
  })
  @ApiOkResponse({ schema: openapi(saveDraftResponseSchema) })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
    @Body({ schema: draftBodySchema }) body: z.infer<typeof draftBodySchema>,
  ) {
    return this.posts.saveDraft(user, id, body);
  }

  @Delete('posts/:id')
  @ApiOperation({ operationId: 'tradingFloorSacoPostDelete', summary: 'Xoá bản nháp' })
  @ApiOkResponse({ schema: openapi(okSchema) })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.deleteDraft(user, id);
  }

  @Post('posts/:id/images')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'tradingFloorSacoPostImageUpload',
    summary: 'Tải ảnh vào nháp (JPG, PNG, WebP, tối đa 5 MB), máy chủ nén lại thành WebP',
  })
  @ApiOkResponse({ schema: openapi(imageResponseSchema) })
  async uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
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
    return this.posts.uploadImage(user, id, file.file);
  }

  @Post('posts/:id/publish')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'tradingFloorSacoPostPublish',
    summary: 'Lưu rồi đăng bài; đăng lại bài đã đăng trả về chính bài đó',
  })
  @ApiOkResponse({ schema: openapi(myPostDetailSchema) })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
    @Body({ schema: draftBodySchema }) body: z.infer<typeof draftBodySchema>,
  ) {
    return this.posts.publish(user, id, body);
  }

  @Post('posts/:id/comments-seen')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'tradingFloorSacoPostCommentsSeen',
    summary: 'Đánh dấu đã xem hết bình luận mới của bài',
  })
  @ApiOkResponse({ schema: openapi(okSchema) })
  commentsSeen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.markCommentsSeen(user, id);
  }
}
