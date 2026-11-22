/**
 * Daily price store of Bot và Chiến lược v2.0 (migration 0058). Exposes `PRICE_STORE` (the read
 * port of `strategy-rules/contracts.ts`) and `PriceStoreService` (reads + `refresh()` for the job
 * `strategy.price-store-refresh`, wired by the Bot workstream). Import this module where needed.
 */

import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { MarketDataModule } from '../market-data/market-data.module.js';
import { MarketIntegrationModule } from '../market-integration/market-integration.module.js';
import { PRICE_STORE } from '../strategy-rules/contracts.js';
import { PgPriceStoreRepository, PRICE_STORE_REPOSITORY } from './price-store.repository.js';
import { PriceStoreService } from './price-store.service.js';
import { DnsePriceStoreSource, PRICE_STORE_SOURCE } from './price-store.source.js';

@Module({
  imports: [DatabaseModule, MarketDataModule, MarketIntegrationModule],
  providers: [
    { provide: PRICE_STORE_REPOSITORY, useClass: PgPriceStoreRepository },
    { provide: PRICE_STORE_SOURCE, useClass: DnsePriceStoreSource },
    PriceStoreService,
    { provide: PRICE_STORE, useExisting: PriceStoreService },
  ],
  exports: [PriceStoreService, PRICE_STORE],
})
export class PriceStoreModule {}
