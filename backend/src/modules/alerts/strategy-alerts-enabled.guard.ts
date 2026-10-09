import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';

/** `STRATEGY_V2_ENABLED=false` hides /api/v2/strategy/alerts behind 404 FEATURE_DISABLED. */
@Injectable()
export class StrategyAlertsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(): boolean {
    if (this.config.get('STRATEGY_V2_ENABLED', { infer: true })) return true;
    throw new NotFoundException({
      code: 'FEATURE_DISABLED',
      message: 'Tính năng chiến lược v2 chưa được bật.',
    });
  }
}
