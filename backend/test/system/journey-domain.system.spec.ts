import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: journey levels 0 through 8', () => {
  let stack: SystemStack;
  let userId: string;
  let token: string;
  let previousCapMaximum: string | undefined;

  beforeAll(async () => {
    previousCapMaximum = process.env.CAP_MAX_ENABLED;
    process.env.CAP_MAX_ENABLED = '8';
    stack = await startSystemStack({ CAP_MAX_ENABLED: '8' });
    const user = await registerAndLogin(stack.app, 'journey-domain');
    userId = user.id;
    token = user.accessToken;
  });

  afterAll(async () => {
    await stack?.close();
    if (previousCapMaximum === undefined) delete process.env.CAP_MAX_ENABLED;
    else process.env.CAP_MAX_ENABLED = previousCapMaximum;
  });

  it('returns null progress for a fresh user instead of fabricating domain state', async () => {
    for (let level = 0; level <= 6; level += 1) {
      const response = await stack.app.inject({
        method: 'GET',
        url: `/api/v2/cap${level}/progress`,
        headers: authHeader(token),
      });
      expect(response.statusCode, `cap${level}: ${response.body}`).toBe(200);
      expect(response.json()).toBeNull();
    }
  });

  it('persists entries and enforces every graduation/entry gate through cap 8', async () => {
    const headers = authHeader(token);

    const cap0 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap0/enter', headers });
    expect(cap0.statusCode, cap0.body).toBe(201);
    expect(cap0.json()).toMatchObject({ user_id: userId, virtual_balance_init: 100_000_000 });
    const accountRows = await stack.query<{ user_id: string; cash_available_vnd: string }>(
      'select user_id, cash_available_vnd from virtual_trading_accounts where user_id = $1',
      [userId],
    );
    expect(accountRows).toEqual([{ user_id: userId, cash_available_vnd: '100000000' }]);

    for (const level of [7, 8]) {
      const response = await stack.app.inject({
        method: 'GET',
        url: `/api/v2/cap${level}/progress`,
        headers,
      });
      expect(response.statusCode, `cap${level}: ${response.body}`).toBe(200);
      expect(response.json()).toMatchObject({
        data: null,
        meta: { request_id: expect.any(String) },
      });
    }

    const blockedCap1 = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap1/enter',
      headers,
    });
    expect(blockedCap1.statusCode, blockedCap1.body).toBe(409);

    const placement = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap0/placement',
      headers,
      payload: { answer: 'regular' },
    });
    expect(placement.statusCode, placement.body).toBe(201);
    expect(placement.json()).toMatchObject({
      answer: 'regular',
      placed_level: 2,
      da_xem_tour: false,
    });

    const cap1 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap1/enter', headers });
    expect(cap1.statusCode, cap1.body).toBe(201);
    expect(cap1.json()).toMatchObject({ user_id: userId, graduated_at: null });

    const cap2 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap2/enter', headers });
    expect(cap2.statusCode, cap2.body).toBe(201);
    expect(cap2.json()).toMatchObject({ user_id: userId, so_lenh_co_cl_tp: 0, graduated_at: null });
    const bootstrappedCap1 = await stack.query<{ graduated_at: Date | null }>(
      'select graduated_at from cap1_progress where user_id = $1',
      [userId],
    );
    expect(bootstrappedCap1[0]?.graduated_at).toBeTruthy();

    const blockedCap3 = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap3/enter',
      headers,
    });
    expect(blockedCap3.statusCode, blockedCap3.body).toBe(409);
    await graduateFixture(stack, 'cap2_progress', userId);

    const cap3 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap3/enter', headers });
    expect(cap3.statusCode, cap3.body).toBe(201);
    expect(cap3.json()).toMatchObject({
      user_id: userId,
      khau_vi_da_dat: false,
      graduated_at: null,
    });
    const appetite = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap3/khau-vi',
      headers,
      payload: { khau_vi: 'can_bang' },
    });
    expect(appetite.statusCode, appetite.body).toBe(201);
    expect(appetite.json()).toMatchObject({ khau_vi: 'can_bang', khau_vi_da_dat: true });
    expect(
      (
        await stack.query<{ khau_vi: string }>(
          'select khau_vi from cap3_progress where user_id=$1',
          [userId],
        )
      )[0]?.khau_vi,
    ).toBe('can_bang');
    expect(
      (await stack.app.inject({ method: 'POST', url: '/api/v2/cap3/graduate', headers }))
        .statusCode,
    ).toBe(409);
    await graduateFixture(stack, 'cap3_progress', userId);

    const cap4 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap4/enter', headers });
    expect(cap4.statusCode, cap4.body).toBe(201);
    expect(cap4.json()).toMatchObject({
      user_id: userId,
      so_lenh_doc_du_5lop: 0,
      graduated_at: null,
    });
    expect(
      (await stack.app.inject({ method: 'POST', url: '/api/v2/cap4/graduate', headers }))
        .statusCode,
    ).toBe(409);
    await graduateFixture(stack, 'cap4_progress', userId);

    const cap5 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap5/enter', headers });
    expect(cap5.statusCode, cap5.body).toBe(201);
    expect(cap5.json()).toMatchObject({
      user_id: userId,
      da_xem_tour_sanma: false,
      graduated_at: null,
    });
    const cap5Tour = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap5/tour-sanma',
      headers,
    });
    expect(cap5Tour.statusCode, cap5Tour.body).toBe(201);
    expect(cap5Tour.json()).toMatchObject({ da_xem_tour_sanma: true });
    expect(
      (await stack.app.inject({ method: 'POST', url: '/api/v2/cap5/graduate', headers }))
        .statusCode,
    ).toBe(409);
    await graduateFixture(stack, 'cap5_progress', userId);

    const cap6 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap6/enter', headers });
    expect(cap6.statusCode, cap6.body).toBe(201);
    expect(cap6.json()).toMatchObject({
      user_id: userId,
      da_xem_tour_mauthuan: false,
      graduated_at: null,
    });
    const cap6Tour = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap6/tour-mauthuan',
      headers,
    });
    expect(cap6Tour.statusCode, cap6Tour.body).toBe(201);
    expect(cap6Tour.json()).toMatchObject({ da_xem_tour_mauthuan: true });
    expect(
      (await stack.app.inject({ method: 'POST', url: '/api/v2/cap6/graduate', headers }))
        .statusCode,
    ).toBe(409);
    await graduateFixture(stack, 'cap6_progress', userId);

    const cap7 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap7/enter', headers });
    expect(cap7.statusCode, cap7.body).toBe(201);
    expect(cap7.json()).toMatchObject({
      data: { user_id: userId, can_doi_ok: false, graduated_at: null },
      meta: {},
    });
    const portfolio = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/cap7/portfolio',
      headers,
    });
    expect(portfolio.statusCode, portfolio.body).toBe(200);
    expect(portfolio.json()).toMatchObject({
      data: {
        positions: [],
        held_symbol_count: 0,
        known_sector_count: 0,
        can_doi_ok: false,
      },
      meta: {},
    });
    expect(
      (await stack.app.inject({ method: 'POST', url: '/api/v2/cap7/graduate', headers }))
        .statusCode,
    ).toBe(409);
    await graduateFixture(stack, 'cap7_progress', userId);

    const cap8 = await stack.app.inject({ method: 'POST', url: '/api/v2/cap8/enter', headers });
    expect(cap8.statusCode, cap8.body).toBe(201);
    expect(cap8.json()).toMatchObject({
      data: {
        user_id: userId,
        so_lenh_thoat_dung_ke_hoach: 0,
        graduated_at: null,
      },
      meta: {},
    });
    const cap8Graduate = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap8/graduate',
      headers,
    });
    expect(cap8Graduate.statusCode, cap8Graduate.body).toBe(409);

    const persisted = await stack.query<{ level: number }>(
      `select level from (
         select 0 level from cap0_progress where user_id=$1 union all
         select 1 from cap1_progress where user_id=$1 union all
         select 2 from cap2_progress where user_id=$1 union all
         select 3 from cap3_progress where user_id=$1 union all
         select 4 from cap4_progress where user_id=$1 union all
         select 5 from cap5_progress where user_id=$1 union all
         select 6 from cap6_progress where user_id=$1 union all
         select 7 from cap7_progress where user_id=$1 union all
         select 8 from cap8_progress where user_id=$1
       ) levels order by level`,
      [userId],
    );
    expect(persisted.map((row) => row.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('returns validation errors rather than internal errors for malformed journey commands', async () => {
    const invalid = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap3/khau-vi',
      headers: authHeader(token),
      payload: { khau_vi: 'unbounded-risk' },
    });
    expect(invalid.statusCode, invalid.body).toBe(422);
    expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});

async function graduateFixture(stack: SystemStack, table: string, userId: string): Promise<void> {
  const allowed = new Set([
    'cap2_progress',
    'cap3_progress',
    'cap4_progress',
    'cap5_progress',
    'cap6_progress',
    'cap7_progress',
  ]);
  if (!allowed.has(table)) throw new Error(`Unsafe journey fixture table: ${table}`);
  await stack.query(`update ${table} set graduated_at=now(), updated_at=now() where user_id=$1`, [
    userId,
  ]);
}
