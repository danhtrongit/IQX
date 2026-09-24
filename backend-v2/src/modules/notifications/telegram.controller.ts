import {
  Controller,
  forwardRef,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { TelegramService } from './telegram.service.js';
import { AlertService } from '../alerts/alerts.service.js';
import { Public } from '../auth/auth.decorators.js';

@Controller(['api/v1/telegram', 'api/v2/telegram'])
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    @Inject(forwardRef(() => AlertService)) private readonly alerts: AlertService,
  ) {}

  @Post('webhook/:secret')
  @Public()
  @HttpCode(200)
  async webhook(
    @Param('secret') secret: string,
    @Headers('x-telegram-bot-api-secret-token') headerSecret: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    if (!this.telegram.verifyWebhookSecret(secret, headerSecret)) return { ok: true };
    const body = request.body;
    await this.telegram.handleWebhookUpdate(body, (userId, chatId) =>
      this.alerts.linkTelegramUser(userId, chatId),
    );
    return { ok: true };
  }
}
