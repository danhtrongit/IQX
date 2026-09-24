import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MarketDataService } from '../market-data/market-data.service.js';
import { KbsMarketProvider } from '../market-data/providers/kbs.provider.js';
import { MarketHttpTransport } from '../market-data/providers/http.transport.js';
import { VciMarketProvider } from '../market-data/providers/vci.provider.js';
import { VndMarketProvider } from '../market-data/providers/vnd.provider.js';
import { VietcapInsightProvider } from '../market-extended/vietcap-insight.provider.js';
import { VietcapOverviewProvider } from '../market-extended/vietcap-overview.provider.js';
import { MarketHttpClient } from '../market-extended/market-http.client.js';
import { AiNewsProvider } from '../market-extended/ai-news.provider.js';
import { FinancialsModule } from '../financials/financials.module.js';
import { AiProviderService } from './ai-provider.service.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';

/** Paid AI use cases. The module owns no schema migrations; DB history is best-effort. */
@Module({
  imports: [AuthModule, FinancialsModule],
  controllers: [AnalysisController],
  providers: [
    MarketHttpTransport,
    VciMarketProvider,
    VndMarketProvider,
    KbsMarketProvider,
    MarketDataService,
    MarketHttpClient,
    VietcapInsightProvider,
    VietcapOverviewProvider,
    AiNewsProvider,
    AiProviderService,
    AnalysisService,
  ],
  exports: [AiProviderService, AnalysisService],
})
export class AnalysisModule {}
