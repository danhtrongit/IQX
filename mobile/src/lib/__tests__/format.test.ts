import { formatCompact, formatDate, formatDateTime, formatNumber, formatPct, formatVnd, priceColorRole, todayVN } from '../format';

describe('format', () => {
  it('formatVnd', () => {
    expect(formatVnd(57600)).toBe('57.600');
    expect(formatVnd(1234567.6)).toBe('1.234.568');
    expect(formatVnd('1000000')).toBe('1.000.000');
    expect(formatVnd(-1500)).toBe('-1.500');
    expect(formatVnd(0)).toBe('0');
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(NaN)).toBe('—');
  });
  it('formatNumber', () => {
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatNumber(1234.567)).toBe('1.234,57');
    expect(formatNumber(10)).toBe('10');
    expect(formatNumber(undefined)).toBe('—');
  });
  it('formatPct is signed with 2 decimals', () => {
    expect(formatPct(1.234)).toBe('+1,23%');
    expect(formatPct(-0.5)).toBe('-0,50%');
    expect(formatPct(0)).toBe('0,00%');
    expect(formatPct(-0.001)).toBe('0,00%');
    expect(formatPct(null)).toBe('—');
  });
  it('formatCompact', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(12300)).toBe('12,3 N');
    expect(formatCompact(1234567)).toBe('1,23 Tr');
    expect(formatCompact(2.5e9)).toBe('2,5 Tỷ');
    expect(formatCompact(-3e6)).toBe('-3 Tr');
  });
  it('dates use Asia/Ho_Chi_Minh', () => {
    expect(formatDate('2026-10-09')).toBe('09/10/2026');
    expect(formatDate('2026-10-09T18:30:00Z')).toBe('10/10/2026'); // 01:30 next day in VN
    expect(formatDateTime('2026-10-09T18:30:00Z')).toBe('10/10/2026 01:30');
    expect(formatDate('nope')).toBe('—');
    expect(todayVN(new Date('2026-10-09T20:00:00Z'))).toBe('2026-10-10');
    expect(todayVN(new Date('2026-10-09T10:00:00Z'))).toBe('2026-10-09');
  });
  it('priceColorRole', () => {
    expect(priceColorRole(11, 10, 10.7, 9.3)).toBe('ceiling');
    expect(priceColorRole(9, 10, 10.7, 9.3)).toBe('floor');
    expect(priceColorRole(10.5, 10, 10.7, 9.3)).toBe('up');
    expect(priceColorRole(9.5, 10, 10.7, 9.3)).toBe('down');
    expect(priceColorRole(10, 10, 10.7, 9.3)).toBe('ref');
    expect(priceColorRole(0, 10)).toBe('ref');
    expect(priceColorRole(null, 10)).toBe('ref');
  });
});
