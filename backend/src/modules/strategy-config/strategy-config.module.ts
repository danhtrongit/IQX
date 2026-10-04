import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { StrategyConfigEnabledGuard } from './strategy-config-enabled.guard.js';
import { StrategyConfigController } from './strategy-config.controller.js';
import { SHARED_CONFIG_READER } from './strategy-config.ports.js';
import { SharedConfigRepository } from './strategy-config.repository.js';
import { SharedConfigService } from './strategy-config.service.js';

// Shared Buy/Sell indicator config (bot-v2). See .pi/botv2/CONTRACTS.md §4.
@Module({
  imports: [DatabaseModule, AuthModule, AcademyModule],
  controllers: [StrategyConfigController],
  providers: [
    SharedConfigRepository,
    SharedConfigService,
    StrategyConfigEnabledGuard,
    { provide: SHARED_CONFIG_READER, useExisting: SharedConfigService },
  ],
  exports: [SHARED_CONFIG_READER],
})
export class StrategyConfigModule {}
