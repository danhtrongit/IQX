/**
 * API quản trị bài SACO nhận định cho quản trị viên và trưởng nhóm. Trưởng nhóm chỉ thấy và ẩn bài của
 * SACO trong nhóm mình; bỏ ẩn là việc riêng của quản trị viên.
 */

import { Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Roles, RolesGuard, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import {
  commentReportsResponseSchema,
  manageListQuerySchema,
  managePostDetailSchema,
  managePostsResponseSchema,
  openapi,
  postStateSchema,
  uuidParamSchema,
} from './saco-posts.schemas.js';
import { SacoPostsService } from './saco-posts.service.js';

@ApiTags('Trading Floor Posts Admin')
@Controller('api/v2/trading-floor/manage')
@UseGuards(RolesGuard)
@Roles('admin', 'team_lead')
export class SacoPostsManageController {
  constructor(private readonly posts: SacoPostsService) {}

  @Get('posts')
  @ApiOperation({
    operationId: 'tradingFloorManagePosts',
    summary: 'Bài đã đăng và bài bị ẩn trong phạm vi của người quản trị',
  })
  @ApiOkResponse({ schema: openapi(managePostsResponseSchema) })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: manageListQuerySchema }) query: z.infer<typeof manageListQuerySchema>,
  ) {
    return this.posts.managePosts(user, query.status);
  }

  @Get('comment-reports')
  @ApiOperation({
    operationId: 'tradingFloorManageCommentReports',
    summary: 'Bình luận đang hiện bị báo cáo trong phạm vi của người quản trị',
  })
  @ApiOkResponse({ schema: openapi(commentReportsResponseSchema) })
  commentReports(@CurrentUser() user: AuthenticatedUser) {
    return this.posts.manageCommentReports(user);
  }

  @Get('posts/:id')
  @ApiOperation({
    operationId: 'tradingFloorManagePost',
    summary: 'Chi tiết một bài kèm nhật ký đăng, ẩn, bỏ ẩn',
  })
  @ApiOkResponse({ schema: openapi(managePostDetailSchema) })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.managePost(user, id);
  }

  @Post('posts/:id/hide')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'tradingFloorManagePostHide',
    summary: 'Ẩn bài (quản trị viên hoặc trưởng nhóm của SACO)',
  })
  @ApiOkResponse({ schema: openapi(postStateSchema) })
  hide(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.hidePost(user, auditContext(user, request), id);
  }

  @Post('posts/:id/unhide')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'tradingFloorManagePostUnhide',
    summary: 'Bỏ ẩn bài (chỉ quản trị viên)',
  })
  @ApiOkResponse({ schema: openapi(postStateSchema) })
  unhide(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: uuidParamSchema }) id: string,
  ) {
    return this.posts.unhidePost(user, auditContext(user, request), id);
  }
}
