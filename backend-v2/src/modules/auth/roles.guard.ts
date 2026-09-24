import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { AUTH_ROLES_KEY } from './auth.decorators.js';
import type { AuthenticatedUser, UserRole } from './auth.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(AUTH_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    if (!request.user || !roles.includes(request.user.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    }
    return true;
  }
}
