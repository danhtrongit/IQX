import { formatDong, formatDongSigned, formatPercentSigned, formatRatio, toNumber, toneOf } from '../money';

describe('bot money parsing', () => {
  it('parses strings safely', () => {
    expect(toNumber('100000000')).toBe(100_000_000);
    expect(toNumber('-12.5')).toBe(-12.5);
    expect(toNumber('')).toBeNull();
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber(NaN)).toBeNull();
  });
  it('formats dong', () => {
    expect(formatDong('100000000')).toBe('100.000.000 đ');
    expect(formatDong(null)).toBe('—');
    expect(formatDongSigned('1500.4')).toBe('+1.500 đ');
    expect(formatDongSigned('-2000')).toBe('−2.000 đ');
    expect(formatDongSigned('0')).toBe('0 đ');
  });
  it('formats ratios', () => {
    expect(formatRatio('0.0123')).toBe('+1,23%');
    expect(formatRatio('-0.05')).toBe('−5%');
    expect(formatRatio(null)).toBe('—');
    expect(formatPercentSigned('12.5')).toBe('+12,5%');
  });
  it('tone', () => {
    expect(toneOf('5')).toBe('priceUp');
    expect(toneOf('-5')).toBe('priceDown');
    expect(toneOf('x')).toBe('foreground');
  });
});
