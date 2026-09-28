import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import {
  AdminIpnController,
  AdminPaymentsController,
  AdminSubscriptionHistoryController,
  AdminSubscriptionsController,
  PremiumController,
} from './billing.controllers.js';
import { BillingService } from './billing.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [
    PremiumController,
    AdminPaymentsController,
    AdminSubscriptionsController,
    AdminSubscriptionHistoryController,
    AdminIpnController,
  ],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
