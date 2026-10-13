import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../platform/config/environment.js';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { AuthModule } from '../auth/index.js';
import { MarketDataModule } from '../market-data/index.js';
import { ReportFiles } from './report-files.js';
import { ResearchAiService } from './research-ai.service.js';
import { ResearchDailyJob } from './research-daily.job.js';
import { ResearchEnabledGuard } from './research-enabled.guard.js';
import { RESEARCH_PRICE, ResearchEngineService } from './research-engine.service.js';
import { ResearchPriceAdapter } from './research-price.adapter.js';
import { ResearchSyncService } from './research-sync.service.js';
import { ResearchController } from './research.controller.js';
import { REPORT_SOURCES, RESEARCH_AI, RESEARCH_STORE } from './research.ports.js';
import { ResearchRepository } from './research.repository.js';
import { ResearchService } from './research.service.js';
import { VietstockSource } from './sources/vietstock.source.js';
import { VndirectSource } from './sources/vndirect.source.js';

// AI Insight v2 "Góc nhìn đầu tư": broker report store (daily download, no AI) and the
// on-demand thesis engine. Gated by RESEARCH_INSIGHT_ENABLED.
@Module({
  imports: [DatabaseModule, AuthModule, AnalysisModule, MarketDataModule],
  controllers: [ResearchController],
  providers: [
    ResearchRepository,
    ResearchAiService,
    ResearchEngineService,
    ResearchService,
    ResearchSyncService,
    ResearchDailyJob,
    ResearchEnabledGuard,
    ResearchPriceAdapter,
    ReportFiles,
    VietstockSource,
    VndirectSource,
    { provide: RESEARCH_STORE, useExisting: ResearchRepository },
    { provide: RESEARCH_AI, useExisting: ResearchAiService },
    { provide: RESEARCH_PRICE, useExisting: ResearchPriceAdapter },
    {
      provide: REPORT_SOURCES,
      inject: [ConfigService, VietstockSource, VndirectSource],
      // RESEARCH_SOURCES picks the enabled sources, e.g. "vietstock" or "vietstock,vndirect".
      useFactory: (config: ConfigService<Environment, true>, vietstock: VietstockSource, vndirect: VndirectSource) => {
        const enabled = new Set(config.get('RESEARCH_SOURCES', { infer: true }).split(',').map((id) => id.trim()));
        return [vietstock, vndirect].filter((source) => enabled.has(source.id));
      },
    },
  ],
  exports: [ResearchDailyJob],
})
export class ResearchModule {}
