import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { RedisModule } from '../../platform/redis/index.js';
import { AuthModule } from '../auth/index.js';
import { UserNotificationsModule } from '../notifications/index.js';
import { OfficeWorkspaceController } from './office-workspace.controller.js';
import { OfficeController } from './office.controller.js';
import { OfficeWsGateway } from './realtime/office.gateway.js';
import { OfficeHub } from './realtime/office.hub.js';
import { OfficeAccessService } from './services/office-access.service.js';
import { OfficeAttendanceService } from './services/office-attendance.service.js';
import { OfficeCollabService } from './services/office-collab.service.js';
import { OfficeCronService } from './services/office-cron.service.js';
import { OfficeRoomsService } from './services/office-rooms.service.js';
import { OfficeTasksService } from './services/office-tasks.service.js';

/**
 * Lightweight job-only module imported by DomainRuntimeModule in the worker process
 * (avoids mounting HTTP controllers or WebSocket gateways inside the BullMQ worker).
 * Runs an idempotent daily-repeat catch-up pass at worker boot so missed 00:01 runs recover.
 */
@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [OfficeCronService],
  exports: [OfficeCronService],
})
export class OfficeJobsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(OfficeJobsModule.name);

  constructor(private readonly cron: OfficeCronService) {}

  async onApplicationBootstrap(): Promise<void> {
    const rawEnabled = process.env.JOB_OFFICE_SPAWN_DAILY_REPEATS_ENABLED;
    if (rawEnabled === 'false' || rawEnabled === '0') return;
    try {
      const outcome = await this.cron.spawnDailyRepeats();
      this.logger.log(
        `Office boot repeat-task catch-up: ${outcome.status} (${JSON.stringify(outcome.detail ?? {})})`,
      );
    } catch (error) {
      this.logger.warn(
        `Office boot repeat-task catch-up failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}

@Module({
  imports: [DatabaseModule, RedisModule, AuthModule, UserNotificationsModule],
  controllers: [OfficeController, OfficeWorkspaceController],
  providers: [
    OfficeAccessService,
    OfficeHub,
    OfficeWsGateway,
    OfficeTasksService,
    OfficeAttendanceService,
    OfficeCollabService,
    OfficeRoomsService,
    OfficeCronService,
  ],
  exports: [OfficeAccessService, OfficeHub, OfficeCronService],
})
export class OfficeModule {}
