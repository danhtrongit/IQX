import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';

/**
 * The practice is part of the learning flow and depends on Academy grants, so it follows the
 * Academy switch: `ACADEMY_ENABLED=false` hides every /api/v2/practice route (404 FEATURE_DISABLED).
 */
@Injectable()
export class PracticeEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(): boolean {
    if (!this.config.get('ACADEMY_ENABLED', { infer: true }))
      throw new NotFoundException({
        code: 'FEATURE_DISABLED',
        message: 'Mini luyện tập hiện chưa được bật.',
      });
    return true;
  }
}
