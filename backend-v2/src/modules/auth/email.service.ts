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

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    if (!asBoolean(this.config.get('EMAIL_ENABLED'))) return false;
    const url = this.config.get<string>('EMAIL_PROVIDER_URL');
    const apiKey = this.config.get<string>('EMAIL_API_KEY');
    const from = this.config.get<string>('EMAIL_SENDER');
    if (!url || !apiKey || !from) {
      this.logger.warn('Email is enabled but provider configuration is incomplete');
      return false;
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`provider status ${response.status}`);
      return true;
    } catch {
      this.logger.warn('Email provider request failed');
      return false;
    }
  }
}

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
