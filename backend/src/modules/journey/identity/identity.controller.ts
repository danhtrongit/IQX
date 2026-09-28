import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import {
  ApiAuthGuard,
  CurrentUser,
  Roles,
  RolesGuard,
  type AuthenticatedUser,
} from '../../auth/index.js';
import { JourneyIdentityService } from './identity.service.js';
import {
  assessmentRequestSchema,
  datasetRequestSchema,
  qaGrantRequestSchema,
  uiEventRequestSchema,
  type AssessmentRequest,
  type DatasetRequest,
  type QaGrantRequest,
  type UIEventRequest,
} from './identity.schemas.js';

@Controller(['api/v1', 'api/v2'])
@UseGuards(ApiAuthGuard)
export class JourneyIdentityController {
  constructor(private readonly identity: JourneyIdentityService) {}

  @Get('bot/mascot')
  async getMascot(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.identity.get(user.id);
  }

  @Post('bot/mascot/ui-events')
  async uiEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: uiEventRequestSchema }) body: UIEventRequest,
  ): Promise<Record<string, unknown>> {
    return this.identity.uiEvent(user.id, body);
  }

  @Post('journey/reading-datasets')
  async createDataset(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: datasetRequestSchema }) body: DatasetRequest,
  ): Promise<Record<string, unknown>> {
    return this.identity.createDataset(user.id, body.symbol);
  }

  @Post('journey/assessments')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: assessmentRequestSchema }) body: AssessmentRequest,
  ): Promise<Record<string, string>> {
    return this.identity.submit(user.id, body.dataset_id, body.answers);
  }

  @Post('journey/assessments/:assessmentId/reveal')
  async reveal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ): Promise<Record<string, unknown>> {
    return this.identity.reveal(user.id, assessmentId);
  }

  @Post('admin/journey/identity/qa-grants')
  @UseGuards(ApiAuthGuard, RolesGuard)
  @Roles('admin')
  async grantQa(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: qaGrantRequestSchema }) body: QaGrantRequest,
  ): Promise<{ accepted: true; target_user_id: string; mascot_id: string }> {
    return this.identity.grantQaMascot(user, body);
  }
}
