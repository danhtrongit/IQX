import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/index.js';
import { BillingService } from '../billing/index.js';
import { RealtimeMobileTicketStore } from '../realtime/mobile-ticket.js';
import { DatabaseService } from '../../platform/database/index.js';
import type {
  DeviceInput,
  ProductQuery,
  PreferencesInput,
  PurchaseInput,
  RestoreInput,
  StoreNotificationInput,
} from './mobile.schemas.js';
import {
  MOBILE_PURCHASE_PROVIDER,
  type MobileDevice,
  type MobilePreferences,
  type MobilePurchaseProvider,
  type MobilePurchaseResult,
} from './mobile.types.js';

const unavailable = (): never => {
  throw new NotImplementedException({
    code: 'MOBILE_PURCHASE_VERIFICATION_UNAVAILABLE',
    message: 'Mobile purchase verification is not configured',
  });
};

@Injectable()
export class UnavailableMobilePurchaseProvider implements MobilePurchaseProvider {
  verify(): Promise<MobilePurchaseResult> {
    return Promise.reject(unavailable());
  }
  restore(): Promise<MobilePurchaseResult> {
    return Promise.reject(unavailable());
  }
  notify(): Promise<{ accepted: boolean }> {
    return Promise.reject(unavailable());
  }
}

@Injectable()
export class MobileService {
  private readonly tickets = new RealtimeMobileTicketStore();

  constructor(
    private readonly billing: BillingService,
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    @Inject(MOBILE_PURCHASE_PROVIDER) private readonly provider: MobilePurchaseProvider,
  ) {}

  async products(query: ProductQuery) {
    const plans = await this.billing.listPlans(true);
    const configuredProducts = this.productMap(query.platform);
    return {
      items: plans.map((plan) => ({
        id: plan.code,
        store_product_id: configuredProducts.get(plan.code) ?? null,
        platform: query.platform,
        name: plan.name,
        description: plan.description,
        price_vnd: plan.price_vnd,
        duration_days: plan.duration_days,
      })),
    };
  }

  private productMap(platform: ProductQuery['platform']): Map<string, string> {
    const raw = this.config.get<string>(
      platform === 'ios' ? 'MOBILE_IOS_PRODUCT_IDS' : 'MOBILE_ANDROID_PRODUCT_IDS',
    );
    const result = new Map<string, string>();
    for (const pair of (raw ?? '').split(',')) {
      const [planCode, productId] = pair.split('=').map((value) => value?.trim());
      if (planCode && productId) result.set(planCode, productId);
    }
    return result;
  }

  verify(input: PurchaseInput, user: AuthenticatedUser) {
    return this.provider.verify(input, user);
  }
  restore(input: RestoreInput, user: AuthenticatedUser) {
    return this.provider.restore(input.platform, user);
  }
  notify(platform: 'ios' | 'android', payload: StoreNotificationInput) {
    return this.provider.notify(platform, payload);
  }

  async registerDevice(user: AuthenticatedUser, input: DeviceInput): Promise<MobileDevice> {
    const rows = await this.database.query<MobileDevice>(
      `insert into mobile_devices (user_id, device_id, platform, push_token, app_version, locale, timezone)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, device_id) do update set
         platform = excluded.platform,
         push_token = excluded.push_token,
         app_version = excluded.app_version,
         locale = excluded.locale,
         timezone = excluded.timezone,
         updated_at = now()
       returning device_id, platform, push_token, app_version, locale, timezone,
                 updated_at::text as updated_at`,
      [
        user.id,
        input.device_id,
        input.platform,
        input.push_token ?? null,
        input.app_version ?? null,
        input.locale ?? null,
        input.timezone ?? null,
      ],
    );
    const device = rows[0];
    if (!device) throw new Error('Mobile device upsert returned no row');
    return device;
  }
  async removeDevice(user: AuthenticatedUser, deviceId: string): Promise<{ deleted: true }> {
    await this.database.query('delete from mobile_devices where user_id = $1 and device_id = $2', [
      user.id,
      deviceId,
    ]);
    return { deleted: true };
  }
  async getPreferences(user: AuthenticatedUser): Promise<MobilePreferences> {
    const rows = await this.database.query<MobilePreferences>(
      `select notifications_enabled, marketing_enabled, locale, timezone
         from mobile_notification_preferences where user_id = $1`,
      [user.id],
    );
    return rows[0] ?? { notifications_enabled: true, marketing_enabled: false };
  }
  async updatePreferences(
    user: AuthenticatedUser,
    input: PreferencesInput,
  ): Promise<MobilePreferences> {
    const current = await this.getPreferences(user);
    const value = { ...current, ...input };
    const rows = await this.database.query<MobilePreferences>(
      `insert into mobile_notification_preferences
         (user_id, notifications_enabled, marketing_enabled, locale, timezone)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set
         notifications_enabled = excluded.notifications_enabled,
         marketing_enabled = excluded.marketing_enabled,
         locale = excluded.locale,
         timezone = excluded.timezone,
         updated_at = now()
       returning notifications_enabled, marketing_enabled, locale, timezone`,
      [
        user.id,
        value.notifications_enabled,
        value.marketing_enabled,
        value.locale ?? null,
        value.timezone ?? null,
      ],
    );
    return rows[0] ?? value;
  }
  issueRealtimeTicket(user: AuthenticatedUser): { ticket: string; expires_at: string } {
    const issued = this.tickets.issue(user.id);
    return { ticket: issued.ticket, expires_at: issued.expiresAt };
  }

  consumeRealtimeTicket(ticket: string): string | null {
    return this.tickets.consume(ticket);
  }
  async requestDeletion(user: AuthenticatedUser) {
    const rows = await this.database.query<{ request_id: string; status: 'queued' }>(
      `insert into mobile_account_requests (user_id, kind)
       values ($1, 'deletion') returning id as request_id, status`,
      [user.id],
    );
    return rows[0] ?? { request_id: randomUUID(), status: 'queued' as const };
  }
  async requestExport(user: AuthenticatedUser) {
    const rows = await this.database.query<{ request_id: string; status: 'queued' }>(
      `insert into mobile_account_requests (user_id, kind)
       values ($1, 'export') returning id as request_id, status`,
      [user.id],
    );
    return rows[0] ?? { request_id: randomUUID(), status: 'queued' as const };
  }

  async deletionStatus(user: AuthenticatedUser) {
    const rows = await this.database.query<{ request_id: string; status: string }>(
      `select id as request_id, status
         from mobile_account_requests
        where user_id = $1 and kind = 'deletion'
        order by created_at desc limit 1`,
      [user.id],
    );
    return rows[0] ?? { request_id: null, status: 'none' as const };
  }
}
