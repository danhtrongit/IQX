/**
 * API đọc của "SACO nhận định": bảng hôm nay, bài, tim, bình luận và ảnh trong bài. Mọi đường dẫn
 * yêu cầu đăng nhập, trừ ảnh (phát công khai theo uuid, cache dài).
 */

import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Public, type AuthenticatedUser } from '../auth/index.js';
import { SacoPostsImagesService } from './saco-posts-images.service.js';
import {
  commentBodySchema,
  commentsResponseSchema,
  heartBodySchema,
  heartResponseSchema,
  okSchema,
  openapi,
  postCommentSchema,
  postDetailSchema,
  todayResponseSchema,
  uuidParamSchema,
} from './saco-posts.schemas.js';
import { SacoPostsService } from './saco-posts.service.js';

@ApiTags('Trading Floor Posts')
@Controller('api/v2/trading-floor')
export class SacoPostsController {
  constructor(
    private readonly posts: SacoPostsService,
    private readonly images: SacoPostsImagesService,
  ) {}

  @Get('posts/today')
  @ApiOperation({
    operationId: 'tradingFloorPostsToday',
    summary: 'Bài SACO nhận định đăng hôm nay (giờ Việt Nam), mới nhất trước',
  })
  @ApiOkResponse({ schema: openapi(todayResponseSchema) })
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.posts.today(user);
  }

  @Get('posts/:id')
  @ApiOperation({
    operationId: 'tradingFloorPostDetail',
    summary: 'Đọc một bài; bài bị ẩn hoặc SACO đã bị gỡ quyền trả 410 POST_UNAVAILABLE',
  })
  @ApiOkResponse({ schema: openapi(postDetailSchema) })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.detail(user, id);
  }

  @Post('posts/:id/heart')
  @HttpCode(200)
  @ApiOperation({ operationId: 'tradingFloorPostHeart', summary: 'Thả hoặc bỏ tim một bài' })
  @ApiOkResponse({ schema: openapi(heartResponseSchema) })
  heart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
    @Body({ schema: heartBodySchema }) body: z.infer<typeof heartBodySchema>,
  ) {
    return this.posts.heart(user, id, body.on);
  }

  @Get('posts/:id/comments')
  @ApiOperation({
    operationId: 'tradingFloorPostComments',
    summary: 'Bình luận đang hiện của một bài, mới nhất trước',
  })
  @ApiOkResponse({ schema: openapi(commentsResponseSchema) })
  comments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.comments(user, id);
  }

  @Post('posts/:id/comments')
  @HttpCode(200)
  @ApiOperation({ operationId: 'tradingFloorPostCommentCreate', summary: 'Gửi bình luận' })
  @ApiOkResponse({ schema: openapi(postCommentSchema) })
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
    @Body({ schema: commentBodySchema }) body: z.infer<typeof commentBodySchema>,
  ) {
    return this.posts.addComment(user, id, body.text);
  }

  @Delete('posts/comments/:commentId')
  @ApiOperation({
    operationId: 'tradingFloorPostCommentDelete',
    summary: 'Người viết xoá bình luận của mình',
  })
  @ApiOkResponse({ schema: openapi(okSchema) })
  deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', { schema: uuidParamSchema }) commentId: string,
  ) {
    return this.posts.deleteComment(user, commentId);
  }

  @Post('posts/comments/:commentId/hide')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'tradingFloorPostCommentHide',
    summary: 'SACO tác giả, quản trị viên hoặc trưởng nhóm của SACO ẩn bình luận',
  })
  @ApiOkResponse({ schema: openapi(okSchema) })
  hideComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', { schema: uuidParamSchema }) commentId: string,
  ) {
    return this.posts.hideComment(user, commentId);
  }

  @Post('posts/comments/:commentId/report')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'tradingFloorPostCommentReport',
    summary: 'Báo cáo một bình luận (một lần mỗi tài khoản)',
  })
  @ApiOkResponse({ schema: openapi(okSchema) })
  reportComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', { schema: uuidParamSchema }) commentId: string,
  ) {
    return this.posts.reportComment(user, commentId);
  }

  @Public()
  @Get('post-images/:imageId')
  @ApiOperation({
    operationId: 'tradingFloorPostImage',
    summary: 'Ảnh trong bài (WebP), phát công khai theo uuid',
  })
  @ApiOkResponse({
    description: 'Ảnh WebP',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  async image(
    @Param('imageId', { schema: uuidParamSchema }) imageId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.images.open(imageId);
    reply.header('Content-Type', 'image/webp');
    reply.header('Content-Length', String(file.size));
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('X-Content-Type-Options', 'nosniff');
    await reply.send(this.images.read(file.path));
  }
}
