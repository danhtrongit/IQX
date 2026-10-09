import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { SavedFiltersController } from './saved-filters.controller.js';
import { SavedFiltersFeatureGuard } from './saved-filters.feature.guard.js';
import { SavedFiltersService } from './saved-filters.service.js';
import { SavedResultsService } from './saved-results.service.js';

// Saved filters (versioned), saved list snapshots and saved result snapshots (bot-v2).
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SavedFiltersController],
  providers: [SavedFiltersService, SavedResultsService, SavedFiltersFeatureGuard],
  exports: [SavedFiltersService, SavedResultsService],
})
export class SavedFiltersModule {}
