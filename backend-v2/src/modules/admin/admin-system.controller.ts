import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from './admin-audit.service.js';
import { AdminSystemService } from './admin-system.service.js';

@ApiTags('Quản trị: Hệ thống')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: ['api/v1/admin/system', 'api/v2/admin/system'] })
export class AdminSystemController {
  constructor(private readonly service: AdminSystemService) {}
  @Get('status') status() {
    return this.service.status();
  }
  @Post('jobs/:jobId/run') run(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ) {
    return this.service.runJob(jobId, auditContext(user, request));
  }
}
