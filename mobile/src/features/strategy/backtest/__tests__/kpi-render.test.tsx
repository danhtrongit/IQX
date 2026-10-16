import { render, screen } from '@testing-library/react-native';

import { KpiGrid } from '../run-view';
import type { BacktestResult } from '../types';

const result = {
  kpis: { total_return_pct: -13.2572, annualized_return_pct: -17.78, max_drawdown_pct: -17.77, closed_trade_count: 4, win_rate_pct: 50, buy_hold_return_pct: -29.03 },
  supplementary: { winning_trade_count: 2 },
} as unknown as BacktestResult;

describe('KpiGrid', () => {
  it('renders the six KPIs', async () => {
    await render(<KpiGrid result={result} />);
    expect(screen.getByTestId('strategy-backtest-kpi-grid')).toBeTruthy();
    for (const id of ['total-return', 'annual-return', 'max-drawdown', 'trade-count', 'win-rate', 'buy-hold']) {
      expect(screen.getByTestId(`strategy-backtest-kpi-${id}`)).toBeTruthy();
    }
    expect(screen.getByText('2 / 4 giao dịch')).toBeTruthy();
    expect(screen.getByText('−13,26%')).toBeTruthy();
  });
});
