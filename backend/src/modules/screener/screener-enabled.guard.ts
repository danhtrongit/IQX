import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';

/** `STRATEGY_V2_ENABLED=false` hides every /api/v2/strategy/screener route behind 404 FEATURE_DISABLED. */
@Injectable()
export class ScreenerEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(): boolean {
    if (!this.config.get('STRATEGY_V2_ENABLED', { infer: true }))
      throw new NotFoundException({
        code: 'FEATURE_DISABLED',
        message: 'Bộ lọc chiến lược hiện chưa được bật.',
      });
    return true;
  }
}
