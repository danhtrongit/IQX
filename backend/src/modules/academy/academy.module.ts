import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AcademyEnabledGuard } from './academy-enabled.guard.js';
import { AcademyGrantsService } from './academy-grants.service.js';
import { AcademyController } from './academy.controller.js';
import { ACADEMY_GRANTS } from './academy.ports.js';
import { AcademyRepository } from './academy.repository.js';
import { AcademyService } from './academy.service.js';

// IQX Academy (bot-v2); see .pi/botv2/CONTRACTS.md §3.
@Module({
  imports: [AuthModule],
  controllers: [AcademyController],
  providers: [
    AcademyRepository,
    AcademyService,
    AcademyGrantsService,
    AcademyEnabledGuard,
    { provide: ACADEMY_GRANTS, useExisting: AcademyGrantsService },
  ],
  exports: [ACADEMY_GRANTS, AcademyGrantsService],
})
export class AcademyModule {}
