import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { CurrentUser, Roles, type AuthenticatedUser } from '../auth/index.js';
import { auditContext } from '../users/audit.js';
import {
  TEAM_LEAD_DETAIL_SCHEMA,
  TEAM_LEAD_LIST_SCHEMA,
  TEAM_LEAD_LOOKUP_SCHEMA,
  TEAM_LEAD_MEMBER_ADD_SCHEMA,
  TEAM_LEAD_MEMBER_REMOVE_SCHEMA,
  TEAM_LEAD_MEMBERS_SCHEMA,
} from './team-leads.openapi.js';
import {
  memberIdSchema,
  teamLeadAppointSchema,
  teamLeadIdSchema,
  teamLeadListQuerySchema,
  teamLeadLookupQuerySchema,
  teamLeadMemberAddSchema,
  teamLeadMemberRemoveSchema,
  teamLeadMembersQuerySchema,
  teamLeadPolicySchema,
  teamLeadRevokeSchema,
  type TeamLeadAppointInput,
  type TeamLeadListQuery,
  type TeamLeadLookupQuery,
  type TeamLeadMemberAddInput,
  type TeamLeadMemberRemoveInput,
  type TeamLeadMembersQuery,
  type TeamLeadPolicyInput,
  type TeamLeadRevokeInput,
} from './team-leads.schemas.js';
import {
  TeamLeadsService,
  type MemberAddResult,
  type MemberRemoveResult,
  type Page,
  type TeamLeadDetail,
  type TeamLeadListItem,
  type TeamLeadLookup,
  type TeamLeadMember,
} from './team-leads.service.js';

/** Admin spec v1.1 §4.2: appointing team leads, their policies and group membership. */
@ApiTags('Quản trị: Trưởng nhóm')
@ApiBearerAuth()
@Roles('admin')
@Controller({ path: ['api/v1/admin/team-leads', 'api/v2/admin/team-leads'] })
export class AdminTeamLeadsController {
  constructor(private readonly teamLeads: TeamLeadsService) {}

  @Get()
  @ApiOkResponse({ schema: TEAM_LEAD_LIST_SCHEMA })
  list(
    @Query({ schema: teamLeadListQuerySchema }) query: TeamLeadListQuery,
  ): Promise<Page<TeamLeadListItem>> {
    return this.teamLeads.list(query);
  }

  /** Appoint / add-member dialogs: find a user by username or email, with eligibility. */
  @Get('lookup')
  @ApiOkResponse({ schema: TEAM_LEAD_LOOKUP_SCHEMA })
  lookup(
    @Query({ schema: teamLeadLookupQuerySchema }) query: TeamLeadLookupQuery,
  ): Promise<TeamLeadLookup> {
    return this.teamLeads.lookup(query);
  }

  @Post()
  @ApiCreatedResponse({ schema: TEAM_LEAD_DETAIL_SCHEMA })
  appoint(
    @Body({ schema: teamLeadAppointSchema }) body: TeamLeadAppointInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<TeamLeadDetail> {
    return this.teamLeads.appoint(body, auditContext(admin, request));
  }

  @Get(':leadId')
  @ApiOkResponse({ schema: TEAM_LEAD_DETAIL_SCHEMA })
  detail(@Param('leadId', { schema: teamLeadIdSchema }) leadId: string): Promise<TeamLeadDetail> {
    return this.teamLeads.detail(leadId);
  }

  @Put(':leadId/policy')
  @ApiOkResponse({ schema: TEAM_LEAD_DETAIL_SCHEMA })
  updatePolicy(
    @Param('leadId', { schema: teamLeadIdSchema }) leadId: string,
    @Body({ schema: teamLeadPolicySchema }) body: TeamLeadPolicyInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<TeamLeadDetail> {
    return this.teamLeads.updatePolicy(leadId, body, auditContext(admin, request));
  }

  @HttpCode(200)
  @Post(':leadId/revoke')
  @ApiOkResponse({ schema: TEAM_LEAD_DETAIL_SCHEMA })
  revoke(
    @Param('leadId', { schema: teamLeadIdSchema }) leadId: string,
    @Body({ schema: teamLeadRevokeSchema }) body: TeamLeadRevokeInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<TeamLeadDetail> {
    return this.teamLeads.revoke(leadId, body.reason, auditContext(admin, request));
  }

  @Get(':leadId/members')
  @ApiOkResponse({ schema: TEAM_LEAD_MEMBERS_SCHEMA })
  members(
    @Param('leadId', { schema: teamLeadIdSchema }) leadId: string,
    @Query({ schema: teamLeadMembersQuerySchema }) query: TeamLeadMembersQuery,
  ): Promise<Page<TeamLeadMember>> {
    return this.teamLeads.members(leadId, query);
  }

  @Post(':leadId/members')
  @ApiCreatedResponse({ schema: TEAM_LEAD_MEMBER_ADD_SCHEMA })
  addMember(
    @Param('leadId', { schema: teamLeadIdSchema }) leadId: string,
    @Body({ schema: teamLeadMemberAddSchema }) body: TeamLeadMemberAddInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<MemberAddResult> {
    return this.teamLeads.addMember(leadId, body, auditContext(admin, request));
  }

  @HttpCode(200)
  @Post(':leadId/members/:userId/remove')
  @ApiOkResponse({ schema: TEAM_LEAD_MEMBER_REMOVE_SCHEMA })
  removeMember(
    @Param('leadId', { schema: teamLeadIdSchema }) leadId: string,
    @Param('userId', { schema: memberIdSchema }) userId: string,
    @Body({ schema: teamLeadMemberRemoveSchema }) body: TeamLeadMemberRemoveInput,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<MemberRemoveResult> {
    return this.teamLeads.removeMember(leadId, userId, body.reason, auditContext(admin, request));
  }
}
