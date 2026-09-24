import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { AUTH_PUBLIC_KEY } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';

const AUTHENTICATED = Symbol('iqx.auth.verified');
type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser; [AUTHENTICATED]?: true };

@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(AUTH_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request[AUTHENTICATED] && request.user) return true;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Yêu cầu đăng nhập' });
    }
    const token = authorization.slice(7).trim();
    if (!token)
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Yêu cầu đăng nhập' });
    request.user = await this.auth.authenticate(token);
    request[AUTHENTICATED] = true;
    return true;
  }
}
