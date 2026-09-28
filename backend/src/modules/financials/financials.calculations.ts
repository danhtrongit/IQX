import type { FinancialRow, Numeric, Period } from './financials.types.js';
import { previousBalancePeriod } from './financials.frequency.js';

export const NONBANK_MAPPING: Readonly<Record<string, string | null>> = {
  gross_revenue: 'isa1',
  net_revenue: 'isa3',
  cogs: 'isa4',
  gross_profit: 'isa5',
  financial_income: 'isa6',
  interest_expense: 'isa8',
  selling_expense: 'isa9',
  admin_expense: 'isa10',
  operating_profit: 'isa11',
  profit_before_tax: 'isa16',
  npat: 'isa20',
  minority_interest: 'isa21',
  npat_parent: 'isa22',
  eps: 'isa23',
  current_assets: 'bsa1',
  cash: 'bsa2',
  st_investments: 'bsa5',
  trade_receivables: 'bsa9',
  inventory_gross: 'bsa16',
  inventory_provision: 'bsa17',
  net_fixed_assets: 'bsa29',
  total_assets: 'bsa53',
  total_liabilities: 'bsa54',
  current_liabilities: 'bsa55',
  st_debt: 'bsa56',
  trade_payables: 'bsa57',
  buyer_prepayments: 'bsa58',
  lt_debt: 'bsa71',
  equity: 'bsa78',
  equity_parent: null,
  charter_capital: 'bsa80',
  retained_earnings: 'bsa90',
  depreciation: 'cfa2',
  provisions_cf: 'cfa3',
  cfo: 'cfa18',
  capex: 'cfa19',
  proceeds_from_shares: 'cfa27',
};
export const BANK_MAPPING: Readonly<Record<string, string | null>> = {
  interest_income_gross: 'isb25',
  interest_expense: 'isb26',
  net_interest_income: 'isb27',
  net_fee_income: 'isb30',
  fx_income: 'isb31',
  trading_securities_income: 'isb32',
  investment_securities_income: 'isb33',
  other_income_bank: 'isb36',
  total_operating_income: 'isb38',
  operating_expense: 'isb39',
  ppop_reported: 'isb40',
  provision_expense: 'isb41',
  profit_before_tax: 'isa16',
  tax_expense: 'isa19',
  npat: 'isa20',
  npat_parent: 'isa22',
  eps: 'isa23',
  total_assets: 'bsa53',
  cash: 'bsa2',
  deposits_at_sbv: 'bsb97',
  deposits_at_other_ci: 'bsb98',
  trading_securities: 'bsb99',
  customer_loans: 'bsb104',
  loan_loss_reserve: 'bsb105',
  investment_securities: 'bsb106',
  total_liabilities: 'bsa54',
  govt_sbv_borrowings: 'bsb111',
  ci_deposits_borrowings: 'bsb112',
  customer_deposits: 'bsb113',
  valuable_papers: 'bsb116',
  equity: 'bsa78',
  charter_capital: 'bsa80',
  retained_earnings: 'bsa90',
  earning_assets: null,
  interest_bearing_liabilities: null,
};

