import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { Roles } from '../auth/index.js';
import { AdminAuditService } from './admin-audit.service.js';
import {
  auditExportQuerySchema,
  auditQuerySchema,
  type AuditExportQuery,
  type AuditQuery,
} from './admin.schemas.js';

@ApiTags('Quản trị: Nhật ký')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: ['api/v1/admin/audit', 'api/v2/admin/audit'] })
export class AdminAuditController {
  constructor(private readonly service: AdminAuditService) {}

  @Get()
  list(@Query({ schema: auditQuerySchema }) query: AuditQuery) {
    return this.service.list(query);
  }

  @Get('export')
  async export(
    @Query({ schema: auditExportQuerySchema }) query: AuditExportQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const csv = await this.service.exportCsv(query);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="admin-audit.csv"');
    reply.header('X-Content-Type-Options', 'nosniff');
    return `\uFEFF${csv}`;
  }
}
