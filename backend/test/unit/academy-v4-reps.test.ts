import { describe, expect, it } from 'vitest';

import { chartModelSchema } from '../../src/modules/academy/content/v4/schema.js';
import type { ChartModel } from '../../src/modules/academy/content/v4/schema.js';
import { REPRESENTATIVE_BUILDERS } from '../../scripts/academy-v4-import/charts/rep.js';

type FundamentalKind = 'A' | 'B' | 'C' | 'D' | 'E1' | 'E2' | 'F' | 'F2';

/**
 * Dashboard spec §8 (kind of every metric), by lesson position in the v4 catalog:
 * Chương 8 = 17 chung, Chương 9 = 16 sản xuất, Chương 10 = 11 ngân hàng, Chương 11 = 10 chứng khoán,
 * Chương 12 = 8 bảo hiểm. Written out id by id on purpose: it is the contract, not derived from the data.
 */
const KIND_OF: Readonly<Record<string, FundamentalKind>> = {
  // 8.1 Phân tích cơ bản chung
  'c8l1-rep': 'A', // Tăng trưởng doanh thu
  'c8l2-rep': 'A', // Tăng trưởng LNST
  'c8l3-rep': 'A', // Tăng trưởng EPS
  'c8l4-rep': 'D', // Revenue CAGR 3Y
  'c8l5-rep': 'D', // Net Profit CAGR 3Y
  'c8l6-rep': 'D', // EPS CAGR 3Y
  'c8l7-rep': 'E2', // Profit Positive Streak
  'c8l8-rep': 'E1', // Revenue Growth Stability
  'c8l9-rep': 'E1', // Margin Stability
  'c8l10-rep': 'E1', // EPS Stability
  'c8l11-rep': 'B', // ROE
  'c8l12-rep': 'B', // ROA
  'c8l13-rep': 'B', // Biên lợi nhuận ròng
  'c8l14-rep': 'F', // P/E
  'c8l15-rep': 'F', // P/B
  'c8l16-rep': 'F', // P/S
  'c8l17-rep': 'F2', // PEG
  // 8.2 Doanh nghiệp sản xuất
  'c9l1-rep': 'B', // Biên lợi nhuận gộp
  'c9l2-rep': 'B', // ROIC
  'c9l3-rep': 'E1', // ROIC Stability
  'c9l4-rep': 'B', // Asset Turnover
  'c9l5-rep': 'C', // Cash Conversion Cycle
  'c9l6-rep': 'B', // D/E
  'c9l7-rep': 'B', // Current Ratio
  'c9l8-rep': 'B', // Interest Coverage
  'c9l9-rep': 'B', // Net Debt / EBITDA
  'c9l10-rep': 'B', // CFO Margin
  'c9l11-rep': 'B', // CFO / LNST
  'c9l12-rep': 'B', // Capex / Revenue
  'c9l13-rep': 'B', // FCF Margin
  'c9l14-rep': 'E2', // FCF Positive Streak
  'c9l15-rep': 'F', // EV / EBITDA
  'c9l16-rep': 'F', // FCF Yield
  // 8.3 Ngân hàng
  'c10l1-rep': 'B', // NIM
  'c10l2-rep': 'B', // Lợi suất tài sản sinh lãi và chi phí vốn (2 đường)
  'c10l3-rep': 'B', // CIR
  'c10l4-rep': 'B', // Tỷ trọng thu nhập ngoài lãi
  'c10l5-rep': 'A', // Tăng trưởng lợi nhuận trước dự phòng
  'c10l6-rep': 'B', // Chi phí tín dụng
  'c10l7-rep': 'B', // Tỷ lệ dự phòng / Dư nợ
  'c10l8-rep': 'A', // Tăng trưởng tín dụng và huy động (2 đường)
  'c10l9-rep': 'B', // LDR
  'c10l10-rep': 'B', // Lãi dự thu / Dư nợ
  'c10l11-rep': 'B', // VCSH / Tổng tài sản
  // 8.4 Chứng khoán
  'c11l1-rep': 'B', // Cơ cấu doanh thu hoạt động (4 mảng)
  'c11l2-rep': 'B', // Biên lợi nhuận hoạt động
  'c11l3-rep': 'A', // Tăng trưởng dư nợ cho vay
  'c11l4-rep': 'B', // Dư nợ cho vay / VCSH
  'c11l5-rep': 'B', // Lợi suất cho vay
  'c11l6-rep': 'B', // Biên lợi nhuận môi giới
  'c11l7-rep': 'B', // Tỷ trọng tài sản tự doanh
  'c11l8-rep': 'B', // Hiệu suất tự doanh
  'c11l9-rep': 'B', // Chi phí hoạt động / Doanh thu hoạt động
  'c11l10-rep': 'B', // Nợ vay / VCSH
  // 8.5 Bảo hiểm
  'c12l1-rep': 'A', // Tăng trưởng doanh thu phí bảo hiểm gốc
  'c12l2-rep': 'B', // Tỷ lệ giữ lại
  'c12l3-rep': 'B', // Tỷ lệ bồi thường
  'c12l4-rep': 'B', // Tỷ lệ chi phí
  'c12l5-rep': 'B', // Combined ratio (mốc 100%)
  'c12l6-rep': 'B', // Lợi suất đầu tư
  'c12l7-rep': 'B', // Cơ cấu lợi nhuận
  'c12l8-rep': 'B', // Dự phòng nghiệp vụ / VCSH
};

