import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { AuthenticatedUser, UserRole } from './auth.types.js';

export const AUTH_PUBLIC_KEY = 'iqx.auth.public';
export const AUTH_ROLES_KEY = 'iqx.auth.roles';
export const AUTH_PREMIUM_KEY = 'iqx.auth.premium';

export const Public = () => SetMetadata(AUTH_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(AUTH_ROLES_KEY, roles);
export const Premium = () => SetMetadata(AUTH_PREMIUM_KEY, true);

type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new Error('Authentication guard did not populate request.user');
    return request.user;
  },
);
