import { CAPITAL_DEFAULT, daysBetween, defaultForm, formatCapital, parseCapital, subtractYears, toRequest, validateForm } from '../form';

const ok = { hasBuyCondition: true };

describe('backtest form', () => {
  it('has sensible defaults', () => {
    const f = defaultForm(new Date('2026-10-09T05:00:00Z'));
    expect(f.symbol).toBe('FPT');
    expect(f.end).toBe('2026-10-09');
    expect(f.start).toBe('2024-10-09');
    expect(parseCapital(f.capital)).toBe(CAPITAL_DEFAULT);
    expect(f.execution).toBe('next_open');
    expect(f.fee).toBe('standard');
    expect(validateForm(f, ok)).toEqual({});
  });

  it('subtracts years with leap-day clamp', () => {
    expect(subtractYears('2028-02-29', 1)).toBe('2027-02-28');
    expect(daysBetween('2025-01-01', '2025-01-31')).toBe(30);
  });

  it('validates the date range', () => {
    const f = defaultForm(new Date('2026-10-09T05:00:00Z'));
    expect(validateForm({ ...f, start: f.end }, ok).end).toBe('Đến ngày phải sau Từ ngày.');
    expect(validateForm({ ...f, start: '2014-01-01' }, ok).end).toBe('Khoảng backtest tối đa 10 năm.');
    expect(validateForm({ ...f, start: '2016-10-10' }, ok).end).toBeUndefined();
  });

  it('validates capital', () => {
    const f = defaultForm();
    expect(validateForm({ ...f, capital: '500.000' }, ok).capital).toBe('Vốn ban đầu từ 1.000.000 đ đến 1.000.000.000.000 đ.');
    expect(validateForm({ ...f, capital: 'abc' }, ok).capital).toBeDefined();
    expect(validateForm({ ...f, capital: '1.000.000' }, ok).capital).toBeUndefined();
  });

  it('requires a symbol and an active buy condition', () => {
    const f = defaultForm();
    expect(validateForm({ ...f, symbol: '' }, ok).symbol).toBe('Chọn mã cổ phiếu.');
    expect(validateForm(f, { hasBuyCondition: false }).indicators).toMatch(/Chưa có điều kiện Mua/);
  });

  it('builds the request body', () => {
    const f = { ...defaultForm(), symbol: 'vnm', capital: '200.000.000', fee: 'none' as const };
    expect(toRequest(f)).toMatchObject({ symbol: 'VNM', assumptions: { capital: 200_000_000, fee_preset: 'none', execution: 'next_open' } });
    expect(formatCapital(100000000)).toBe('100.000.000');
  });
});
