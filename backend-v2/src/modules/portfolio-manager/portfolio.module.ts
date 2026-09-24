import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { MarketDataModule } from '../market-data/index.js';
import { AiProviderService } from '../analysis/ai-provider.service.js';
import { PortfolioRepository } from './portfolio.repository.js';
import { PortfolioManagerService } from './portfolio.service.js';
import {
  PortfolioManagerController,
  PortfolioManagerV1Controller,
} from './portfolio.controller.js';
import { PORTFOLIO_AI } from './portfolio.types.js';

@Module({
  imports: [DatabaseModule, AuthModule, AnalysisModule, MarketDataModule],
  controllers: [PortfolioManagerController, PortfolioManagerV1Controller],
  providers: [
    PortfolioRepository,
    PortfolioManagerService,
    {
      provide: PORTFOLIO_AI,
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
  exports: [PortfolioManagerService, PortfolioRepository],
})
export class PortfolioManagerModule {}
