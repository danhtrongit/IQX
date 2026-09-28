import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startSystemStack, type SystemStack } from './system-stack.js';
import { ConfigurationModule } from '../../src/platform/config/configuration.module.js';
import { DatabaseModule, DatabaseService } from '../../src/platform/database/index.js';
import { JobsService, RuntimeModule } from '../../src/modules/runtime/index.js';
import type { JobOutcome } from '../../src/modules/runtime/runtime.types.js';

const waitFor = async <T>(
  read: () => Promise<T | null>,
  predicate: (value: T) => boolean,
): Promise<T> => {
  const deadline = Date.now() + 30_000;
  let value: T | null = null;
  while (Date.now() < deadline) {
    value = await read();
    if (value !== null && predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for runtime job: ${JSON.stringify(value)}`);
};

describe('system acceptance: BullMQ runtime worker', () => {
  let stack: SystemStack;
  let context: INestApplicationContext;
  let jobs: JobsService;
  let userId: string;
  let attempts = 0;

  beforeAll(async () => {
    stack = await startSystemStack();
    userId = randomUUID();
    const planId = '30000000-0000-4000-8000-000000000001';
    await stack.query(
      `insert into users(id,email,hashed_password,full_name,role,status)
       values($1,$2,'system-test-hash','Runtime Worker','premium','active')`,
      [userId, `runtime-${Date.now()}@example.test`],
    );
    await stack.query(
      `insert into premium_subscriptions(user_id,current_plan_id,current_period_start,current_period_end,status)
       values($1,$2,now()-interval '2 days',now()-interval '1 minute','active')`,
      [userId, planId],
    );

    const environment = {
      APP_ENV: 'test',
      DATABASE_URL: stack.databaseUrl,
      REDIS_ENABLED: 'true',
      REDIS_URL: stack.redisUrl,
      QUEUE_ENABLED: 'true',
      LOG_LEVEL: 'silent',
    };
    const expiryHandler = async (): Promise<JobOutcome> => {
      attempts += 1;
      // Exercise BullMQ retry without making the job a fake no-op: the handler
      // queries the fixture and only the first delivery fails before the same
      // expiry mutation is retried idempotently.
      const database = context.get(DatabaseService);
      const before = await database.query<{ id: string }>(
        `select id from premium_subscriptions
         where user_id=$1 and status='active' and current_period_end <= now()`,
        [userId],
      );
      if (before.length === 0) return { status: 'skipped', reason: 'already-expired' };
      if (attempts === 1) throw new Error('transient expiry worker failure');
      const expired = await database.query<{ id: string }>(
        `update premium_subscriptions set status='expired',updated_at=now()
         where user_id=$1 and status='active' and current_period_end <= now()
         returning id`,
        [userId],
      );
      return { status: 'completed', detail: { expired_count: expired.length } };
    };
    const module = await Test.createTestingModule({
      imports: [
        ConfigurationModule.forEnvironment(environment),
        DatabaseModule,
        RuntimeModule.register({
          enabled: true,
          consumeJobs: true,
          handlers: { 'billing.expiry-sweep': expiryHandler },
          schedules: [
            {
              name: 'billing.expiry-sweep',
              description: 'System test expiry sweep',
              everyMs: 86_400_000,
              tradingDay: false,
              enabled: true,
            },
          ],
        }),
      ],
    }).compile();
    context = module;
    await module.init();
    jobs = context.get(JobsService);
  });

  afterAll(async () => {
    await context?.close();
    await stack?.close();
  });

  it('enqueues, retries and completes a real expiry mutation with durable status', async () => {
    const queued = await jobs.runNow('billing.expiry-sweep', userId);
    expect(queued.state).toBe('queued');
    const status = await waitFor(
      () => jobs.getStatus(queued.jobId),
      (value) => value.state === 'completed',
    );
    expect(status.detail).toMatchObject({ expired_count: 1 });
    expect(attempts).toBeGreaterThanOrEqual(2);
    const rows = await stack.query<{ status: string }>(
      'select status from premium_subscriptions where user_id=$1',
      [userId],
    );
    expect(rows).toEqual([{ status: 'expired' }]);
  });
});
