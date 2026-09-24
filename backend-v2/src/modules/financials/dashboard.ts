import type { FinancialRow, Numeric, Period } from './financials.types.js';
import {
  performancePeriods,
  previousBalancePeriod,
  yearAgoPeriod,
} from './financials.frequency.js';
import {
  BANK_MAPPING,
  NONBANK_MAPPING,
  avg,
  buildPeriods,
  cashFlowBridge,
  cir,
  detectSubsector,
  detectTemplate,
  earningAssets,
  equityRatio,
  finite,
  grossMargin,
  llrLoans,
  netDebtEbitda,
  nim,
  ppopCor,
  ratio,
  revenueGrowth,
  roeBank,
  roeNonbank,
  subsectorSpotlight,
  sumPresent,
  toiMix,
  val,
  valuationBank,
  valuationNonbank,
  workingCapitalCycle,
} from './financials.calculations.js';

const MAX = 5;
const BASE =
  'Mọi chỉ tiêu được tính từ 3 báo cáo tài chính (CĐKT, KQKD, LCTT); so ngành và ngưỡng mang tính tham chiếu. Không phải khuyến nghị mua/bán/giữ.';
const NONBANK =
  'Football field dùng P/E lịch sử, thu nhập thặng dư (RIM) và sàn sổ sách; DCF chưa được ước lượng ở lớp tính toán deterministic.';
const BANK =
  'Thiếu thuyết minh: nợ xấu theo nhóm, CAR và CASA không có sẵn — chất lượng tài sản dùng số đại diện từ 3 báo cáo (ước tính).';
const div = (a: Numeric, b: Numeric) => ratio(a, b),
  chrono = (ps: Period[]) => [...ps.slice(0, MAX)].reverse();
const metric = (key: string, label: string, value: Numeric, unit: string) => ({
  key,
  label,
  value,
  unit,
  peer_median: null,
  color: null,
});
const ratioVal = (rows: FinancialRow[], key: string): Numeric => {
  for (const row of rows) {
    const n = finite(row[key]);
    if (n !== undefined) return n;
  }
  return null;
};
function price(rows: FinancialRow[]) {
  const mc = ratioVal(rows, 'market_cap'),
    shares = ratioVal(rows, 'number_of_shares_mkt_cap');
  if (mc !== null && shares) return mc / shares;
  const pe = ratioVal(rows, 'pe'),
    eps = ratioVal(rows, 'eps');
  if (pe !== null && eps !== null) return pe * eps;
  const pb = ratioVal(rows, 'pb'),
    bvps = ratioVal(rows, 'bvps');
  return pb !== null && bvps !== null ? pb * bvps : null;
}
function hero(symbol: string, o: FinancialRow, p: Numeric, f: Numeric) {
  return {
    ticker: symbol.toUpperCase(),
    name: o.name ?? null,
    exchange: o.exchange ?? null,
    sector: o.icb_name_2 ?? o.icb_lv2 ?? null,
    price: p,
    fair_value: f,
    upside_pct: f !== null && p ? div(f - p, p) : null,
  };
}
const radar = (spec: Array<[string, string, string | null, Numeric]>) => ({
  dims: spec.map(([key, label, value_label, value]) => ({
    key,
    label,
    score: null,
    band: null,
    value_label,
    value,
  })),
});
const pct = (v: Numeric) => (v === null ? null : `${(v * 100).toFixed(1)}%`),
  x = (v: Numeric) => (v === null ? null : `${v.toFixed(2)}×`);
