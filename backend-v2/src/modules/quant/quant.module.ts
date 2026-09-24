import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/index.js';
import { AuthModule } from '../auth/index.js';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { QuantController } from './quant.controller.js';
import { QuantMarketDataAdapter } from './market-data.adapter.js';
import { QuantService } from './quant.service.js';
import { StrategyRepository } from './strategy.repository.js';
import { QUANT_MARKET_DATA } from './quant.types.js';

@Module({
  imports: [DatabaseModule, MarketDataModule, AuthModule],
  controllers: [QuantController],
  providers: [
    StrategyRepository,
    QuantService,
    QuantMarketDataAdapter,
    { provide: QUANT_MARKET_DATA, useExisting: QuantMarketDataAdapter },
  ],
  exports: [QuantService, QUANT_MARKET_DATA],
})
export class QuantModule {}
