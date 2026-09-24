import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  BillingService,
  exactVndNumber,
  sanitizeIpnPayload,
  signCheckoutFields,
} from '../../src/modules/billing/billing.service.js';
import type { BillingSqlClient } from '../../src/modules/billing/billing.types.js';

type QueryCall = { sql: string; params: readonly unknown[] };

class FakeDatabase implements BillingSqlClient {
  readonly calls: QueryCall[] = [];

  constructor(
    private readonly resolver: (
      sql: string,
      params: readonly unknown[],
    ) => Record<string, unknown>[],
  ) {}

  query<T extends Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    this.calls.push({ sql, params });
    return Promise.resolve(this.resolver(sql, params) as T[]);
  }

  transaction<T>(operation: (client: BillingSqlClient) => Promise<T>): Promise<T> {
    return operation(this);
  }
}

function service(database: FakeDatabase, settings: Record<string, string> = {}): BillingService {
  const config = { get: (name: string) => settings[name] } as ConfigService;
  return new BillingService(database as unknown as DatabaseService, config);
}

const order = {
  id: '8b490a0e-02f3-41aa-bc5a-6fbf14eb3bb6',
  invoice_number: 'IQX_ORDER1',
  user_id: '54b3c5d4-a0b2-44f4-97b9-23f2b0a88332',
  plan_id: 'de384f50-fc36-4c16-9cd3-a59053003bf8',
  amount_vnd: 199000,
  refunded_amount_vnd: 0,
  currency: 'VND',
  status: 'pending',
  duration_days_snapshot: 30,
  plan_code_snapshot: 'MONTHLY',
  plan_name_snapshot: 'Monthly',
  sepay_transaction_id: null,
  paid_at: null,
  grant_type: null,
  granted_by_user_id: null,
  grant_note: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

function payload(amount = '199000') {
  return {
    notification_type: 'ORDER_PAID',
    order: {
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: amount,
      order_invoice_number: order.invoice_number,
    },
    transaction: {
      transaction_id: 'SEPAY_TX_1',
      transaction_status: 'APPROVED',
      transaction_currency: 'VND',
      transaction_amount: amount,
    },
  };
}

describe('billing payment security helpers', () => {
  it('decodes PostgreSQL int8 text exactly and rejects unsafe JSON numbers', () => {
    expect(exactVndNumber('50000', 'refunded_amount_vnd')).toBe(50_000);
    expect(() => exactVndNumber(Number.MAX_SAFE_INTEGER + 1, 'refunded_amount_vnd')).toThrow(
      'refunded_amount_vnd cannot be represented exactly',
    );
  });

  it('signs fields in SePay order and ignores unknown fields', () => {
    const fields = {
      cancel_url: 'https://app/cancel',
      unknown: 'not-signed',
      order_amount: '199000',
      merchant: 'IQX',
      currency: 'VND',
      operation: 'PURCHASE',
    };
    expect(signCheckoutFields(fields, 'secret')).toBe(
      'jNLiN9arsNG25OK+Abalrx5pYtH4TW0nUTdg/meRLjs=',
    );
  });

  it('redacts customer, card and IP address fields from webhook storage', () => {
    const safe = sanitizeIpnPayload({
      ...payload(),
      customer: { customer_id: 'pii' },
      order: { ...payload().order, ip_address: '10.0.0.1', user_agent: 'secret' },
      transaction: { ...payload().transaction, card_number: '4111111111111111' },
    });
    expect(JSON.stringify(safe)).not.toContain('4111111111111111');
    expect(JSON.stringify(safe)).not.toContain('10.0.0.1');
    expect(JSON.stringify(safe)).not.toContain('pii');
    expect(safe).toMatchObject({ notification_type: 'ORDER_PAID' });
  });
});

describe('BillingService IPN processing', () => {
  it('rejects amount mismatch without claiming or granting', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('for update')) return [order];
      return [];
    });
    const result = await service(db).processWebhook(payload('199001'), {});
    expect(result).toEqual({ success: 'true', message: 'amount_mismatch' });
    expect(db.calls.some(({ sql }) => sql.includes("set status = 'paid'"))).toBe(false);
    expect(db.calls.some(({ sql }) => sql.includes('billing_entitlement_grants'))).toBe(false);
  });

  it('treats a paid order replay as idempotent', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('for update')) return [{ ...order, status: 'paid' }];
      return [];
    });
    const result = await service(db).processWebhook(payload(), {});
    expect(result.message).toBe('already_processed');
    expect(db.calls.filter(({ sql }) => sql.includes("set status = 'paid'"))).toHaveLength(0);
  });

  it('uses a pending-only atomic claim before creating a grant', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('where invoice_number') && sql.includes('for update')) return [order];
      if (sql.includes('where sepay_transaction_id')) return [];
      if (sql.includes('update premium_payment_orders') && sql.includes('returning')) {
        return [{ ...order, status: 'paid' }];
      }
      if (sql.includes('bool_or')) {
        return [
          {
            starts_at: new Date('2026-01-01T00:00:00Z'),
            ends_at: new Date('2026-02-01T00:00:00Z'),
            current_plan_id: order.plan_id,
            entitled: true,
          },
        ];
      }
      if (sql.includes('returning id')) return [{ id: 'sub-id' }];
      return [];
    });
    const result = await service(db).processWebhook(payload(), {});
    expect(result.message).toBe('processed');
    const claimIndex = db.calls.findIndex(({ sql }) =>
      sql.includes('update premium_payment_orders'),
    );
    const grantIndex = db.calls.findIndex(({ sql }) =>
      sql.includes('insert into billing_entitlement_grants'),
    );
    expect(claimIndex).toBeGreaterThan(-1);
    expect(db.calls[claimIndex]?.sql).toContain("where id = $1 and status = 'pending'");
    expect(grantIndex).toBeGreaterThan(claimIndex);
    expect(db.calls[grantIndex]?.sql).toContain('on conflict (order_id)');
  });
});

