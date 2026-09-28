import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

const basePlan = {
  lyDo: 'ky_thuat',
  trangThai_luc_dat: 'ung_ho',
  vung_mua: 90_000,
  phuong_phap_sl_tp: 'ho_tro_khang_cu',
  cat_lo: 80_000,
  chot_loi: 110_000,
} as const;

async function refreshQuote(stack: SystemStack, symbol = 'VCB'): Promise<void> {
  await stack.query('update symbols set last_synced_at=now() where symbol=$1', [symbol]);
}

async function activateAccount(stack: SystemStack, token: string): Promise<void> {
  const response = await stack.app.inject({
    method: 'POST',
    url: '/api/v2/virtual-trading/account/activate',
    headers: authHeader(token),
  });
  expect([200, 201], response.body).toContain(response.statusCode);
}

async function seedLevel2(stack: SystemStack, userId: string): Promise<void> {
  await stack.query(
    `insert into cap1_progress
       (id,user_id,entered_at,da_xem_tour,graduated_at,created_at,updated_at)
     values (gen_random_uuid(),$1,now()-interval '2 days',true,now()-interval '1 day',now(),now())
     on conflict (user_id) do nothing;
     `,
    [userId],
  );
  await stack.query(
    `insert into cap2_progress
       (id,user_id,entered_at,so_lenh_co_cl_tp,so_lan_cat_lo_dung,so_lan_chot_loi_dung,
        so_lan_thuc_hien_dung,chuoi_current,chuoi_record,created_at,updated_at)
     values (gen_random_uuid(),$1,now()-interval '1 day',0,0,0,0,0,0,now(),now())
     on conflict (user_id) do nothing`,
    [userId],
  );
}