function financial(ps: Period[], bank: boolean) {
  const ch = chrono(ps),
    newest = ps[0]!,
    oldest = ch[0]!,
    debt = (p: Period) =>
      bank
        ? sumPresent(
            val(p, 'govt_sbv_borrowings'),
            val(p, 'ci_deposits_borrowings'),
            val(p, 'valuable_papers'),
          )
        : sumPresent(val(p, 'st_debt'), val(p, 'lt_debt')),
    other = (p: Period) =>
      bank
        ? val(p, 'customer_deposits')
        : val(p, 'total_liabilities') === null
          ? null
          : val(p, 'total_liabilities')! - (debt(p) ?? 0),
    growthDefs = bank
      ? ([
          ['Lợi nhuận giữ lại', (p: Period) => val(p, 'retained_earnings')],
          ['Tiền gửi huy động', other],
          ['Vay & phát hành khác', debt],
        ] as const)
      : ([
          ['Lợi nhuận giữ lại', (p: Period) => val(p, 'retained_earnings')],
          ['Nợ vận hành', other],
          ['Vay nợ', debt],
        ] as const),
    assets: ReadonlyArray<readonly [string, (p: Period) => Numeric]> = bank
      ? ([
          ['Cho vay khách hàng', (p: Period) => val(p, 'customer_loans')],
          [
            'Chứng khoán đầu tư',
            (p: Period) =>
              sumPresent(val(p, 'investment_securities'), val(p, 'trading_securities')),
          ],
          [
            'Tiền & gửi NHNN/TCTD',
            (p: Period) =>
              sumPresent(val(p, 'cash'), val(p, 'deposits_at_sbv'), val(p, 'deposits_at_other_ci')),
          ],
        ] as const)
      : ([
          [
            'Tiền & ĐT ngắn hạn',
            (p: Period) => sumPresent(val(p, 'cash'), val(p, 'st_investments')),
          ],
          ['Phải thu khách hàng', (p: Period) => val(p, 'trade_receivables')],
          ['Tài sản cố định', (p: Period) => val(p, 'net_fixed_assets')],
        ] as const),
    totals: ReadonlyArray<readonly [string, string]> = bank
      ? [
          ['Tổng tài sản', 'total_assets'],
          ['Cho vay khách hàng', 'customer_loans'],
          ['Vốn chủ sở hữu', 'equity'],
        ]
      : [
          ['Tổng tài sản', 'total_assets'],
          ['Vốn chủ sở hữu', 'equity'],
          ['Nợ phải trả', 'total_liabilities'],
        ],
    delta =
      val(newest, 'total_assets') !== null && val(oldest, 'total_assets') !== null
        ? val(newest, 'total_assets')! - val(oldest, 'total_assets')!
        : null,
    ta = val(newest, 'total_assets');
  let accounted = 0;
  const asset_mix: Array<{ label: string; pct: Numeric }> = assets.map(([label, fn]) => {
    const q = div(fn(newest), ta);
    if (q !== null) accounted += q;
    return { label, pct: q };
  });
  asset_mix.push({ label: 'Khác', pct: ta ? 1 - accounted : null });
  return {
    stacked_abs: ch.map((p) => ({
      year: p.year,
      equity: val(p, 'equity'),
      other_liab: other(p),
      debt: debt(p),
    })),
    growth_sources: growthDefs.map(([label, fn]) => {
      const a = fn(newest),
        b = fn(oldest),
        amount = a === null || b === null ? null : a - b;
      return { label, amount, pct: div(amount, delta) };
    }),
    totals: totals.map(([label, key]) => ({
      label,
      value: val(newest, key),
      mult: div(val(newest, key), val(oldest, key)),
    })),
    asset_mix,
  };
}
function business(ps: Period[], bank: boolean, rawCur: Period, rawYearAgo?: Period) {
  const ch = chrono(ps),
    cur = ps[0]!,
    prev = previousBalancePeriod(ps, 0);
  if (bank) {
    const mix = toiMix(cur);
    return {
      revenue_series: ch.map((p) => ({
        year: p.year,
        revenue: val(p, 'total_operating_income'),
        gross_margin: null,
        net_margin: div(val(p, 'npat'), val(p, 'total_operating_income')),
      })),
      metrics: [
        metric('nim', 'NIM', nim(cur, prev), '%'),
        metric('roa', 'ROA', div(val(cur, 'npat'), avg(cur, prev, 'total_assets')), '%'),
        metric('roe', 'ROE', roeBank(cur, prev), '%'),
      ],
      nim_series: ps
        .map((period, index) => ({
          year: period.year,
          nim: nim(period, previousBalancePeriod(ps, index)),
        }))
        .reverse(),
      income_mix: [
        { label: 'Lãi thuần', pct: mix.nii_pct },
        { label: 'Phí dịch vụ', pct: mix.fee_pct },
        { label: 'Ngoại hối & KD chứng khoán', pct: mix.trading_pct },
        { label: 'Khác', pct: mix.other_pct },
      ],
    };
  }
  const pbt = val(cur, 'profit_before_tax'),
    op = val(cur, 'operating_profit'),
    core = div(op, pbt);
  return {
    revenue_series: ch.map((p) => ({
      year: p.year,
      revenue: val(p, 'net_revenue'),
      gross_margin: div(val(p, 'gross_profit'), val(p, 'net_revenue')),
      net_margin: div(val(p, 'npat'), val(p, 'net_revenue')),
    })),
    metrics: [
      metric('revenue_growth', 'Tăng trưởng doanh thu', revenueGrowth(rawCur, rawYearAgo), '%'),
      metric('gross_margin', 'Biên lợi nhuận gộp', grossMargin(cur), '%'),
      metric('roe', 'ROE', roeNonbank(cur, prev), '%'),
    ],
    earnings_quality: {
      core_pct: core,
      oneoff_pct: core === null ? null : 1 - core,
      peer_median: null,
    },
  };
}
function cashflow(ps: Period[], bank: boolean) {
  const ch = chrono(ps),
    cur = ps[0]!,
    prev = previousBalancePeriod(ps, 0);
  if (bank) {
    const pc = ppopCor(cur, prev);
    return {
      cir_series: ch.map((p) => ({ year: p.year, cir: cir(p) })),
      metrics: [
        metric('cir', 'CIR (chi phí / thu nhập)', pc.cir, '%'),
        metric('cost_of_risk', 'Chi phí tín dụng / Cho vay', pc.cost_of_risk, '%'),
        metric('provision_ppop', 'Chi phí dự phòng / PPOP', pc.provision_ppop, '%'),
      ],
      ppop: pc.ppop,
    };
  }
  const bridge = cashFlowBridge(cur);
  return {
    profit_vs_cash: ch.map((p) => ({ year: p.year, profit: val(p, 'npat'), cfo: val(p, 'cfo') })),
    metrics: [
      metric('cfo_ni', 'Tiền từ KD / Lợi nhuận', bridge.cfo_ni, 'x'),
      metric('fcf_margin', 'Dòng tiền tự do / Doanh thu', bridge.fcf_margin, '%'),
      metric('accrual', 'Phần lãi chưa thành tiền', bridge.sloan_accrual, '%'),
    ],
    waterfall: bridge.lines.map((line) => ({
      label: line.label,
      value: line.value,
      kind: ['ni', 'cfo', 'fcf'].includes(String(line.key)) ? 'base' : 'delta',
    })),
  };
}
function valuation(rows: FinancialRow[], p: Numeric, ps: Period[], bank: boolean) {
  if (!bank) {
    const v = valuationNonbank(rows),
      s = v.summary,
      methods = [] as Array<Record<string, unknown>>;
    if (v.pe_band) methods.push({ name: 'P/E lịch sử', ...v.pe_band });
    if (v.rim !== null)
      methods.push({ name: 'Thu nhập thặng dư (RIM)', bear: null, base: v.rim, bull: null });
    if (v.book_floor !== null)
      methods.push({ name: 'Sàn sổ sách', bear: null, base: v.book_floor, bull: null });
    if (Object.values(s).some((z) => z !== null)) methods.push({ name: 'Trung vị tổng hợp', ...s });
    return {
      methods,
      current_price: p,
      fair_median: s.base,
      upside_pct: s.base !== null && p ? div(s.base - p, p) : null,
      metrics: [
        { key: 'pe', label: 'P/E', value: ratioVal(rows, 'pe'), peer_median: null },
        { key: 'pb', label: 'P/B', value: ratioVal(rows, 'pb'), peer_median: null },
        { key: 'roe', label: 'ROE', value: ratioVal(rows, 'roe'), peer_median: null },
      ],
    };
  }
  const cur = ps[0]!,
    prev = previousBalancePeriod(ps, 0),
    pc = ppopCor(cur, prev),
    ta = val(cur, 'total_assets'),
    roa = div(val(cur, 'npat'), avg(cur, prev, 'total_assets')),
    em = div(avg(cur, prev, 'total_assets'), avg(cur, prev, 'equity')),
    v = valuationBank(rows, {
      nim: nim(cur, prev),
      cost_of_risk: pc.cost_of_risk,
      roa,
      equity_multiplier: em,
      earning_assets_ratio: div(earningAssets(cur), ta),
      loans_ratio: div(val(cur, 'customer_loans'), ta),
    });
  return {
    methods: [],
    current_price: p,
    fair_median: v.fair_value,
    upside_pct: v.fair_value !== null && p ? div(v.fair_value - p, p) : null,
    metrics: [
      { key: 'pb', label: 'P/B hiện tại', value: ratioVal(rows, 'pb'), peer_median: null },
      { key: 'justified_pb', label: 'P/B hợp lý', value: v.justified_pb, peer_median: null },
      { key: 'pe', label: 'P/E hiện tại', value: ratioVal(rows, 'pe'), peer_median: null },
      { key: 'roe', label: 'ROE', value: ratioVal(rows, 'roe'), peer_median: null },
    ],
  };
}
function health(ps: Period[], bank: boolean, dayBasis = 365) {
  const ch = chrono(ps),
    cur = ps[0]!,
    prev = previousBalancePeriod(ps, 0);
  if (bank) {
    const pc = ppopCor(cur, prev);
    return {
      sub_a: {
        series: ch.map((p) => ({ year: p.year, value: llrLoans(p) })),
        peer: [
          { label: 'Dự phòng / Cho vay (công ty)', value: llrLoans(cur) },
          { label: 'Ngưỡng cảnh báo', value: 0.03 },
          { label: 'Trung vị ngành', value: null },
        ],
      },
      sub_b: {
        series: ch.map((p) => ({
          year: p.year,
          value:
            val(p, 'provision_expense') === null
              ? null
              : div(Math.abs(val(p, 'provision_expense')!), val(p, 'ppop_reported')),
        })),
        peer: [
          { label: 'Chi phí dự phòng / PPOP (công ty)', value: pc.provision_ppop },
          {
            label: 'Đòn bẩy (Tổng TS / VCSH)',
            value: div(val(cur, 'total_assets'), val(cur, 'equity')),
          },
          { label: 'Trung vị ngành', value: null },
        ],
      },
    };
  }
  const debt = (p: Period) => sumPresent(val(p, 'st_debt'), val(p, 'lt_debt')),
    dso = (p: Period) =>
      val(p, 'net_revenue')
        ? div(val(p, 'trade_receivables'), val(p, 'net_revenue'))! * dayBasis
        : null,
    old = ch[0]!,
    bridge = cashFlowBridge(cur);
  return {
    sub_a: {
      series: ch.map((p) => ({ year: p.year, value: netDebtEbitda(p) })),
      peer: [
        { label: 'Nợ vay / Vốn chủ (công ty)', value: div(debt(cur), val(cur, 'equity')) },
        { label: 'Trung vị ngành', value: null },
      ],
    },
    sub_b: {
      series: ch.map((p) => {
        const ie = val(p, 'interest_expense');
        return {
          year: p.year,
          value: div(val(p, 'operating_profit'), ie === null ? null : Math.abs(ie)),
        };
      }),
      peer: [
        {
          label: 'Thanh khoản hiện hành (công ty)',
          value: div(val(cur, 'current_assets'), val(cur, 'current_liabilities')),
        },
        { label: 'Trung vị ngành', value: null },
      ],
    },
    sub_c: {
      series: ch.map((p) => ({ year: p.year, company: dso(p), peer: null })),
      checklist: [
        {
          label: 'Lợi nhuận có khớp với tiền mặt thu về?',
          ok: bridge.cfo_ni !== null && bridge.cfo_ni >= 1,
        },
        {
          label: 'Không pha loãng cổ phiếu của cổ đông?',
          ok:
            val(cur, 'charter_capital') !== null &&
            val(old, 'charter_capital') !== null &&
            val(cur, 'charter_capital')! <= val(old, 'charter_capital')! * 1.05,
        },
        {
          label: 'Khách hàng không trả tiền chậm dần?',
          ok: dso(cur) !== null && dso(old) !== null && dso(cur)! <= dso(old)! * 1.1,
        },
      ],
    },
  };
}
function dividend(ps: Period[], rows: FinancialRow[], p: Numeric, bank: boolean) {
  const by = new Map<number, number>();
  for (const row of rows) {
    const year = Math.trunc(finite(row.year_report ?? row.year) ?? 0),
      d = finite(row.dividend);
    if (year && d !== undefined && !by.has(year)) by.set(year, d);
  }
  const latest =
    ps
      .slice(0, MAX)
      .map((z) => by.get(z.year))
      .find((z) => z !== undefined) ?? null;
  return {
    series: chrono(ps).map((z) => ({ year: z.year, value: by.get(z.year) ?? null })),
    yield: latest !== null && p ? div(latest, p) : null,
    payout: latest !== null ? div(latest, ratioVal(rows, 'eps')) : null,
    form: bank ? 'cổ phiếu' : 'tiền mặt',
  };
}

