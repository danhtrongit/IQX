import { describe, expect, it } from 'vitest';
import {
  BROKER_DISPLAY_NAMES,
  normalizeBroker,
} from '../../src/modules/research/sources/broker-aliases.js';
import { parseTargetPriceVnd } from '../../src/modules/research/sources/target-parse.js';

describe('parseTargetPriceVnd', () => {
  it.each([
    ['DCM: Khuyến nghị MUA với giá mục tiêu 46,800 đồng/cổ phiếu', 46800],
    ['VNM: Khuyến nghị TÍCH LŨY với giá mục tiêu 59,000 đồng/cổ phiếu', 59000],
    ['MUA với giá mục tiêu 46,800', 46800],
    ['Khuyến nghị MUA, GMT 46.800đ', 46800],
    ['We recommend HOLD with a 12M TP of VND54,600', 54600],
    ['target price VND54,600 per share', 54600],
    ['Our target price of VND35,600/share, implying an upside of 14.7%', 35600],
    ['giá mục tiêu 46,8 nghìn đồng', 46800],
    ['giá mục tiêu 46.8k', 46800],
    ['giá mục tiêu 12 tháng là 59.000 VNĐ', 59000],
    ['giá mục tiêu: 54600', 54600],
  ])('parses %s', (text, expected) => {
    expect(parseTargetPriceVnd(text)).toBe(expected);
  });

  it.each([
    ['PNJ: Báo cáo cập nhật 12/10/2026'],
    ['giá mục tiêu 68'],
    ['giá mục tiêu 46,8 đồng'],
    ['Our TP is 11.2% lower than the previous one'],
    ['TP HCM 2026 có nhiều dự án'],
    [''],
  ])('does not guess for %j', (text) => {
    expect(parseTargetPriceVnd(text)).toBeNull();
  });

  it('skips a percentage and keeps looking for the real target', () => {
    expect(parseTargetPriceVnd('Our TP is 11.2% lower. Target price of VND35,600/share')).toBe(
      35600,
    );
  });
});

describe('normalizeBroker', () => {
  it.each([
    ['VDS', 'VDSC'],
    ['Rồng Việt', 'VDSC'],
    ['GTJA (Vietnam) ', 'GTJA'],
    ['Guotai Haitong', 'GTJA'],
    ['Vietcap', 'VIETCAP'],
    ['VCSC', 'VIETCAP'],
    ['Bản Việt', 'VIETCAP'],
    ['VNDS', 'VNDIRECT'],
    ['VNDIRECT', 'VNDIRECT'],
    ['Nhật Việt', 'NHSV'],
    ['Công ty Chứng khoán SSI', 'SSI'],
    ['MAS', 'MIRAE'],
    ['TCBS', 'TCBS'],
  ])('%s → %s', (raw, canonical) => {
    expect(normalizeBroker(raw).broker).toBe(canonical);
  });

  it('keeps unknown brokers as an upper-case slug and the raw label', () => {
    expect(normalizeBroker('Quỹ Lạ  Co')).toEqual({ broker: 'QUY_LA_CO', brokerRaw: 'Quỹ Lạ Co' });
    expect(normalizeBroker('').broker).toBe('UNKNOWN');
  });

  it('exports raw aliases and canonical names for the output blocklist', () => {
    expect(BROKER_DISPLAY_NAMES).toEqual(
      expect.arrayContaining(['VIETCAP', 'Vietcap', 'Rồng Việt', 'VDS', 'SSI']),
    );
  });
});
