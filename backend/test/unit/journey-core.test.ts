import { describe, expect, it, vi } from 'vitest';

import { CoreJourneyService } from '../../src/modules/journey/core/journey-core.service.js';
import { LearningPlanService } from '../../src/modules/journey/core/learning-plan.service.js';
import { type SqlClient } from '../../src/platform/database/index.js';

function txFor(rows: Record<string, unknown>[]): SqlClient {
  return {
    query: vi.fn(
      async <T extends Record<string, unknown> = Record<string, unknown>>(
        _text: string,
        _values?: readonly unknown[],
      ): Promise<T[]> => rows as T[],
    ) as unknown as SqlClient['query'],
  };
}

describe('CoreJourneyService', () => {
  it('clamps historical cap7/8 rows to current cap6 while retaining history in progressRows', async () => {
    const tx = txFor([
      { level: 6, entered_at: '2026-01-01T00:00:00Z', graduated_at: '2026-02-01T00:00:00Z' },
      { level: 7, entered_at: '2026-02-02T00:00:00Z', graduated_at: '2026-03-01T00:00:00Z' },
      { level: 8, entered_at: '2026-03-02T00:00:00Z', graduated_at: null },
    ]);
    const service = new CoreJourneyService({} as never);
    await expect(service.getLevel(tx, 'u1')).resolves.toBe(6);
    await expect(service.progressRows(tx, 'u1')).resolves.toHaveLength(3);
  });

  it('uses placement when no progress exists', async () => {
    const tx: SqlClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ placed_level: 2 }]),
    };
    const service = new CoreJourneyService({} as never);
    await expect(service.getLevel(tx, 'u1')).resolves.toBe(2);
  });

  it('unlocks level 1 after level 0 graduates', async () => {
    const tx = txFor([
      { level: 0, entered_at: '2026-01-01T00:00:00Z', graduated_at: '2026-01-02T00:00:00Z' },
    ]);
    const service = new CoreJourneyService({} as never);
    await expect(service.getLevel(tx, 'u1')).resolves.toBe(1);
  });
});

describe('LearningPlanService', () => {
  it('rejects plans owned by a different order context', async () => {
    const journey = {
      getActiveLevel: vi.fn().mockResolvedValue(1),
    } as unknown as CoreJourneyService;
    const service = new LearningPlanService(journey);
    const tx = txFor([
      {
        id: 'o1',
        user_id: 'u1',
        side: 'buy',
        status: 'pending',
        quantity: 10,
        filled_price_vnd: null,
        limit_price_vnd: '1000',
      },
    ]);
    await expect(
      service.validateForOrder(
        tx,
        { userId: 'u1', orderId: 'o1', side: 'buy', quantity: 9 },
        {
          lyDo: 'ky_thuat',
          trangThai_luc_dat: 'ung_ho',
          vung_mua: 1000,
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'ORDER_CONTEXT_MISMATCH' } });
  });

  it('rejects incomplete cumulative level 4 plans', async () => {
    const journey = {
      getActiveLevel: vi.fn().mockResolvedValue(4),
    } as unknown as CoreJourneyService;
    const service = new LearningPlanService(journey);
    const tx = txFor([
      {
        id: 'o1',
        user_id: 'u1',
        side: 'buy',
        status: 'pending',
        quantity: 10,
        filled_price_vnd: null,
        limit_price_vnd: '1000',
      },
    ]);
    await expect(
      service.validateForOrder(
        tx,
        { userId: 'u1', orderId: 'o1', side: 'buy', quantity: 10 },
        {
          lyDo: 'ky_thuat',
          trangThai_luc_dat: 'ung_ho',
          vung_mua: 1000,
        },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_JOURNEY_PLAN' } });
  });
});
