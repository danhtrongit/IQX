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

// IQX Học viện v4 (`iqx-academy-v4.0-12ch-116lessons`): 12 chapters, each with lessons and a
// chapter exam (plus the optional chapter 3 practice). Learning is free: every item is open (the
// `sequential` prefix mode stays available through the optional ACADEMY_ACCESS_MODE provider, a
// hook for a per-user setting). Items pass only with every answer right. ACADEMY_GRANTS answers
// every tool capability for everybody (no tool is tied to a lesson) plus legacy `lesson:*` holders.
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
