import type { FinancialRow, Numeric, Period } from './financials.types.js';
import {
  performancePeriods,
  previousBalancePeriod,
  yearAgoPeriod,
} from './financials.frequency.js';
import {
  BANK_MAPPING,
  NONBANK_MAPPING,
  altmanZ,
  bankDupont,
  buildPeriods,
  cashFlowBridge,
  cir,
  classify,
  commonSizeTable,
  detectSubsector,
  detectTemplate,
  dupontDecomposition,
  earningAssets,
  equityRatio,
  fcfMargin,
  grossMargin,
  ldr,
  llrLoans,
  netDebtEbitda,
  nim,
  nimDecomposition,
  ppopCor,
  ratio,
  revenueGrowth,
  roeBank,
  roeNonbank,
  subsectorSpotlight,
  toiMix,
  val,
  valuationBank,
  valuationNonbank,
  workingCapitalCycle,
  workingCapitalCycleSeries,
} from './financials.calculations.js';

export const BANK_BLIND_SPOTS = [
  'Nợ nhóm 2-5 (phân loại nợ) — cần thuyết minh',
  'CASA (tỷ lệ tiền gửi không kỳ hạn) — cần thuyết minh',
  'CAR (hệ số an toàn vốn) — cần RWA, ngoài BCTC thuần số',
  'Nợ tái cơ cấu (TT02) — cần thuyết minh',
];

