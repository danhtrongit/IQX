import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Roles, type AuthenticatedUser, type PublicUser } from '../auth/index.js';
import { auditContext } from './audit.js';
import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  userIdSchema,
  userListQuerySchema,
  userUpdateSchema,
  type UserListQuery,
} from './users.schemas.js';
import { UsersService } from './users.service.js';
import {
  usernameChangeSchema,
  type AdminUserCreateInput,
  type AdminUserUpdateInput,
  type UsernameChangeInput,
  type UserUpdateInput,
} from '../auth/auth.schemas.js';

@ApiTags('Users')
@Controller(['api/v1/users', 'api/v2/users'])
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() current: AuthenticatedUser): Promise<PublicUser> {
    return this.users.getById(current.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() current: AuthenticatedUser,
    @Body({ schema: userUpdateSchema }) body: UserUpdateInput,
  ): Promise<PublicUser> {
    return this.users.updateSelf(current.id, body);
  }

  /**
   * DECISION 1: one-time replacement of a backfilled username. 422 USERNAME_LOCKED once used
   * (or for team leads), 409 USERNAME_TAKEN when another account has it.
   */
  @HttpCode(200)
  @Post('me/username')
  @ApiOkResponse({ schema: { $ref: '#/components/schemas/Legacy_UserResponse' } })
  changeUsername(
    @CurrentUser() current: AuthenticatedUser,
    @Body({ schema: usernameChangeSchema }) body: UsernameChangeInput,
  ): Promise<PublicUser> {
    return this.users.changeOwnUsername(current.id, body.username);
  }

  @Roles('admin')
  @Get()
  list(
    @Query({ schema: userListQuerySchema }) query: UserListQuery,
  ): ReturnType<UsersService['list']> {
    return this.users.list(query);
  }

  @Roles('admin')
  @Get(':userId')
  get(@Param('userId', { schema: userIdSchema }) userId: string): Promise<PublicUser> {
    return this.users.getById(userId);
  }

  @Roles('admin')
  @Post()
  create(
    @Body({ schema: adminUserCreateSchema }) body: AdminUserCreateInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    return this.users.adminCreate(body, auditContext(admin, request));
  }

  @Roles('admin')
  @Patch(':userId')
  update(
    @Param('userId', { schema: userIdSchema }) userId: string,
    @Body({ schema: adminUserUpdateSchema }) body: AdminUserUpdateInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<PublicUser> {
    return this.users.adminUpdate(userId, body, auditContext(admin, request));
  }

  @Roles('admin')
  @HttpCode(200)
  @Delete(':userId')
  async remove(
    @Param('userId', { schema: userIdSchema }) userId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<{ message: string }> {
    await this.users.softDelete(userId, auditContext(admin, request));
    return { message: 'Xóa người dùng thành công' };
  }
}
