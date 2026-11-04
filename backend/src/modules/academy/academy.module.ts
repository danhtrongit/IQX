import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AcademyEnabledGuard } from './academy-enabled.guard.js';
import { AdminAcademyConfigsController } from './academy-config.controller.js';
import { AcademyConfigRepository } from './academy-config.repository.js';
import { AcademyConfigService } from './academy-config.service.js';
import { AcademyGrantsService } from './academy-grants.service.js';
import { AcademyProgressReader } from './academy-progress-reader.service.js';
import { AcademyController } from './academy.controller.js';
import { loadAcademyContent } from './academy.content.js';
import { ACADEMY_CONTENT, type AcademyContentSource } from './academy.content.types.js';
import { ACADEMY_CONFIG, ACADEMY_GRANTS } from './academy.ports.js';
import { AcademyRepository } from './academy.repository.js';
import { AcademyService } from './academy.service.js';

const academyContentSource: AcademyContentSource = loadAcademyContent;

// IQX Học viện v4 (`iqx-academy-v4.0-12ch-116lessons`): 12 chapters, each with lessons and a
// chapter exam (plus the optional chapter 3 practice). Học viện v4.1: the chapters a learner sees
// and his access mode (free or sequential) come from the Academy config of his group, resolved on
// every call by AcademyConfigService (ACADEMY_CONFIG); admins edit the configs, team leads read
// theirs. Items pass only with every answer right. ACADEMY_GRANTS answers every tool capability
// for everybody (no tool is tied to a lesson) plus legacy `lesson:*` holders.
// The Academy never writes bot or shared configuration.
// The learning-coin hook LESSON_REWARD_PORT (platform/ports) is optional: the Shop module
// provides it, and without it a first lesson pass reports reward `{ status: 'unavailable' }`.
// Chapter exams never call it.
@Module({
  imports: [AuthModule],
  controllers: [AcademyController, AdminAcademyConfigsController],
  providers: [
    AcademyRepository,
    AcademyService,
    AcademyGrantsService,
    AcademyEnabledGuard,
    AcademyProgressReader,
    AcademyConfigRepository,
    AcademyConfigService,
    { provide: ACADEMY_GRANTS, useExisting: AcademyGrantsService },
    { provide: ACADEMY_CONFIG, useExisting: AcademyConfigService },
    { provide: ACADEMY_CONTENT, useValue: academyContentSource },
  ],
  // AcademyProgressReader and AcademyConfigService: read-only progress / config of other users for
  // the admin and team-lead views.
  exports: [
    ACADEMY_GRANTS,
    ACADEMY_CONTENT,
    ACADEMY_CONFIG,
    AcademyGrantsService,
    AcademyProgressReader,
    AcademyConfigService,
  ],
})
export class AcademyModule {}
