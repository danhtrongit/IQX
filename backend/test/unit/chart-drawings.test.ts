import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';
import {
  chartDrawingUpsertSchema,
  chartSymbolSchema,
  MAX_DRAWING_STATE_BYTES,
} from '../../src/modules/chart-drawings/chart-drawings.schemas.js';
import { ChartDrawingsService } from '../../src/modules/chart-drawings/chart-drawings.service.js';

describe('chart drawing schemas', () => {
  it('accepts nested JSON state used by the chart integration', () => {
    const state = {
      sources: [{ id: 'line-1', points: [{ time: 1_789_000_000, price: 61_800 }] }],
      groups: { alpha: { name: 'Kịch bản tăng', visible: true } },
    };
    expect(chartDrawingUpsertSchema.parse({ state })).toEqual({ state });
    expect(chartSymbolSchema.parse(' vnm ')).toBe('VNM');
  });

  it('rejects arrays, non-JSON values and oversized payloads', () => {
    expect(chartDrawingUpsertSchema.safeParse({ state: [] }).success).toBe(false);
    expect(chartDrawingUpsertSchema.safeParse({ state: { bad: undefined } }).success).toBe(false);
    expect(
      chartDrawingUpsertSchema.safeParse({ state: { blob: 'x'.repeat(MAX_DRAWING_STATE_BYTES) } })
        .success,
    ).toBe(false);
  });
});

describe('ChartDrawingsService ownership', () => {
  it('loads only the authenticated user and normalized symbol', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new ChartDrawingsService({ query } as unknown as DatabaseService);
    await service.getForUser('user-a', 'vnm');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $1 AND symbol = $2'), [
      'user-a',
      'VNM',
    ]);
  });

  it('upserts on the composite ownership key and serializes state as JSONB', async () => {
    const row = {
      id: 'drawing-a',
      user_id: 'user-a',
      symbol: 'VNM',
      state: { sources: [] },
      created_at: '2026-09-23 10:00:00',
      updated_at: '2026-09-23 10:00:00',
    };
    const query = vi.fn().mockResolvedValue([row]);
    const database = {
      transaction: (operation: (client: SqlClient) => Promise<unknown>) => operation({ query }),
    } as unknown as DatabaseService;
    const service = new ChartDrawingsService(database);
    await expect(service.upsertForUser('user-a', 'vnm', { sources: [] })).resolves.toEqual(row);
    expect(String(query.mock.calls[0]?.[0])).toContain('ON CONFLICT (user_id, symbol)');
    expect(query.mock.calls[0]?.[1]?.slice(1)).toEqual(['user-a', 'VNM', '{"sources":[]}']);
  });

  it('deletes only the authenticated user drawing', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const database = {
      transaction: (operation: (client: SqlClient) => Promise<unknown>) => operation({ query }),
    } as unknown as DatabaseService;
    const service = new ChartDrawingsService(database);
    await service.deleteForUser('user-a', 'vnm');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $1 AND symbol = $2'), [
      'user-a',
      'VNM',
    ]);
  });
});
