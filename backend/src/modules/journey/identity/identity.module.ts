import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/index.js';
import { AnalysisModule } from '../../analysis/index.js';
import { FinancialsModule } from '../../financials/index.js';
import { MarketDataModule } from '../../market-data/index.js';
import { DatabaseModule } from '../../../platform/database/index.js';
import { JourneyCoreModule } from '../core/index.js';
import { JourneyIdentityController } from './identity.controller.js';
import { JourneyIdentityService } from './identity.service.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    JourneyCoreModule,
    AnalysisModule,
    FinancialsModule,
    MarketDataModule,
  ],
  controllers: [JourneyIdentityController],
  providers: [JourneyIdentityService],
  exports: [JourneyIdentityService],
})
export class JourneyIdentityModule {}
