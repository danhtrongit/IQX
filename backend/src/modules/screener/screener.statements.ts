/**
 * Bộ lọc data adapter (pure): VCI IQ financial-statement rows → normalized statement periods
 * → registry formula arguments → `calculateMetric`. No I/O; the service fetches the rows.
 * See the support matrix at the top of `screener.metrics.ts`.
 *
 * Period policy (`scope.period`):
 *  - flow/ratio metrics: TTM = four consecutive discrete quarters ending at the latest quarter;
 *    annual = latest fiscal year; quarter = latest discrete quarter (growth vs the same quarter
 *    one year earlier). Averages use balances at both ends of the flow window
 *    (TTM: quarter-end now and four quarters earlier; annual: two year-ends; quarter: two
 *    consecutive quarter-ends). Both ends are required — never the end balance alone.
 *  - point-in-time metrics: latest quarter-end (TTM/quarter) or latest year-end (annual).
 *  - valuation metrics (price-based): annual → latest fiscal year flows, otherwise TTM flows.
 *  - 3-year metrics, CCC and streaks always use fiscal years (registry period Năm/Ba năm).
 * A report is usable only after its publication date (date-only timestamps become usable from
 * the next day, Asia/Ho_Chi_Minh), so `available_at` never precedes publication.
 */
import { finite } from '../financials/financials.calculations.js';
import {
  calculateMetric,
  insufficientBase,
  METRIC_REASONS,
  metricSupport,
  missing,
  notApplicable,
  type MetricValue,
} from './screener.metrics.js';
import {
  fundamentalMetric,
  type ScreenerApiUnit,
  type ScreenerMetricId,
} from './screener.registry.js';

export type ScreenerPeriod = 'TTM' | 'annual' | 'quarter';

/**
 * VCI IQ statement field per concept. Outflow lines reported negative (giá vốn, chi phí lãi
 * vay, capex, tiền chi mua lại cổ phiếu) are negated into positive amounts — never abs().
 */
const CONCEPT_FIELDS = {
  revenue: { field: 'isa3' },
  cogs: { field: 'isa4', negate: true },
  gross_profit: { field: 'isa5' },
  interest_expense: { field: 'isa8', negate: true },
  pbt: { field: 'isa16' },
  npat: { field: 'isa20' },
  npat_parent: { field: 'isa22' },
  depreciation: { field: 'cfa2' },
  goodwill_amortization: { field: 'cfa103' },
  cfo: { field: 'cfa18' },
  capex: { field: 'cfa19', negate: true },
  share_issuance: { field: 'cfa27' },
  share_buyback: { field: 'cfa28', negate: true },
  current_assets: { field: 'bsa1' },
  cash: { field: 'bsa2' },
  st_investments: { field: 'bsa5' },
  receivables: { field: 'bsa9' },
  inventory: { field: 'bsa15' },
  total_assets: { field: 'bsa53' },
  current_liabilities: { field: 'bsa55' },
  st_debt: { field: 'bsa56' },
  payables: { field: 'bsa57' },
  lt_debt: { field: 'bsa71' },
  equity: { field: 'bsa78' },
  preferred_equity: { field: 'bsa174' },
  nci: { field: 'bsa210' },
} as const satisfies Record<string, { field: string; negate?: boolean }>;

export type StatementConcept = keyof typeof CONCEPT_FIELDS;

export interface StatementPeriod {
  year: number;
  /** 1-4 for a discrete quarter, null for a fiscal year. */
  quarter: 1 | 2 | 3 | 4 | null;
  values: Partial<Record<StatementConcept, number>>;
  published_at: string | null;
  updated_at: string | null;
}

export interface NormalizedStatements {
  /** Fiscal years, newest first. */
  years: StatementPeriod[];
  /** Discrete quarters, newest first. */
  quarters: StatementPeriod[];
  /** Bank / insurance / securities statement template detected. */
  financial: boolean;
}

export type VciStatementRows = Record<'years' | 'quarters', Record<string, unknown>[]>;

export interface VciStatementSections {
  balance_sheet: Partial<VciStatementRows>;
  income_statement: Partial<VciStatementRows>;
  cash_flow: Partial<VciStatementRows>;
}

/** Bank (isb*), securities (iss*) and insurance (isi*) income-statement template fields. */
const FINANCIAL_TEMPLATE_FIELD = /^is[bsi]\d+$/;
const VN_OFFSET_MS = 7 * 3_600_000;

