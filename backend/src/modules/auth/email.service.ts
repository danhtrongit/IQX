import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerification(email: string, fullName: string, token: string): Promise<boolean> {
    const href = `${this.publicApiUrl()}/api/v2/auth/verify-email?token=${encodeURIComponent(token)}`;
    return this.send(
      email,
      'Xác thực email IQX',
      `<p>Xin chào ${escapeHtml(fullName)},</p><p><a href="${escapeHtml(href)}">Xác thực email</a></p>`,
    );
  }

  async sendPasswordReset(email: string, fullName: string, token: string): Promise<boolean> {
    const href = `${this.publicApiUrl()}/api/v2/auth/reset-password?token=${encodeURIComponent(token)}`;
    return this.send(
      email,
      'Đặt lại mật khẩu IQX',
      `<p>Xin chào ${escapeHtml(fullName)},</p><p><a href="${escapeHtml(href)}">Đặt lại mật khẩu</a></p>`,
    );
  }

  private publicApiUrl(): string {
    return (this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
  }

  /** Email gửi được không (cờ bật và đủ cấu hình nhà cung cấp). */
  isEnabled(): boolean {
    return (
      asBoolean(this.config.get('EMAIL_ENABLED')) &&
      Boolean(this.config.get<string>('EMAIL_PROVIDER_URL')) &&
      Boolean(this.config.get<string>('EMAIL_API_KEY')) &&
      Boolean(this.config.get<string>('EMAIL_SENDER'))
    );
  }

  /**
   * Địa chỉ gửi theo loại thư (update 22-11 §8.4): Bản tin và Bot có địa chỉ riêng, bỏ trống thì
   * dùng `EMAIL_SENDER`.
   */
  sender(kind: EmailSenderKind = 'default'): string | undefined {
    const fallback = this.config.get<string>('EMAIL_SENDER') || undefined;
    if (kind === 'bulletin') return this.config.get<string>('EMAIL_SENDER_BULLETIN') || fallback;
    if (kind === 'bot') return this.config.get<string>('EMAIL_SENDER_BOT') || fallback;
    return fallback;
  }

  /**
   * Gửi một thư qua nhà cung cấp HTTP. Không ném lỗi: kết quả cho biết đã gửi, đang tắt, thiếu
   * cấu hình hay nhà cung cấp lỗi (để bên gọi quyết định thử lại).
   */
  async deliver(message: EmailMessage): Promise<EmailDeliveryResult> {
    if (!asBoolean(this.config.get('EMAIL_ENABLED'))) return { status: 'disabled' };
    const url = this.config.get<string>('EMAIL_PROVIDER_URL');
    const apiKey = this.config.get<string>('EMAIL_API_KEY');
    const from = message.from ?? this.sender();
    if (!url || !apiKey || !from) {
      this.logger.warn('Email is enabled but provider configuration is incomplete');
      return { status: 'misconfigured' };
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`provider status ${response.status}`);
      return { status: 'sent' };
    } catch (error) {
      this.logger.warn('Email provider request failed');
      return {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
      };
    }
  }

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    return (await this.deliver({ to, subject, html })).status === 'sent';
  }
}

export type EmailSenderKind = 'default' | 'bulletin' | 'bot';

export type EmailMessage = { to: string; subject: string; html: string; from?: string };

export type EmailDeliveryResult =
  | { status: 'sent' }
  | { status: 'disabled' }
  | { status: 'misconfigured' }
  | { status: 'failed'; error: string };

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}
