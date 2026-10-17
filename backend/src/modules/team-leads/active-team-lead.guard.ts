import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { DatabaseService } from '../../platform/database/index.js';
import type { AuthenticatedUser } from '../auth/index.js';

/**
 * Admin spec v1.1 §4.2 (`team/*`): besides `@Roles('team_lead')`, the caller must hold an
 * active team_lead_profiles row. A revoke already turns the role back into user/premium; this
 * guard also covers a role/profile mismatch, so a revoked lead never reads a group.
 */
@Injectable()
export class ActiveTeamLeadGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const userId = request.user?.id;
    const rows = userId
      ? await this.database.query<{ user_id: string }>(
          `select user_id from team_lead_profiles where user_id = $1 and status = 'active'`,
          [userId],
        )
      : [];
    if (rows.length === 0) {
      throw new ForbiddenException({
        code: 'TEAM_LEAD_NOT_ACTIVE',
        message: 'Bạn không còn là trưởng nhóm',
      });
    }
    return true;
  }
}
