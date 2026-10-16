import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AdminTeamLeadsController } from './admin-team-leads.controller.js';
import { TeamLeadsService } from './team-leads.service.js';

/** Admin spec v1.1 §3 / §4.2: team leads (Trưởng nhóm) and their groups. */
@Module({
  imports: [DatabaseModule],
  controllers: [AdminTeamLeadsController],
  providers: [TeamLeadsService],
  exports: [TeamLeadsService],
})
export class TeamLeadsModule {}
