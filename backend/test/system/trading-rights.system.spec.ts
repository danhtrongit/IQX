import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TradingRightsEventsPort } from '../../src/modules/trading/rights.ports.js';
import { TradingRightsService } from '../../src/modules/trading/rights.service.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

const PASSWORD = 'System!Passw0rd';

type SyncOutcome = {
  as_of: string;
  events_seen: number;
  events_inserted: number;
  events_updated: number;
  events_ignored: number;
  events_review: number;
  ais_matches: number;
  accounts_checked: number;
  ex_applied: number;
  cash_paid: number;
  shares_credited: number;
};

type RefreshResponse = {
  rights_ex_applied: number;
  rights_cash_paid: number;
  rights_stock_credited: number;
};

type PortfolioPosition = {
  symbol: string;
  quantity_total: number;
  quantity_sellable: number;
  quantity_pending: number;
  quantity_reserved: number;
  avg_cost_vnd: number;
  current_price_vnd: number | null;
  market_value_vnd: number | null;
  pending_cash_dividend_vnd: number;
  pending_stock_dividend_quantity: number;
};

type PortfolioResponse = {
  account: {
    cash_available_vnd: number;
    cash_reserved_vnd: number;
    cash_pending_vnd: number;
  };
  positions: PortfolioPosition[];
  nav_vnd: number;
  total_market_value_vnd: number;
  pending_rights: {
    pending_cash_dividend_vnd: number;
    pending_stock_dividend_quantity: number;
  };
};

