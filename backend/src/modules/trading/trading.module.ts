import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { TradingController } from './trading.controller.js';
import { SymbolsTradingMarketPort, TradingMarketPort } from './trading.ports.js';
import { TradingRepository } from './trading.repository.js';
import { TradingService } from './trading.service.js';

@Module({
  imports: [DatabaseModule, MarketDataModule, BillingModule],
  controllers: [TradingController],
  providers: [
    TradingRepository,
    SymbolsTradingMarketPort,
    { provide: TradingMarketPort, useExisting: SymbolsTradingMarketPort },
    TradingService,
  ],
  exports: [TradingService, TradingRepository, TradingMarketPort],
})
export class TradingModule {}
