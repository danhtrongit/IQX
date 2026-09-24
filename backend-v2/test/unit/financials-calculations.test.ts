import { describe, expect, it } from 'vitest';
import { buildBctcPayload } from '../../src/modules/financials/bctc.js';
import { assembleDashboard } from '../../src/modules/financials/dashboard.js';
import { workingCapitalCycle } from '../../src/modules/financials/financials.calculations.js';

const nonbank = {
  balance_sheet: [
    {
      year_report: 2024,
      length_report: 5,
      bsa1: 500,
      bsa2: 100,
      bsa5: 20,
      bsa9: 80,
      bsa16: 120,
      bsa17: -5,
      bsa29: 300,
      bsa53: 1000,
      bsa54: 500,
      bsa55: 220,
      bsa56: 100,
      bsa57: 80,
      bsa71: 100,
      bsa78: 500,
      bsa80: 300,
      bsa90: 100,
    },
    {
      year_report: 2023,
      length_report: 5,
      bsa1: 450,
      bsa2: 90,
      bsa5: 20,
      bsa9: 70,
      bsa16: 110,
      bsa17: -4,
      bsa29: 280,
      bsa53: 900,
      bsa54: 450,
      bsa55: 200,
      bsa56: 90,
      bsa57: 70,
      bsa71: 90,
      bsa78: 450,
      bsa80: 300,
      bsa90: 80,
    },
  ],
  income_statement: [
    {
      year_report: 2024,
      length_report: 5,
      isa3: 1000,
      isa4: -600,
      isa5: 400,
      isa8: -20,
      isa9: -40,
      isa10: -50,
      isa11: 310,
      isa16: 290,
      isa20: 232,
      isa22: 232,
    },
    {
      year_report: 2023,
      length_report: 5,
      isa3: 800,
      isa4: -500,
      isa5: 300,
      isa8: -18,
      isa9: -35,
      isa10: -45,
      isa11: 220,
      isa16: 205,
      isa20: 164,
      isa22: 164,
    },
  ],
  cash_flow: [
    { year_report: 2024, length_report: 5, cfa2: 40, cfa3: 5, cfa18: 250, cfa19: -80, cfa27: 0 },
    { year_report: 2023, length_report: 5, cfa2: 35, cfa3: 4, cfa18: 170, cfa19: -70, cfa27: 0 },
  ],
};

const bank = {
  balance_sheet: [
    {
      year_report: 2024,
      length_report: 5,
      bsa2: 20,
      bsb97: 100,
      bsb98: 100,
      bsb99: 50,
      bsb104: 700,
      bsb105: -14,
      bsb106: 100,
      bsa53: 1000,
      bsa54: 930,
      bsb111: 20,
      bsb112: 50,
      bsb113: 700,
      bsb116: 40,
      bsa78: 70,
      bsa80: 50,
      bsa90: 10,
    },
  ],
  income_statement: [
    {
      year_report: 2024,
      length_report: 5,
      isb25: 100,
      isb26: -40,
      isb27: 60,
      isb30: 10,
      isb31: 2,
      isb32: 2,
      isb33: 1,
      isb36: 1,
      isb38: 76,
      isb39: -30,
      isb40: 46,
      isb41: -8,
      isa16: 38,
      isa19: -8,
      isa20: 30,
      isa22: 30,
    },
  ],
  cash_flow: [],
};

