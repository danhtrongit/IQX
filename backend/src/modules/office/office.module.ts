import { Module } from '@nestjs/common';

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
 */
@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [OfficeCronService],
  exports: [OfficeCronService],
})
export class OfficeJobsModule {}

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
