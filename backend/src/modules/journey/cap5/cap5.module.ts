import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../../platform/database/database.module.js';
import { MarketHuntDataSource, MarketIntegrationModule } from '../../market-integration/index.js';
import { CAP5_HUNT_DATA_SOURCE } from './hunt.engine.js';
import { Cap5Controller } from './cap5.controller.js';
import { Cap5Service } from './cap5.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, MarketIntegrationModule],
  controllers: [Cap5Controller],
  providers: [Cap5Service, { provide: CAP5_HUNT_DATA_SOURCE, useExisting: MarketHuntDataSource }],
  exports: [Cap5Service, CAP5_HUNT_DATA_SOURCE],
})
export class Cap5Module {}
