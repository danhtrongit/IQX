import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/index.js';
import { SavedFiltersFeatureGuard } from '../saved-filters/saved-filters.feature.guard.js';
import { IqxTemplatesAdminController, IqxTemplatesController } from './iqx-templates.controller.js';
import { IqxTemplatesService } from './iqx-templates.service.js';

/** Bộ lọc IQX / Chiến lược IQX (tab IQX) and Quản trị › Mẫu IQX. */
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [IqxTemplatesController, IqxTemplatesAdminController],
  providers: [IqxTemplatesService, SavedFiltersFeatureGuard],
  exports: [IqxTemplatesService],
})
export class IqxTemplatesModule {}
