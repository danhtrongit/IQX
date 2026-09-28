/**
 * Mobile-facing OpenAPI view. The complete generated snapshot lives in
 * `backend/contracts/client`; these stable aliases keep the app package
 * independent of the backend workspace while retaining the contract shape.
 */
export type MobilePlatform = 'ios' | 'android';

export interface MobilePremiumProduct {
  id: string;
  store_product_id: string | null;
  platform: MobilePlatform;
  name: string;
  description?: string | null;
  price_vnd: number;
  duration_days: number;
}

export interface MobileProductsResponse { items: MobilePremiumProduct[]; }
export interface MobileWsTicketResponse { ticket: string; expires_at: string; }
export interface MobileDeviceRegistration {
  device_id: string;
  platform: MobilePlatform;
  push_token?: string;
  app_version?: string;
  locale?: string;
  timezone?: string;
}
export interface MobileNotificationPreferences {
  notifications_enabled: boolean;
  marketing_enabled: boolean;
  locale?: string;
  timezone?: string;
}
export interface MobilePurchaseRequest {
  platform: MobilePlatform;
  product_id: string;
  transaction_id: string;
  receipt: string;
}
export interface MobilePurchaseVerificationResponse {
  verified: boolean;
  provider: string;
  transaction_id: string;
  entitlement: unknown;
}
export interface AccountPrivacyRequestResponse { request_id: string; status: string; }
export interface AccountDeletionStatusResponse { request_id: string | null; status: string; }
