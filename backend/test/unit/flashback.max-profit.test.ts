import { describe, expect, it } from 'vitest';

import {
  flashbackMaxProfit,
  readFlashbackConfig,
} from '../../src/modules/flashback/flashback.round-builder.js';

describe('flashbackMaxProfit (lợi nhuận tối đa khi chơi hoàn hảo)', () => {
  it('giá đi ngang thì không lời', () => {
    expect(flashbackMaxProfit(new Array(61).fill(25_000))).toBe(0);
  });

  it('giữ tới phiên cuối không mất phí bán và thuế', () => {
    // Mua Phiên 0 giá 100, Phiên 2 giá 120: bán ra được 1,2 × 0,9975 / 1,0015; giữ lại được 1,2 / 1,0015.
    expect(flashbackMaxProfit([100, 100, 120])).toBeCloseTo(1.2 / 1.0015 - 1, 10);
  });

  it('T+2 không cho ăn sóng một phiên', () => {
    // Mua ở 100 (Phiên 0) thì Phiên 1 giá 110 chưa bán được, Phiên 2 về lại 100.
    expect(flashbackMaxProfit([100, 110, 100])).toBe(0);
  });

  it('chốt lời rồi mua lại khi giá giảm sâu', () => {
    // Mua Phiên 0, bán Phiên 2 ở 150, mua lại Phiên 3 ở 100 và giữ tới Phiên 5 ở 150.
    const closes = [100, 100, 150, 100, 100, 150];
    const once = (1.5 * 0.9975) / 1.0015;
    expect(flashbackMaxProfit(closes)).toBeCloseTo(once * (1.5 / 1.0015) - 1, 10);
  });

  it('mặc định chỉ nhận đề có lợi nhuận tối đa từ 20% tới 40%', () => {
    const config = readFlashbackConfig({});
    expect(config.minMaxProfit).toBe(0.2);
    expect(config.maxMaxProfit).toBe(0.4);
  });
});