function balanceFlag(p: Period) {
  const ta = val(p, 'total_assets'),
    tl = val(p, 'total_liabilities'),
    eq = val(p, 'equity');
  return ta !== null &&
    tl !== null &&
    eq !== null &&
    ta !== 0 &&
    Math.abs(tl + eq - ta) / Math.abs(ta) > 0.005
    ? {
        level: 'warn',
        code: 'balance_identity',
        message: `BCĐKT lệch: Nợ+VCSH ≠ Tổng TS (${p.year})`,
      }
    : null;
}
function sanity(values: Record<string, Numeric>) {
  const ranges: Record<string, [number, number]> = {
    gross_margin: [0, 1],
    roe: [-0.5, 0.5],
    nim: [0.01, 0.08],
  };
  return Object.entries(ranges).flatMap(([key, [lo, hi]]) => {
    const v = values[key];
    return v !== undefined && v !== null && (v < lo || v > hi)
      ? [
          {
            level: 'warn',
            code: `${key}_out_of_range`,
            message: `${key}=${v.toFixed(3)} ngoài khoảng hợp lý [${lo},${hi}]`,
          },
        ]
      : [];
  });
}
function allAbove(xs: unknown, n: number, t: number) {
  return (
    Array.isArray(xs) &&
    xs.length >= n &&
    xs.slice(0, n).every((x) => typeof x === 'number' && x > t)
  );
}
function forensic(m: Record<string, unknown>, bank: boolean) {
  const green: string[] = [],
    red: string[] = [];
  let assessed = 0;
  const countSeries = (value: unknown) =>
    Array.isArray(value) && value.some((item) => typeof item === 'number');
  if (bank) {
    if (countSeries(m.nim_series)) assessed += 1;
    if (countSeries(m.roe_series)) assessed += 1;
    if (typeof m.cir === 'number') assessed += 1;
    if (typeof m.equity_ratio === 'number') assessed += 1;
    if (typeof m.llr_loans === 'number') assessed += 1;
    if (typeof m.ldr === 'number') assessed += 1;
    if (allAbove(m.nim_series, 3, 0.035)) green.push('NIM top quartile, bền vững > 3.5%');
    if (allAbove(m.roe_series, 3, 0.18)) green.push('ROE > 18% sustainable');
    if (typeof m.cir === 'number' && m.cir < 0.35) green.push('CIR best-in-class < 35%');
    if (typeof m.equity_ratio === 'number' && m.equity_ratio > 0.08)
      green.push('Capital position lành mạnh (VCSH/TS > 8%)');
    if (typeof m.llr_loans === 'number' && m.llr_loans > 0.025)
      green.push('Buffer dự phòng dày (LLR > 2.5%)');
    if (typeof m.ldr === 'number' && m.ldr > 0.85)
      red.push(`LDR ${(m.ldr * 100).toFixed(0)}% vượt cap NHNN 85%`);
    if (typeof m.cir === 'number' && m.cir > 0.45) red.push('CIR cao > 45%');
  } else {
    if (countSeries(m.roe_series)) assessed += 1;
    if (typeof m.net_debt_ebitda === 'number') assessed += 1;
    if (typeof m.altman_z === 'number') assessed += 1;
    if (countSeries(m.fcf_margin_series)) assessed += 1;
    if (typeof m.dso_change_2y === 'number') assessed += 1;
    if (typeof m.gross_margin_delta === 'number') assessed += 1;
    if (allAbove(m.roe_series, 3, 0.18)) green.push('ROE bền vững > 18% ba năm');
    if (typeof m.net_debt_ebitda === 'number' && m.net_debt_ebitda < 0)
      green.push('Vị thế tiền mặt ròng (Net cash)');
    if (typeof m.altman_z === 'number' && m.altman_z > 3.5)
      green.push(`Tài chính an toàn — Altman Z ${m.altman_z.toFixed(2)}`);
    if (typeof m.altman_z === 'number' && m.altman_z <= 1.81)
      red.push(`Altman Z ${m.altman_z.toFixed(2)} — vùng cảnh báo phá sản`);
    if (typeof m.net_debt_ebitda === 'number' && m.net_debt_ebitda > 3)
      red.push(`Đòn bẩy cao — Net Debt/EBITDA ${m.net_debt_ebitda.toFixed(1)}x`);
  }
  if (!red.length) {
    if (assessed === 0) red.push('Không đủ dữ liệu để đánh giá forensic');
    else red.push('Không có cờ đỏ trọng yếu');
  }
  const required = 6;
  return {
    green,
    red,
    assessed_criteria: assessed,
    completeness: { assessed, required, complete: assessed >= required },
  };
}
const r = (n: Numeric, d: Numeric) => ratio(n, d);
function piotroski(cur: Period, prev?: Period) {
  if (!prev)
    return {
      score: null,
      criteria: {},
      completeness: { assessed: 0, required: 9, complete: false },
    };
  const roa = r(val(cur, 'npat'), val(cur, 'total_assets')),
    rp = r(val(prev, 'npat'), val(prev, 'total_assets')),
    cr = r(val(cur, 'current_assets'), val(cur, 'current_liabilities')),
    crp = r(val(prev, 'current_assets'), val(prev, 'current_liabilities')),
    gm = r(val(cur, 'gross_profit'), val(cur, 'net_revenue')),
    gmp = r(val(prev, 'gross_profit'), val(prev, 'net_revenue')),
    at = r(val(cur, 'net_revenue'), val(cur, 'total_assets')),
    atp = r(val(prev, 'net_revenue'), val(prev, 'total_assets')),
    cfo = val(cur, 'cfo'),
    npat = val(cur, 'npat'),
    ltd = val(cur, 'lt_debt'),
    ltdp = val(prev, 'lt_debt'),
    shares = val(cur, 'proceeds_from_shares');
  const criteria = {
    roa_positive: roa === null ? null : roa > 0,
    cfo_positive: cfo === null ? null : cfo > 0,
    roa_increasing: roa === null || rp === null ? null : roa > rp,
    accrual_quality: cfo === null || npat === null ? null : cfo > npat,
    lower_leverage: ltd === null || ltdp === null ? null : ltd < ltdp,
    current_ratio_up: cr === null || crp === null ? null : cr > crp,
    no_dilution: shares === null ? null : shares === 0,
    gross_margin_up: gm === null || gmp === null ? null : gm > gmp,
    asset_turnover_up: at === null || atp === null ? null : at > atp,
  };
  const known = Object.values(criteria).filter((value) => value !== null).length;
  return {
    score:
      known === Object.keys(criteria).length
        ? Object.values(criteria).filter(Boolean).length
        : null,
    criteria,
    completeness: {
      assessed: known,
      required: Object.keys(criteria).length,
      complete: known === Object.keys(criteria).length,
    },
  };
}
function beneish(cur: Period, prev?: Period): Numeric {
  if (!prev) return null;
  const aq = (p: Period) => {
      const ca = val(p, 'current_assets'),
        nfa = val(p, 'net_fixed_assets'),
        ta = val(p, 'total_assets');
      return ca === null || nfa === null ? null : ta ? 1 - (ca + nfa) / ta : null;
    },
    dep = (p: Period) => {
      const d = val(p, 'depreciation'),
        n = val(p, 'net_fixed_assets');
      return d === null || n === null || Math.abs(d) + n === 0
        ? null
        : Math.abs(d) / (Math.abs(d) + n);
    },
    sum2 = (a: Numeric, b: Numeric) =>
      a === null && b === null ? null : Math.abs(a ?? 0) + Math.abs(b ?? 0),
    idx = (a: Numeric, b: Numeric) => (b === null || b === 0 || a === null ? null : a / b);
  const dsri = idx(
      r(val(cur, 'trade_receivables'), val(cur, 'net_revenue')),
      r(val(prev, 'trade_receivables'), val(prev, 'net_revenue')),
    ),
    gmi = idx(
      r(val(prev, 'gross_profit'), val(prev, 'net_revenue')),
      r(val(cur, 'gross_profit'), val(cur, 'net_revenue')),
    ),
    aqi = idx(aq(cur), aq(prev)),
    sgi = idx(val(cur, 'net_revenue'), val(prev, 'net_revenue')),
    depi = idx(dep(prev), dep(cur)),
    sgai = idx(
      r(sum2(val(cur, 'selling_expense'), val(cur, 'admin_expense')), val(cur, 'net_revenue')),
      r(sum2(val(prev, 'selling_expense'), val(prev, 'admin_expense')), val(prev, 'net_revenue')),
    ),
    lvgi = idx(
      r(val(cur, 'total_liabilities'), val(cur, 'total_assets')),
      r(val(prev, 'total_liabilities'), val(prev, 'total_assets')),
    ),
    tata =
      val(cur, 'npat') === null || val(cur, 'cfo') === null
        ? null
        : r(val(cur, 'npat')! - val(cur, 'cfo')!, val(cur, 'total_assets'));
  if ([dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata].some((x) => x === null)) return null;
  return (
    -4.84 +
    0.92 * dsri! +
    0.528 * gmi! +
    0.404 * aqi! +
    0.892 * sgi! +
    0.115 * depi! -
    0.172 * sgai! -
    0.327 * lvgi! +
    4.679 * tata!
  );
}

