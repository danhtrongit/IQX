import type { AuthenticatedUser } from '../auth/index.js';

export const MOBILE_PURCHASE_PROVIDER = Symbol('MOBILE_PURCHASE_PROVIDER');

export type MobilePurchaseInput = {
  platform: 'ios' | 'android';
  product_id: string;
  transaction_id: string;
  receipt: string;
};

export type MobilePurchaseResult = {
  verified: boolean;
  provider: string;
  transaction_id: string;
  entitlement: null;
};

export interface MobilePurchaseProvider {
  verify(input: MobilePurchaseInput, user: AuthenticatedUser): Promise<MobilePurchaseResult>;
  restore(
    platform: MobilePurchaseInput['platform'],
    user: AuthenticatedUser,
  ): Promise<MobilePurchaseResult>;
  notify(
    platform: MobilePurchaseInput['platform'],
    payload: Record<string, unknown>,
  ): Promise<{ accepted: boolean }>;
}

export type MobileDevice = {
  device_id: string;
  platform: 'ios' | 'android';
  push_token?: string;
  app_version?: string;
  locale?: string;
  timezone?: string;
  updated_at: string;
};

export type MobilePreferences = {
  notifications_enabled: boolean;
  marketing_enabled: boolean;
  locale?: string;
  timezone?: string;
};
