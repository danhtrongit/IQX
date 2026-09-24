import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { MarketDataModule } from '../market-data/index.js';
import { FinancialsController } from './financials.controller.js';
import { FinancialsService } from './financials.service.js';
import { PeerMediansRepository } from './peer-medians.repository.js';

@Module({
  imports: [DatabaseModule, MarketDataModule],
  controllers: [FinancialsController],
  providers: [FinancialsService, PeerMediansRepository],
  exports: [FinancialsService],
})
export class FinancialsModule {}