export function buildBctcPayload(
  bs: FinancialRow[],
  is: FinancialRow[],
  cf: FinancialRow[],
  ratioRows: FinancialRow[] = [],
) {
  const template = detectTemplate(is),
    bank = template === 'B',
    periods = buildPeriods(bs, is, cf, bank ? BANK_MAPPING : NONBANK_MAPPING);
  if (!periods.length)
    return {
      template,
      sector: bank ? 'bank' : 'nonbank',
      periods: [],
      snapshot: [],
      modules: [],
      forensic: {
        green: [],
        red: ['Không đủ dữ liệu BCTC'],
        assessed_criteria: 0,
        completeness: { assessed: 0, required: 6, complete: false },
      },
      flags: [],
      trinity: {},
      blind_spots: [],
      subsector: null,
      valuation: null,
      meta: { frequency_assumptions: [], revenue_growth_comparison: null },
    };
  const rawCur = periods[0]!,
    rawYearAgo = yearAgoPeriod(periods, 0),
    prev = previousBalancePeriod(periods, 0),
    frequency = performancePeriods(periods),
    analysisPeriods = frequency.periods,
    cur = analysisPeriods[0]!;
  const values: Record<string, Numeric> = bank
    ? {
        nim: nim(cur, prev),
        roe: roeBank(cur, prev),
        ldr: ldr(cur),
        equity_ratio: equityRatio(cur),
        llr_loans: llrLoans(cur),
        cir: cir(cur),
      }
    : {
        revenue_growth: revenueGrowth(rawCur, rawYearAgo),
        gross_margin: grossMargin(cur),
        roe: roeNonbank(cur, prev),
        net_debt_ebitda: netDebtEbitda(cur),
        fcf_margin: fcfMargin(cur),
        altman_z: altmanZ(cur),
      };
  const defs = bank
    ? [
        ['nim', 'NIM', '%'],
        ['roe', 'ROE', '%'],
        ['ldr', 'LDR', '%'],
        ['equity_ratio', 'VCSH / Tổng TS', '%'],
        ['llr_loans', 'Dự phòng / Cho vay', '%'],
        ['cir', 'CIR', '%'],
      ]
    : [
        ['revenue_growth', 'Tăng trưởng Doanh thu', '%'],
        ['gross_margin', 'Biên Lợi nhuận gộp', '%'],
        ['roe', 'ROE', '%'],
        ['net_debt_ebitda', 'Nợ ròng / EBITDA', 'x'],
        ['fcf_margin', 'Biên FCF', '%'],
        ['altman_z', 'Điểm Z Altman', ''],
      ];
  const snapshot = defs.map(([key, label, unit]) => ({
    key,
    label,
    unit,
    value: values[key!],
    status: classify(key!, values[key!] ?? null),
  }));
  const dayBasis = frequency.assumptions[0]?.mode === 'quarter_annualized_estimate' ? 91.25 : 365;
  const modules = bank
    ? [
        { id: 'toi_mix', title: 'Cơ cấu Thu nhập (TOI)', type: 'ratios', data: toiMix(cur) },
        {
          id: 'nim_decomp',
          title: 'Phân rã NIM',
          type: 'ratios',
          data: nimDecomposition(cur, prev),
        },
        {
          id: 'ppop_cor',
          title: 'PPOP & Chi phí Dự phòng',
          type: 'ratios',
          data: ppopCor(cur, prev),
        },
        {
          id: 'bank_dupont',
          title: 'DuPont Ngân hàng',
          type: 'ratios',
          data: bankDupont(cur, prev),
        },
      ]
    : [
        {
          id: 'common_size',
          title: 'Common-Size KQKD',
          type: 'common_size_table',
          data: commonSizeTable(analysisPeriods),
        },
        {
          id: 'wcc',
          title: 'Chu kỳ Vốn lưu động',
          type: 'wcc',
          data: workingCapitalCycleSeries(analysisPeriods, dayBasis),
        },
        {
          id: 'cf_bridge',
          title: 'Cầu nối Dòng tiền',
          type: 'cf_bridge',
          data: cashFlowBridge(cur),
        },
        {
          id: 'dupont',
          title: 'DuPont 5 bước',
          type: 'dupont',
          data: dupontDecomposition(analysisPeriods),
        },
      ];
  const roeFn = bank ? roeBank : roeNonbank,
    metrics = {
      template,
      roe_series: analysisPeriods
        .slice(0, 3)
        .map((p, i) => roeFn(p, previousBalancePeriod(periods, i)))
        .filter((x) => x !== null),
      net_debt_ebitda: values.net_debt_ebitda,
      altman_z: values.altman_z,
      nim_series: bank
        ? analysisPeriods
            .slice(0, 3)
            .map((p, i) => nim(p, previousBalancePeriod(periods, i)))
            .filter((x) => x !== null)
        : null,
      fcf_margin_series: bank
        ? null
        : analysisPeriods
            .slice(0, 3)
            .map(fcfMargin)
            .filter((x) => x !== null),
      dso_change_2y: bank
        ? null
        : (() => {
            const newest = analysisPeriods[0],
              oldest = analysisPeriods[Math.min(2, analysisPeriods.length - 1)];
            const newestDso =
                newest && val(newest, 'net_revenue')
                  ? ratio(val(newest, 'trade_receivables'), val(newest, 'net_revenue'))
                  : null,
              oldestDso =
                oldest && val(oldest, 'net_revenue')
                  ? ratio(val(oldest, 'trade_receivables'), val(oldest, 'net_revenue'))
                  : null;
            return newestDso !== null && oldestDso !== null && oldestDso !== 0
              ? newestDso / oldestDso - 1
              : null;
          })(),
      gross_margin_delta: bank
        ? null
        : (() => {
            const newest = analysisPeriods[0],
              oldest = analysisPeriods[Math.min(4, analysisPeriods.length - 1)];
            const newestMargin = newest ? grossMargin(newest) : null,
              oldestMargin = oldest ? grossMargin(oldest) : null;
            return newestMargin !== null && oldestMargin !== null
              ? newestMargin - oldestMargin
              : null;
          })(),
      cir: values.cir,
      ldr: values.ldr,
      equity_ratio: values.equity_ratio,
      llr_loans: values.llr_loans,
    };
  const flags = sanity(values),
    bf = balanceFlag(rawCur);
  if (bf) flags.push(bf);
  const pc = ppopCor(cur, prev),
    bd = bankDupont(cur, prev),
    ta = val(cur, 'total_assets');
  const valuation = bank
    ? valuationBank(ratioRows, {
        nim: values.nim,
        cost_of_risk: pc.cost_of_risk,
        roa: bd.roa,
        equity_multiplier: bd.equity_multiplier,
        earning_assets_ratio: r(earningAssets(cur), ta),
        loans_ratio: r(val(cur, 'customer_loans'), ta),
      })
    : valuationNonbank(ratioRows);
  let subsector = null;
  if (!bank) {
    const w = workingCapitalCycle(cur, prev, dayBasis),
      s = detectSubsector(cur, w.ccc);
    subsector = subsectorSpotlight(cur, s);
  }
  return {
    template,
    sector: bank ? 'bank' : 'nonbank',
    periods: periods.map((p) => `${p.length < 5 ? `Q${p.length}/` : ''}${p.year}`),
    snapshot,
    modules,
    forensic: forensic(metrics, bank),
    flags,
    trinity: {
      altman_z: bank ? null : altmanZ(cur),
      piotroski_f: piotroski(rawCur, rawYearAgo),
      beneish_m: beneish(rawCur, rawYearAgo),
    },
    blind_spots: bank ? BANK_BLIND_SPOTS : [],
    subsector,
    valuation,
    meta: {
      frequency_assumptions: frequency.assumptions,
      revenue_growth_comparison: rawYearAgo
        ? `${rawCur.length < 5 ? `Q${rawCur.length}/` : ''}${rawCur.year} vs ${rawYearAgo.length < 5 ? `Q${rawYearAgo.length}/` : ''}${rawYearAgo.year}`
        : null,
    },
  };
}

export { piotroski as piotroskiF, beneish as beneishM };
