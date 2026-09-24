import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../platform/redis/index.js';
import type { Environment } from '../../platform/config/environment.js';

export class TelegramDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'TelegramDeliveryError';
  }
}

type TelegramApiResponse = { ok?: boolean; description?: string; result?: unknown };

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token: string | undefined;
  private readonly username: string | undefined;
  private readonly webhookSecret: string | undefined;
  private readonly linkTtlSeconds: number;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly redis: RedisService,
  ) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.username = config.get('TELEGRAM_BOT_USERNAME', { infer: true });
    this.webhookSecret = config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    this.linkTtlSeconds = config.get('TELEGRAM_LINK_TTL_SECONDS', { infer: true });
  }

  get botUsername(): string | null {
    return this.username ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.username);
  }

  requireConfigured(): void {
    if (!this.isConfigured())
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_NOT_CONFIGURED',
        message: 'Telegram chưa được cấu hình',
      });
  }

  async mintLink(userId: string): Promise<{ deep_link: string; token: string }> {
    this.requireConfigured();
    const raw = randomBytes(24).toString('base64url');
    const hash = this.hash(raw);
    const key = this.redis.key('telegram-link', hash);
    try {
      await this.redis.execute((client) =>
        client.set(key, userId, 'EX', this.linkTtlSeconds, 'NX'),
      );
    } catch (error) {
      this.logger.warn(
        `Telegram link storage failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_LINK_UNAVAILABLE',
        message: 'Không thể tạo liên kết Telegram',
      });
    }
    return { token: raw, deep_link: `https://t.me/${this.username}?start=${raw}` };
  }

  async redeemLink(rawToken: string, chatId: string): Promise<string | null> {
    if (!rawToken || rawToken.length > 128) return null;
    const key = this.redis.key('telegram-link', this.hash(rawToken));
    try {
      const userId = await this.redis.execute(
        (client) =>
          client.eval(
            `local v = redis.call('GET', KEYS[1]); if v and ARGV[1] ~= '' then redis.call('DEL', KEYS[1]); return v else return false end`,
            1,
            key,
            chatId,
          ) as Promise<string | null>,
      );
      return userId ?? null;
    } catch (error) {
      this.logger.warn(
        `Telegram link redemption unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  verifyWebhookSecret(pathSecret: string | undefined, headerSecret: string | undefined): boolean {
    if (!this.webhookSecret || !pathSecret || !headerSecret) return false;
    return (
      this.constantTimeEqual(pathSecret, this.webhookSecret) &&
      this.constantTimeEqual(headerSecret, this.webhookSecret)
    );
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    this.requireConfigured();
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.call('sendMessage', {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
        if (result.ok) return;
        const status =
          typeof result.description === 'string' ? result.description : 'Telegram API lỗi';
        throw new TelegramDeliveryError(
          status,
          /timeout|temporar|try again|too many|rate limit|429|5\d\d/i.test(status),
        );
      } catch (error) {
        lastError = error;
        if (!(error instanceof TelegramDeliveryError) || !error.retryable || attempt === 2)
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new TelegramDeliveryError('Telegram delivery failed', true);
  }

  async setupWebhook(baseUrl: string): Promise<{ configured: boolean; url: string }> {
    this.requireConfigured();
    if (!this.webhookSecret)
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_WEBHOOK_NOT_CONFIGURED',
        message: 'Thiếu TELEGRAM_WEBHOOK_SECRET',
      });
    const url = `${baseUrl.replace(/\/$/, '')}/api/v2/telegram/webhook/${encodeURIComponent(this.webhookSecret)}`;
    const result = await this.call('setWebhook', {
      url,
      secret_token: this.webhookSecret,
      allowed_updates: ['message'],
    });
    if (!result.ok)
      throw new TelegramDeliveryError(
        result.description ?? 'Không thể đăng ký Telegram webhook',
        false,
      );
    return { configured: true, url };
  }

  async handleWebhookUpdate(
    update: unknown,
    linkUser: (userId: string, chatId: string) => Promise<boolean>,
  ): Promise<void> {
    if (!update || typeof update !== 'object') return;
    const record = update as Record<string, unknown>;
    const message =
      record.message && typeof record.message === 'object'
        ? (record.message as Record<string, unknown>)
        : {};
    const chat =
      message.chat && typeof message.chat === 'object'
        ? (message.chat as Record<string, unknown>)
        : {};
    const chatId =
      typeof chat.id === 'string' || typeof chat.id === 'number' ? String(chat.id) : null;
    const sender =
      message.from && typeof message.from === 'object'
        ? (message.from as Record<string, unknown>)
        : {};
    if (chat.type !== 'private' || String(sender.id ?? '') !== chatId) return;
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (!chatId || !text) return;
    if (!/^\/start(?:\s|$)/.test(text)) return;
    const token = text.slice(6).trim().split(/\s+/)[0] ?? '';
    if (!token) return;
    const userId = await this.redeemLink(token, chatId);
    if (userId) {
      try {
        await linkUser(userId, chatId);
      } catch (error) {
        // Webhooks are acknowledged regardless of account state; Telegram retries
        // are not allowed to turn a duplicate chat binding into a 5xx storm.
        this.logger.warn(
          `Telegram chat binding failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  private async call(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramApiResponse> {
    if (!this.token)
      throw new ServiceUnavailableException({
        code: 'TELEGRAM_NOT_CONFIGURED',
        message: 'Telegram chưa được cấu hình',
      });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new TelegramDeliveryError(
          `Telegram HTTP ${response.status}`,
          response.status >= 500 || response.status === 429,
        );
      return (await response.json()) as TelegramApiResponse;
    } catch (error) {
      if (error instanceof TelegramDeliveryError) throw error;
      throw new TelegramDeliveryError('Telegram request failed', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
