import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AlertsRepository } from '../../src/modules/alerts/index.js';
import { startSystemStack, type SystemStack } from './system-stack.js';

describe('system acceptance: alert scan entitlement', () => {
  let stack: SystemStack;

  beforeAll(async () => {
    stack = await startSystemStack();
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('stops scanning an expired Premium account while retaining admin exemption', async () => {
    const activeUserId = randomUUID();
    const expiredUserId = randomUUID();
    const adminId = randomUUID();
    const planId = '30000000-0000-4000-8000-000000000001';
    await stack.query(
      `insert into users(id,email,hashed_password,full_name,role,status,telegram_chat_id)
       values
         ($1,$2,'hash','Active grant','user','active','alert-active-chat'),
         ($3,$4,'hash','Expired grant','premium','active','alert-expired-chat'),
         ($5,$6,'hash','Admin','admin','active','alert-admin-chat')`,
      [
        activeUserId,
        `alert-active-${activeUserId}@example.test`,
        expiredUserId,
        `alert-expired-${expiredUserId}@example.test`,
        adminId,
        `alert-admin-${adminId}@example.test`,
      ],
    );
    await stack.query(
      `insert into billing_entitlement_grants
         (user_id,plan_id,kind,duration_days,starts_at,ends_at,original_ends_at,status)
       values
         ($1,$3,'trial',7,now()-interval '1 day',now()+interval '6 days',now()+interval '6 days','active'),
         ($2,$3,'trial',7,now()-interval '8 days',now()-interval '1 minute',now()-interval '1 minute','active')`,
      [activeUserId, expiredUserId, planId],
    );
    await stack.query(
      `insert into user_alert_rules(user_id,name,side,combination,is_enabled)
       values
         ($1,'Active rule','buy',$4::jsonb,true),
         ($2,'Expired rule','buy',$4::jsonb,true),
         ($3,'Admin rule','buy',$4::jsonb,true)`,
      [
        activeUserId,
        expiredUserId,
        adminId,
        JSON.stringify({
          logic: 'AND',
          conditions: [{ indicator: 'rsi', op: 'lt', value: 30 }],
        }),
      ],
    );
    await stack.query(
      `insert into watchlist_items(user_id,symbol)
       values($1,'VCB'),($2,'VCB'),($3,'VCB')`,
      [activeUserId, expiredUserId, adminId],
    );

    const rules = await stack.app.get(AlertsRepository).listScannableRules();
    const selectedUsers = rules.map((rule) => rule.user_id).sort();

    expect(selectedUsers).toEqual([activeUserId, adminId].sort());
    expect(selectedUsers).not.toContain(expiredUserId);
  });
});
