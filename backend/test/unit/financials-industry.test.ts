import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INDUSTRY,
  INDUSTRIES,
  INDUSTRY_LABELS,
  detectIndustry,
  industrySignals,
  isIndustry,
} from '../../src/modules/financials/financials.industry.js';

type Row = Record<string, unknown>;

const META = { year_report: 2024, length_report: 4, public_date: '2025-01-28T00:00:00' };

/**
 * VCI IQ returns every symbol with the union of the four template columns; columns that do not
 * belong to the template of the company are zero. These fixtures keep that shape: the signature
 * lines of the own template are non-zero, every other template's lines are 0.
 */
const union = (template: Row): Row => ({
  ...META,
  // enterprise lines (also shared by securities as total revenue etc.)
  isa3: 0,
  isa4: 0,
  isa20: 0,
  isa22: 0,
  // bank lines
  isb25: 0,
  isb26: 0,
  isb27: 0,
  isb33: 0,
  isb34: 0,
  isb35: 0,
  isb36: 0,
  isb37: 0,
  isb38: 0,
  isb39: 0,
  isb40: 0,
  isb41: 0,
  // securities lines
  iss42: 0,
  iss115: 0,
  iss120: 0,
  iss133: 0,
  // insurance lines
  isi51: 0,
  isi74: 0,
  isi97: 0,
  isi105: 0,
  ...template,
});

/** Bank (VCB, MBB) and finance company (EVF): credit-institution template, isb25-isb41. */
const BANK_ROW = union({
  isb25: 90_000,
  isb26: -45_000,
  isb27: 45_000,
  isb33: 12_000,
  isb38: 60_000,
  isb39: -20_000,
  isb40: 40_000,
  isb41: -8_000,
  isa22: 25_000,
});
const FINANCE_COMPANY_ROW = union({
  isb25: 3_000,
  isb26: -1_800,
  isb27: 1_200,
  isb38: 1_500,
  isb39: -700,
  isb40: 800,
  isb41: -200,
  isa22: 300,
});
/** Securities company (SSI, VND): iss* lines; total revenue sits in isa3. */
const SECURITIES_ROW = union({
  isa3: 9_000,
  isa4: -4_000,
  isa22: 2_500,
  iss42: 1_500,
  iss115: 2_000,
  iss120: 1_800,
  iss133: -600,
});
/** Insurer (BVH, PVI, BMI): isi* lines. */
const INSURANCE_ROW = union({
  isa22: 1_200,
  isi51: 30_000,
  isi74: -2_000,
  isi97: 1_000,
  isi105: 24_000,
});
/** Manufacturer / retailer / developer (FPT, HPG, VHM): enterprise template only. */
const ENTERPRISE_ROW = union({ isa3: 70_000, isa4: -45_000, isa20: 9_000, isa22: 8_000 });

describe('industry labels', () => {
  it('lists the four industries with their display labels', () => {
    expect(INDUSTRIES).toEqual(['thuong', 'nh', 'ck', 'bh']);
    expect(DEFAULT_INDUSTRY).toBe('thuong');
    expect(INDUSTRY_LABELS).toEqual({
      thuong: 'Doanh nghiệp sản xuất',
      nh: 'Ngân hàng',
      ck: 'Chứng khoán',
      bh: 'Bảo hiểm',
    });
    expect(INDUSTRIES.every(isIndustry)).toBe(true);
    expect(isIndustry('ban')).toBe(false);
    expect(isIndustry(undefined)).toBe(false);
    expect(isIndustry(3)).toBe(false);
  });
});

describe('detectIndustry (spec §1.3: from the financial statement template)', () => {
  it('maps the credit-institution template to nh, banks and finance companies alike', () => {
    expect(detectIndustry([BANK_ROW, BANK_ROW])).toBe('nh');
    expect(detectIndustry([FINANCE_COMPANY_ROW])).toBe('nh');
  });

  it('maps the securities template to ck', () => {
    expect(detectIndustry([SECURITIES_ROW])).toBe('ck');
  });

  it('maps the insurance template to bh', () => {
    expect(detectIndustry([INSURANCE_ROW])).toBe('bh');
  });

  it('keeps every enterprise-template company in thuong', () => {
    expect(detectIndustry([ENTERPRISE_ROW])).toBe('thuong');
  });

  it('treats an empty or unreadable statement as thuong', () => {
    expect(detectIndustry([])).toBe('thuong');
    expect(detectIndustry({})).toBe('thuong');
    expect(detectIndustry({ years: [], quarters: [] })).toBe('thuong');
    expect(detectIndustry([{ ...META }])).toBe('thuong');
    // A symbol with no known template: only zero / missing / non-numeric signature cells.
    expect(
      detectIndustry([
        union({}),
        { isb27: null, iss42: 'n/a', isi97: undefined, isb38: Number.NaN },
      ]),
    ).toBe('thuong');
  });

  it('reads the statement either as a row list or as the {years, quarters} sections of VCI', () => {
    expect(detectIndustry({ years: [BANK_ROW], quarters: [] })).toBe('nh');
    expect(detectIndustry({ quarters: [SECURITIES_ROW] })).toBe('ck');
    expect(detectIndustry({ years: [INSURANCE_ROW], quarters: [INSURANCE_ROW] })).toBe('bh');
    expect(detectIndustry({ years: [ENTERPRISE_ROW], quarters: [ENTERPRISE_ROW] })).toBe('thuong');
  });

  it('counts numeric strings but never zero cells', () => {
    expect(detectIndustry([union({ isb27: '45000', isb38: '60000' })])).toBe('nh');
    expect(detectIndustry([union({ isb27: '0', iss42: '0.0', isi97: '' })])).toBe('thuong');
  });

  it('ignores isb34-isb36, which other templates also use (not signature lines)', () => {
    expect(detectIndustry([union({ isb34: 500, isb35: 300, isb36: -100, isa3: 5_000 })])).toBe(
      'thuong',
    );
  });

  it('does not need the latest period: any period with the template lines decides', () => {
    // The newest quarter is empty (just published, all zero); older periods carry the template.
    expect(detectIndustry({ quarters: [union({}), BANK_ROW, BANK_ROW] })).toBe('nh');
  });

  it('lets the template with the most non-zero signature lines win a mixed history', () => {
    const rows = [SECURITIES_ROW, BANK_ROW, BANK_ROW];
    const signals = industrySignals(rows);
    expect(signals.nh).toBeGreaterThan(signals.ck);
    expect(detectIndustry(rows)).toBe('nh');
  });

  it('exposes the signal counts of each template', () => {
    expect(industrySignals([ENTERPRISE_ROW])).toEqual({ nh: 0, ck: 0, bh: 0 });
    expect(industrySignals([INSURANCE_ROW])).toEqual({ nh: 0, ck: 0, bh: 4 });
    expect(industrySignals([SECURITIES_ROW])).toEqual({ nh: 0, ck: 4, bh: 0 });
    expect(industrySignals([BANK_ROW])).toEqual({ nh: 8, ck: 0, bh: 0 });
  });
});
