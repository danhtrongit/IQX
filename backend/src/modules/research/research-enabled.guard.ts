import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';

/** `RESEARCH_INSIGHT_ENABLED=false` hides "Góc nhìn đầu tư" (404 FEATURE_DISABLED; the block stays hidden). */
@Injectable()
export class ResearchEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(): boolean {
    if (!this.config.get('RESEARCH_INSIGHT_ENABLED', { infer: true }))
      throw new NotFoundException({
        code: 'FEATURE_DISABLED',
        message: 'Góc nhìn đầu tư hiện chưa được bật.',
      });
    return true;
  }
}
