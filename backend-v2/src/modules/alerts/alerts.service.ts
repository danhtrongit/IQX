import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildFrame, evaluateLatest } from '../quant/conditions.js';
import type { Ohlcv } from '../quant/indicators.js';
import type { Environment } from '../../platform/config/environment.js';
import { AlertsRepository } from './alerts.repository.js';
import { TelegramService } from '../notifications/telegram.service.js';
import type { AlertScanSummary, UserAlertRule } from './alerts.types.js';
import type { UserAlertRuleCreateInput, UserAlertRuleUpdateInput } from './alerts.schemas.js';

export type OhlcvLoader = (symbol: string) => Promise<Ohlcv | null>;

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  constructor(
    private readonly repository: AlertsRepository,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  listSignals(enabledOnly = false) {
    return this.repository.listSignals(enabledOnly);
  }
  listRules(userId: string) {
    return this.repository.listRules(userId);
  }
  listEvents(userId: string) {
    return this.repository.listEvents(userId);
  }

  async createRule(userId: string, input: UserAlertRuleCreateInput): Promise<UserAlertRule> {
    if (input.signal_key) {
      const signal = await this.repository.findSignal(input.signal_key);
      if (!signal || !signal.is_enabled)
        throw new NotFoundException({
          code: 'ALERT_SIGNAL_NOT_FOUND',
          message: 'Không tìm thấy tín hiệu',
        });
      return this.repository.createRule(userId, {
        name: input.name ?? signal.message_title,
        side: signal.side,
        base_signal_key: signal.key,
        combination: signal.combination,
        is_enabled: input.is_enabled,
      });
    }
    return this.repository.createRule(userId, {
      name: input.name!,
      side: input.side!,
      base_signal_key: null,
      combination: input.combination!,
      is_enabled: input.is_enabled,
    });
  }

  async updateRule(
    userId: string,
    ruleId: string,
    input: UserAlertRuleUpdateInput,
  ): Promise<UserAlertRule> {
    const rule = await this.repository.updateRule(userId, ruleId, input);
    if (!rule)
      throw new NotFoundException({
        code: 'ALERT_RULE_NOT_FOUND',
        message: 'Không tìm thấy cảnh báo',
      });
    return rule;
  }

  async deleteRule(userId: string, ruleId: string): Promise<void> {
    if (!(await this.repository.deleteRule(userId, ruleId)))
      throw new NotFoundException({
        code: 'ALERT_RULE_NOT_FOUND',
        message: 'Không tìm thấy cảnh báo',
      });
  }

  async telegramStatus(userId: string) {
    const status = await this.repository.telegramStatus(userId);
    return {
      linked: Boolean(status.telegram_chat_id),
      linked_at: status.telegram_linked_at,
      bot_username: this.telegram.botUsername,
    };
  }

  async createTelegramLink(userId: string) {
    return this.telegram.mintLink(userId);
  }

  unlinkTelegram(userId: string) {
    return this.repository.unlinkTelegram(userId);
  }

  async linkTelegramUser(userId: string, chatId: string): Promise<boolean> {
    return this.repository.linkTelegram(userId, chatId);
  }

  async scan(
    loader: OhlcvLoader,
    options: { force?: boolean; now?: Date } = {},
  ): Promise<AlertScanSummary> {
    const now = options.now ?? new Date();
    if (!options.force && !this.isMarketOpen(now))
      return {
        rules: 0,
        symbols_scanned: 0,
        alerts_fired: 0,
        deliveries_succeeded: 0,
        deliveries_failed: 0,
        ran_at: now.toISOString(),
        skipped: 'market_closed',
      };
    const rules = await this.repository.listScannableRules();
    const symbols = [...new Set(rules.flatMap((rule) => rule.symbols))];
    const frames = new Map<string, Ohlcv>();
    for (const symbol of symbols) {
      const frame = await loader(symbol);
      if (frame && frame.close.length >= 60) frames.set(symbol, frame);
    }
    let fired = 0,
      successes = 0,
      failures = 0;
    const sessionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
      now,
    );
    for (const rule of rules) {
      if (!rule.telegram_chat_id) continue;
      for (const symbol of rule.symbols) {
        const ohlcv = frames.get(symbol);
        if (!ohlcv) continue;
        try {
          if (!evaluateLatest(buildFrame(ohlcv), rule.combination)) continue;
          const price = ohlcv.close[ohlcv.close.length - 1]!;
          const event = await this.repository.recordFire({
            userId: rule.user_id,
            ruleId: rule.id,
            symbol,
            signalKey: rule.base_signal_key,
            sessionDate,
            firedAt: now,
            price,
            cooldownSeconds: this.config.get('ALERT_COOLDOWN_SECONDS', { infer: true }),
          });
          if (!event) continue;
          fired += 1;
          try {
            await this.telegram.sendMessage(
              rule.telegram_chat_id,
              this.formatMessage(rule, symbol, price),
            );
            await this.repository.markDelivery(event.id, true, null);
            successes += 1;
          } catch (error) {
            await this.repository.markDelivery(
              event.id,
              false,
              error instanceof Error ? error.message : 'Telegram delivery failed',
            );
            failures += 1;
          }
        } catch (error) {
          this.logger.warn(
            `Alert evaluation failed for ${rule.id}/${symbol}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }
    }
    return {
      rules: rules.length,
      symbols_scanned: frames.size,
      alerts_fired: fired,
      deliveries_succeeded: successes,
      deliveries_failed: failures,
      ran_at: now.toISOString(),
    };
  }

  run(
    loader: OhlcvLoader,
    options: { force?: boolean; now?: Date } = {},
  ): Promise<AlertScanSummary> {
    return this.scan(loader, options);
  }

  private formatMessage(rule: UserAlertRule, symbol: string, price: number): string {
    const title = this.escapeHtml(rule.name);
    const side = rule.side === 'buy' ? '🟢' : '🔴';
    return `${side} <b>${title}</b> — <b>${this.escapeHtml(symbol)}</b>\nGiá: ${price.toLocaleString('vi-VN')}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  private isMarketOpen(date: Date): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const day = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
    if (day === 'Sat' || day === 'Sun') return false;
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    const total = hour * 60 + minute;
    return (total >= 540 && total < 690) || (total >= 780 && total < 900);
  }
}

/** Stable runtime-facing name; the service is deliberately independent from HTTP controllers. */
export { AlertService as AlertScanService };
