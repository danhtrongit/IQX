import { checkOrderInput, estimateOrder, parseIntInput, quantityForPercent, roundToLot } from '../order-math';

describe('order math', () => {
  it('rounds to board lots', () => {
    expect(roundToLot(149)).toBe(100);
    expect(roundToLot(150)).toBe(200);
    expect(roundToLot(0)).toBe(0);
  });

  it('buy quick-fill uses affordable lots including fee', () => {
    // 10,000,000 / (50,000 * 1.0015) = 199.7 -> 100 affordable lots floor => 100
    expect(quantityForPercent({ side: 'buy', percent: 100, price: 50_000, cashAvailable: 10_000_000, sellable: 0 })).toBe(100);
    // 100,000,000 / (57,600*1.0015) = 1733.5 -> 1700; 50% = 850 -> 900 (ties up)
    expect(quantityForPercent({ side: 'buy', percent: 100, price: 57_600, cashAvailable: 100_000_000, sellable: 0 })).toBe(1700);
    expect(quantityForPercent({ side: 'buy', percent: 50, price: 57_600, cashAvailable: 100_000_000, sellable: 0 })).toBe(900);
    expect(quantityForPercent({ side: 'buy', percent: 25, price: 57_600, cashAvailable: 1_000_000, sellable: 0 })).toBe(100);
  });

  it('buy quick-fill needs a price and cash', () => {
    expect(quantityForPercent({ side: 'buy', percent: 50, price: null, cashAvailable: 1e8, sellable: 0 })).toBeNull();
    expect(quantityForPercent({ side: 'buy', percent: 50, price: 1000, cashAvailable: null, sellable: 0 })).toBeNull();
  });

  it('sell quick-fill uses sellable, min one lot', () => {
    expect(quantityForPercent({ side: 'sell', percent: 50, price: 1, cashAvailable: 0, sellable: 1000 })).toBe(500);
    expect(quantityForPercent({ side: 'sell', percent: 25, price: 1, cashAvailable: 0, sellable: 100 })).toBe(100);
    expect(quantityForPercent({ side: 'sell', percent: 100, price: 1, cashAvailable: 0, sellable: 0 })).toBeNull();
  });

  it('validates input with Vietnamese messages', () => {
    const ok = { hasQuote: true, quantity: 100, method: 'market' as const, limitPrice: null };
    expect(checkOrderInput(ok)).toEqual({ ok: true });
    expect(checkOrderInput({ ...ok, hasQuote: false })).toEqual({ ok: false, message: 'Không có dữ liệu mã CK' });
    expect(checkOrderInput({ ...ok, quantity: 0 })).toEqual({ ok: false, message: 'Khối lượng tối thiểu là 100 CP' });
    expect(checkOrderInput({ ...ok, quantity: 150 })).toEqual({ ok: false, message: 'Khối lượng phải là bội số của 100' });
    expect(checkOrderInput({ ...ok, method: 'limit' })).toEqual({ ok: false, message: 'Vui lòng nhập giá hợp lệ cho lệnh giới hạn' });
    expect(checkOrderInput({ ...ok, method: 'limit', limitPrice: 57_000 })).toEqual({ ok: true });
  });

  it('estimates gross, fee and total', () => {
    expect(estimateOrder({ side: 'buy', quantity: 100, price: 57_600 })).toEqual({ gross: 5_760_000, fee: 8640, total: 5_768_640 });
    expect(estimateOrder({ side: 'sell', quantity: 100, price: 57_600 })).toEqual({ gross: 5_760_000, fee: 8640, total: 5_751_360 });
    expect(estimateOrder({ side: 'buy', quantity: 100, price: null })).toBeNull();
  });

  it('parses typed integers', () => {
    expect(parseIntInput('1.200')).toBe(1200);
    expect(parseIntInput('')).toBeNull();
  });
});
