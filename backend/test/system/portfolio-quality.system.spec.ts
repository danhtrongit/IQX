import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { PortfolioRepository } from '../../src/modules/portfolio-manager/portfolio.repository.js';
import { buildAnalysis } from '../../src/modules/portfolio-manager/portfolio.math.js';
import {
  authHeader,
  registerAndLogin,
  startSystemStack,
  type SystemStack,
} from './system-stack.js';

describe('system acceptance: portfolio valuation and data quality', () => {
  let stack: SystemStack;

  beforeAll(async () => {
    stack = await startSystemStack();
  });

  afterAll(async () => {
    await stack?.close();
  });

  it('includes reserved and pending cash, preserves missing histories, and rejects unavailable prices', async () => {
    const user = await registerAndLogin(stack.app, 'portfolio-quality');
    const activated = await stack.app.inject({
      method: 'POST',
      url: '/api/v2/virtual-trading/account/activate',
      headers: authHeader(user.accessToken),
    });
    expect([200, 201]).toContain(activated.statusCode);

    const accountRows = await stack.query<{ id: string }>(
      'select id from virtual_trading_accounts where user_id=$1',
      [user.id],
    );
    const accountId = accountRows[0]!.id;
    await stack.query(
      `update virtual_trading_accounts
       set cash_available_vnd=1000, cash_reserved_vnd=200, cash_pending_vnd=300
       where id=$1`,
      [accountId],
    );

    const repository = stack.app.get(PortfolioRepository);
    const cashOnly = await repository.input(user.id);
    expect(cashOnly.cashVnd).toBe(1500n);
    expect(cashOnly.cashAvailableVnd).toBe(1000n);
    expect(cashOnly.cashReservedVnd).toBe(200n);
    expect(cashOnly.cashPendingVnd).toBe(300n);
    expect(cashOnly.navVnd).toBe(1500n);

    await stack.query(
      `insert into virtual_positions
        (id, account_id, symbol, quantity_total, quantity_sellable, avg_cost_vnd)
       values ($1,$2,'VCB',10,10,90000)`,
      ['70000000-0000-4000-8000-000000000001', accountId],
    );
    const withPosition = await repository.input(user.id);
    expect(withPosition.benchmarkHistory).toEqual([]);
    expect(withPosition.holdings[0]!.priceSource).toBe('symbol_snapshot');
    const analysis = buildAnalysis(withPosition);
    const risk = analysis.risk as Record<string, unknown>;
    const behavior = analysis.behavior as Record<string, unknown>;
    const scores = analysis.scores as Record<string, unknown>;
    const performance = analysis.performance as Record<string, unknown>;
    expect(risk.beta).toBeNull();
    expect(risk.volatility).toBeNull();
    expect(behavior.losing_count).toBe(0);
    expect((scores.pillars as Record<string, unknown>).discipline).toBeNull();
    expect(performance.portfolio_return).toBeNull();

    await stack.query(
      `update symbols set current_price_vnd=null, last_synced_at=null where symbol='VCB'`,
    );
    let valuationError: unknown;
    try {
      await repository.input(user.id);
    } catch (error) {
      valuationError = error;
    }
    expect(valuationError).toBeInstanceOf(ServiceUnavailableException);
    expect((valuationError as ServiceUnavailableException).getResponse()).toMatchObject({
      code: 'PORTFOLIO_VALUATION_UNAVAILABLE',
    });
  });
});
