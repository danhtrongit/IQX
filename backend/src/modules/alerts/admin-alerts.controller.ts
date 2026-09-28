import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';

import { ApiAuthGuard, Roles, RolesGuard } from '../auth/index.js';
import {
  alertKeySchema,
  alertSeedQuerySchema,
  alertSignalCreateSchema,
  alertSignalUpdateSchema,
} from './alerts.schemas.js';
import { AlertService } from './alerts.service.js';
import { AlertsRepository } from './alerts.repository.js';
import { factorLibraryPayload, INDICATOR_DISPLAY } from '../quant/catalog.js';
import { INDICATORS, BINARY_INDICATORS } from '../quant/indicators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import { TelegramService } from '../notifications/telegram.service.js';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../platform/config/environment.js';

@Controller(['api/v1/admin/alerts', 'api/v2/admin/alerts'])
@UseGuards(ApiAuthGuard, RolesGuard)
@Roles('admin')
export class AdminAlertsController {
  constructor(
    private readonly alerts: AlertService,
    private readonly repository: AlertsRepository,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  @Get('indicators') indicators() {
    return INDICATORS.map((id) => ({
      id,
      label: INDICATOR_DISPLAY[id] ?? id,
      kind: BINARY_INDICATORS.has(id as never) ? 'bin' : 'num',
    }));
  }
  @Get('factor-library') factorLibrary() {
    return factorLibraryPayload();
  }
  @Get('signals') signals() {
    return this.alerts.listSignals(false);
  }
  @Post('signals') async create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body({ schema: alertSignalCreateSchema }) body: unknown,
  ) {
    const signal = await this.repository.createSignal(body as never, admin.id);
    if (!signal)
      throw new ConflictException({ code: 'ALERT_SIGNAL_EXISTS', message: 'Tín hiệu đã tồn tại' });
    return signal;
  }
  @Put('signals/:key') async update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('key', { schema: alertKeySchema }) key: string,
    @Body({ schema: alertSignalUpdateSchema }) body: unknown,
  ) {
    const signal = await this.repository.updateSignal(key, body as never, admin.id);
    if (!signal)
      throw new NotFoundException({
        code: 'ALERT_SIGNAL_NOT_FOUND',
        message: 'Không tìm thấy tín hiệu',
      });
    return signal;
  }
  @Delete('signals/:key') async remove(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('key', { schema: alertKeySchema }) key: string,
  ) {
    if (!(await this.repository.deleteSignal(key, admin.id)))
      throw new NotFoundException({
        code: 'ALERT_SIGNAL_NOT_FOUND',
        message: 'Không tìm thấy tín hiệu',
      });
    return { deleted: true };
  }
  @Post('seed') seed(
    @CurrentUser() admin: AuthenticatedUser,
    @Query({ schema: alertSeedQuerySchema }) query: unknown,
  ) {
    return this.repository
      .seedSignals((query as { overwrite: boolean }).overwrite, admin.id)
      .then((created) => ({
        created,
        changed: created,
        overwrite: (query as { overwrite: boolean }).overwrite,
      }));
  }

  @Post('telegram/webhook')
  async setupTelegramWebhook(
    @Body() body: { base_url?: string } = {},
  ): Promise<{ configured: boolean; url: string }> {
    const baseUrl = body?.base_url ?? this.config.get('APP_PUBLIC_URL', { infer: true });
    if (!baseUrl)
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_WEBHOOK_URL_MISSING',
        message: 'Thiếu APP_PUBLIC_URL hoặc base_url',
      });
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch (error) {
      void error;
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_WEBHOOK_URL_INVALID',
        message: 'Webhook URL không hợp lệ',
      });
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/'
    )
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_WEBHOOK_URL_INVALID',
        message: 'Webhook URL phải là HTTPS origin',
      });
    return this.telegram.setupWebhook(baseUrl);
  }
}
