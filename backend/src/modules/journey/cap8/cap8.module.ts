import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../platform/database/database.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { VciMarketProvider } from '../../market-data/providers/vci.provider.js';
import { MarketHttpTransport } from '../../market-data/providers/http.transport.js';
import { Cap7Module } from '../cap7/cap7.module.js';
import { Cap8Controller, Cap8V1Controller } from './cap8.controller.js';
import { Cap8PriceHistoryService } from './cap8.history.js';
import { Cap8Service } from './cap8.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, Cap7Module],
  controllers: [Cap8Controller, Cap8V1Controller],
  providers: [Cap8Service, Cap8PriceHistoryService, VciMarketProvider, MarketHttpTransport],
  exports: [Cap8Service],
})
export class Cap8Module {}

export { Cap8Service } from './cap8.service.js';
export * from './cap8.types.js';
