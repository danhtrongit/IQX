import { api } from './api';

export type StorePlatform = 'ios' | 'android';
export type StoreProduct = { id: string; store_product_id?: string | null; platform?: StorePlatform; name?: string; description?: string | null; price_vnd?: number; duration_days?: number };
export type StorePurchase = { productId: string; transactionId: string; receipt: string };
export type StoreEntitlement = { verified: boolean; provider: string; transaction_id: string; entitlement: unknown };

/**
 * Native StoreKit/Play Billing adapters implement this boundary. Keeping the
 * provider behind an interface prevents a client-side purchase from becoming
 * an entitlement before the backend verifies it.
 */
export interface StoreBillingProvider {
  platform: StorePlatform;
  loadProducts(): Promise<StoreProduct[]>;
  purchase(productId: string): Promise<StorePurchase>;
  restore(): Promise<StorePurchase[]>;
}

export async function verifyPurchase(platform: StorePlatform, purchase: StorePurchase): Promise<StoreEntitlement> {
  return api<StoreEntitlement>(`mobile/premium/purchases/${platform === 'ios' ? 'apple' : 'google'}/verify`, {
    method: 'POST',
    idempotencyKey: `${platform}:${purchase.transactionId}`,
    body: { platform, product_id: purchase.productId, transaction_id: purchase.transactionId, receipt: purchase.receipt },
  });
}

export async function restorePurchases(platform: StorePlatform, purchases: StorePurchase[] = []): Promise<StoreEntitlement[]> {
  const entitlements: StoreEntitlement[] = [];
  for (const purchase of purchases) entitlements.push(await verifyPurchase(platform, purchase));
  if (!purchases.length) {
    const result = await api<StoreEntitlement>('mobile/premium/purchases/restore', { method: 'POST', body: { platform } });
    entitlements.push(result);
  }
  return entitlements;
}
