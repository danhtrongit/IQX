import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AuthModule } from '../auth/index.js';
import { SavedFiltersController } from './saved-filters.controller.js';
import { SavedFiltersFeatureGuard } from './saved-filters.feature.guard.js';
import { SavedFiltersService } from './saved-filters.service.js';

// Saved filters (versioned) + saved list snapshots (bot-v2). See .pi/botv2/CONTRACTS.md §5.
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SavedFiltersController],
  providers: [SavedFiltersService, SavedFiltersFeatureGuard],
  exports: [SavedFiltersService],
})
export class SavedFiltersModule {}
