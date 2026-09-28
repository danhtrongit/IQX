import { Global, Module } from '@nestjs/common';
import { BillingModule } from '../billing/index.js';
import { DatabaseModule } from '../../platform/database/index.js';
import { MOBILE_PURCHASE_PROVIDER } from './mobile.types.js';
import { MobileController } from './mobile.controller.js';
import { MobileAccountController } from './mobile-account.controller.js';
import { MobileService, UnavailableMobilePurchaseProvider } from './mobile.service.js';

@Global()
@Module({
  imports: [BillingModule, DatabaseModule],
  controllers: [MobileController, MobileAccountController],
  providers: [
    MobileService,
    UnavailableMobilePurchaseProvider,
    { provide: MOBILE_PURCHASE_PROVIDER, useExisting: UnavailableMobilePurchaseProvider },
  ],
  exports: [MobileService],
})
export class MobileModule {}