const EXPECTED_IDS = Object.keys(KIND_OF);

/** Lesson counts per chapter of the v4 catalog (chapter exams excluded). */
const LESSONS_PER_CHAPTER: Readonly<Record<number, number>> = {
  8: 17,
  9: 16,
  10: 11,
  11: 10,
  12: 8,
};

/** Spec §8.3: the only two metrics that draw two lines on the upper panel. */
const TWO_LINE_IDS = ['c10l2-rep', 'c10l8-rep'];

/** Spec §8: stacked lower bars (the others are grouped). */
const STACKED_IDS = ['c9l1-rep', 'c10l4-rep', 'c11l1-rep', 'c11l2-rep', 'c11l7-rep', 'c12l5-rep'];

/** Lower bar counts that are not the default one or two. */
const SUB_SERIES_COUNT: Readonly<Record<string, number>> = {
  'c9l5-rep': 3, // Cash Conversion Cycle: ba cột số ngày
  'c9l13-rep': 3, // FCF Margin: CFO + Capex + FCF
  'c11l1-rep': 4, // Cơ cấu doanh thu hoạt động: bốn mảng
  'c11l7-rep': 3, // Tỷ trọng tài sản tự doanh: FVTPL + AFS + HTM
};

/** Banded charts with one lower bar series (spec §8 "Cột bên dưới" names one component). */
const ONE_SUB_SERIES_IDS = [
  'c8l11-rep',
  'c8l12-rep',
  'c8l13-rep',
  'c9l2-rep',
  'c9l10-rep',
  'c9l12-rep',
  'c10l1-rep',
  'c10l6-rep',
  'c10l7-rep',
  'c10l10-rep',
  'c10l11-rep',
  'c11l5-rep',
  'c11l8-rep',
  'c12l6-rep',
];

type Fundamental = Extract<ChartModel, { kind: 'fundamental' }>;

function build(id: string): Fundamental {
  const builder = REPRESENTATIVE_BUILDERS[id];
  expect(builder, `no builder for ${id}`).toBeTypeOf('function');
  const model = (builder as () => ChartModel)();
  expect(model.kind).toBe('fundamental');
  return model as Fundamental;
}

