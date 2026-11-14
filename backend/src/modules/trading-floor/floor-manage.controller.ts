/**
 * API Quản trị SACO dưới `api/v2/trading-floor/manage` (spec nhắn tin với SACO, mục "Quản trị SACO").
 * Chỉ quản trị viên và trưởng nhóm; trưởng nhóm luôn bị giới hạn ở SACO của nhóm mình. Mọi thao tác
 * ghi `admin_audit_log`.
 */

import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import { FloorSacoService, type ManageList } from './floor-saco.service.js';
import type { FloorCandidate } from './floor-saco.repository.js';
import {
  FLOOR_CANDIDATES_SCHEMA,
  FLOOR_MANAGE_CONVS_SCHEMA,
  FLOOR_MANAGE_CONV_SCHEMA,
  FLOOR_MANAGE_INVITES_SCHEMA,
  FLOOR_MANAGE_LIST_SCHEMA,
  FLOOR_MANAGE_SACO_SCHEMA,
  floorIdParamSchema,
  manageInvitesQuerySchema,
  sacoCandidatesQuerySchema,
  sacoGrantBodySchema,
  sacoMoveBodySchema,
  sacoUpdateBodySchema,
  type SacoGrantBody,
  type SacoUpdateBody,
} from './floor.schemas.js';
import type {
  ManageConv,
  ManageConvDetail,
  ManageInvite,
  ManageSaco,
} from './floor-types.js';

@ApiTags('Khu giao dịch · Quản trị SACO')
@ApiBearerAuth()
@Roles('admin', 'team_lead')
@Controller('api/v2/trading-floor/manage')
export class FloorManageController {
  constructor(private readonly sacos: FloorSacoService) {}

  @Get('sacos')
  @ApiOperation({
    operationId: 'floorManageSacos',
    summary: 'Hàng khớp SACO (cả sàn), SACO đã gỡ của phạm vi mình và danh sách nhóm',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_LIST_SCHEMA })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ManageList> {
    return this.sacos.list(user);
  }

  @Get('saco-candidates')
  @ApiOperation({
    operationId: 'floorManageSacoCandidates',
    summary: 'Tìm tài khoản có thể được gán quyền SACO (tối đa 20; trưởng nhóm chỉ thấy nhóm mình)',
  })
  @ApiOkResponse({ schema: FLOOR_CANDIDATES_SCHEMA })
  candidates(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: sacoCandidatesQuerySchema }) query: z.infer<typeof sacoCandidatesQuerySchema>,
  ): Promise<{ items: FloorCandidate[] }> {
    return this.sacos.candidates(user, query.q);
  }

  @Post('sacos')
  @ApiOperation({
    operationId: 'floorManageSacoGrant',
    summary: 'Gán quyền SACO cho một tài khoản (vào cuối hàng, trạng thái Vắng); gán lại thì khôi phục dòng cũ',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_SACO_SCHEMA })
  grant(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body({ schema: sacoGrantBodySchema }) body: SacoGrantBody,
  ): Promise<ManageSaco> {
    return this.sacos.grant(user, body, auditContext(user, request));
  }

  @Patch('sacos/:id')
  @ApiOperation({
    operationId: 'floorManageSacoUpdate',
    summary: 'Đổi tên hiển thị của SACO; chỉ quản trị viên được đổi nhóm',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_SACO_SCHEMA })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
    @Body({ schema: sacoUpdateBodySchema }) body: SacoUpdateBody,
  ): Promise<ManageSaco> {
    return this.sacos.update(user, id, body, auditContext(user, request));
  }

  @Post('sacos/:id/move')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorManageSacoMove',
    summary: 'Đổi chỗ SACO trong hàng khớp (▲▼); trưởng nhóm chỉ đổi chỗ trong các vị trí của nhóm mình',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_LIST_SCHEMA })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
    @Body({ schema: sacoMoveBodySchema }) body: z.infer<typeof sacoMoveBodySchema>,
  ): Promise<ManageList> {
    return this.sacos.move(user, id, body.dir, auditContext(user, request));
  }

  @Post('sacos/:id/remove')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'floorManageSacoRemove',
    summary: 'Gỡ quyền SACO: ra khỏi hàng khớp, chat cũ thành chỉ đọc, thu hồi lời mời đang chờ',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_LIST_SCHEMA })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: floorIdParamSchema }) id: string,
  ): Promise<ManageList> {
    return this.sacos.remove(user, id, auditContext(user, request));
  }

  @Get('invites')
  @ApiOperation({
    operationId: 'floorManageInvites',
    summary: 'Nhật ký lời mời Chat SACO (mới nhất trước), trong phạm vi nhóm',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_INVITES_SCHEMA })
  invites(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: manageInvitesQuerySchema }) query: z.infer<typeof manageInvitesQuerySchema>,
  ): Promise<{ items: ManageInvite[] }> {
    return this.sacos.invites(user, query.limit);
  }

  @Get('convs')
  @ApiOperation({
    operationId: 'floorManageConvs',
    summary: 'Lịch sử chat: các cặp người dùng và SACO, mới nhất trước, trong phạm vi nhóm',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_CONVS_SCHEMA })
  convs(@CurrentUser() user: AuthenticatedUser): Promise<{ items: ManageConv[] }> {
    return this.sacos.convs(user);
  }

  @Get('convs/:id')
  @ApiOperation({
    operationId: 'floorManageConv',
    summary: 'Toàn bộ một cuộc chat, chỉ xem: không đổi trạng thái đã xem hay chưa đọc',
  })
  @ApiOkResponse({ schema: FLOOR_MANAGE_CONV_SCHEMA })
  conv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: floorIdParamSchema }) id: string,
  ): Promise<ManageConvDetail> {
    return this.sacos.conv(user, id);
  }
}
