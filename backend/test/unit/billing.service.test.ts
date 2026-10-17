import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  BillingService,
  exactVndNumber,
  sanitizeIpnPayload,
  signCheckoutFields,
  teamLeadCommissionAmount,
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
  team_lead_id: null,
  commission_pct: null,
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

describe('team-lead commission accounting (admin spec v1.1 §3.3-4)', () => {
  const ledgerInserts = (db: FakeDatabase) =>
    db.calls.filter(({ sql }) => sql.includes('insert into referral_commission_ledger'));

  function ipnDatabase(paid: Record<string, unknown>, source = order): FakeDatabase {
    return new FakeDatabase((sql) => {
      if (sql.includes('where invoice_number') && sql.includes('for update')) return [source];
      if (sql.includes('where sepay_transaction_id')) return [];
      if (sql.includes('update premium_payment_orders') && sql.includes('returning')) {
        return [{ ...source, status: 'paid', ...paid }];
      }
      return [];
    });
  }

  it('floors amount × pct / 100 in exact integer VND', () => {
    expect(teamLeadCommissionAmount(1, 40)).toBe(0);
    expect(teamLeadCommissionAmount(99, 40)).toBe(39);
    expect(teamLeadCommissionAmount('199000', 35)).toBe(69_650);
    expect(teamLeadCommissionAmount(199_000, 0)).toBe(0);
    expect(teamLeadCommissionAmount(199_000, 100)).toBe(199_000);
    expect(() => teamLeadCommissionAmount(100, 101)).toThrow('Invalid commission_pct');
    expect(() => teamLeadCommissionAmount(Number.MAX_SAFE_INTEGER + 1, 10)).toThrow(
      'amount_vnd cannot be represented exactly',
    );
  });

  it('snapshots the active lead and pct in the same UPDATE that marks the order paid', async () => {
    const db = ipnDatabase({ team_lead_id: 'lead-id', commission_pct: 40 });
    expect((await service(db).processWebhook(payload(), {})).message).toBe('processed');
    const claim = db.calls.find(({ sql }) => sql.includes('update premium_payment_orders'));
    expect(claim?.sql).toContain("set status = 'paid'");
    expect(claim?.sql).toContain('team_lead_id = (select team_lead_id from team_lead_snapshot)');
    expect(claim?.sql).toContain(
      'commission_pct = (select commission_pct from team_lead_snapshot)',
    );
    // DECISION 2: only an active lead profile is snapshotted.
    expect(claim?.sql).toContain("p.status = 'active'");
    const inserts = ledgerInserts(db);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.sql).toContain("'team_lead_direct'");
    expect(inserts[0]?.params).toEqual([order.id, 'lead-id', 79_600, 199_000]);
  });

  it('allocates nothing without a snapshot (no group or a revoked lead)', async () => {
    const db = ipnDatabase({ team_lead_id: null, commission_pct: null });
    expect((await service(db).processWebhook(payload(), {})).message).toBe('processed');
    expect(ledgerInserts(db)).toHaveLength(0);
  });

  it('does not create zero-value ledger rows for tiny payments or 0%', async () => {
    const tiny = { ...order, amount_vnd: 1 };
    const tinyDb = ipnDatabase({ team_lead_id: 'lead-id', commission_pct: 40 }, tiny);
    expect((await service(tinyDb).processWebhook(payload('1'), {})).message).toBe('processed');
    expect(ledgerInserts(tinyDb)).toHaveLength(0);
    const zeroDb = ipnDatabase({ team_lead_id: 'lead-id', commission_pct: 0 });
    expect((await service(zeroDb).processWebhook(payload(), {})).message).toBe('processed');
    expect(ledgerInserts(zeroDb)).toHaveLength(0);
  });

  function markPaidDatabase(): FakeDatabase {
    return new FakeDatabase((sql) => {
      if (sql.includes('premium_payment_orders where id = $1 for update')) return [order];
      if (sql.includes('update premium_payment_orders') && sql.includes('returning')) {
        return [{ ...order, status: 'paid', team_lead_id: 'lead-id', commission_pct: 10 }];
      }
      if (sql.includes('select o.*, o.plan_name_snapshot')) return [order];
      return [];
    });
  }

  it('snapshots mark-paid orders and allocates by default', async () => {
    const db = markPaidDatabase();
    await service(db).markPaid(order.id, { id: 'admin-id' }, 'bank transfer');
    const claim = db.calls.find(({ sql }) => sql.includes('update premium_payment_orders'));
    expect(claim?.sql).toContain('team_lead_snapshot');
    expect(ledgerInserts(db).map(({ params }) => params)).toEqual([
      [order.id, 'lead-id', 19_900, 199_000],
    ]);
  });

  it('skips mark-paid commission when REFERRAL_COMMISSION_ON_MARK_PAID is off', async () => {
    const db = markPaidDatabase();
    await service(db, { REFERRAL_COMMISSION_ON_MARK_PAID: 'false' }).markPaid(
      order.id,
      { id: 'admin-id' },
      'bank transfer',
    );
    expect(
      db.calls.find(({ sql }) => sql.includes('update premium_payment_orders'))?.sql,
    ).toContain('team_lead_snapshot');
    expect(ledgerInserts(db)).toHaveLength(0);
  });

  it('never snapshots a free admin grant and refuses the referral-offer plan', async () => {
    const plan = { id: order.plan_id, code: 'MONTHLY', name: 'Monthly', duration_days: 30 };
    const db = new FakeDatabase((sql) => {
      if (sql.includes('from users where id = $1 for update')) return [{ id: order.user_id }];
      if (sql.includes('from premium_plans where id = $1')) return [plan];
      if (sql.includes('insert into premium_payment_orders')) return [{ ...order, status: 'paid' }];
      return [];
    });
    await service(db).adminGrant(order.user_id, order.plan_id, { id: 'admin-id' });
    const insert = db.calls.find(({ sql }) => sql.includes('insert into premium_payment_orders'));
    expect(insert?.sql).not.toContain('team_lead');
    expect(ledgerInserts(db)).toHaveLength(0);

    const offerDb = new FakeDatabase((sql) => {
      if (sql.includes('from users where id = $1 for update')) return [{ id: order.user_id }];
      if (sql.includes('from premium_plans where id = $1'))
        return [{ ...plan, code: 'REFERRAL_OFFER' }];
      return [];
    });
    await expect(
      service(offerDb).adminGrant(order.user_id, order.plan_id, { id: 'admin-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      offerDb.calls.some(({ sql }) => sql.includes('insert into premium_payment_orders')),
    ).toBe(false);
  });

  it('reverses legacy and team-lead ledger types each by its own type', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('premium_payment_orders where id') && sql.includes('for update')) {
        return [{ ...order, status: 'paid' }];
      }
      if (sql.includes('insert into billing_refunds')) return [{ id: 'refund-id' }];
      if (sql.includes('update premium_payment_orders') && sql.includes('amount_vnd_text')) {
        return [
          {
            ...order,
            status: 'partially_refunded',
            amount_vnd_text: '199000',
            refunded_amount_vnd_text: '99000',
          },
        ];
      }
      if (sql.includes('select o.*, o.plan_name_snapshot')) return [order];
      return [];
    });
    await service(db).refund(order.id, { id: 'admin-id' }, 'partial', 99_000);
    const reversal = ledgerInserts(db)[0]?.sql ?? '';
    expect(reversal).toContain(
      "commission_type in ('ctv_direct', 'lead_management', 'team_lead_direct')",
    );
    for (const [original, reversed] of [
      ['ctv_direct', 'ctv_direct_reversal'],
      ['lead_management', 'lead_management_reversal'],
      ['team_lead_direct', 'team_lead_direct_reversal'],
    ]) {
      expect(reversal).toContain(`when '${reversed}' then '${original}'`);
      expect(reversal).toContain(`when '${original}' then '${reversed}'`);
    }
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

describe('BillingService role projection (admin spec v1.1 §1.1 rule 1)', () => {
  // refreshSubscription only flips user <-> premium. A team_lead (like an admin) keeps its role
  // whether a grant starts or ends; Premium access comes from the grants themselves.
  const roleUpdates = (db: FakeDatabase) =>
    db.calls.filter(({ sql }) => sql.includes('update users set role'));
  const expectOnlyUserPremiumTransitions = (db: FakeDatabase) => {
    const updates = roleUpdates(db);
    expect(updates.length).toBeGreaterThan(0);
    for (const { sql } of updates) {
      expect(sql).toMatch(/and role = '(user|premium)'/);
      expect(sql).not.toContain('team_lead');
    }
  };

  it.each([true, false])(
    'never rewrites a team_lead role when a grant is applied (entitled=%s)',
    async (entitled) => {
      const plan = { id: order.plan_id, code: 'MONTHLY', name: 'Monthly', duration_days: 30 };
      const db = new FakeDatabase((sql) => {
        if (sql.includes('from users where id = $1 for update')) return [{ id: order.user_id }];
        if (sql.includes('from premium_plans where id = $1')) return [plan];
        if (sql.includes('insert into premium_payment_orders'))
          return [{ ...order, status: 'paid' }];
        if (sql.includes('bool_or')) {
          return [
            {
              starts_at: new Date('2026-01-01T00:00:00Z'),
              ends_at: new Date('2027-01-01T00:00:00Z'),
              current_plan_id: order.plan_id,
              entitled,
            },
          ];
        }
        if (sql.includes('returning id')) return [{ id: 'sub-id' }];
        return [];
      });
      await service(db).adminGrant(order.user_id, order.plan_id, { id: 'admin-id' });
      expectOnlyUserPremiumTransitions(db);
    },
  );

  it('never rewrites a team_lead role when no grant remains', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('from users where id = $1 for update')) return [{ id: order.user_id }];
      if (sql.includes('from premium_plans where id = $1')) return [{ id: order.plan_id }];
      if (sql.includes('insert into premium_payment_orders')) return [{ ...order, status: 'paid' }];
      if (sql.includes('bool_or'))
        return [{ starts_at: null, ends_at: null, current_plan_id: null, entitled: false }];
      return [];
    });
    await service(db).adminGrant(order.user_id, order.plan_id, { id: 'admin-id' });
    expectOnlyUserPremiumTransitions(db);
  });
});