function vnDate(instant: Date): string {
  return new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function dateOnly(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** Merges the three VCI sections per (year, period) and keeps only reports published before as-of. */
export function normalizeVciStatements(
  sections: VciStatementSections,
  asOf: Date,
): NormalizedStatements {
  const cutoff = vnDate(asOf);
  const build = (kind: 'years' | 'quarters') => {
    const merged = new Map<string, StatementPeriod>();
    for (const section of [sections.balance_sheet, sections.income_statement, sections.cash_flow]) {
      for (const row of section[kind] ?? []) {
        const year = Math.trunc(finite(row.year_report) ?? 0);
        const length = Math.trunc(finite(row.length_report) ?? 0);
        if (!year) continue;
        if (kind === 'years' ? length !== 5 : length < 1 || length > 4) continue;
        const published = dateOnly(row.public_date);
        if (published !== null && published >= cutoff) continue;
        const key = `${year}:${length}`;
        const period = merged.get(key) ?? {
          year,
          quarter: kind === 'years' ? null : (length as 1 | 2 | 3 | 4),
          values: {},
          published_at: null,
          updated_at: null,
        };
        for (const [concept, spec] of Object.entries(CONCEPT_FIELDS) as [
          StatementConcept,
          { field: string; negate?: boolean },
        ][]) {
          const n = finite(row[spec.field]);
          if (n !== undefined) period.values[concept] = spec.negate ? -n : n;
        }
        if (published !== null && (period.published_at === null || published > period.published_at))
          period.published_at = published;
        const updated = typeof row.update_date === 'string' ? row.update_date : null;
        if (updated !== null && (period.updated_at === null || updated > period.updated_at))
          period.updated_at = updated;
        merged.set(key, period);
      }
    }
    return [...merged.values()].sort(
      (a, b) => b.year - a.year || (b.quarter ?? 0) - (a.quarter ?? 0),
    );
  };
  const income = sections.income_statement;
  const financial = [...(income.quarters ?? []), ...(income.years ?? [])].some((row) =>
    Object.entries(row).some(
      ([key, value]) => FINANCIAL_TEMPLATE_FIELD.test(key) && (finite(value) ?? 0) !== 0,
    ),
  );
  return { years: build('years'), quarters: build('quarters'), financial };
}

export interface MarketInputs {
  /** Observed price in VND, null when unavailable. */
  price: number | null;
  /** Shares on the provider's current market-cap basis, null when unavailable. */
  shares: number | null;
}

export interface ScreenerMetricResult {
  value: number | null;
  status: MetricValue['status'];
  unit: ScreenerApiUnit;
  period: string | null;
  available_at: string | null;
  source_revision: string | null;
  reason?: string;
  lower_bound?: boolean;
}

interface FlowWindow {
  label: string;
  periods: StatementPeriod[];
}

interface PeriodView {
  flow(yearsBack: 0 | 1): FlowWindow | null;
  balanceEnd(): StatementPeriod | null;
  balanceStart(): StatementPeriod | null;
}

const ordinal = (p: StatementPeriod) => p.year * 4 + (p.quarter ?? 1) - 1;
const quarterLabel = (p: StatementPeriod) => `Q${p.quarter}/${p.year}`;

function periodView(statements: NormalizedStatements, period: ScreenerPeriod): PeriodView {
  if (period === 'annual') {
    const latest = statements.years[0];
    const year = (y: number) => statements.years.find((p) => p.year === y) ?? null;
    return {
      flow: (back) => {
        const p = latest ? year(latest.year - back) : null;
        return p ? { label: `FY${p.year}`, periods: [p] } : null;
      },
      balanceEnd: () => latest ?? null,
      balanceStart: () => (latest ? year(latest.year - 1) : null),
    };
  }
  const latest = statements.quarters[0];
  const at = (ord: number) => statements.quarters.find((p) => ordinal(p) === ord) ?? null;
  if (period === 'quarter')
    return {
      flow: (back) => {
        const p = latest ? at(ordinal(latest) - 4 * back) : null;
        return p ? { label: quarterLabel(p), periods: [p] } : null;
      },
      balanceEnd: () => latest ?? null,
      balanceStart: () => (latest ? at(ordinal(latest) - 1) : null),
    };
  return {
    flow: (back) => {
      if (!latest) return null;
      const end = ordinal(latest) - 4 * back;
      const periods = [0, 1, 2, 3].map((i) => at(end - i));
      if (periods.some((p) => p === null)) return null;
      return { label: `TTM ${quarterLabel(periods[0]!)}`, periods: periods as StatementPeriod[] };
    },
    balanceEnd: () => latest ?? null,
    balanceStart: () => (latest ? at(ordinal(latest) - 4) : null),
  };
}

const bal = (p: StatementPeriod | null, c: StatementConcept): number | null => p?.values[c] ?? null;

function flowSum(w: FlowWindow | null, c: StatementConcept): number | null {
  if (!w) return null;
  let total = 0;
  for (const p of w.periods) {
    const v = p.values[c];
    if (v === undefined) return null;
    total += v;
  }
  return total;
}

const sub = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
const add = (...xs: (number | null)[]) =>
  xs.some((x) => x === null) ? null : (xs as number[]).reduce((s, x) => s + x, 0);

interface Derived {
  value: MetricValue;
  label: string | null;
  used: (StatementPeriod | null)[];
}

/** Computes one registry metric for one symbol from normalized statements and market inputs. */
export function evaluateScreenerMetric(
  id: ScreenerMetricId,
  statements: NormalizedStatements,
  market: MarketInputs,
  period: ScreenerPeriod,
): ScreenerMetricResult {
  const registry = fundamentalMetric(id);
  const support = metricSupport(id);
  const derived: Derived = !support.supported
    ? { value: missing(support.unsupported_reason!), label: null, used: [] }
    : registry.applicability === 'non_financial' && statements.financial
      ? { value: notApplicable(METRIC_REASONS.financialSector), label: null, used: [] }
      : derive(id, statements, market, period);
  const used = derived.used.filter((p): p is StatementPeriod => p !== null);
  const published = used.map((p) => p.published_at).filter((x): x is string => x !== null);
  const updated = used.map((p) => p.updated_at).filter((x): x is string => x !== null);
  const result: ScreenerMetricResult = {
    value: derived.value.status === 'ok' ? derived.value.value : null,
    status: derived.value.status,
    unit: registry.api_unit,
    period: derived.label,
    available_at: published.length ? `${published.sort().at(-1)}T00:00:00+07:00` : null,
    source_revision: updated.length ? `VCI:${updated.sort().at(-1)}` : null,
  };
  if (derived.value.reason) result.reason = derived.value.reason;
  if (derived.value.lower_bound) result.lower_bound = true;
  return result;
}

function derive(
  id: ScreenerMetricId,
  s: NormalizedStatements,
  market: MarketInputs,
  period: ScreenerPeriod,
): Derived {
  const view = periodView(s, period);
  const valuationView = periodView(s, period === 'annual' ? 'annual' : 'TTM');
  const cur = view.flow(0);
  const end = view.balanceEnd();
  const start = view.balanceStart();

  const calc = (
    args: (number | null)[],
    label: string | null,
    used: (StatementPeriod | null)[],
  ) => ({
    value: calculateMetric(id, args),
    label,
    used,
  });
  const noReport = (): Derived => ({
    value: missing(METRIC_REASONS.noReport),
    label: null,
    used: [],
  });
  const avgBal = (c: StatementConcept) => {
    const a = bal(end, c);
    const b = bal(start, c);
    return a === null || b === null ? null : (a + b) / 2;
  };
  const flowWithBalance = (num: number | null, c: StatementConcept): Derived =>
    cur && end ? calc([num, avgBal(c)], cur.label, [...cur.periods, end, start]) : noReport();
  const flowRatio = (
    num: StatementConcept | ((w: FlowWindow) => number | null),
    den: StatementConcept,
  ): Derived =>
    cur
      ? calc(
          [typeof num === 'function' ? num(cur) : flowSum(cur, num), flowSum(cur, den)],
          cur.label,
          cur.periods,
        )
      : noReport();
  const growth = (value: (w: FlowWindow | null) => number | null): Derived => {
    const base = view.flow(1);
    return cur && base
      ? calc([value(cur), value(base)], cur.label, [...cur.periods, ...base.periods])
      : noReport();
  };
  const fcf = (w: FlowWindow | null) => sub(flowSum(w, 'cfo'), flowSum(w, 'capex'));
  const ebitda = (w: FlowWindow | null) => {
    const goodwill = flowSum(w, 'goodwill_amortization');
    return add(
      flowSum(w, 'pbt'),
      flowSum(w, 'interest_expense'),
      flowSum(w, 'depreciation'),
      goodwill ?? 0,
    );
  };
  const debt = (p: StatementPeriod | null) => add(bal(p, 'st_debt'), bal(p, 'lt_debt'));
  const eligibleCash = (p: StatementPeriod | null) => add(bal(p, 'cash'), bal(p, 'st_investments'));
  const equityParent = (p: StatementPeriod | null) =>
    sub(sub(bal(p, 'equity'), bal(p, 'nci')), bal(p, 'preferred_equity'));

  const valuation = (
    num: (w: FlowWindow, p: StatementPeriod, cap: number) => [number | null, number | null],
  ): Derived => {
    const w = valuationView.flow(0);
    const p = valuationView.balanceEnd();
    if (!w || !p) return noReport();
    if (market.price === null || market.price <= 0)
      return { value: missing(METRIC_REASONS.priceUnavailable), label: w.label, used: w.periods };
    if (market.shares === null || market.shares <= 0)
      return { value: missing(METRIC_REASONS.sharesUnavailable), label: w.label, used: w.periods };
    return calc(num(w, p, market.price * market.shares), w.label, [...w.periods, p]);
  };

  const fy = s.years[0] ?? null;
  const year = (y: number) => s.years.find((p) => p.year === y) ?? null;
  const fiscalYears = (count: number) => {
    if (!fy) return null;
    const ys = Array.from({ length: count }, (_, i) => year(fy.year - i));
    return ys.every((p) => p !== null) ? (ys as StatementPeriod[]) : null;
  };
  const insufficientHistory = (): Derived => ({
    value: missing(METRIC_REASONS.insufficientHistory),
    label: null,
    used: [],
  });
  const cagr3 = (c: StatementConcept): Derived => {
    const ys = fiscalYears(4);
    if (!ys) return insufficientHistory();
    const [e, m2, m1, b] = ys.map((p) => bal(p, c));
    return calc(
      [e ?? null, b ?? null, m1 ?? null, m2 ?? null],
      `FY${ys[3]!.year}–FY${ys[0]!.year}`,
      ys,
    );
  };
  const streak = (value: (p: StatementPeriod) => number | null): Derived => {
    if (!fy || value(fy) === null) return noReport();
    const series: number[] = [];
    let oldest = fy.year;
    for (let y = fy.year; ; y -= 1) {
      const p = year(y);
      const v = p ? value(p) : null;
      if (v === null) break;
      series.unshift(v);
      oldest = y;
    }
    const used = s.years.filter((p) => p.year >= oldest);
    return calc(series, `FY${oldest}–FY${fy.year}`, used);
  };

  switch (id) {
    case 'revenue_yoy':
      return growth((w) => flowSum(w, 'revenue'));
    case 'profit_yoy':
      return growth((w) => flowSum(w, 'npat_parent'));
    case 'fcf_yoy':
      return growth(fcf);
    case 'gross_margin':
      return flowRatio('gross_profit', 'revenue');
    case 'net_margin':
      return flowRatio('npat', 'revenue');
    case 'cfo_margin':
      return flowRatio('cfo', 'revenue');
    case 'cfo_profit':
      return flowRatio('cfo', 'npat');
    case 'fcf_margin':
      return flowRatio(fcf, 'revenue');
    case 'capex_revenue':
      return flowRatio('capex', 'revenue');
    case 'interest_coverage':
      return flowRatio(
        (w) => add(flowSum(w, 'pbt'), flowSum(w, 'interest_expense')),
        'interest_expense',
      );
    case 'roe': {
      if (!cur || !end) return noReport();
      const a = equityParent(end);
      const b = equityParent(start);
      return calc(
        [flowSum(cur, 'npat_parent'), a === null || b === null ? null : (a + b) / 2],
        cur.label,
        [...cur.periods, end, start],
      );
    }
    case 'roa':
      return flowWithBalance(flowSum(cur, 'npat'), 'total_assets');
    case 'accrual':
      return flowWithBalance(sub(flowSum(cur, 'npat'), flowSum(cur, 'cfo')), 'total_assets');
    case 'asset_turnover':
      return flowWithBalance(flowSum(cur, 'revenue'), 'total_assets');
    case 'working_cap_turnover': {
      if (!cur || !end) return noReport();
      const a = sub(bal(end, 'current_assets'), bal(end, 'current_liabilities'));
      const b = sub(bal(start, 'current_assets'), bal(start, 'current_liabilities'));
      return calc(
        [flowSum(cur, 'revenue'), a === null || b === null ? null : (a + b) / 2],
        cur.label,
        [...cur.periods, end, start],
      );
    }
    case 'debt_equity':
      return end ? calc([debt(end), bal(end, 'equity')], labelOf(end), [end]) : noReport();
    case 'current_ratio':
      return end
        ? calc([bal(end, 'current_assets'), bal(end, 'current_liabilities')], labelOf(end), [end])
        : noReport();
    case 'net_debt_ebitda':
      return cur && end
        ? calc([sub(debt(end), eligibleCash(end)), ebitda(cur)], cur.label, [...cur.periods, end])
        : noReport();
    case 'pe':
      return valuation((w, _p, cap) => {
        const earnings = flowSum(w, 'npat_parent');
        return [market.price, earnings === null ? null : earnings / (cap / market.price!)];
      });
    case 'pb':
      return valuation((_w, p, cap) => [cap, equityParent(p)]);
    case 'ps':
      return valuation((w, _p, cap) => [cap, flowSum(w, 'revenue')]);
    case 'ev_ebitda':
      return valuation((w, p, cap) => [
        add(
          cap,
          bal(p, 'preferred_equity'),
          debt(p),
          bal(p, 'nci'),
          eligibleCash(p) === null ? null : -eligibleCash(p)!,
        ),
        ebitda(w),
      ]);
    case 'fcf_yield':
      return valuation((w, _p, cap) => [fcf(w), cap]);
    case 'buyback_yield':
      return valuation((w, _p, cap) => [
        sub(flowSum(w, 'share_buyback'), flowSum(w, 'share_issuance')),
        cap,
      ]);
    case 'revenue_cagr3':
      return cagr3('revenue');
    case 'profit_cagr3':
      return cagr3('npat_parent');
    case 'ccc': {
      const ys = fiscalYears(2);
      if (!ys) return insufficientHistory();
      const [e, b] = ys as [StatementPeriod, StatementPeriod];
      const avg = (c: StatementConcept) => {
        const x = bal(e, c);
        const y = bal(b, c);
        return x === null || y === null ? null : (x + y) / 2;
      };
      const revenue = bal(e, 'revenue');
      const cogs = bal(e, 'cogs');
      const inventory = avg('inventory');
      const receivables = avg('receivables');
      const payables = avg('payables');
      if ([revenue, cogs, inventory, receivables, payables].some((x) => x === null))
        return { value: missing(), label: `FY${e.year}`, used: ys };
      if (revenue! <= 0 || cogs! <= 0)
        return {
          value: insufficientBase(METRIC_REASONS.nonPositiveDenominator),
          label: `FY${e.year}`,
          used: ys,
        };
      return calc(
        [(inventory! / cogs!) * 365, (receivables! / revenue!) * 365, (payables! / cogs!) * 365],
        `FY${e.year}`,
        ys,
      );
    }
    case 'revenue_growth_stability': {
      const ys = fiscalYears(4);
      if (!ys) return insufficientHistory();
      const revenue = ys.map((p) => bal(p, 'revenue')).reverse();
      const growths: number[] = [];
      for (let i = 1; i < revenue.length; i += 1) {
        const g = calculateMetric('revenue_yoy', [revenue[i], revenue[i - 1]]);
        if (g.status !== 'ok')
          return { value: g, label: `FY${ys[3]!.year}–FY${ys[0]!.year}`, used: ys };
        growths.push(g.value!);
      }
      return calc(growths, `FY${ys[3]!.year}–FY${ys[0]!.year}`, ys);
    }
    case 'net_margin_stability': {
      const ys = fiscalYears(3);
      if (!ys) return insufficientHistory();
      const margins: number[] = [];
      for (const p of [...ys].reverse()) {
        const m = calculateMetric('net_margin', [bal(p, 'npat'), bal(p, 'revenue')]);
        if (m.status !== 'ok')
          return { value: m, label: `FY${ys[2]!.year}–FY${ys[0]!.year}`, used: ys };
        margins.push(m.value!);
      }
      return calc(margins, `FY${ys[2]!.year}–FY${ys[0]!.year}`, ys);
    }
    case 'fcf_positive_streak':
      return streak((p) => sub(bal(p, 'cfo'), bal(p, 'capex')));
    case 'profit_positive_streak':
      return streak((p) => bal(p, 'npat_parent'));
    default:
      return { value: missing(METRIC_REASONS.missingInput), label: null, used: [] };
  }
}

function labelOf(p: StatementPeriod): string {
  return p.quarter === null ? `FY${p.year}` : quarterLabel(p);
}

/** Metrics whose formula needs the observed price and share count. */
export const PRICE_METRICS: ReadonlySet<ScreenerMetricId> = new Set<ScreenerMetricId>([
  'pe',
  'pb',
  'ps',
  'ev_ebitda',
  'fcf_yield',
  'buyback_yield',
]);
