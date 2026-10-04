import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';

/** `ACADEMY_ENABLED=false` hides every /api/v2/academy route behind 404 FEATURE_DISABLED. */
@Injectable()
export class AcademyEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(): boolean {
    if (!this.config.get('ACADEMY_ENABLED', { infer: true }))
      throw new NotFoundException({
        code: 'FEATURE_DISABLED',
        message: 'Học viện hiện chưa được bật.',
      });
    return true;
  }
}
