import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { AdminUsersService } from './admin-users.service.js';
import { auditContext } from './audit.js';
import {
  bulkUpdateSchema,
  loginHistoryQuerySchema,
  userExportQuerySchema,
  userIdSchema,
  type BulkUpdateInput,
  type LoginHistoryQuery,
  type UserExportQuery,
} from './users.schemas.js';
import { UsersService } from './users.service.js';

@ApiTags('Admin users')
@Roles('admin')
@Controller(['api/v1/admin/users', 'api/v2/admin/users'])
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly users: UsersService,
  ) {}

  @Get('export')
  @Header('content-type', 'text/csv; charset=utf-8')
  async export(
    @Query({ schema: userExportQuerySchema }) query: UserExportQuery,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const csv = await this.adminUsers.exportCsv(query, auditContext(admin, request));
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    await reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="users-${timestamp}.csv"`)
      .send(csv);
  }

  @Post('bulk')
  bulk(
    @Body({ schema: bulkUpdateSchema }) body: BulkUpdateInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): ReturnType<UsersService['bulkUpdate']> {
    return this.users.bulkUpdate(body, auditContext(admin, request));
  }

  @Get(':userId/360')
  get360(
    @Param('userId', { schema: userIdSchema }) userId: string,
  ): Promise<Record<string, unknown>> {
    return this.adminUsers.get360(userId);
  }

  @HttpCode(200)
  @Post(':userId/reset-password')
  resetPassword(
    @Param('userId', { schema: userIdSchema }) userId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): ReturnType<AdminUsersService['resetPassword']> {
    return this.adminUsers.resetPassword(userId, auditContext(admin, request));
  }

  @HttpCode(202)
  @Post(':userId/resend-verification')
  async resendVerification(
    @Param('userId', { schema: userIdSchema }) userId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    await this.users.resendVerification(userId, auditContext(admin, request));
    return { message: 'Đã gửi lại email xác thực.' };
  }

  @Get(':userId/login-history')
  loginHistory(
    @Param('userId', { schema: userIdSchema }) userId: string,
    @Query({ schema: loginHistoryQuerySchema }) query: LoginHistoryQuery,
  ): Promise<Record<string, unknown>> {
    return this.adminUsers.loginHistory(userId, query);
  }
}