type VciEvent = {
  id: string;
  ticker: string;
  event_code: 'DIV' | 'ISS' | 'AIS';
  event_title_en: string;
  public_date: string | null;
  exright_date: string | null;
  record_date: string | null;
  payout_date: string | null;
  issue_date: string | null;
  value_per_share: number | null;
  exercise_ratio: number | null;
};

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(dateIso: string, days: number): string {
  const cursor = new Date(`${dateIso}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return isoDate(cursor);
}

function realToday(): string {
  const now = new Date();
  return isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

function isAvoided(dateIso: string): boolean {
  const [, month, day] = dateIso.split('-').map((part) => Number(part));
  if (month === 1 && day === 1) return true;
  if ((month === 1 && (day ?? 0) >= 20) || month === 2) return true;
  if ((month === 4 && (day ?? 0) >= 29) || (month === 5 && (day ?? 0) <= 2)) return true;
  if (month === 9 && (day ?? 0) <= 2) return true;
  return false;
}

/**
 * Scenario window, always strictly in the future relative to the real clock so
 * every ex-date is after `virtual_rights_policy.deployment_date`. BUY_DATE is a
 * Monday, EX_DATE the next Tuesday, RECORD_DATE the Wednesday and PAYOUT_DATE /
 * the AIS issue date the following Monday.
 */
const SCENARIO = (() => {
  let monday = addUtcDays(realToday(), 35);
  for (;;) {
    const candidate = new Date(`${monday}T00:00:00.000Z`);
    candidate.setUTCDate(candidate.getUTCDate() + ((8 - candidate.getUTCDay()) % 7));
    monday = isoDate(candidate);
    const exDate = addUtcDays(monday, 1);
    const recordDate = addUtcDays(monday, 2);
    const payoutDate = addUtcDays(monday, 7);
    if (![monday, exDate, recordDate, payoutDate].some(isAvoided)) {
      return { buy: monday, ex: exDate, record: recordDate, payout: payoutDate };
    }
    monday = addUtcDays(monday, 7);
  }
})();

const BUY_DATE = SCENARIO.buy;
const EX_DATE = SCENARIO.ex;
const RECORD_DATE = SCENARIO.record;
const PAYOUT_DATE = SCENARIO.payout;
const AIS_ISSUE_DATE = PAYOUT_DATE;

let events: VciEvent[] = [];
const fakePort = {
  async fetch(input: {
    from: string;
    to: string;
    codes: 'DIV,ISS' | 'AIS';
  }): Promise<readonly unknown[]> {
    if (input.codes === 'AIS') return events.filter((event) => event.event_code === 'AIS');
    return events.filter((event) => event.event_code === 'DIV' || event.event_code === 'ISS');
  },
};

function eventBase(id: string, ticker: string, eventCode: VciEvent['event_code']): VciEvent {
  return {
    id,
    ticker,
    event_code: eventCode,
    event_title_en: '',
    public_date: `${addUtcDays(EX_DATE, -10)}T00:00:00`,
    exright_date: `${EX_DATE}T00:00:00`,
    record_date: `${RECORD_DATE}T00:00:00`,
    payout_date: `${PAYOUT_DATE}T00:00:00`,
    issue_date: null,
    value_per_share: null,
    exercise_ratio: null,
  };
}

function divEvent(id: string, ticker: string, valuePerShare = 4000): VciEvent {
  return {
    ...eventBase(id, ticker, 'DIV'),
    event_title_en: 'Cash Dividend',
    value_per_share: valuePerShare,
  };
}

function issEvent(id: string, ticker: string, ratio = 0.2, title = 'Stock Dividend 20%'): VciEvent {
  return { ...eventBase(id, ticker, 'ISS'), event_title_en: title, exercise_ratio: ratio };
}

function aisEvent(id: string, ticker: string, issueDate = AIS_ISSUE_DATE): VciEvent {
  return {
    ...eventBase(id, ticker, 'AIS'),
    event_title_en: 'Additional Listing',
    issue_date: `${issueDate}T00:00:00`,
  };
}

function rightsIssueEvent(id: string, ticker: string): VciEvent {
  return {
    ...eventBase(id, ticker, 'ISS'),
    event_title_en: 'Share Issue - Rights issue ratio 2:1',
    exercise_ratio: 2,
  };
}

describe('system acceptance: demo trading dividends and rights', () => {
  let stack: SystemStack;
  let suffixCounter = 0;

  beforeAll(async () => {
    stack = await startSystemStack(
      {},
      { overrideProviders: [{ token: TradingRightsEventsPort, value: fakePort }] },
    );
    await stack.query(
      `insert into symbols
         (id, symbol, name, exchange, asset_type, is_index, current_price_vnd, last_synced_at, is_active, source)
       values
         ('21000000-0000-4000-8000-000000000001', 'BFC', 'BFC', 'HOSE', 'stock', false, 49900, now(), true, 'system-fixture'),
         ('21000000-0000-4000-8000-000000000002', 'HTN', 'HTN', 'HOSE', 'stock', false, 7300, now(), true, 'system-fixture')
       on conflict (symbol) do update
         set is_active = true, current_price_vnd = excluded.current_price_vnd`,
    );
  });

  afterAll(async () => {
    vi.useRealTimers();
    await stack?.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    events = [];
  });

  async function resetRights(): Promise<void> {
    await stack.query('delete from virtual_rights_entitlements');
    await stack.query(
      'update virtual_corporate_actions set credit_action_id = null, credit_date = null',
    );
    await stack.query('delete from virtual_corporate_actions');
  }

  beforeEach(async () => {
    await resetRights();
  });

  function setPhase(dateIso: string): void {
    if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${dateIso}T05:00:00.000Z`));
  }

  async function loginForPhase(email: string): Promise<string> {
    const response = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/auth/login',
      payload: { email, password: PASSWORD },
    });
    if (response.statusCode !== 200) {
      throw new Error(`phase login failed: ${response.statusCode} ${response.body}`);
    }
    return (response.json() as { access_token: string }).access_token;
  }

  async function enterPhase(dateIso: string, email: string): Promise<string> {
    setPhase(dateIso);
    return loginForPhase(email);
  }

  async function setupAccount(suffix: string): Promise<{
    userId: string;
    accountId: string;
    email: string;
  }> {
    vi.useRealTimers();
    suffixCounter += 1;
    const user = await registerAndLogin(stack.app, `${suffix}-${suffixCounter}`);
    const activate = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/account/activate',
      headers: authHeader(user.accessToken),
    });
    expect([200, 201], activate.body).toContain(activate.statusCode);
    const rows = await stack.query<{ id: string }>(
      'select id from virtual_trading_accounts where user_id = $1',
      [user.id],
    );
    const accountId = rows[0]?.id;
    if (!accountId) throw new Error('Activation did not create a virtual trading account');
    return { userId: user.id, accountId, email: user.email };
  }

  async function setPrice(symbol: string, priceVnd: number, dateIso: string): Promise<void> {
    await stack.query(
      'update symbols set current_price_vnd = $1, last_synced_at = $2::timestamptz where symbol = $3',
      [priceVnd, `${dateIso}T05:00:00.000Z`, symbol],
    );
  }

  async function sync(): Promise<SyncOutcome> {
    const service = stack.app.get(TradingRightsService);
    return (await service.syncAndApply(new Date())) as unknown as SyncOutcome;
  }

  async function buy(
    token: string,
    symbol: string,
    quantity: number,
    priceVnd: number,
  ): Promise<void> {
    const response = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/orders',
      headers: authHeader(token),
      payload: { symbol, side: 'buy', order_type: 'market', quantity },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ status: 'filled', filled_price_vnd: priceVnd });
  }

  function sell(token: string, symbol: string, quantity: number) {
    return stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/orders',
      headers: authHeader(token),
      payload: { symbol, side: 'sell', order_type: 'market', quantity },
    });
  }

  async function portfolio(token: string): Promise<PortfolioResponse> {
    const response = await stack.app.inject({
      method: 'GET',
      url: '/api/v2/virtual-trading/portfolio',
      headers: authHeader(token),
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as PortfolioResponse;
  }

  async function refresh(token: string): Promise<RefreshResponse> {
    const response = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/refresh',
      headers: authHeader(token),
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as RefreshResponse;
  }

  function positionOf(data: PortfolioResponse, symbol: string): PortfolioPosition {
    const found = data.positions.find((position) => position.symbol === symbol);
    if (!found) throw new Error(`Portfolio is missing position ${symbol}`);
    return found;
  }

  function netCash(data: PortfolioResponse): number {
    return (
      data.account.cash_available_vnd +
      data.account.cash_reserved_vnd +
      data.account.cash_pending_vnd
    );
  }

  function ledgerRows(accountId: string) {
    return stack.query<{ kind: string; amount_vnd: string }>(
      `select kind, amount_vnd::text as amount_vnd
         from virtual_cash_ledger
        where account_id = $1 and reference_type = 'rights_entitlement'
        order by kind`,
      [accountId],
    );
  }

  it('TEST 1 cash dividend: BFC 100 shares at 49,900 with 4,000 VND/share → avg 45,900, 400,000 pending, paid on payout date', async () => {
    const { accountId, email } = await setupAccount('rights-cash');
    let token = await enterPhase(BUY_DATE, email);
    await setPrice('BFC', 49900, BUY_DATE);
    await buy(token, 'BFC', 100, 49900);

    const before = await portfolio(token);
    expect(positionOf(before, 'BFC').avg_cost_vnd).toBe(49900);
    const cashBeforeEx = BigInt(before.account.cash_available_vnd);

    events = [divEvent('evt-cash-div', 'BFC')];
    token = await enterPhase(EX_DATE, email);
    const exOutcome = await sync();
    expect(exOutcome.ex_applied).toBeGreaterThanOrEqual(1);

    const exPortfolio = await portfolio(token);
    const exPosition = positionOf(exPortfolio, 'BFC');
    expect(exPosition.avg_cost_vnd).toBe(45900);
    expect(exPosition.quantity_total).toBe(100);
    expect(exPosition.quantity_sellable).toBe(100);
    expect(exPosition.pending_cash_dividend_vnd).toBe(400_000);
    expect(exPortfolio.pending_rights).toEqual({
      pending_cash_dividend_vnd: 400_000,
      pending_stock_dividend_quantity: 0,
    });
    expect(exPortfolio.nav_vnd).toBe(netCash(exPortfolio) + 400_000 + 100 * 49900);
    expect(BigInt(exPortfolio.account.cash_available_vnd)).toBe(cashBeforeEx);

    const entitlement = await stack.query<{
      status: string;
      eligible_quantity: number;
      cash_amount_vnd: string;
      avg_after_ex_vnd: string;
    }>(
      `select status, eligible_quantity,
              cash_amount_vnd::text as cash_amount_vnd,
              avg_after_ex_vnd::text as avg_after_ex_vnd
         from virtual_rights_entitlements where account_id = $1`,
      [accountId],
    );
    expect(entitlement).toEqual([
      {
        status: 'pending_cash',
        eligible_quantity: 100,
        cash_amount_vnd: '400000',
        avg_after_ex_vnd: '45900',
      },
    ]);
    expect(await ledgerRows(accountId)).toEqual([{ kind: 'rights_ex_applied', amount_vnd: '0' }]);

    token = await enterPhase(PAYOUT_DATE, email);
    const payoutRefresh = await refresh(token);
    expect(payoutRefresh.rights_cash_paid).toBeGreaterThanOrEqual(1);

    const paidPortfolio = await portfolio(token);
    expect(BigInt(paidPortfolio.account.cash_available_vnd)).toBe(cashBeforeEx + 400_000n);
    expect(positionOf(paidPortfolio, 'BFC').pending_cash_dividend_vnd).toBe(0);
    expect(paidPortfolio.pending_rights).toEqual({
      pending_cash_dividend_vnd: 0,
      pending_stock_dividend_quantity: 0,
    });
    expect(
      await stack.query<{ status: string }>(
        'select status from virtual_rights_entitlements where account_id = $1',
        [accountId],
      ),
    ).toEqual([{ status: 'paid' }]);
    expect(await ledgerRows(accountId)).toEqual([
      { kind: 'rights_cash_paid', amount_vnd: '400000' },
      { kind: 'rights_ex_applied', amount_vnd: '0' },
    ]);
  });

  it('TEST 2 stock dividend: HTN 1,400 shares at 7,300 with 20% → 280 pending, avg 6,083, sellable 1,400, credited on AIS issue date', async () => {
    const { accountId, email } = await setupAccount('rights-stock');
    let token = await enterPhase(BUY_DATE, email);
    await setPrice('HTN', 7300, BUY_DATE);
    await buy(token, 'HTN', 1400, 7300);

    events = [issEvent('evt-stock-iss', 'HTN')];
    token = await enterPhase(EX_DATE, email);
    await sync();

    const exPortfolio = await portfolio(token);
    const exPosition = positionOf(exPortfolio, 'HTN');
    expect(exPosition.quantity_total).toBe(1680);
    expect(exPosition.quantity_pending).toBe(280);
    expect(exPosition.quantity_sellable).toBe(1400);
    expect(exPosition.avg_cost_vnd).toBe(6083);
    expect(exPosition.pending_stock_dividend_quantity).toBe(280);
    expect(exPortfolio.pending_rights).toEqual({
      pending_cash_dividend_vnd: 0,
      pending_stock_dividend_quantity: 280,
    });
    expect(exPortfolio.nav_vnd).toBe(netCash(exPortfolio) + 1680 * 7300);

    expect(
      await stack.query<{ status: string }>(
        'select status from virtual_rights_entitlements where account_id = $1',
        [accountId],
      ),
    ).toEqual([{ status: 'pending_stock' }]);

    await setPrice('HTN', 7300, EX_DATE);
    const rejected = await sell(token, 'HTN', 1500);
    expect([400, 422]).toContain(rejected.statusCode);

    events = [issEvent('evt-stock-iss', 'HTN'), aisEvent('evt-stock-ais', 'HTN')];
    token = await enterPhase(PAYOUT_DATE, email);
    await sync();

    const creditedPortfolio = await portfolio(token);
    const creditedPosition = positionOf(creditedPortfolio, 'HTN');
    expect(creditedPosition.quantity_total).toBe(1680);
    expect(creditedPosition.quantity_sellable).toBe(1680);
    expect(creditedPosition.quantity_pending).toBe(0);
    expect(creditedPosition.pending_stock_dividend_quantity).toBe(0);
    expect(creditedPosition.avg_cost_vnd).toBe(6083);
    expect(
      await stack.query<{ status: string }>(
        'select status from virtual_rights_entitlements where account_id = $1',
        [accountId],
      ),
    ).toEqual([{ status: 'credited' }]);
    expect(await ledgerRows(accountId)).toEqual([
      { kind: 'rights_ex_applied', amount_vnd: '0' },
      { kind: 'rights_stock_credited', amount_vnd: '0' },
    ]);
  });

  it('TEST 3 idempotency: repeated syncs and concurrent refreshes apply each transition once', async () => {
    const { accountId, email } = await setupAccount('rights-idempotent');
    let token = await enterPhase(BUY_DATE, email);
    await setPrice('BFC', 49900, BUY_DATE);
    await buy(token, 'BFC', 100, 49900);

    events = [divEvent('evt-idem-div', 'BFC')];
    token = await enterPhase(EX_DATE, email);
    await sync();
    await sync();
    await sync();
    await Promise.all(Array.from({ length: 5 }, () => refresh(token)));

    const entitlements = await stack.query<{ status: string; avg_after_ex_vnd: string }>(
      `select status, avg_after_ex_vnd::text as avg_after_ex_vnd
         from virtual_rights_entitlements where account_id = $1`,
      [accountId],
    );
    expect(entitlements).toEqual([{ status: 'pending_cash', avg_after_ex_vnd: '45900' }]);
    expect(await ledgerRows(accountId)).toEqual([{ kind: 'rights_ex_applied', amount_vnd: '0' }]);

    const cashAtEx = BigInt((await portfolio(token)).account.cash_available_vnd);

    token = await enterPhase(PAYOUT_DATE, email);
    await sync();
    await sync();
    await Promise.all(Array.from({ length: 5 }, () => refresh(token)));

    expect(
      await stack.query<{ status: string }>(
        'select status from virtual_rights_entitlements where account_id = $1',
        [accountId],
      ),
    ).toEqual([{ status: 'paid' }]);
    expect(await ledgerRows(accountId)).toEqual([
      { kind: 'rights_cash_paid', amount_vnd: '400000' },
      { kind: 'rights_ex_applied', amount_vnd: '0' },
    ]);
    const paidPortfolio = await portfolio(token);
    expect(BigInt(paidPortfolio.account.cash_available_vnd)).toBe(cashAtEx + 400_000n);
    expect(positionOf(paidPortfolio, 'BFC').pending_cash_dividend_vnd).toBe(0);
  });

  it('TEST 4 no rights: nothing changes', async () => {
    const { accountId, email } = await setupAccount('rights-none');
    let token = await enterPhase(BUY_DATE, email);
    await setPrice('BFC', 49900, BUY_DATE);
    await buy(token, 'BFC', 100, 49900);
    const before = await portfolio(token);

    events = [];
    token = await enterPhase(EX_DATE, email);
    const outcome = await sync();
    expect(outcome.events_seen).toBe(0);
    expect(outcome.ex_applied).toBe(0);
    expect(outcome.cash_paid).toBe(0);
    expect(outcome.shares_credited).toBe(0);

    const after = await portfolio(token);
    expect(positionOf(after, 'BFC').avg_cost_vnd).toBe(49900);
    expect(BigInt(after.account.cash_available_vnd)).toBe(
      BigInt(before.account.cash_available_vnd),
    );
    expect(after.pending_rights).toEqual({
      pending_cash_dividend_vnd: 0,
      pending_stock_dividend_quantity: 0,
    });
    expect(
      await stack.query('select id from virtual_rights_entitlements where account_id = $1', [
        accountId,
      ]),
    ).toHaveLength(0);
  });

  it('buy on the ex-date earns no entitlement', async () => {
    const { accountId, email } = await setupAccount('rights-exdate-buy');
    const token = await enterPhase(EX_DATE, email);
    await setPrice('BFC', 49900, EX_DATE);
    await buy(token, 'BFC', 100, 49900);

    events = [divEvent('evt-exbuy-div', 'BFC')];
    await sync();

    const after = await portfolio(token);
    expect(positionOf(after, 'BFC').avg_cost_vnd).toBe(49900);
    expect(after.pending_rights.pending_cash_dividend_vnd).toBe(0);
    expect(
      await stack.query<{ status: string; eligible_quantity: number }>(
        'select status, eligible_quantity from virtual_rights_entitlements where account_id = $1',
        [accountId],
      ),
    ).toEqual([{ status: 'no_entitlement', eligible_quantity: 0 }]);
  });

  it('selling everything on the ex-date keeps the cash dividend', async () => {
    const { accountId, email } = await setupAccount('rights-exdate-sell');
    let token = await enterPhase(BUY_DATE, email);
    await setPrice('BFC', 49900, BUY_DATE);
    await buy(token, 'BFC', 100, 49900);

    token = await enterPhase(EX_DATE, email);
    await setPrice('BFC', 49900, EX_DATE);
    const sold = await sell(token, 'BFC', 100);
    expect(sold.statusCode, sold.body).toBe(201);

    events = [divEvent('evt-exsell-div', 'BFC')];
    await sync();

    const exPortfolio = await portfolio(token);
    const exPosition = positionOf(exPortfolio, 'BFC');
    expect(exPosition.quantity_total).toBe(0);
    expect(exPosition.pending_cash_dividend_vnd).toBe(400_000);
    expect(exPortfolio.pending_rights.pending_cash_dividend_vnd).toBe(400_000);
    expect(
      await stack.query<{ status: string }>(
        'select status from virtual_rights_entitlements where account_id = $1',
        [accountId],
      ),
    ).toEqual([{ status: 'pending_cash' }]);

    const cashBeforePayout = BigInt(exPortfolio.account.cash_available_vnd);
    token = await enterPhase(PAYOUT_DATE, email);
    await sync();
    const paid = await portfolio(token);
    expect(BigInt(paid.account.cash_available_vnd)).toBe(cashBeforePayout + 400_000n);
    expect(paid.pending_rights.pending_cash_dividend_vnd).toBe(0);
    // A zero-quantity position is only listed while cash is still pending.
    expect(paid.positions.find((position) => position.symbol === 'BFC')).toBeUndefined();
  });

  it('stock dividend without a matching AIS stays pending', async () => {
    const { accountId, email } = await setupAccount('rights-noais');
    let token = await enterPhase(BUY_DATE, email);
    await setPrice('HTN', 7300, BUY_DATE);
    await buy(token, 'HTN', 1400, 7300);

    events = [issEvent('evt-noais-iss', 'HTN')];
    await enterPhase(EX_DATE, email);
    await sync();

    token = await enterPhase(AIS_ISSUE_DATE, email);
    await sync();

    const after = await portfolio(token);
    const position = positionOf(after, 'HTN');
    expect(position.quantity_total).toBe(1680);
    expect(position.quantity_pending).toBe(280);
    expect(position.pending_stock_dividend_quantity).toBe(280);
    expect(
      await stack.query<{ status: string }>(
        'select status from virtual_rights_entitlements where account_id = $1',
        [accountId],
      ),
    ).toEqual([{ status: 'pending_stock' }]);
    expect(
      await stack.query<{ credit_date: string | null }>(
        'select credit_date from virtual_corporate_actions where source_event_id = $1',
        ['evt-noais-iss'],
      ),
    ).toEqual([{ credit_date: null }]);
  });

  it('rights issue (purchase right) events are ignored', async () => {
    const { email } = await setupAccount('rights-iss-ignored');
    events = [rightsIssueEvent('evt-rights-ignored', 'HTN')];
    await enterPhase(EX_DATE, email);
    const outcome = await sync();
    expect(outcome.events_ignored).toBeGreaterThanOrEqual(1);
    expect(
      await stack.query('select id from virtual_corporate_actions where source_event_id = $1', [
        'evt-rights-ignored',
      ]),
    ).toHaveLength(0);
  });
});
