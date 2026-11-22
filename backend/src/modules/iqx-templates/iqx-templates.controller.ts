import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  ApiAuthGuard,
  CurrentUser,
  Premium,
  PremiumGuard,
  Roles,
  RolesGuard,
} from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { SavedFiltersFeatureGuard } from '../saved-filters/saved-filters.feature.guard.js';
import { auditContext } from '../users/audit.js';
import {
  iqxAdminDetailSchema,
  iqxAdminListSchema,
  iqxCreateBodySchema,
  iqxDeletedSchema,
  iqxDraftBodySchema,
  iqxKindQuerySchema,
  iqxOrderBodySchema,
  iqxPublishBodySchema,
  iqxPublishedListSchema,
  iqxReasonBodySchema,
  iqxRestoreBodySchema,
  iqxTemplateIdSchema,
  iqxUsedBodySchema,
  iqxUsedResponseSchema,
  iqxUserVersionDetailSchema,
  iqxUserVersionListSchema,
  iqxVersionParamSchema,
  type IqxCreateBody,
  type IqxDraftBody,
  type IqxKindQuery,
  type IqxOrderBody,
  type IqxPublishBody,
  type IqxReasonBody,
  type IqxRestoreBody,
  type IqxUsedBody,
} from './iqx-templates.schemas.js';
import { IqxTemplatesService } from './iqx-templates.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Tab IQX of Bộ lọc and Backtest (spec §4.2): the shown, published Bộ lọc IQX / Chiến lược IQX.
 * Same gates as the Strategy page (feature flag + Premium): the tab opens no new access.
 */
@ApiTags('Strategy IQX templates')
@Premium()
@UseGuards(SavedFiltersFeatureGuard, ApiAuthGuard, PremiumGuard)
@Controller('api/v2/strategy/iqx-templates')
export class IqxTemplatesController {
  constructor(private readonly templates: IqxTemplatesService) {}

  @Get()
  @ApiOperation({
    operationId: 'listStrategyIqxTemplates',
    summary: 'Bộ lọc IQX hoặc Chiến lược IQX đang hiện, phiên bản hiện hành',
  })
  @ApiOkResponse({ schema: openApi(iqxPublishedListSchema) })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: iqxKindQuerySchema }) query: IqxKindQuery,
  ) {
    return this.templates.listPublished(query.kind, user.id);
  }

  @Get(':id/versions')
  @ApiOperation({
    operationId: 'listStrategyIqxTemplateVersions',
    summary: 'Lịch sử phiên bản của một Chiến lược IQX (đã ẩn: chỉ khi Bot đang dùng)',
  })
  @ApiOkResponse({ schema: openApi(iqxUserVersionListSchema) })
  versions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
  ) {
    return this.templates.userVersions(user.id, id);
  }

  @Get(':id/versions/:version')
  @ApiOperation({
    operationId: 'getStrategyIqxTemplateVersion',
    summary: 'Nội dung một phiên bản Chiến lược IQX',
  })
  @ApiOkResponse({ schema: openApi(iqxUserVersionDetailSchema) })
  version(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
    @Param('version', { schema: iqxVersionParamSchema }) version: number,
  ) {
    return this.templates.userVersion(user.id, id, Number(version));
  }

  @Post(':id/used')
  @ApiOperation({
    operationId: 'recordStrategyIqxTemplateUsed',
    summary: 'Ghi một lần người dùng bấm Dùng (form đã được điền)',
  })
  @ApiOkResponse({ schema: openApi(iqxUsedResponseSchema) })
  used(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
    @Body({ schema: iqxUsedBodySchema }) body: IqxUsedBody,
  ) {
    return this.templates.recordUsed(user.id, id, body.version);
  }
}

