import { Global, Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { MarketExtendedModule } from '../market-extended/market-extended.module.js';
import { BotMarketSnapshotProvider } from './bot-market-snapshot.provider.js';
import { HoseRestrictedSecuritiesProvider } from './hose-restricted-securities.provider.js';
import { MarketHuntDataSource } from './market-hunt-data-source.js';
import { MarketInputSnapshotService } from './market-input-snapshot.service.js';

@Global()
@Module({
  imports: [DatabaseModule, MarketDataModule, MarketExtendedModule],
  providers: [
    HoseRestrictedSecuritiesProvider,
    MarketHuntDataSource,
    BotMarketSnapshotProvider,
    MarketInputSnapshotService,
  ],
  exports: [
    HoseRestrictedSecuritiesProvider,
    MarketHuntDataSource,
    BotMarketSnapshotProvider,
    MarketInputSnapshotService,
  ],
})
export class MarketIntegrationModule {}
