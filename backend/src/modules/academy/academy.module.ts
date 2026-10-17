import { Module, NotImplementedException } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AcademyEnabledGuard } from './academy-enabled.guard.js';
import { AcademyGrantsService } from './academy-grants.service.js';
import { AcademyProgressReader } from './academy-progress-reader.service.js';
import { AcademyController } from './academy.controller.js';
import { ACADEMY_CONTENT, type AcademyContentSource } from './academy.content.types.js';
import { ACADEMY_GRANTS } from './academy.ports.js';
import { AcademyRepository } from './academy.repository.js';
import { AcademyService } from './academy.service.js';

/** Content source until the v3 loader lands: P1 replaces it with `loadAcademyContent`. */
const pendingAcademyContent: AcademyContentSource = () => {
  throw new NotImplementedException('academy v3.2 content loader');
};

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
    AcademyProgressReader,
    { provide: ACADEMY_GRANTS, useExisting: AcademyGrantsService },
    { provide: ACADEMY_CONTENT, useValue: pendingAcademyContent },
  ],
  // AcademyProgressReader: read-only progress of other users for the admin / team-lead views.
  exports: [ACADEMY_GRANTS, ACADEMY_CONTENT, AcademyGrantsService, AcademyProgressReader],
})
export class AcademyModule {}
