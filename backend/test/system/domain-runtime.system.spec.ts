import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AlertService } from '../../src/modules/alerts/index.js';
import { BillingService } from '../../src/modules/billing/index.js';
import { BotService } from '../../src/modules/bots/index.js';
import { Cap5Service } from '../../src/modules/journey/cap5/index.js';
import { MarketDataService } from '../../src/modules/market-data/index.js';
import { MarketExtendedService } from '../../src/modules/market-extended/index.js';
import { MarketInputSnapshotService } from '../../src/modules/market-integration/index.js';
import { MarketReportsService } from '../../src/modules/reports/index.js';
import { DatabaseService } from '../../src/platform/database/index.js';
import { DomainRuntimeJobs } from '../../src/platform/domain-runtime.module.js';
import { startSystemStack, type SystemStack } from './system-stack.js';

describe('system acceptance: real domain runtime handlers', () => {
  let stack: SystemStack;
  let jobs: DomainRuntimeJobs;

  beforeAll(async () => {
    stack = await startSystemStack();
    jobs = new DomainRuntimeJobs(
      stack.app.get(DatabaseService),
      stack.app.get(MarketReportsService),
      stack.app.get(AlertService),
      stack.app.get(MarketDataService),
      stack.app.get(BillingService),
      stack.app.get(Cap5Service),
      stack.app.get(BotService),
      stack.app.get(MarketExtendedService),
      stack.app.get(MarketInputSnapshotService),
    );
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('uses the active v2 trading config for weekends and configured holidays', async () => {
    await expect(jobs.isTradingDay('2026-09-20')).resolves.toBe(false);
    await expect(jobs.isTradingDay('2026-09-21')).resolves.toBe(true);

    await stack.query(
      `update virtual_trading_configs
          set holidays = $1, updated_at = now()
        where is_active = true`,
      [JSON.stringify(['2026-09-21'])],
    );

    await expect(jobs.isTradingDay('2026-09-21')).resolves.toBe(false);
  });

  it('expires canonical grants and subscriptions and downgrades the user atomically', async () => {
    const userId = randomUUID();
    const planId = '30000000-0000-4000-8000-000000000001';
    await stack.query(
      `insert into users(id,email,hashed_password,full_name,role,status)
       values($1,$2,'system-test-hash','Domain Runtime','premium','active')`,
      [userId, `domain-runtime-${Date.now()}@example.test`],
    );
    await stack.query(
      `insert into premium_subscriptions
         (user_id,current_plan_id,current_period_start,current_period_end,status)
       values($1,$2,now()-interval '8 days',now()-interval '1 minute','active')`,
      [userId, planId],
    );
    await stack.query(
      `insert into billing_entitlement_grants
         (user_id,plan_id,kind,duration_days,starts_at,ends_at,original_ends_at,status)
       values($1,$2,'trial',7,now()-interval '8 days',now()-interval '1 day',
              now()-interval '1 day','active')`,
      [userId, planId],
    );

    const handler = jobs.handlers()['billing.expiry-sweep'];
    expect(handler).toBeDefined();
    const outcome = await handler!({
      jobId: randomUUID(),
      name: 'billing.expiry-sweep',
      scheduledFor: new Date(),
    });

    expect(outcome).toMatchObject({
      status: 'completed',
      detail: { expired_count: 1, downgraded_count: 1 },
    });
    await expect(
      stack.query<{ role: string; subscription_status: string; grant_status: string }>(
        `select u.role, s.status::text as subscription_status, g.status as grant_status
           from users u
           join premium_subscriptions s on s.user_id = u.id
           join billing_entitlement_grants g on g.user_id = u.id
          where u.id = $1`,
        [userId],
      ),
    ).resolves.toEqual([{ role: 'user', subscription_status: 'expired', grant_status: 'expired' }]);
  });
});
