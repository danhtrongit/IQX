import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LegacyWatchlistsController, WatchlistsController } from './watchlists.controller.js';
import { WatchlistsService } from './watchlists.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LegacyWatchlistsController, WatchlistsController],
  providers: [WatchlistsService],
  exports: [WatchlistsService],
})
export class WatchlistsModule {}
