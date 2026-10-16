import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AcademyModule } from '../academy/academy.module.js';
import { AdminModule } from '../admin/admin.module.js';
import { UsersModule } from '../users/index.js';
import { ActiveTeamLeadGuard } from './active-team-lead.guard.js';
import { AdminTeamLeadsController } from './admin-team-leads.controller.js';
import { TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';
import { TeamLeadsService } from './team-leads.service.js';

/**
 * Admin spec v1.1 §3 / §4.2 / §4.3: team leads (Trưởng nhóm), their groups, and the team
 * lead's own `team/*` area.
 */
@Module({
  imports: [DatabaseModule, UsersModule, AdminModule, AcademyModule],
  controllers: [AdminTeamLeadsController, TeamController],
  providers: [TeamLeadsService, TeamService, ActiveTeamLeadGuard],
  exports: [TeamLeadsService],
})
export class TeamLeadsModule {}
