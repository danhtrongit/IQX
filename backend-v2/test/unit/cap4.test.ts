import { describe, expect, it } from 'vitest';

import { cap4PlanBodySchema } from '../../src/modules/journey/cap4/cap4.schemas.js';
import { ASSESSMENTS, LAYERS } from '../../src/modules/journey/cap4/cap4.types.js';

describe('cap4 five-layer contract', () => {
  it('accepts partial readings for an open plan, preserving the server-side 10-complete gate', () => {
    const value = cap4PlanBodySchema.parse({
      order_id: '00000000-0000-0000-0000-000000000000',
      doc_5_lop: { ky_thuat: 'ok' },
    });
    expect(value.doc_5_lop).toEqual({ ky_thuat: 'ok' });
  });

  it('rejects unknown layers and verdicts', () => {
    expect(() =>
      cap4PlanBodySchema.parse({
        order_id: '00000000-0000-0000-0000-000000000000',
        doc_5_lop: { unknown: 'ok' },
      }),
    ).toThrow();
    expect(() =>
      cap4PlanBodySchema.parse({
        order_id: '00000000-0000-0000-0000-000000000000',
        doc_5_lop: { ky_thuat: 'maybe' },
      }),
    ).toThrow();
  });

  it('pins the canonical five layers and three neutral verdicts', () => {
    expect(LAYERS).toEqual(['ky_thuat', 'dong_tien', 'noi_bo', 'tin_tuc', 'dinh_gia']);
    expect(ASSESSMENTS).toEqual(['ok', 'neu', 'bad']);
  });
});
