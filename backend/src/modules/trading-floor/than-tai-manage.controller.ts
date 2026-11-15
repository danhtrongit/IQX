/**
 * API quản trị Thần Tài v2 dưới `api/v2/trading-floor/manage/than-tai`: sửa nội dung lá quẻ, quẻ và cấu
 * hình 5 hành. Chỉ quản trị viên; mọi thao tác sửa ghi `admin_audit_log`.
 */

import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import type { Hanh } from './than-tai.logic.js';
import type { AdminHanh, AdminLa, AdminQue } from './than-tai.repository.js';
import {
  THAN_TAI_ADMIN_HANH_LIST_SCHEMA,
  THAN_TAI_ADMIN_HANH_SCHEMA,
  THAN_TAI_ADMIN_LA_LIST_SCHEMA,
  THAN_TAI_ADMIN_LA_SCHEMA,
  THAN_TAI_ADMIN_QUE_SCHEMA,
  thanTaiHanhParamSchema,
  thanTaiHanhPatchSchema,
  thanTaiLaIdParamSchema,
  thanTaiLaPatchSchema,
  thanTaiQueIdParamSchema,
  thanTaiQuePatchSchema,
  type ThanTaiHanhPatch,
  type ThanTaiLaPatch,
  type ThanTaiQuePatch,
} from './than-tai.schemas.js';
import { ThanTaiService } from './than-tai.service.js';

@ApiTags('Khu giao dịch · Quản trị Thần Tài')
@ApiBearerAuth()
@Roles('admin')
@Controller('api/v2/trading-floor/manage/than-tai')
export class ThanTaiManageController {
  constructor(private readonly service: ThanTaiService) {}

  @Get('la')
  @ApiOperation({
    operationId: 'thanTaiAdminLaList',
    summary: 'Mọi lá quẻ (đang bật hoặc đã tắt) kèm nội dung quẻ, xếp theo quẻ rồi hào động',
  })
  @ApiOkResponse({ schema: THAN_TAI_ADMIN_LA_LIST_SCHEMA })
  laList(): Promise<{ items: AdminLa[] }> {
    return this.service.adminLaList();
  }

  @Put('la/:id')
  @ApiOperation({
    operationId: 'thanTaiAdminLaUpdate',
    summary: 'Sửa một lá: tên hào, kinh văn hào, nghĩa, hạng, thầy luận, lời chốt, bật/tắt',
  })
  @ApiOkResponse({ schema: THAN_TAI_ADMIN_LA_SCHEMA })
  laUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: thanTaiLaIdParamSchema }) id: number,
    @Body({ schema: thanTaiLaPatchSchema }) body: ThanTaiLaPatch,
  ): Promise<AdminLa> {
    return this.service.adminLaUpdate(id, body, auditContext(user, request));
  }

  @Put('que/:id')
  @ApiOperation({
    operationId: 'thanTaiAdminQueUpdate',
    summary: 'Sửa phần theo quẻ (1–64): tên, chữ Hán, tượng, thoán và nghĩa thoán',
  })
  @ApiOkResponse({ schema: THAN_TAI_ADMIN_QUE_SCHEMA })
  queUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: thanTaiQueIdParamSchema }) id: number,
    @Body({ schema: thanTaiQuePatchSchema }) body: ThanTaiQuePatch,
  ): Promise<AdminQue> {
    return this.service.adminQueUpdate(id, body, auditContext(user, request));
  }

  @Get('hanh')
  @ApiOperation({
    operationId: 'thanTaiAdminHanhList',
    summary: 'Cấu hình 5 hành: ngành, màu hợp và hướng',
  })
  @ApiOkResponse({ schema: THAN_TAI_ADMIN_HANH_LIST_SCHEMA })
  hanhList(): Promise<{ items: AdminHanh[] }> {
    return this.service.adminHanhList();
  }

  @Put('hanh/:hanh')
  @ApiOperation({
    operationId: 'thanTaiAdminHanhUpdate',
    summary: 'Sửa cấu hình một hành (kim, moc, thuy, hoa, tho): danh sách ngành, màu và hướng',
  })
  @ApiOkResponse({ schema: THAN_TAI_ADMIN_HANH_SCHEMA })
  hanhUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('hanh', { schema: thanTaiHanhParamSchema }) hanh: Hanh,
    @Body({ schema: thanTaiHanhPatchSchema }) body: ThanTaiHanhPatch,
  ): Promise<AdminHanh> {
    return this.service.adminHanhUpdate(hanh, body, auditContext(user, request));
  }
}
