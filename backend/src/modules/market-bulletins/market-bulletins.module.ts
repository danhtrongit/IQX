import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/auth.module.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { MarketIntegrationModule } from '../market-integration/index.js';
import { BulletinDataService } from './bulletin-data.service.js';
import { BulletinSlotsService } from './bulletin-slots.service.js';
import { BulletinTrackingService } from './bulletin-tracking.service.js';
import { BulletinRepository } from './bulletin.repository.js';
import { BulletinPublicService } from './bulletins-public.service.js';
import {
  MarketBulletinsAdminController,
  MarketBulletinsPublicController,
} from './bulletins.controller.js';
import { MarketBulletinsJob } from './bulletins.job.js';
import { MarketBulletinsService } from './bulletins.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, MarketDataModule, MarketIntegrationModule],
  controllers: [MarketBulletinsPublicController, MarketBulletinsAdminController],
  providers: [
    BulletinRepository,
    BulletinDataService,
    BulletinTrackingService,
    MarketBulletinsService,
    BulletinSlotsService,
    BulletinPublicService,
    MarketBulletinsJob,
  ],
  exports: [MarketBulletinsJob, MarketBulletinsService, BulletinTrackingService],
})
export class MarketBulletinsModule {}