export function assembleDashboard(
  bs: FinancialRow[],
  is: FinancialRow[],
  cf: FinancialRow[],
  rows: FinancialRow[],
  overview: FinancialRow,
  symbol: string,
) {
  const template = detectTemplate(is),
    bank = template === 'B',
    rawPeriods = buildPeriods(bs, is, cf, bank ? BANK_MAPPING : NONBANK_MAPPING).slice(0, MAX);
  if (!rawPeriods.length)
    return {
      template,
      sub_sector: null,
      hero: hero(symbol, overview, null, null),
      radar: radar([]),
      blocks: {},
      meta: {
        periods: [],
        frequency_assumptions: [],
        growth_comparison: null,
        is_estimated_fields: [],
        peer_count: 0,
        peer_asof: null,
        disclaimers: [BASE, 'Không đủ dữ liệu BCTC để dựng dashboard.', bank ? BANK : NONBANK],
      },
    };
  const frequency = performancePeriods(rawPeriods),
    ps = frequency.periods,
    rawCur = rawPeriods[0]!,
    rawYearAgo = yearAgoPeriod(rawPeriods, 0),
    cur = ps[0]!,
    prev = previousBalancePeriod(rawPeriods, 0),
    p = price(rows),
    f = financial(ps, bank),
    b = business(ps, bank, rawCur, rawYearAgo),
    c = cashflow(ps, bank),
    v = valuation(rows, p, ps, bank),
    h = health(
      ps,
      bank,
      frequency.assumptions[0]?.mode === 'quarter_annualized_estimate' ? 91.25 : 365,
    ),
    d = dividend(ps, rows, p, bank),
    fair = v.fair_median;
  let sub: string | null = null;
  const dayBasis = frequency.assumptions[0]?.mode === 'quarter_annualized_estimate' ? 91.25 : 365;
  if (!bank) {
    const w = workingCapitalCycle(cur, prev, dayBasis);
    sub = subsectorSpotlight(cur, detectSubsector(cur, w.ccc)).label;
  }
  const up = v.upside_pct,
    bankGrowth =
      rawYearAgo && val(rawYearAgo, 'total_operating_income')
        ? div(
            val(rawCur, 'total_operating_income')! - val(rawYearAgo, 'total_operating_income')!,
            val(rawYearAgo, 'total_operating_income'),
          )
        : null,
    nonbankGrowth = revenueGrowth(rawCur, rawYearAgo);
  const rd = bank
    ? radar([
        ['growth', 'Tăng trưởng', pct(bankGrowth), bankGrowth],
        ['profitability', 'Sinh lời', pct(roeBank(cur, prev)), roeBank(cur, prev)],
        ['asset_quality', 'Chất lượng tài sản', pct(llrLoans(cur)), llrLoans(cur)],
        ['capital', 'An toàn vốn', pct(equityRatio(cur)), equityRatio(cur)],
        ['valuation', 'Định giá', pct(up), up],
      ])
    : radar([
        ['business', 'Kinh doanh', pct(nonbankGrowth), nonbankGrowth],
        ['profitability', 'Sinh lời', pct(roeNonbank(cur, prev)), roeNonbank(cur, prev)],
        ['cashflow', 'Dòng tiền', x(cashFlowBridge(cur).cfo_ni), cashFlowBridge(cur).cfo_ni],
        ['safety', 'An toàn tài chính', x(netDebtEbitda(cur)), netDebtEbitda(cur)],
        ['valuation', 'Định giá', pct(up), up],
      ]);
  return {
    template,
    sub_sector: sub,
    hero: hero(symbol, overview, p, fair),
    radar: rd,
    blocks: { financial: f, business: b, cashflow: c, valuation: v, health: h, dividend: d },
    meta: {
      periods: rawPeriods.map((z) => `${z.length < 5 ? `Q${z.length}/` : ''}${z.year}`),
      frequency_assumptions: frequency.assumptions,
      growth_comparison: rawYearAgo
        ? `${rawCur.length < 5 ? `Q${rawCur.length}/` : ''}${rawCur.year} vs ${rawYearAgo.length < 5 ? `Q${rawYearAgo.length}/` : ''}${rawYearAgo.year}`
        : null,
      is_estimated_fields: bank
        ? ['blocks.health.sub_a.series', 'blocks.health.sub_b.series']
        : ['blocks.business.earnings_quality'],
      peer_count: 0,
      peer_asof: null,
      disclaimers: [BASE, bank ? BANK : NONBANK],
    },
  };
}
