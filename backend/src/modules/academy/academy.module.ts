import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AcademyEnabledGuard } from './academy-enabled.guard.js';
import { AcademyGrantsService } from './academy-grants.service.js';
import { AcademyController } from './academy.controller.js';
import { ACADEMY_GRANTS } from './academy.ports.js';
import { AcademyRepository } from './academy.repository.js';
import { AcademyService } from './academy.service.js';

// IQX Academy: 13 chapters / 71 lessons (`iqx-academy-outline-13ch-71lessons-v1`). Lessons are
// read here, completed by quiz (8/8) or by the guide button, and open capabilities through
// ACADEMY_GRANTS; the Academy never writes bot or shared configuration.
// The learning-coin hook LESSON_REWARD_PORT (platform/ports) is optional: the Shop module
// provides it, and without it a first completion reports reward `{ status: 'unavailable' }`.
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
