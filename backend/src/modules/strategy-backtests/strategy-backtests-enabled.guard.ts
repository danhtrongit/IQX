import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';

/** `STRATEGY_V2_ENABLED=false` hides the v2 backtest routes behind 404 FEATURE_DISABLED. */
@Injectable()
export class StrategyBacktestsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(): boolean {
    if (this.config.get('STRATEGY_V2_ENABLED', { infer: true })) return true;
    throw new NotFoundException({
      code: 'FEATURE_DISABLED',
      message: 'Tính năng chiến lược v2 chưa được bật.',
    });
  }
}
