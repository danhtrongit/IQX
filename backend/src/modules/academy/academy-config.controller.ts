import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, type SchemaObject } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import { AcademyConfigService } from './academy-config.service.js';
import {
  academyConfigCreateSchema,
  academyConfigIdParamSchema,
  academyConfigItemSchema,
  academyConfigListResponseSchema,
  academyConfigLogsQuerySchema,
  academyConfigLogsResponseSchema,
  academyConfigPreviewResponseSchema,
  academyConfigWriteSchema,
  type AcademyConfigCreate,
  type AcademyConfigLogsQuery,
  type AcademyConfigWrite,
} from './academy-config.schemas.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/**
 * Học viện v4.1 §1.3 / §1.4 / §8.3: the Academy configs of the admin area. ADMIN ONLY: creating, saving and deleting
 * a config (the default one included) is refused to every other role, a team lead too; he reads his own group's config
 * through `GET api/v2/team/academy-config`. Not behind the Academy feature flag: staff configure the Academy while it
 * is hidden. Every change writes `academy_config_logs` and the global admin audit trail.
 */
@ApiTags('Admin Academy')
@ApiBearerAuth()
@Roles('admin')
@Controller('api/v2/admin/academy-configs')
export class AdminAcademyConfigsController {
  constructor(private readonly configs: AcademyConfigService) {}

  @Get()
  @ApiOperation({
    operationId: 'adminAcademyConfigs',
    summary:
      'Academy configs (v4.1 §1.4): the default first, then every team lead with his own config or "Theo mặc định", the 12 catalog chapters and the users each config applies to',
  })
  @ApiOkResponse({ schema: openApi(academyConfigListResponseSchema) })
  list() {
    return this.configs.list();
  }

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'adminAcademyConfigPreview',
    summary:
      'Preview of a config: the chapters exactly as the group will see them, renumbered from 1, N and the Dashboard warnings; saves nothing',
  })
  @ApiOkResponse({ schema: openApi(academyConfigPreviewResponseSchema) })
  preview(@Body({ schema: academyConfigWriteSchema }) body: AcademyConfigWrite) {
    return this.configs.preview(body);
  }

  @Post()
  @ApiOperation({
    operationId: 'adminAcademyConfigCreate',
    summary:
      'Create the own config of a team lead (409 ACADEMY_CONFIG_EXISTS when he has one; 404 ACADEMY_LEADER_NOT_FOUND; 422 ACADEMY_CONFIG_INVALID)',
  })
  @ApiOkResponse({ schema: openApi(academyConfigItemSchema) })
  create(
    @Body({ schema: academyConfigCreateSchema }) body: AcademyConfigCreate,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.configs.create(body, auditContext(admin, request));
  }

  @Put(':id')
  @ApiOperation({
    operationId: 'adminAcademyConfigSave',
    summary:
      'Save a config (the default or a lead’s own): mode and at least one valid chapter; applies at once to every user it covers; logged (404 ACADEMY_CONFIG_NOT_FOUND, 422 ACADEMY_CONFIG_INVALID)',
  })
  @ApiOkResponse({ schema: openApi(academyConfigItemSchema) })
  save(
    @Param('id', { schema: academyConfigIdParamSchema }) id: string,
    @Body({ schema: academyConfigWriteSchema }) body: AcademyConfigWrite,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.configs.update(id, body, auditContext(admin, request));
  }

  @Delete(':id')
  @ApiOperation({
    operationId: 'adminAcademyConfigDelete',
    summary:
      'Delete the own config of a team lead ("Về mặc định"): the group goes back to the default; 409 ACADEMY_CONFIG_DEFAULT_PROTECTED for the default config; logged',
  })
  @ApiOkResponse({ schema: openApi(academyConfigItemSchema) })
  remove(
    @Param('id', { schema: academyConfigIdParamSchema }) id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.configs.remove(id, auditContext(admin, request));
  }

  @Get(':id/logs')
  @ApiOperation({
    operationId: 'adminAcademyConfigLogs',
    summary: 'Change log of a config: who, when, before and after (newest first)',
  })
  @ApiOkResponse({ schema: openApi(academyConfigLogsResponseSchema) })
  logs(
    @Param('id', { schema: academyConfigIdParamSchema }) id: string,
    @Query({ schema: academyConfigLogsQuerySchema }) query: AcademyConfigLogsQuery,
  ) {
    return this.configs.logs(id, query.limit);
  }
}
