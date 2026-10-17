import type { SqlClient } from '../../platform/database/index.js';

/**
 * Demo Trading and Bot results of users as a percentage only (admin spec v1.1 §5.1.3): the
 * admin and team-lead views never get capital or money values from here.
 *
 * - Demo: `(equity − initial_cash) / initial_cash`, where equity is cash (available, reserved,
 *   pending) + pending cash rights + each open position valued at the latest stored price
 *   (`symbols.current_price_vnd`), falling back to the position's average cost when no price is
 *   stored. Unlike the owner's live portfolio it never fails for a missing quote. An admin VT
 *   reset rewrites `initial_cash_vnd`, so the result restarts from the last reset.
 * - Bot: the latest complete `bot_nav_daily` NAV against the account's initial cash (end of
 *   session, `as_of` is that trading date). An account with no NAV row yet uses its cash; one
 *   whose rows are all incomplete has no result (null).
 *
 * Results are rounded to 2 decimals. Not activated means no account row.
 */

export type DemoTradingPerformance = {
  activated: boolean;
  account_id: string | null;
  status: string | null;
  activated_at: Date | string | null;
  pnl_pct: number | null;
  last_activity_at: Date | string | null;
};

export type BotPerformance = {
  activated: boolean;
  account_id: string | null;
  status: string | null;
  activated_at: Date | string | null;
  pnl_pct: number | null;
  as_of: string | null;
  last_activity_at: Date | string | null;
};

export type MemberPerformance = { demo_trading: DemoTradingPerformance; bot: BotPerformance };

const NOT_ACTIVATED_DEMO: DemoTradingPerformance = {
  activated: false,
  account_id: null,
  status: null,
  activated_at: null,
  pnl_pct: null,
  last_activity_at: null,
};

const NOT_ACTIVATED_BOT: BotPerformance = {
  activated: false,
  account_id: null,
  status: null,
  activated_at: null,
  pnl_pct: null,
  as_of: null,
  last_activity_at: null,
};

function pct(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function memberPerformance(
  client: Pick<SqlClient, 'query'>,
  userIds: readonly string[],
): Promise<Map<string, MemberPerformance>> {
  const result = new Map<string, MemberPerformance>(
    userIds.map((id) => [id, { demo_trading: NOT_ACTIVATED_DEMO, bot: NOT_ACTIVATED_BOT }]),
  );
  if (userIds.length === 0) return result;
  const [demo, bot] = await Promise.all([
    client.query<{
      user_id: string;
      id: string;
      status: string;
      activated_at: Date | string;
      pnl_pct: string | null;
      last_activity_at: Date | string | null;
    }>(
      `select a.user_id, a.id, a.status::text as status, a.activated_at,
              case when a.initial_cash_vnd > 0 then round(
                (a.cash_available_vnd + a.cash_reserved_vnd + a.cash_pending_vnd
                  + coalesce(r.cash_vnd, 0) + coalesce(pos.value_vnd, 0) - a.initial_cash_vnd)::numeric
                  * 100 / a.initial_cash_vnd, 2)::text
              end as pnl_pct,
              (select max(o.created_at) from virtual_orders o where o.account_id = a.id)
                as last_activity_at
         from virtual_trading_accounts a
         left join lateral (
           select sum(p.quantity_total::numeric * coalesce(
                    case when s.current_price_vnd > 0 then s.current_price_vnd end,
                    p.avg_cost_vnd)) as value_vnd
             from virtual_positions p
             left join symbols s on s.symbol = p.symbol and s.is_active = true
            where p.account_id = a.id and p.quantity_total > 0
         ) pos on true
         left join lateral (
           select sum(e.cash_amount_vnd) as cash_vnd
             from virtual_rights_entitlements e
            where e.account_id = a.id and e.status = 'pending_cash'
         ) r on true
        where a.user_id = any($1::uuid[])`,
      [userIds],
    ),
    client.query<{
      user_id: string;
      id: string;
      status: string;
      activated_at: Date | string;
      pnl_pct: string | null;
      as_of: string | null;
      last_activity_at: Date | string | null;
    }>(
      `select b.user_id, b.id, b.status, b.activated_at,
              case
                when b.initial_cash_vnd <= 0 then null
                when nav.nav_vnd is not null then
                  round((nav.nav_vnd - b.initial_cash_vnd)::numeric * 100 / b.initial_cash_vnd, 2)::text
                when not exists (select 1 from bot_nav_daily d where d.bot_account_id = b.id) then
                  round((b.cash_vnd - b.initial_cash_vnd)::numeric * 100 / b.initial_cash_vnd, 2)::text
              end as pnl_pct,
              nav.trading_date::text as as_of,
              (select max(x.executed_at) from bot_executions x where x.bot_account_id = b.id)
                as last_activity_at
         from bot_accounts b
         left join lateral (
           select d.nav_vnd, d.trading_date from bot_nav_daily d
            where d.bot_account_id = b.id and d.valuation_complete and d.nav_vnd is not null
            order by d.trading_date desc limit 1
         ) nav on true
        where b.user_id = any($1::uuid[])`,
      [userIds],
    ),
  ]);
  for (const row of demo) {
    const entry = result.get(row.user_id);
    if (!entry) continue;
    entry.demo_trading = {
      activated: true,
      account_id: row.id,
      status: row.status,
      activated_at: row.activated_at,
      pnl_pct: pct(row.pnl_pct),
      last_activity_at: row.last_activity_at,
    };
  }
  for (const row of bot) {
    const entry = result.get(row.user_id);
    if (!entry) continue;
    entry.bot = {
      activated: true,
      account_id: row.id,
      status: row.status,
      activated_at: row.activated_at,
      pnl_pct: pct(row.pnl_pct),
      as_of: row.as_of,
      last_activity_at: row.last_activity_at,
    };
  }
  return result;
}