describe('financials deterministic calculations', () => {
  it('computes non-bank annual KPIs and modules', () => {
    const payload = buildBctcPayload(
      nonbank.balance_sheet,
      nonbank.income_statement,
      nonbank.cash_flow,
    );
    expect(payload.template).toBe('A');
    expect(payload.snapshot.find((x) => x.key === 'revenue_growth')?.value).toBeCloseTo(0.25);
    expect(payload.modules.map((x) => x.id)).toEqual(['common_size', 'wcc', 'cf_bridge', 'dupont']);
    expect(payload.trinity.piotroski_f?.score).toBe(8);
    expect(payload.trinity.piotroski_f?.completeness).toEqual({
      assessed: 9,
      required: 9,
      complete: true,
    });
  });

  it('computes bank KPIs and exposes bank-specific blind spots', () => {
    const payload = buildBctcPayload(bank.balance_sheet, bank.income_statement, bank.cash_flow);
    expect(payload.template).toBe('B');
    expect(payload.snapshot.find((x) => x.key === 'nim')?.value).toBeGreaterThan(0);
    expect(payload.modules.map((x) => x.id)).toEqual([
      'toi_mix',
      'nim_decomp',
      'ppop_cor',
      'bank_dupont',
    ]);
    expect(payload.blind_spots).toHaveLength(4);
    const provision = payload.modules.find((x) => x.id === 'ppop_cor')?.data as {
      provision_ppop: number;
      cost_of_risk: number;
    };
    expect(provision.provision_ppop).toBeGreaterThan(0);
    expect(provision.cost_of_risk).toBeGreaterThan(0);
  });

  it('keeps missing metrics explicitly null and dashboard shape stable', () => {
    const payload = buildBctcPayload([], [], []);
    expect(payload.periods).toEqual([]);
    const dashboard = assembleDashboard([], [], [], [], {}, 'ABC');
    expect(dashboard.hero.ticker).toBe('ABC');
    expect(dashboard.meta.periods).toEqual([]);
  });

  it('does not convert unknown forensic criteria into a clean bill of health', () => {
    const payload = buildBctcPayload(
      [{ year_report: 2024, length_report: 5, bsa53: 100 }],
      [{ year_report: 2024, length_report: 5 }],
      [],
    );
    expect(payload.forensic.red).toContain('Không đủ dữ liệu để đánh giá forensic');
    expect(payload.forensic.red).not.toContain('Không có cờ đỏ trọng yếu');
    expect(payload.forensic.completeness).toMatchObject({ assessed: 0, complete: false });
    expect(payload.trinity.piotroski_f?.score).toBeNull();
    expect(payload.trinity.piotroski_f?.completeness).toEqual({
      assessed: 0,
      required: 9,
      complete: false,
    });
  });

  it('preserves quarterly period identity instead of mixing annual rows', () => {
    const payload = buildBctcPayload(
      [{ year_report: 2024, length_report: 1, bsa53: 100, bsa54: 50, bsa78: 50 }],
      [{ year_report: 2024, length_report: 1, isa3: 100, isa5: 30, isa20: 10, isa22: 10 }],
      [{ year_report: 2024, length_report: 1, cfa18: 12, cfa19: -2 }],
    );
    expect(payload.periods).toEqual(['Q1/2024']);
    expect(payload.snapshot.find((x) => x.key === 'revenue_growth')?.value).toBeNull();
    expect(payload.meta.frequency_assumptions[0]).toMatchObject({
      mode: 'quarter_annualized_estimate',
      estimated: true,
      flow_multiplier: 4,
    });
    expect(
      workingCapitalCycle(
        {
          year: 2024,
          length: 1,
          values: {
            net_revenue: 100,
            cogs: -60,
            trade_receivables: 25,
            inventory_gross: 10,
            trade_payables: 5,
          },
        },
        undefined,
        91.25,
      ).dso,
    ).toBeCloseTo(22.8125);
  });

  it('uses the same quarter last year for growth, never the prior quarter', () => {
    const income = [
      { year_report: 2024, length_report: 4, isa3: 120, isa5: 40, isa20: 12, isa22: 12 },
      { year_report: 2024, length_report: 3, isa3: 110, isa5: 35, isa20: 11, isa22: 11 },
      { year_report: 2024, length_report: 2, isa3: 105, isa5: 34, isa20: 10, isa22: 10 },
      { year_report: 2024, length_report: 1, isa3: 100, isa5: 32, isa20: 9, isa22: 9 },
      { year_report: 2023, length_report: 4, isa3: 100, isa5: 30, isa20: 8, isa22: 8 },
    ];
    const balances = income.map((row) => ({
      year_report: row.year_report,
      length_report: row.length_report,
      bsa53: 1000,
      bsa54: 500,
      bsa78: 500,
    }));
    const payload = buildBctcPayload(balances, income, []);
    expect(payload.snapshot.find((x) => x.key === 'revenue_growth')?.value).toBeCloseTo(0.2);
    expect(payload.meta.revenue_growth_comparison).toBe('Q4/2024 vs Q4/2023');
    expect(payload.meta.frequency_assumptions[0]).toMatchObject({
      mode: 'quarter_ttm',
      estimated: false,
    });
  });
});
