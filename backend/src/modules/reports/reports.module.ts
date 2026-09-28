import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { AiProviderService } from '../analysis/ai-provider.service.js';
import { ReportsRepository } from './reports.repository.js';
import { MARKET_REPORT_AI, MARKET_REPORT_INPUT } from './reports.types.js';
import { MarketReportsService } from './reports.service.js';
import { ReportsController, ReportsV1Controller } from './reports.controller.js';
import { SqlMarketReportInputService } from './sql-report-input.service.js';
import { MarketIntegrationModule } from '../market-integration/index.js';

@Module({
  imports: [DatabaseModule, AuthModule, AnalysisModule, MarketIntegrationModule],
  controllers: [ReportsController, ReportsV1Controller],
  providers: [
    ReportsRepository,
    MarketReportsService,
    SqlMarketReportInputService,
    { provide: MARKET_REPORT_INPUT, useExisting: SqlMarketReportInputService },
    {
      provide: MARKET_REPORT_AI,
      inject: [AiProviderService],
      useFactory: (ai: AiProviderService) => ({
        complete: (input: {
          systemPrompt: string;
          userPrompt: string;
          temperature: number;
          responseFormat: 'json';
        }) =>
          ai.complete(input.systemPrompt, input.userPrompt, {
            temperature: input.temperature,
            maxTokens: 6000,
            json: input.responseFormat === 'json',
          }),
      }),
    },
  ],
  exports: [MarketReportsService, ReportsRepository],
})
export class ReportsModule {}
