import { Global, Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { MarketExtendedModule } from '../market-extended/market-extended.module.js';
import { BotMarketSnapshotProvider } from './bot-market-snapshot.provider.js';
import { DailyBarsService } from './daily-bars.service.js';
import { HoseRestrictedSecuritiesProvider } from './hose-restricted-securities.provider.js';
import { IndexMembershipProvider } from './index-membership.provider.js';
import { IndexMembershipService } from './index-membership.service.js';
import { MarketHuntDataSource } from './market-hunt-data-source.js';
import { MarketInputSnapshotService } from './market-input-snapshot.service.js';
import { SymbolAttributesService } from './symbol-attributes.service.js';

@Global()
@Module({
  imports: [DatabaseModule, MarketDataModule, MarketExtendedModule],
  providers: [
    HoseRestrictedSecuritiesProvider,
    MarketHuntDataSource,
    IndexMembershipProvider,
    IndexMembershipService,
    BotMarketSnapshotProvider,
    MarketInputSnapshotService,
    DailyBarsService,
    SymbolAttributesService,
  ],
  exports: [
    HoseRestrictedSecuritiesProvider,
    MarketHuntDataSource,
    IndexMembershipProvider,
    IndexMembershipService,
    BotMarketSnapshotProvider,
    MarketInputSnapshotService,
    DailyBarsService,
    SymbolAttributesService,
  ],
})
export class MarketIntegrationModule {}