describe('academy v4 representative charts (62, Chương 8-12)', () => {
  it('has exactly one builder per lesson of Chương 8-12 (62 ids)', () => {
    const lessons: string[] = [];
    for (const [chapter, count] of Object.entries(LESSONS_PER_CHAPTER))
      for (let l = 1; l <= count; l += 1) lessons.push(`c${chapter}l${l}-rep`);
    expect(lessons).toHaveLength(62);
    expect(Object.keys(REPRESENTATIVE_BUILDERS).sort()).toEqual([...EXPECTED_IDS].sort());
    expect([...EXPECTED_IDS].sort()).toEqual([...lessons].sort());
  });

  it.each(EXPECTED_IDS)('%s builds a schema-valid, deterministic model of the spec kind', (id) => {
    const model = build(id);
    const parsed = chartModelSchema.safeParse(model);
    expect(
      parsed.success,
      parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 4)),
    ).toBe(true);
    expect(JSON.stringify(build(id))).toBe(JSON.stringify(model));
    expect(model.chart.kind).toBe(KIND_OF[id]);
  });

  it.each(EXPECTED_IDS)('%s has no blank, dash or arrow glyph in any visible name', (id) => {
    const { chart, alt } = build(id);
    const names = [
      chart.name,
      alt,
      chart.legendNote ?? 'x',
      ...chart.main.map((s) => s.name),
      ...(chart.sub?.series.map((s) => s.name) ?? []),
    ];
    for (const name of names) {
      expect(name.trim().length).toBeGreaterThan(0);
      expect(name).not.toMatch(/[–—✓✔←-↓↗↘]/);
    }
  });

  it('draws two main lines only for the metrics the spec marks "2 đường"', () => {
    for (const id of EXPECTED_IDS) {
      const { chart } = build(id);
      expect(chart.main.length, id).toBe(TWO_LINE_IDS.includes(id) ? 2 : 1);
    }
    const yields = build('c10l2-rep').chart;
    expect(yields.main.map((s) => s.name)).toEqual(['Lợi suất tài sản sinh lãi', 'Chi phí vốn']);
    const growth = build('c10l8-rep').chart;
    expect(growth.main.map((s) => s.name)).toEqual([
      'Tăng trưởng tín dụng',
      'Tăng trưởng huy động',
    ]);
    for (const chart of [yields, growth]) {
      expect(chart.main[0]?.v.length).toBe(chart.labels.length);
      expect(chart.main[1]?.v.length).toBe(chart.labels.length);
      expect(chart.main[0]?.v).not.toEqual(chart.main[1]?.v);
    }
  });

  it('gives Combined ratio the dashed reference line at 100 and no other chart a B reference', () => {
    expect(build('c12l5-rep').chart.ref).toBe(100);
    for (const id of EXPECTED_IDS) {
      const { chart } = build(id);
      if (id === 'c12l5-rep') continue;
      if (chart.kind === 'F2') expect(chart.ref, id).toBe(1);
      else expect(chart.ref, id).toBeUndefined();
    }
    const combined = build('c12l5-rep').chart;
    expect(combined.sub?.type).toBe('stacked');
    expect(combined.sub?.series.map((s) => s.name)).toEqual(['Tỷ lệ bồi thường', 'Tỷ lệ chi phí']);
    expect(combined.sub?.unit).toBe('%');
    // The two stacked ratios add up to the line (bồi thường + chi phí = combined ratio).
    const line = combined.main[0]?.v ?? [];
    const [loss, cost] = combined.sub?.series ?? [];
    line.forEach((v, i) => {
      const sum = (loss?.v[i] ?? 0) + (cost?.v[i] ?? 0);
      expect(Math.abs((v ?? 0) - sum)).toBeLessThan(0.01);
    });
  });

  it('draws four lower bar series for Cơ cấu doanh thu hoạt động', () => {
    const chart = build('c11l1-rep').chart;
    expect(chart.sub?.series.map((s) => s.name)).toEqual([
      'Môi giới',
      'Cho vay margin',
      'Tự doanh',
      'Ngân hàng đầu tư và khác',
    ]);
    expect(chart.sub?.type).toBe('stacked');
    expect(chart.main[0]?.name).toBe('Tỷ trọng tự doanh');
    // The line is the proprietary share of the four stacked segments.
    const [broker, margin, prop, bank] = chart.sub?.series ?? [];
    chart.main[0]?.v.forEach((v, i) => {
      const total =
        (broker?.v[i] ?? 0) + (margin?.v[i] ?? 0) + (prop?.v[i] ?? 0) + (bank?.v[i] ?? 0);
      expect(Math.abs((v ?? 0) - (100 * (prop?.v[i] ?? 0)) / total)).toBeLessThan(0.05);
    });
  });

  it('keeps the lower-bar shape of every banded chart (count and stacked or grouped)', () => {
    for (const id of EXPECTED_IDS) {
      const { chart } = build(id);
      if (!chart.sub) continue;
      const n = SUB_SERIES_COUNT[id] ?? (ONE_SUB_SERIES_IDS.includes(id) ? 1 : 2);
      expect(chart.sub.series.length, id).toBe(n);
      expect(chart.sub.type, id).toBe(STACKED_IDS.includes(id) ? 'stacked' : 'grouped');
      for (const s of chart.sub.series)
        expect(s.v.length, `${id} ${s.name}`).toBe(chart.labels.length);
    }
  });

  it('puts sub bars on A, B and C only, with the right fixed-kind fields', () => {
    for (const id of EXPECTED_IDS) {
      const { chart } = build(id);
      const banded = chart.kind === 'A' || chart.kind === 'B' || chart.kind === 'C';
      expect(!!chart.sub, id).toBe(banded);
      const fixed = chart.kind === 'D' || chart.kind === 'E1' || chart.kind === 'E2';
      expect(chart.hero !== undefined, id).toBe(fixed);
      expect(chart.mainUnit !== undefined, id).toBe(fixed);
    }
  });

  it('applies the Dashboard wording overrides at the v4 positions', () => {
    expect(build('c8l11-rep').chart.main[0]?.name).toBe('ROE (4 quý, cổ đông công ty mẹ)');
    expect(build('c8l11-rep').chart.name).toBe('ROE');
    expect(build('c9l9-rep').chart.legendNote).toBe('Tiền gồm đầu tư tài chính ngắn hạn');
    expect(build('c9l9-rep').chart.name).toBe('Net Debt / EBITDA');
    for (const id of EXPECTED_IDS)
      if (id !== 'c9l9-rep') expect(build(id).chart.legendNote, id).toBeUndefined();
  });

  it('reproduces the number shown on the card (CAGR, streak, deviation, last value)', () => {
    expect(build('c8l4-rep').chart.hero).toBeCloseTo(9.5568, 3);
    expect(build('c8l5-rep').chart.hero).toBeCloseTo(11.271, 3);
    expect(build('c8l6-rep').chart.hero).toBeCloseTo(8.0901, 3);
    expect(build('c8l7-rep').chart.hero).toBe(5);
    expect(build('c9l14-rep').chart.hero).toBe(4);
    expect(build('c8l8-rep').chart.hero).toBeCloseTo(4.92, 1);
    expect(build('c8l10-rep').chart.hero).toBeCloseTo(24.35, 1);
    expect(build('c8l1-rep').chart.main[0]?.v.at(-1)).toBeCloseTo(10.19, 2);
    expect(build('c11l3-rep').chart.main[0]?.v.at(-1)).toBeCloseTo(-2.255, 2);
    expect(build('c8l17-rep').chart.main[0]?.v.at(-1)).toBeCloseTo(0.4051, 3);
  });

  it('dates the daily valuation series on trading days, 782 sessions for P/E, P/B, P/S, EV/EBITDA, FCF Yield', () => {
    for (const id of ['c8l14-rep', 'c8l15-rep', 'c8l16-rep', 'c9l15-rep', 'c9l16-rep']) {
      const { chart } = build(id);
      expect(chart.kind).toBe('F');
      expect(chart.labels.length).toBe(782);
      expect(chart.main[0]?.v.length).toBe(782);
      expect(chart.labels[0]).toBe('2023-07-03');
      for (const date of chart.labels) {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        expect(weekday === 0 || weekday === 6, date).toBe(false);
      }
    }
  });

  it('keeps every Chương 8-12 line value finite (no blank, NaN or zero standing in for a period)', () => {
    for (const id of EXPECTED_IDS) {
      const { chart } = build(id);
      for (const s of [...chart.main, ...(chart.sub?.series ?? [])])
        for (const v of s.v) expect(Number.isFinite(v), `${id} ${s.name}`).toBe(true);
    }
  });
});
