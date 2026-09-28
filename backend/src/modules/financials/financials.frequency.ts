import type { Period } from './financials.types.js';

const FLOW_CONCEPTS = new Set([
  'gross_revenue',
  'net_revenue',
  'cogs',
  'gross_profit',
  'financial_income',
  'interest_expense',
  'selling_expense',
  'admin_expense',
  'operating_profit',
  'profit_before_tax',
  'tax_expense',
  'npat',
  'minority_interest',
  'npat_parent',
  'eps',
  'depreciation',
  'provisions_cf',
  'cfo',
  'capex',
  'proceeds_from_shares',
  'interest_income_gross',
  'net_interest_income',
  'net_fee_income',
  'fx_income',
  'trading_securities_income',
  'investment_securities_income',
  'other_income_bank',
  'total_operating_income',
  'operating_expense',
  'ppop_reported',
  'provision_expense',
]);

export interface FrequencyAssumption {
  period: string;
  mode: 'annual_reported' | 'quarter_ttm' | 'quarter_annualized_estimate';
  estimated: boolean;
  flow_multiplier: number;
  day_basis: number;
  comparable_period: string | null;
  note: string;
}

export const isQuarter = (p: Period): boolean => p.length >= 1 && p.length <= 4;
export const ordinal = (p: Period): number => p.year * 4 + p.length - 1;
export const label = (p: Period): string => `${isQuarter(p) ? `Q${p.length}/` : ''}${p.year}`;

export function previousBalancePeriod(periods: Period[], index: number): Period | undefined {
  const cur = periods[index];
  if (!cur) return undefined;
  if (!isQuarter(cur)) return periods.slice(index + 1).find((p) => !isQuarter(p));
  return periods.slice(index + 1).find((p) => isQuarter(p) && ordinal(p) === ordinal(cur) - 1);
}

export function yearAgoPeriod(periods: Period[], index: number): Period | undefined {
  const cur = periods[index];
  if (!cur) return undefined;
  return periods.find((p) => p.year === cur.year - 1 && p.length === cur.length);
}

/**
 * Normalise flow concepts to a yearly rate while leaving point-in-time balance
 * sheet concepts at the period-end value. Four consecutive discrete quarters
 * produce TTM; otherwise a single quarter is annualised and explicitly marked
 * as an estimate. Annual reports are returned unchanged.
 */
export function performancePeriod(
  periods: Period[],
  index: number,
): { period: Period; assumption: FrequencyAssumption } {
  const cur = periods[index];
  if (!cur) throw new Error(`Missing period at index ${index}`);
  const comparable = yearAgoPeriod(periods, index);
  if (!isQuarter(cur)) {
    return {
      period: cur,
      assumption: {
        period: label(cur),
        mode: 'annual_reported',
        estimated: false,
        flow_multiplier: 1,
        day_basis: 365,
        comparable_period: comparable ? label(comparable) : null,
        note: 'Annual flow values are reported values; balance values are period-end.',
      },
    };
  }

  const window = [cur];
  let wanted = ordinal(cur) - 1;
  for (const candidate of periods.slice(index + 1)) {
    if (isQuarter(candidate) && ordinal(candidate) === wanted) {
      window.push(candidate);
      wanted -= 1;
      if (window.length === 4) break;
    }
  }
  const values = { ...cur.values };
  if (window.length === 4) {
    for (const concept of FLOW_CONCEPTS) {
      const xs = window.map((p) => p.values[concept]);
      if (xs.every((v) => v !== undefined))
        values[concept] = (xs as number[]).reduce((a, b) => a + b, 0);
      else delete values[concept];
    }
    return {
      period: { ...cur, values },
      assumption: {
        period: label(cur),
        mode: 'quarter_ttm',
        estimated: false,
        flow_multiplier: 1,
        day_basis: 365,
        comparable_period: comparable ? label(comparable) : null,
        note: 'Flow metrics use four consecutive discrete quarters (TTM); balance values use quarter-end.',
      },
    };
  }

  for (const concept of FLOW_CONCEPTS) {
    const value = values[concept];
    if (value !== undefined) values[concept] = value * 4;
  }
  return {
    period: { ...cur, values },
    assumption: {
      period: label(cur),
      mode: 'quarter_annualized_estimate',
      estimated: true,
      flow_multiplier: 4,
      day_basis: 365,
      comparable_period: comparable ? label(comparable) : null,
      note: 'Fewer than four consecutive quarters: flow metrics are annualised from the current discrete quarter (×4); they are estimates, not annual reported values.',
    },
  };
}

export function performancePeriods(periods: Period[]): {
  periods: Period[];
  assumptions: FrequencyAssumption[];
} {
  const computed = periods.map((_, index) => performancePeriod(periods, index));
  return { periods: computed.map((x) => x.period), assumptions: computed.map((x) => x.assumption) };
}
