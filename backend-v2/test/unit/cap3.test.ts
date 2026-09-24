import { describe, expect, it } from 'vitest';

import {
  cap3PlanBodySchema,
  sizingMethodSchema,
} from '../../src/modules/journey/cap3/cap3.schemas.js';
import { exactInteger, exactRatioPercent } from '../../src/modules/journey/cap3/exact-numeric.js';
import { isWithinAllocationCap } from '../../src/modules/journey/cap3/cap3.service.js';

describe('cap3 contracts and exact arithmetic', () => {
  it('normalizes legacy sizing labels while keeping the canonical values', () => {
    expect(sizingMethodSchema.parse('linh_hoat')).toBe('khau_vi_tu_tin');
    expect(sizingMethodSchema.parse('ky_luat')).toBe('chia_deu');
  });

  it('rejects invalid confidence and negative capital percentage', () => {
    expect(() =>
      cap3PlanBodySchema.parse({
        order_id: '00000000-0000-0000-0000-000000000001',
        khau_vi: 'can_bang',
        muc_tu_tin: 4,
        cach_khoi_luong: 'chia_deu',
        khoi_luong: 100,
        pct_von: 1,
      }),
    ).toThrow();
    expect(() =>
      cap3PlanBodySchema.parse({
        order_id: '00000000-0000-0000-0000-000000000001',
        khau_vi: 'can_bang',
        muc_tu_tin: 2,
        cach_khoi_luong: 'chia_deu',
        khoi_luong: 100,
        pct_von: -1,
      }),
    ).toThrow();
  });

  it('does not silently round money outside the legacy safe integer range', () => {
    expect(exactInteger(1_000_000n, 'price')).toBe(1_000_000);
    expect(() => exactInteger(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 'price')).toThrow();
  });

  it('calculates percentage from integer money operands', () => {
    expect(exactRatioPercent(25_000n, 1_000_000n)).toBe(2.5);
    expect(exactRatioPercent(0n, 1_000_000n)).toBe(0);
  });

  it('enforces the selected risk appetite allocation ceiling', () => {
    expect(isWithinAllocationCap('than_trong', 10)).toBe(true);
    expect(isWithinAllocationCap('than_trong', 10.01)).toBe(false);
    expect(isWithinAllocationCap('can_bang', 20)).toBe(true);
    expect(isWithinAllocationCap('tan_cong', 30.01)).toBe(false);
  });
});