/** Quản trị › Mẫu IQX (spec §5.6): admin only (team_lead 403); every write is audited. */
@ApiTags('IQX templates admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('admin')
@Controller('api/v2/admin/iqx-templates')
export class IqxTemplatesAdminController {
  constructor(private readonly templates: IqxTemplatesService) {}

  @Get()
  @ApiOperation({ operationId: 'listAdminIqxTemplates', summary: 'Danh sách Mẫu IQX của một loại' })
  @ApiOkResponse({ schema: openApi(iqxAdminListSchema) })
  list(@Query({ schema: iqxKindQuerySchema }) query: IqxKindQuery) {
    return this.templates.adminList(query.kind);
  }

  @Put('order')
  @ApiOperation({ operationId: 'reorderAdminIqxTemplates', summary: 'Ghi thứ tự hiển thị' })
  @ApiOkResponse({ schema: openApi(iqxAdminListSchema) })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body({ schema: iqxOrderBodySchema }) body: IqxOrderBody,
  ) {
    return this.templates.reorder(body.kind, body.ids, auditContext(user, request));
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getAdminIqxTemplate',
    summary: 'Thông tin, bản nháp, phiên bản hiện hành và lịch sử',
  })
  @ApiOkResponse({ schema: openApi(iqxAdminDetailSchema) })
  detail(@Param('id', { schema: iqxTemplateIdSchema }) id: string) {
    return this.templates.adminDetail(id);
  }

  @Post()
  @ApiOperation({ operationId: 'createAdminIqxTemplate', summary: 'Tạo mục mới chưa xuất bản' })
  @ApiOkResponse({ schema: openApi(iqxAdminDetailSchema) })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Body({ schema: iqxCreateBodySchema }) body: IqxCreateBody,
  ) {
    return this.templates.create(body.kind, body.draft, auditContext(user, request));
  }

  @Put(':id/draft')
  @ApiOperation({ operationId: 'saveAdminIqxTemplateDraft', summary: 'Lưu nháp' })
  @ApiOkResponse({ schema: openApi(iqxAdminDetailSchema) })
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
    @Body({ schema: iqxDraftBodySchema }) body: IqxDraftBody,
  ) {
    return this.templates.saveDraft(
      id,
      body.draft,
      body.draft_updated_at,
      auditContext(user, request),
    );
  }

  @Post(':id/publish')
  @ApiOperation({
    operationId: 'publishAdminIqxTemplate',
    summary: 'Kiểm tra rồi xuất bản phiên bản mới',
  })
  @ApiOkResponse({ schema: openApi(iqxAdminDetailSchema) })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
    @Body({ schema: iqxPublishBodySchema }) body: IqxPublishBody,
  ) {
    return this.templates.publish(id, body, auditContext(user, request));
  }

  @Post(':id/hide')
  @ApiOperation({ operationId: 'hideAdminIqxTemplate', summary: 'Ẩn khỏi tab IQX của người dùng' })
  @ApiOkResponse({ schema: openApi(iqxAdminDetailSchema) })
  hide(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
    @Body({ schema: iqxReasonBodySchema }) body: IqxReasonBody,
  ) {
    return this.templates.setVisibility(id, 'hidden', body.reason, auditContext(user, request));
  }

  @Post(':id/show')
  @ApiOperation({ operationId: 'showAdminIqxTemplate', summary: 'Hiện lại trong tab IQX' })
  @ApiOkResponse({ schema: openApi(iqxAdminDetailSchema) })
  show(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
    @Body({ schema: iqxReasonBodySchema }) body: IqxReasonBody,
  ) {
    return this.templates.setVisibility(id, 'shown', body.reason, auditContext(user, request));
  }

  @Delete(':id')
  @ApiOperation({ operationId: 'deleteAdminIqxTemplate', summary: 'Xóa mục chưa xuất bản lần nào' })
  @ApiOkResponse({ schema: openApi(iqxDeletedSchema) })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
  ) {
    return this.templates.deleteDraft(id, auditContext(user, request));
  }

  @Post(':id/restore')
  @ApiOperation({
    operationId: 'restoreAdminIqxTemplate',
    summary: 'Chép một phiên bản vào bản nháp',
  })
  @ApiOkResponse({ schema: openApi(iqxAdminDetailSchema) })
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Param('id', { schema: iqxTemplateIdSchema }) id: string,
    @Body({ schema: iqxRestoreBodySchema }) body: IqxRestoreBody,
  ) {
    return this.templates.restore(id, body.version, auditContext(user, request));
  }
}
