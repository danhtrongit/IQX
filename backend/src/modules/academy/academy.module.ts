import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AcademyEnabledGuard } from './academy-enabled.guard.js';
import { AcademyGrantsService } from './academy-grants.service.js';
import { AcademyProgressReader } from './academy-progress-reader.service.js';
import { AcademyController } from './academy.controller.js';
import { loadAcademyContent } from './academy.content.js';
import { ACADEMY_CONTENT, type AcademyContentSource } from './academy.content.types.js';
import { ACADEMY_GRANTS } from './academy.ports.js';
import { AcademyRepository } from './academy.repository.js';
import { AcademyService } from './academy.service.js';

const academyContentSource: AcademyContentSource = loadAcademyContent;

// IQX Học viện v3.2 (`iqx-academy-v3.2-14ch-94lessons`): 14 chapters, 1-5 published, each with
// lessons and a chapter exam (plus the optional chapter 3 practice) in one prefix-unlocked chain.
// Items pass only with every answer right; lessons open capabilities through ACADEMY_GRANTS.
// The Academy never writes bot or shared configuration.
// The learning-coin hook LESSON_REWARD_PORT (platform/ports) is optional: the Shop module
// provides it, and without it a first lesson pass reports reward `{ status: 'unavailable' }`.
// Chapter exams never call it.
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
    { provide: ACADEMY_CONTENT, useValue: academyContentSource },
  ],
  // AcademyProgressReader: read-only progress of other users for the admin / team-lead views.
  exports: [ACADEMY_GRANTS, ACADEMY_CONTENT, AcademyGrantsService, AcademyProgressReader],
})
export class AcademyModule {}
