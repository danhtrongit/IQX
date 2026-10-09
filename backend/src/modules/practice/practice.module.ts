import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AuthModule } from '../auth/index.js';
import { QuantModule } from '../quant/quant.module.js';
import { PracticeEnabledGuard } from './practice-enabled.guard.js';
import { PracticeController } from './practice.controller.js';
import { PRACTICE_DATA, PracticeDataService } from './practice.data.js';
import { PRACTICE_STORE, PracticeRepository } from './practice.repository.js';
import { PRACTICE_SET, loadPracticeSet } from './practice.set.js';
import { PracticeService } from './practice.service.js';

// Optional mini practice (bot-v2, SPEC §10-§11). Consumes ACADEMY_GRANTS (read-only) and
// QUANT_MARKET_DATA (the adapter quant v2 backtests use). Never touches bot/manual accounts,
// shared config, grants or coins.
@Module({
  imports: [DatabaseModule, AuthModule, AcademyModule, QuantModule],
  controllers: [PracticeController],
  providers: [
    PracticeRepository,
    PracticeDataService,
    PracticeService,
    PracticeEnabledGuard,
    { provide: PRACTICE_STORE, useExisting: PracticeRepository },
    { provide: PRACTICE_DATA, useExisting: PracticeDataService },
    { provide: PRACTICE_SET, useFactory: loadPracticeSet },
  ],
})
export class PracticeModule {}
