import { Module } from '@nestjs/common';
import { MarketDataController } from './market-data.controller.js';
import { MarketDataService } from './market-data.service.js';
import { DnseMarketProvider } from './providers/dnse.provider.js';
import { MarketHttpTransport } from './providers/http.transport.js';
import { KbsMarketProvider } from './providers/kbs.provider.js';
import { VciMarketProvider } from './providers/vci.provider.js';
import { VndMarketProvider } from './providers/vnd.provider.js';

@Module({
  controllers: [MarketDataController],
  providers: [
    MarketHttpTransport,
    VciMarketProvider,
    VndMarketProvider,
    KbsMarketProvider,
    DnseMarketProvider,
    MarketDataService,
  ],
  exports: [
    MarketHttpTransport,
    VciMarketProvider,
    VndMarketProvider,
    KbsMarketProvider,
    DnseMarketProvider,
    MarketDataService,
  ],
})
export class MarketDataModule {}
