import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { DatabaseService } from '../../platform/database/index.js';
import { AUTH_PREMIUM_KEY } from './auth.decorators.js';
import type { AuthenticatedUser } from './auth.types.js';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(AUTH_PREMIUM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user)
      throw new ForbiddenException({ code: 'PREMIUM_REQUIRED', message: 'Yêu cầu gói Premium' });
    if (user.role === 'admin') return true;
    const rows = await this.database.query<{ entitled: boolean }>(
      `select exists(
         select 1 from billing_entitlement_grants
         where user_id = $1 and status = 'active'
           and starts_at <= now() and now() < ends_at
       ) as entitled`,
      [user.id],
    );
    if (!rows[0]?.entitled) {
      throw new ForbiddenException({
        code: 'PREMIUM_REQUIRED',
        message: 'Yêu cầu gói Premium đang hoạt động',
      });
    }
    return true;
  }
}
