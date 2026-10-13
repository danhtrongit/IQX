import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { vnToday } from './engine/window.js';
import { ResearchSyncService } from './research-sync.service.js';

/** `research.reports-sync`: daily download of broker reports into the store (no AI, spec §7.3). */
@Injectable()
export class ResearchDailyJob {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly sync: ResearchSyncService,
  ) {}

  async run(scheduledFor: Date): Promise<{ skipped: string } | Record<string, unknown>> {
    if (!this.config.get('RESEARCH_INSIGHT_ENABLED', { infer: true })) return { skipped: 'feature_disabled' };
    return this.sync.sync({ today: vnToday(scheduledFor) });
  }
}
