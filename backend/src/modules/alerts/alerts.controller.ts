import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { ApiAuthGuard, CurrentUser, Premium, PremiumGuard } from '../auth/index.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  userAlertRuleCreateSchema,
  userAlertRuleUpdateSchema,
  alertRuleIdSchema,
} from './alerts.schemas.js';
import { AlertService } from './alerts.service.js';

@Controller(['api/v1/alerts', 'api/v2/alerts'])
@UseGuards(ApiAuthGuard, PremiumGuard)
@Premium()
export class AlertsController {
  constructor(private readonly alerts: AlertService) {}

  @Get('signals') listSignals() {
    return this.alerts.listSignals(true);
  }

  @Get('rules')
  listRules(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.listRules(user.id);
  }

  @Post('rules')
  async createRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: userAlertRuleCreateSchema }) body: unknown,
  ) {
    return this.alerts.createRule(user.id, body as never);
  }

  @Put('rules/:ruleId')
  async updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ruleId', { schema: alertRuleIdSchema }) ruleId: string,
    @Body({ schema: userAlertRuleUpdateSchema }) body: unknown,
  ) {
    return this.alerts.updateRule(user.id, ruleId, body as never);
  }

  @Delete('rules/:ruleId')
  @HttpCode(204)
  async deleteRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ruleId', { schema: alertRuleIdSchema }) ruleId: string,
  ): Promise<void> {
    await this.alerts.deleteRule(user.id, ruleId);
  }

  @Get('events') listEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.listEvents(user.id);
  }

  @Get('telegram') telegramStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.telegramStatus(user.id);
  }

  @Post('telegram/link') createTelegramLink(@CurrentUser() user: AuthenticatedUser) {
    return this.alerts.createTelegramLink(user.id);
  }

  @Delete('telegram')
  @HttpCode(204)
  async unlinkTelegram(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.alerts.unlinkTelegram(user.id);
  }
}