describe('BillingService entitlement lifecycle', () => {
  it('uses exactly active + start <= now < end for user entitlement and lets admin bypass', async () => {
    const db = new FakeDatabase(() => []);
    const billing = service(db);
    expect(await billing.getEntitlement(order.user_id, 'user')).toMatchObject({
      is_premium: false,
    });
    expect(await billing.getEntitlement(order.user_id, 'admin')).toMatchObject({
      is_premium: true,
      status: 'active',
    });
    expect(db.calls[0]?.sql).toContain("g.status = 'active'");
    expect(db.calls[0]?.sql).toContain('g.starts_at <= now() and now() < g.ends_at');
  });

  it('cancellation revokes every current/future grant and never downgrades admin', async () => {
    const sub = {
      id: '0bee4b3b-a269-4313-8c5f-3de0dce07c89',
      user_id: order.user_id,
      current_plan_id: order.plan_id,
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 86_400_000),
      status: 'active',
      cancelled_at: null,
      cancelled_by_user_id: null,
      cancel_reason: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const db = new FakeDatabase((sql) => {
      if (sql.includes('select user_id from premium_subscriptions')) {
        return [{ user_id: sub.user_id }];
      }
      if (sql.includes('premium_subscriptions where id') && sql.includes('for update'))
        return [sub];
      if (sql.includes('select s.*, u.email')) return [sub];
      return [];
    });
    await service(db).cancelSubscription(sub.id, { id: order.user_id }, 'requested');
    const revoke = db.calls.find(({ sql }) => sql.includes('update billing_entitlement_grants'));
    const role = db.calls.find(({ sql }) => sql.includes('update users set role'));
    expect(revoke?.sql).toContain("status = 'active' and ends_at > now()");
    expect(role?.sql).toContain("and role = 'premium'");
  });

  it('partial refund shortens only grants belonging to the refunded order', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('premium_payment_orders where id') && sql.includes('for update')) {
        return [{ ...order, status: 'paid' }];
      }
      if (sql.includes('update premium_payment_orders') && sql.includes('amount_vnd_text')) {
        return [
          {
            ...order,
            status: 'partially_refunded',
            refunded_amount_vnd: '99000',
            amount_vnd_text: '199000',
            refunded_amount_vnd_text: '99000',
          },
        ];
      }
      if (sql.includes('bool_or'))
        return [{ starts_at: null, ends_at: null, current_plan_id: null, entitled: false }];
      if (sql.includes('select o.*, o.plan_name_snapshot')) return [order];
      return [];
    });
    await service(db).refund(order.id, { id: order.user_id }, 'partial', 99000);
    const grantUpdate = db.calls.find(
      ({ sql }) =>
        sql.includes('update billing_entitlement_grants') && sql.includes('original_ends_at'),
    );
    expect(grantUpdate?.sql).toContain('billing_entitlement_grants.order_id = o.id');
    expect(grantUpdate?.sql).toContain(
      "billing_entitlement_grants.kind in ('payment', 'admin_confirmed')",
    );
    expect(db.calls.some(({ sql }) => sql.includes('insert into billing_refunds'))).toBe(true);
    expect(db.calls.some(({ sql }) => sql.includes("'partially_refunded'"))).toBe(true);
  });
});

describe('BillingService checkout configuration', () => {
  it('returns 503 before creating an order when provider config is absent', async () => {
    const db = new FakeDatabase(() => []);
    await expect(service(db).createCheckout(order.user_id, order.plan_id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(db.calls).toHaveLength(0);
  });
});
