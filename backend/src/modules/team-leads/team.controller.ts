import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import { ActiveTeamLeadGuard } from './active-team-lead.guard.js';
import {
  TEAM_LOGIN_HISTORY_SCHEMA,
  TEAM_ME_SCHEMA,
  TEAM_MEMBER_REMOVE_SCHEMA,
  TEAM_OVERVIEW_SCHEMA,
  TEAM_REVENUE_SCHEMA,
  TEAM_USER_360_SCHEMA,
  TEAM_USERS_SCHEMA,
} from './team.openapi.js';
import {
  teamLoginHistoryQuerySchema,
  teamMemberIdSchema,
  teamMemberRemoveSchema,
  teamRevenueQuerySchema,
  teamUserListQuerySchema,
  type TeamLoginHistoryQuery,
  type TeamMemberRemoveInput,
  type TeamRevenueQuery,
  type TeamUserListQuery,
} from './team.schemas.js';
import { TeamService, type TeamMe, type TeamUserItem } from './team.service.js';
import type { MemberRemoveResult, Page } from './team-leads.service.js';

/**
 * Admin spec v1.1 §1.3 / §4.3: the team lead's own admin area. Class-level
 * `@Roles('team_lead')` plus an active profile (ActiveTeamLeadGuard); the group is always the
 * caller's own and no parameter can name another group. Users outside it are 404.
 */
@ApiTags('Trưởng nhóm')
@ApiBearerAuth()
@Roles('team_lead')
@UseGuards(ActiveTeamLeadGuard)
@Controller({ path: ['api/v1/team', 'api/v2/team'] })
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('me')
  @ApiOkResponse({ schema: TEAM_ME_SCHEMA })
  me(@CurrentUser() lead: AuthenticatedUser): Promise<TeamMe> {
    return this.team.me(lead.id);
  }

  @Get('metrics/overview')
  @ApiOkResponse({ schema: TEAM_OVERVIEW_SCHEMA })
  overview(@CurrentUser() lead: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.team.overview(lead.id);
  }

  @Get('metrics/revenue')
  @ApiOkResponse({ schema: TEAM_REVENUE_SCHEMA })
  revenue(
    @CurrentUser() lead: AuthenticatedUser,
    @Query({ schema: teamRevenueQuerySchema }) query: TeamRevenueQuery,
  ): Promise<Record<string, unknown>[]> {
    return this.team.revenue(lead.id, query.days);
  }

  @Get('users')
  @ApiOkResponse({ schema: TEAM_USERS_SCHEMA })
  users(
    @CurrentUser() lead: AuthenticatedUser,
    @Query({ schema: teamUserListQuerySchema }) query: TeamUserListQuery,
  ): Promise<Page<TeamUserItem>> {
    return this.team.users(lead.id, query);
  }

  @Get('users/:userId')
  @ApiOkResponse({ schema: TEAM_USER_360_SCHEMA })
  user(
    @CurrentUser() lead: AuthenticatedUser,
    @Param('userId', { schema: teamMemberIdSchema }) userId: string,
  ): Promise<Record<string, unknown>> {
    return this.team.user(lead.id, userId);
  }

  @Get('users/:userId/login-history')
  @ApiOkResponse({ schema: TEAM_LOGIN_HISTORY_SCHEMA })
  loginHistory(
    @CurrentUser() lead: AuthenticatedUser,
    @Param('userId', { schema: teamMemberIdSchema }) userId: string,
    @Query({ schema: teamLoginHistoryQuerySchema }) query: TeamLoginHistoryQuery,
  ): Promise<Record<string, unknown>> {
    return this.team.loginHistory(lead.id, userId, query);
  }

  @HttpCode(200)
  @Post('users/:userId/remove')
  @ApiOkResponse({ schema: TEAM_MEMBER_REMOVE_SCHEMA })
  remove(
    @CurrentUser() lead: AuthenticatedUser,
    @Param('userId', { schema: teamMemberIdSchema }) userId: string,
    @Body({ schema: teamMemberRemoveSchema }) body: TeamMemberRemoveInput,
    @Req() request: FastifyRequest,
  ): Promise<MemberRemoveResult> {
    return this.team.removeMember(lead.id, userId, body.reason, auditContext(lead, request));
  }
}