export function finite(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
export function detectTemplate(rows: FinancialRow[]): 'A' | 'B' {
  return rows.some((r) => ['isb38', 'isb27', 'isb43'].some((k) => (finite(r[k]) ?? 0) !== 0))
    ? 'B'
    : 'A';
}
export function buildPeriods(
  bs: FinancialRow[],
  is: FinancialRow[],
  cf: FinancialRow[],
  mapping: Readonly<Record<string, string | null>>,
): Period[] {
  const merged = new Map<string, Period>();
  for (const row of [...bs, ...is, ...cf]) {
    const year = Math.trunc(finite(row.year_report) ?? 0),
      length = Math.trunc(finite(row.length_report) ?? 0);
    if (!year || !length) continue;
    const key = `${year}:${length}`;
    const p = merged.get(key) ?? { year, length, values: {} };
    for (const [concept, field] of Object.entries(mapping)) {
      if (!field) continue;
      const n = finite(row[field]);
      if (n !== undefined) p.values[concept] = n;
    }
    merged.set(key, p);
  }
  return [...merged.values()].sort((a, b) => b.year - a.year || b.length - a.length);
}
export const val = (p: Period | undefined, c: string): Numeric => p?.values[c] ?? null;
export const ratio = (n: Numeric, d: Numeric): Numeric =>
  n === null || d === null || d === 0 ? null : n / d;
export const sumPresent = (...xs: Numeric[]): Numeric => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
export const avg = (cur: Period, prev: Period | undefined, c: string): Numeric => {
  const a = val(cur, c);
  if (a === null) return null;
  const b = val(prev, c);
  return b === null ? a : (a + b) / 2;
};
export const periodLabel = (p: Period) => `${p.length < 5 ? `Q${p.length}/` : ''}${p.year}`;

export function revenueGrowth(cur: Period, prev?: Period): Numeric {
  const a = val(cur, 'net_revenue'),
    b = val(prev, 'net_revenue');
  return a === null || b === null || b === 0 ? null : a / b - 1;
}
export const grossMargin = (p: Period): Numeric =>
  ratio(val(p, 'gross_profit'), val(p, 'net_revenue'));
export function roeNonbank(cur: Period, prev?: Period): Numeric {
  return ratio(
    val(cur, 'npat_parent') ?? val(cur, 'npat'),
    avg(cur, prev, 'equity_parent') ?? avg(cur, prev, 'equity'),
  );
}
export function netDebtEbitda(p: Period): Numeric {
  const xs = [
    'st_debt',
    'lt_debt',
    'cash',
    'st_investments',
    'operating_profit',
    'depreciation',
  ].map((c) => val(p, c));
  if (xs.some((x) => x === null)) return null;
  const [sd = 0, ld = 0, cash = 0, sti = 0, ebit = 0, dep = 0] = xs as number[];
  return ratio(sd + ld - cash - sti, ebit + dep);
}
export function fcfMargin(p: Period): Numeric {
  const cfo = val(p, 'cfo'),
    capex = val(p, 'capex');
  return cfo === null || capex === null ? null : ratio(cfo + capex, val(p, 'net_revenue'));
}
export function altmanZ(p: Period): Numeric {
  const [ca, cl, ta, re, ebit, eq, tl, rev] = [
    'current_assets',
    'current_liabilities',
    'total_assets',
    'retained_earnings',
    'operating_profit',
    'equity',
    'total_liabilities',
    'net_revenue',
  ].map((c) => val(p, c));
  if ([ca, cl, ta, re, ebit, eq, tl, rev].some((x) => x === null) || !ta || !tl) return null;
  return (
    1.2 * ((ca! - cl!) / ta) + 1.4 * (re! / ta) + 3.3 * (ebit! / ta) + 0.6 * (eq! / tl) + rev! / ta
  );
}

const EA = [
  'deposits_at_sbv',
  'deposits_at_other_ci',
  'trading_securities',
  'customer_loans',
  'investment_securities',
];
const IBL = [
  'govt_sbv_borrowings',
  'ci_deposits_borrowings',
  'customer_deposits',
  'valuable_papers',
];
const sumConcepts = (p: Period, keys: string[]) => sumPresent(...keys.map((k) => val(p, k)));
export const earningAssets = (p: Period) => sumConcepts(p, EA);
export const interestBearingLiabilities = (p: Period) => sumConcepts(p, IBL);
const avgDerived = (cur: Period, prev: Period | undefined, fn: (p: Period) => Numeric) => {
  const a = fn(cur);
  if (a === null) return null;
  const b = prev ? fn(prev) : null;
  return b === null ? a : (a + b) / 2;
};
export const nim = (cur: Period, prev?: Period) =>
  ratio(val(cur, 'net_interest_income'), avgDerived(cur, prev, earningAssets));
export const roeBank = (cur: Period, prev?: Period) =>
  ratio(val(cur, 'npat'), avg(cur, prev, 'equity'));
export const ldr = (p: Period) => ratio(val(p, 'customer_loans'), val(p, 'customer_deposits'));
export const equityRatio = (p: Period) => ratio(val(p, 'equity'), val(p, 'total_assets'));
export const llrLoans = (p: Period) => {
  const r = val(p, 'loan_loss_reserve');
  return r === null ? null : ratio(Math.abs(r), val(p, 'customer_loans'));
};
export const cir = (p: Period) => {
  const o = val(p, 'operating_expense');
  return o === null ? null : ratio(Math.abs(o), val(p, 'total_operating_income'));
};

export function toiMix(p: Period) {
  const trading = sumPresent(
    val(p, 'fx_income'),
    val(p, 'trading_securities_income'),
    val(p, 'investment_securities_income'),
  );
  const toi = val(p, 'total_operating_income');
  return {
    nii_pct: ratio(val(p, 'net_interest_income'), toi),
    fee_pct: ratio(val(p, 'net_fee_income'), toi),
    trading_pct: ratio(trading, toi),
    other_pct: ratio(val(p, 'other_income_bank'), toi),
  };
}
export function nimDecomposition(cur: Period, prev?: Period) {
  const ea = avgDerived(cur, prev, earningAssets),
    ibl = avgDerived(cur, prev, interestBearingLiabilities),
    ie = val(cur, 'interest_expense');
  const yield_ea = ratio(val(cur, 'interest_income_gross'), ea),
    cost_of_funds = ie === null ? null : ratio(Math.abs(ie), ibl);
  return {
    yield_ea,
    cost_of_funds,
    spread: yield_ea === null || cost_of_funds === null ? null : yield_ea - cost_of_funds,
  };
}
export function ppopCor(cur: Period, prev?: Period) {
  const toi = val(cur, 'total_operating_income'),
    opex = val(cur, 'operating_expense'),
    provRaw = val(cur, 'provision_expense'),
    prov = provRaw === null ? null : Math.abs(provRaw);
  const ppop = toi === null || opex === null ? null : toi - Math.abs(opex);
  return {
    ppop,
    cir: opex === null ? null : ratio(Math.abs(opex), toi),
    provision_ppop: ratio(prov, ppop),
    cost_of_risk: ratio(prov, avg(cur, prev, 'customer_loans')),
  };
}
export function bankDupont(cur: Period, prev?: Period) {
  const ta = avg(cur, prev, 'total_assets'),
    eq = avg(cur, prev, 'equity'),
    roa = ratio(val(cur, 'npat'), ta),
    em = ratio(ta, eq),
    nii = val(cur, 'net_interest_income'),
    toi = val(cur, 'total_operating_income'),
    non = toi === null || nii === null ? null : toi - nii;
  const absR = (c: string) => {
    const v = val(cur, c);
    return ratio(v === null ? null : Math.abs(v), ta);
  };
  return {
    roa,
    equity_multiplier: em,
    roe: roa === null || em === null ? null : roa * em,
    nii_to_ta: ratio(nii, ta),
    non_nii_to_ta: ratio(non, ta),
    opex_to_ta: absR('operating_expense'),
    provision_to_ta: absR('provision_expense'),
    tax_to_ta: absR('tax_expense'),
  };
}

export function commonSize(p: Period) {
  const rev = val(p, 'net_revenue'),
    abs = (c: string) => {
      const v = val(p, c);
      return v === null ? null : ratio(Math.abs(v), rev);
    };
  return {
    cogs_pct: abs('cogs'),
    gross_margin: ratio(val(p, 'gross_profit'), rev),
    selling_pct: abs('selling_expense'),
    admin_pct: abs('admin_expense'),
    ebit_margin: ratio(val(p, 'operating_profit'), rev),
    net_margin: ratio(val(p, 'npat'), rev),
  };
}
export function commonSizeTable(periods: Period[]) {
  const cols = [...periods.slice(0, 5)].reverse(),
    defs = [
      ['cogs_pct', 'Giá vốn hàng bán', false],
      ['gross_margin', 'Biên lợi nhuận gộp', true],
      ['selling_pct', 'Chi phí bán hàng', false],
      ['admin_pct', 'Chi phí quản lý DN', false],
      ['ebit_margin', 'Biên EBIT (LN thuần HĐKD)', true],
      ['net_margin', 'Biên LNST', false],
    ] as const,
    values = cols.map(commonSize);
  return {
    columns: cols.map(periodLabel),
    rows: defs.map(([key, label, emphasis]) => ({
      key,
      label,
      emphasis,
      unit: '%',
      values: values.map((v) => v[key]),
    })),
  };
}
export function workingCapitalCycle(cur: Period, prev?: Period, dayBasis = 365) {
  const rev = val(cur, 'net_revenue'),
    cogs = val(cur, 'cogs'),
    ar = avg(cur, prev, 'trade_receivables'),
    ig = avg(cur, prev, 'inventory_gross'),
    ip = avg(cur, prev, 'inventory_provision') ?? 0,
    inv = ig === null ? null : ig - Math.abs(ip),
    ap = avg(cur, prev, 'trade_payables');
  const dso = rev ? ratio(ar, rev)! * dayBasis : null,
    dio = cogs ? ratio(inv, cogs)! * dayBasis : null,
    dpo = cogs ? ratio(ap, cogs)! * dayBasis : null;
  return {
    dso,
    dio,
    dpo,
    ccc: dso === null || dio === null || dpo === null ? null : dso + dio - dpo,
  };
}
export function workingCapitalCycleSeries(periods: Period[], dayBasis = 365) {
  const idx = [...periods.slice(0, 5).keys()].reverse(),
    data = idx.map((i) =>
      workingCapitalCycle(periods[i]!, previousBalancePeriod(periods, i), dayBasis),
    ),
    defs = [
      ['dso', 'DSO — Phải thu'],
      ['dio', 'DIO — Tồn kho'],
      ['dpo', 'DPO — Phải trả'],
      ['ccc', 'CCC — Chu kỳ tiền mặt'],
    ] as const;
  return {
    columns: idx.map((i) => periodLabel(periods[i]!)),
    rows: defs.map(([key, label]) => ({ key, label, values: data.map((x) => x[key]) })),
    latest: data.at(-1) ?? { dso: null, dio: null, dpo: null, ccc: null },
  };
}
export function cashFlowBridge(p: Period) {
  const ni = val(p, 'npat'),
    dep = val(p, 'depreciation'),
    prov = val(p, 'provisions_cf'),
    cfo = val(p, 'cfo'),
    capex = val(p, 'capex'),
    fcf = cfo === null || capex === null ? null : cfo + capex,
    wc = cfo === null || ni === null ? null : cfo - (ni + (dep ?? 0) + (prov ?? 0)),
    lines = [
      ['ni', 'Lợi nhuận sau thuế (NI)', ni, 'base'],
      ['depreciation', '(+) Khấu hao', dep, 'add'],
      ['provisions', '(+) Dự phòng', prov, 'add'],
      ['wc_change', '(±) Thay đổi vốn lưu động', wc, 'add'],
      ['cfo', '= CFO', cfo, 'subtotal'],
      ['capex', '(−) CapEx', capex, 'sub'],
      ['fcf', '= FCF (Dòng tiền tự do)', fcf, 'total'],
    ].map(([key, label, value, kind]) => ({ key, label, value, kind }));
  return {
    ni,
    depreciation: dep,
    provisions: prov,
    cfo,
    capex,
    fcf,
    wc_change: wc,
    lines,
    cfo_ni: ratio(cfo, ni),
    fcf_margin: ratio(fcf, val(p, 'net_revenue')),
    sloan_accrual: ni === null || cfo === null ? null : ratio(ni - cfo, val(p, 'total_assets')),
  };
}

export function dupont(cur: Period, prev?: Period) {
  const d = {
    tax_burden: ratio(val(cur, 'npat'), val(cur, 'profit_before_tax')),
    interest_burden: ratio(val(cur, 'profit_before_tax'), val(cur, 'operating_profit')),
    op_margin: ratio(val(cur, 'operating_profit'), val(cur, 'net_revenue')),
    asset_turnover: ratio(val(cur, 'net_revenue'), avg(cur, prev, 'total_assets')),
    equity_multiplier: ratio(avg(cur, prev, 'total_assets'), avg(cur, prev, 'equity')),
  };
  const xs = Object.values(d);
  return {
    ...d,
    roe: xs.some((x) => x === null) ? null : (xs as number[]).reduce((a, b) => a * b, 1),
  };
}
export function dupontDecomposition(periods: Period[]) {
  const defs = [
    ['tax_burden', 'Gánh nặng thuế', 'TAX BURDEN', 'x'],
    ['interest_burden', 'Gánh nặng lãi vay', 'INTEREST BRD', 'x'],
    ['op_margin', 'Biên hoạt động', 'OP MARGIN', '%'],
    ['asset_turnover', 'Vòng quay tài sản', 'ASSET T/O', 'x'],
    ['equity_multiplier', 'Hệ số nhân VCSH', 'EQUITY MULT', 'x'],
  ] as const;
  const c = periods[0] ? dupont(periods[0], previousBalancePeriod(periods, 0)) : null,
    p = periods[1] ? dupont(periods[1], previousBalancePeriod(periods, 1)) : null,
    delta =
      c?.roe !== null && c?.roe !== undefined && p?.roe !== null && p?.roe !== undefined
        ? c.roe - p.roe
        : null;
  const logs = defs.map(([k]) =>
      c?.[k] && p?.[k] && c[k]! > 0 && p[k]! > 0 ? Math.log(c[k]! / p[k]!) : null,
    ),
    total = logs.every((x) => x !== null) ? (logs as number[]).reduce((a, b) => a + b, 0) : null;
  return {
    roe: c?.roe ?? null,
    roe_prev: p?.roe ?? null,
    roe_delta: delta,
    drivers: defs.map(([key, label, abbr, unit], i) => {
      const value = c?.[key] ?? null,
        prev = p?.[key] ?? null;
      return {
        key,
        label,
        abbr,
        unit,
        value,
        prev,
        delta: value === null || prev === null ? null : value - prev,
        contribution:
          delta === null || total === null
            ? null
            : Math.abs(total) < 1e-12
              ? 0
              : (delta * logs[i]!) / total,
      };
    }),
  };
}

export function classify(metric: string, value: Numeric) {
  if (value === null) return 'na';
  if (metric === 'altman_z') return value > 2.99 ? 'green' : value > 1.81 ? 'amber' : 'red';
  const t: Record<string, Array<[number, string]>> = {
    revenue_growth: [
      [0.05, 'red'],
      [0.15, 'amber'],
      [Infinity, 'green'],
    ],
    gross_margin: [
      [0.15, 'red'],
      [0.25, 'amber'],
      [Infinity, 'green'],
    ],
    roe: [
      [0.12, 'red'],
      [0.18, 'amber'],
      [Infinity, 'green'],
    ],
    fcf_margin: [
      [0, 'red'],
      [0.08, 'amber'],
      [Infinity, 'green'],
    ],
    net_debt_ebitda: [
      [1.5, 'green'],
      [3, 'amber'],
      [Infinity, 'red'],
    ],
    cir: [
      [0.35, 'green'],
      [0.45, 'amber'],
      [Infinity, 'red'],
    ],
    ldr: [
      [0.8, 'green'],
      [0.85, 'amber'],
      [Infinity, 'red'],
    ],
    nim: [
      [0.025, 'red'],
      [0.035, 'amber'],
      [Infinity, 'green'],
    ],
    equity_ratio: [
      [0.06, 'red'],
      [0.08, 'amber'],
      [Infinity, 'green'],
    ],
  };
  return t[metric]?.find(([max]) => value <= max)?.[1] ?? 'na';
}
export function median(xs: number[]) {
  const a = [...xs].sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}
export function justifiedPb(roe: Numeric, ke: number, g: number): Numeric {
  return roe === null || ke <= g ? null : (roe - g) / (ke - g);
}
const vals = (rows: FinancialRow[], key: string, positive = false) =>
  rows
    .map((r) => finite(r[key]))
    .filter((x): x is number => x !== undefined && (!positive || x > 0));
const latest = (rows: FinancialRow[], key: string) => vals(rows, key)[0] ?? null;
export function valuationNonbank(rows: FinancialRow[]) {
  const pe = vals(rows, 'pe', true).slice(0, 5),
    eps = latest(rows, 'eps'),
    bvps = latest(rows, 'bvps'),
    rm = median(vals(rows, 'roe')),
    j = justifiedPb(rm, 0.125, 0.05),
    band =
      pe.length && eps !== null
        ? { bear: Math.min(...pe) * eps, base: median(pe)! * eps, bull: Math.max(...pe) * eps }
        : null,
    rim = j === null || bvps === null ? null : j * bvps,
    cands = [band?.base, rim, bvps].filter((x): x is number => x !== null && x !== undefined),
    summary = {
      bear: band ? Math.min(band.bear, ...cands) : median(cands),
      base: median(cands),
      bull: band ? Math.max(band.bull, ...cands) : median(cands),
    };
  return { pe_band: band, rim, book_floor: bvps, justified_pb: j, roe_sustainable: rm, summary };
}
export function valuationBank(
  rows: FinancialRow[],
  ctx: {
    nim?: Numeric;
    cost_of_risk?: Numeric;
    roa?: Numeric;
    equity_multiplier?: Numeric;
    earning_assets_ratio?: Numeric;
    loans_ratio?: Numeric;
  } = {},
) {
  const bvps = latest(rows, 'bvps'),
    rm = median(vals(rows, 'roe')),
    j = justifiedPb(rm, 0.14, 0.07),
    fair = j === null || bvps === null ? null : j * bvps;
  const ns = [0.002, 0, -0.002].map((d) => (ctx.nim == null ? null : ctx.nim + d)),
    cs = [-0.002, 0, 0.002].map((d) => (ctx.cost_of_risk == null ? null : ctx.cost_of_risk + d));
  const matrixRows = ns.map((n) => ({
    nim: n,
    cells: cs.map((c) => {
      let pb: Numeric = null;
      if (
        n !== null &&
        c !== null &&
        ctx.nim != null &&
        ctx.cost_of_risk != null &&
        ctx.roa != null &&
        ctx.equity_multiplier != null &&
        ctx.earning_assets_ratio != null &&
        ctx.loans_ratio != null
      ) {
        const dr =
          (n - ctx.nim) * ctx.earning_assets_ratio - (c - ctx.cost_of_risk) * ctx.loans_ratio;
        pb = justifiedPb((ctx.roa + dr) * ctx.equity_multiplier, 0.14, 0.07);
      }
      return { cor: c, justified_pb: pb };
    }),
  }));
  return {
    justified_pb: j,
    fair_value: fair,
    roe_sustainable: rm,
    bvps,
    nim_cor_matrix: { rows: matrixRows },
  };
}

export function detectSubsector(p: Period, ccc: Numeric) {
  const ta = val(p, 'total_assets');
  if (!ta) return 'san_xuat';
  const nfa = (val(p, 'net_fixed_assets') ?? 0) / ta,
    inv = (val(p, 'inventory_gross') ?? 0) / ta,
    bp = (val(p, 'buyer_prepayments') ?? 0) / ta;
  if (bp > 0.15 && inv > 0.3) return 'bat_dong_san';
  if (nfa > 0.6) return 'tien_ich';
  if (ccc !== null && ccc < 0 && inv > 0.2) return 'ban_le';
  if (nfa < 0.2 && inv < 0.05) return 'cntt_dichvu';
  return 'san_xuat';
}
const SUB_LABELS: Record<string, string> = {
  san_xuat: 'Sản xuất / Công nghiệp',
  cntt_dichvu: 'CNTT / Dịch vụ',
  ban_le: 'Bán lẻ',
  bat_dong_san: 'Bất động sản',
  tien_ich: 'Tiện ích / Điện',
};
export function subsectorSpotlight(p: Period, subsector: string) {
  return {
    subsector,
    label: SUB_LABELS[subsector] ?? 'Hỗn hợp',
    metrics: {
      asset_intensity: ratio(val(p, 'net_fixed_assets'), val(p, 'total_assets')),
      inventory_ratio: ratio(val(p, 'inventory_gross'), val(p, 'total_assets')),
    },
  };
}