describe('system acceptance: atomic BUY learning plans', () => {
  let stack: SystemStack;

  beforeAll(async () => {
    stack = await startSystemStack();
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('materializes placement progress and activates the Cap2 stop/take plan on a filled BUY', async () => {
    const user = await registerAndLogin(stack.app, 'plan-cap2');
    const headers = authHeader(user.accessToken);
    expect(
      (await stack.app.inject({ method: 'POST', url: '/api/v2/cap0/enter', headers })).statusCode,
    ).toBe(201);
    const placement = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/cap0/placement',
      headers,
      payload: { answer: 'regular' },
    });
    expect(placement.statusCode, placement.body).toBe(201);
    expect(placement.json()).toMatchObject({ placed_level: 2 });
    await refreshQuote(stack);

    const response = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/orders',
      headers,
      payload: {
        symbol: 'VCB',
        side: 'buy',
        order_type: 'market',
        quantity: 100,
        journey_plan: basePlan,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const order = response.json() as { id: string; journey_plan_saved_levels: number[] };
    expect(order.journey_plan_saved_levels).toEqual([1, 2]);

    const progress = await stack.query<{ cap1_graduated: boolean; cap2_exists: boolean }>(
      `select exists(select 1 from cap1_progress where user_id=$1 and graduated_at is not null) cap1_graduated,
              exists(select 1 from cap2_progress where user_id=$1) cap2_exists`,
      [user.id],
    );
    expect(progress[0]).toEqual({ cap1_graduated: true, cap2_exists: true });
    const positions = await stack.query<{
      active_plan_buy_order_id: string;
      active_original_stop_vnd: string;
      active_original_take_profit_vnd: string;
    }>(
      `select active_plan_buy_order_id,active_original_stop_vnd,active_original_take_profit_vnd
       from virtual_positions p join virtual_trading_accounts a on a.id=p.account_id
       where a.user_id=$1 and p.symbol='VCB'`,
      [user.id],
    );
    expect(positions[0]).toEqual({
      active_plan_buy_order_id: order.id,
      active_original_stop_vnd: '80000',
      active_original_take_profit_vnd: '110000',
    });
  });

  it('rolls the order and cash back when an averaging-down alert does not match', async () => {
    const user = await registerAndLogin(stack.app, 'plan-alert-rollback');
    await activateAccount(stack, user.accessToken);
    await seedLevel2(stack, user.id);
    const alertId = randomUUID();
    await stack.query(
      `insert into cap2_alert_events
       (id,user_id,alert_type,symbol,session_date,trigger_key,observed_price_vnd,
        intended_quantity,intended_order_type,intended_limit_price_vnd,status,action,acted_at,
        impression_count,breach_session_no,created_at,updated_at)
       values ($1,$2,'nhoi_lenh','VCB',(now() at time zone 'Asia/Ho_Chi_Minh')::date,
        $3,85000,200,'market',null,'acted','proceed_buy',now(),1,1,now(),now())`,
      [alertId, user.id, `system:${alertId}`],
    );
    const before = await stack.query<{
      cash_available_vnd: string;
      cash_reserved_vnd: string;
      order_count: string;
    }>(
      `select a.cash_available_vnd::text,a.cash_reserved_vnd::text,
              (select count(*)::text from virtual_orders where user_id=$1) order_count
       from virtual_trading_accounts a where a.user_id=$1`,
      [user.id],
    );
    await refreshQuote(stack);

    const response = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/orders',
      headers: authHeader(user.accessToken),
      payload: {
        symbol: 'VCB',
        side: 'buy',
        order_type: 'market',
        quantity: 100,
        journey_plan: { ...basePlan, nhoi_lenh_alert_id: alertId },
      },
    });
    expect(response.statusCode, response.body).toBe(409);
    const after = await stack.query<{
      cash_available_vnd: string;
      cash_reserved_vnd: string;
      order_count: string;
    }>(
      `select a.cash_available_vnd::text,a.cash_reserved_vnd::text,
              (select count(*)::text from virtual_orders where user_id=$1) order_count
       from virtual_trading_accounts a where a.user_id=$1`,
      [user.id],
    );
    expect(after).toEqual(before);
    expect(
      await stack.query(
        'select p.id from virtual_positions p join virtual_trading_accounts a on a.id=p.account_id where a.user_id=$1',
        [user.id],
      ),
    ).toEqual([]);
    const alerts = await stack.query<{ source_order_id: string | null }>(
      'select source_order_id from cap2_alert_events where id=$1',
      [alertId],
    );
    expect(alerts[0]?.source_order_id).toBeNull();
  });

  it('links an approved averaging-down alert once and confirms it only after the BUY fills', async () => {
    const user = await registerAndLogin(stack.app, 'plan-alert-link');
    await activateAccount(stack, user.accessToken);
    await seedLevel2(stack, user.id);
    const alertId = randomUUID();
    await stack.query(
      `insert into cap2_alert_events
       (id,user_id,alert_type,symbol,session_date,trigger_key,observed_price_vnd,
        intended_quantity,intended_order_type,intended_limit_price_vnd,status,action,acted_at,
        impression_count,breach_session_no,created_at,updated_at)
       values ($1,$2,'nhoi_lenh','VCB',(now() at time zone 'Asia/Ho_Chi_Minh')::date,
        $3,85000,100,'market',null,'acted','proceed_buy',now(),1,1,now(),now())`,
      [alertId, user.id, `system:${alertId}`],
    );
    await refreshQuote(stack);

    const first = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/orders',
      headers: authHeader(user.accessToken),
      payload: {
        symbol: 'VCB',
        side: 'buy',
        order_type: 'market',
        quantity: 100,
        journey_plan: { ...basePlan, nhoi_lenh_alert_id: alertId },
      },
    });
    expect(first.statusCode, first.body).toBe(201);
    const firstOrder = first.json() as { id: string; nhoi_lenh_alert_linked: boolean };
    expect(firstOrder.nhoi_lenh_alert_linked).toBe(true);
    const linked = await stack.query<{
      source_order_id: string;
      violation_confirmed_at: Date;
      ignored_streak: number;
    }>(
      `select e.source_order_id,e.violation_confirmed_at,s.ignored_streak
       from cap2_alert_events e
       join cap2_alert_type_state s on s.user_id=e.user_id and s.alert_type=e.alert_type
       where e.id=$1`,
      [alertId],
    );
    expect(linked[0]).toMatchObject({ source_order_id: firstOrder.id, ignored_streak: 1 });
    expect(linked[0]?.violation_confirmed_at).toBeTruthy();

    await refreshQuote(stack);
    const second = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/orders',
      headers: authHeader(user.accessToken),
      payload: {
        symbol: 'VCB',
        side: 'buy',
        order_type: 'market',
        quantity: 100,
        journey_plan: { ...basePlan, nhoi_lenh_alert_id: alertId },
      },
    });
    expect(second.statusCode, second.body).toBe(409);
    const after = await stack.query<{ order_count: number; ignored_streak: number }>(
      `select (select count(*)::integer from virtual_orders where user_id=$1) order_count,
              (select ignored_streak from cap2_alert_type_state
               where user_id=$1 and alert_type='nhoi_lenh') ignored_streak`,
      [user.id],
    );
    expect(after[0]).toEqual({ order_count: 1, ignored_streak: 1 });
  });

  it('freezes Cap5 hunt/consensus and Cap6 conflict provenance in the BUY transaction', async () => {
    const user = await registerAndLogin(stack.app, 'plan-cap6');
    await activateAccount(stack, user.accessToken);
    await stack.query(
      `insert into cap1_progress (id,user_id,entered_at,da_xem_tour,graduated_at,created_at,updated_at)
       values(gen_random_uuid(),$1,now()-interval '8 days',true,now()-interval '7 days',now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into cap2_progress (id,user_id,entered_at,graduated_at,created_at,updated_at)
       values(gen_random_uuid(),$1,now()-interval '7 days',now()-interval '6 days',now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into cap3_progress (id,user_id,entered_at,von_ban_dau,graduated_at,created_at,updated_at)
       values(gen_random_uuid(),$1,now()-interval '6 days',100000000,now()-interval '5 days',now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into cap4_progress (id,user_id,entered_at,graduated_at,created_at,updated_at)
       values(gen_random_uuid(),$1,now()-interval '5 days',now()-interval '4 days',now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into cap5_progress (id,user_id,entered_at,graduated_at,created_at,updated_at)
       values(gen_random_uuid(),$1,now()-interval '4 days',now()-interval '1 day',now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into cap6_progress (id,user_id,entered_at,created_at,updated_at)
       values(gen_random_uuid(),$1,now()-interval '1 day',now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into cap5_hunt_log
         (id,user_id,symbol,hunt_filter,hunt_signal,first_hunted_at,last_hunted_at,created_at,updated_at)
       values(gen_random_uuid(),$1,'VCB','dong_tien','volume-breakout',now()-interval '3 days',now(),now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into watchlist_items
         (id,user_id,symbol,sort_order,consensus_today,consensus_da_cham,consensus_at,created_at,updated_at)
       values(gen_random_uuid(),$1,'VCB',0,3,4,now()-interval '2 hours',now(),now())`,
      [user.id],
    );
    await stack.query(
      `insert into ai_insight_history(id,symbol,session_date,payload,created_at,updated_at)
       values(gen_random_uuid(),'VCB',(now() at time zone 'Asia/Ho_Chi_Minh')::date,
         '{"L1":{"statusLabel":"Mạnh"},"L3":{"statusLabel":"Cảnh báo nhẹ"},"L4":{"statusLabel":"Cảnh báo mạnh"},"L5":{"statusLabel":"Tích cực"}}'::jsonb,
         now(),now())
       on conflict(symbol,session_date) do update set payload=excluded.payload,updated_at=now()`,
    );
    await refreshQuote(stack);

    const response = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/orders',
      headers: authHeader(user.accessToken),
      payload: {
        symbol: 'VCB',
        side: 'buy',
        order_type: 'market',
        quantity: 100,
        journey_plan: {
          ...basePlan,
          khau_vi: 'can_bang',
          muc_tu_tin: 2,
          cach_khoi_luong: 'khau_vi_tu_tin',
          conflict_level: 'ngai',
        },
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const order = response.json() as { id: string; journey_plan_saved_levels: number[] };
    expect(order.journey_plan_saved_levels).toEqual([1, 2, 3, 5, 6]);
    const plans = await stack.query<{
      from_watchlist: boolean;
      hunt_filter: string;
      hunt_signal_at_entry: string;
      hunt_sessions_at_entry: number;
      consensus_at_entry: number;
      consensus_scored_at_entry: number;
      consensus_captured_at_entry: Date;
      cap5_entry_snapshot_at: Date;
      conflict_level: string;
      had_conflict: boolean;
      had_veto: boolean;
      veto_layers: string[];
      support_layers: string[];
      opposing_layers: string[];
      conflict_snapshot_session_date: string;
      conflict_snapshot_at: Date;
    }>('select * from order_kehoach where order_id=$1', [order.id]);
    expect(plans[0]).toMatchObject({
      from_watchlist: true,
      hunt_filter: 'dong_tien',
      hunt_signal_at_entry: 'volume-breakout',
      consensus_at_entry: 3,
      consensus_scored_at_entry: 4,
      conflict_level: 'ngai',
      had_conflict: true,
      had_veto: true,
      veto_layers: ['noi_bo'],
      support_layers: ['ky_thuat', 'tin_tuc'],
      opposing_layers: ['dong_tien', 'noi_bo'],
    });
    expect(plans[0]?.hunt_sessions_at_entry).toBeGreaterThanOrEqual(1);
    expect(plans[0]?.consensus_captured_at_entry).toBeTruthy();
    expect(plans[0]?.cap5_entry_snapshot_at).toBeTruthy();
    expect(plans[0]?.conflict_snapshot_session_date).toBeTruthy();
    expect(plans[0]?.conflict_snapshot_at).toBeTruthy();
  });
});
