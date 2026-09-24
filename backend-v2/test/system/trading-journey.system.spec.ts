import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: virtual trading and journey gates', () => {
  let stack: SystemStack;
  beforeAll(async () => {
    stack = await startSystemStack();
  });
  afterAll(async () => {
    await stack?.close();
  });

  it('requires placement and cap-0 gates before progressing', async () => {
    const user = await registerAndLogin(stack.app, 'journey');
    const enter = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap0/enter',
      headers: authHeader(user.accessToken),
    });
    expect([200, 201]).toContain(enter.statusCode);
    const placement = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap0/placement',
      headers: authHeader(user.accessToken),
      payload: { answer: 'never' },
    });
    expect(placement.statusCode).toBe(201);
    const beforeBuy = await stack.app.inject({
      method: 'PATCH',
      url: '/api/v2/cap0/task',
      headers: authHeader(user.accessToken),
      payload: { task_no: 1, gate: 'star' },
    });
    expect([400, 409]).toContain(beforeBuy.statusCode);
    const missingGate = await stack.app.inject({
      method: 'PATCH',
      url: '/api/v2/cap0/task',
      headers: authHeader(user.accessToken),
      payload: { task_no: 1 },
    });
    expect([400, 409]).toContain(missingGate.statusCode);
  });

  it('prevents cash oversubscription when concurrent orders race on one account', async () => {
    const user = await registerAndLogin(stack.app, 'race');
    const activate = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/account/activate',
      headers: authHeader(user.accessToken),
    });
    expect([200, 201]).toContain(activate.statusCode);
    const payload = {
      symbol: 'VCB',
      side: 'buy',
      order_type: 'limit',
      quantity: 1000,
      limit_price_vnd: 90000,
    };
    const [left, right] = await Promise.all([
      stack.app.inject({
        method: 'POST',
        url: '/api/v2/virtual-trading/orders',
        headers: authHeader(user.accessToken),
        payload,
      }),
      stack.app.inject({
        method: 'POST',
        url: '/api/v2/virtual-trading/orders',
        headers: authHeader(user.accessToken),
        payload,
      }),
    ]);
    const statuses = [left.statusCode, right.statusCode];
    expect(statuses.every((status) => status !== 500)).toBe(true);
    expect(statuses.filter((status) => [200, 201].includes(status)).length).toBe(1);
    expect(statuses.some((status) => [400, 409, 422].includes(status))).toBe(true);
    const accounts = await stack.query<{ cash_available_vnd: string; cash_reserved_vnd: string }>(
      'SELECT cash_available_vnd, cash_reserved_vnd FROM virtual_trading_accounts WHERE user_id = $1',
      [user.id],
    );
    expect(accounts).toHaveLength(1);
    const available = BigInt(accounts[0]!.cash_available_vnd);
    const reserved = BigInt(accounts[0]!.cash_reserved_vnd);
    expect(available >= 0n).toBe(true);
    expect(reserved >= 0n).toBe(true);
    expect(available + reserved).toBe(100_000_000n);
  });
});