describe('BillingService checkout configuration', () => {
  const configured = {
    SEPAY_MERCHANT_ID: 'merchant',
    SEPAY_SECRET_KEY: 'secret',
    SEPAY_CHECKOUT_URL: 'https://pay.invalid/checkout',
    APP_PUBLIC_URL: 'https://app.invalid',
  };

  it('refuses checkout with 409 while a lifetime grant is active (DECISION 4)', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('from premium_plans where id = $1')) {
        return [{ id: order.plan_id, code: 'MONTHLY', name: 'Monthly', is_active: true }];
      }
      if (sql.includes('ends_at >= $2::timestamptz')) return [{ id: 'lifetime-grant' }];
      return [];
    });
    const attempt = service(db, configured).createCheckout(order.user_id, order.plan_id);
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'LIFETIME_PREMIUM_ACTIVE' },
    });
    expect(db.calls.some(({ sql }) => sql.includes('insert into premium_payment_orders'))).toBe(
      false,
    );
  });

  it('refuses to put the referral-offer plan on sale', async () => {
    const db = new FakeDatabase((sql) => {
      if (sql.includes('from premium_plans where id = $1')) {
        return [{ id: order.plan_id, code: 'REFERRAL_OFFER', is_active: false }];
      }
      return [];
    });
    await expect(
      service(db).updatePlan(order.plan_id, { is_active: true }, { id: 'admin-id' }),
    ).rejects.toMatchObject({ response: { code: 'REFERRAL_OFFER_PLAN_PROTECTED' } });
    expect(db.calls.some(({ sql }) => sql.includes('update premium_plans'))).toBe(false);
  });

  it('returns 503 before creating an order when provider config is absent', async () => {
    const db = new FakeDatabase(() => []);
    await expect(service(db).createCheckout(order.user_id, order.plan_id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(db.calls).toHaveLength(0);
  });
});
