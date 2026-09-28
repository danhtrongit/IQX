import { describe, expect, it, vi } from 'vitest';

import { type SqlClient } from '../../src/platform/database/index.js';
import { buildFrozenDataset } from '../../src/modules/journey/identity/identity.dataset.js';
import { digest } from '../../src/modules/journey/identity/identity.classification.js';
import { JourneyIdentityService } from '../../src/modules/journey/identity/identity.service.js';

const insight = {
  symbol: 'VNM',
  updatedAt: '2026-09-22T08:00:00Z',
  header: { price: 74_000 },
  layers: {
    L1: { statusLabel: 'Mạnh', xu_huong: 'Tăng', ho_tro: '70,000' },
    L3: { statusLabel: 'Hỗ trợ nhẹ', khoi_ngoai: 'Khối ngoại mua ròng' },
    L4: { statusLabel: 'Trung tính', noi_bo: 'Không có giao dịch lớn' },
    L5: { statusLabel: 'Tích cực', tong_quan: 'Kết quả kinh doanh cải thiện' },
  },
};
const dashboard = {
  hero: { ticker: 'VNM' },
  blocks: {
    valuation: {
      current_price: 74_000,
      fair_median: 80_000,
      methods: [{ name: 'P/E', bear: 68_000, base: 80_000, bull: 92_000 }],
    },
  },
  meta: { periods: ['2025'] },
};
const ohlcv = { data: [{ time: '2026-09-22', close: 74_000 }] };

describe('fresh journey reading datasets', () => {
  it('builds five real readings without inventing neutral values', () => {
    const payload = buildFrozenDataset({
      symbol: 'VNM',
      insight,
      financialDashboard: dashboard,
      ohlcv,
      observedAt: new Date('2026-09-23T02:00:00Z'),
    });
    expect(payload.trading_date).toBe('2026-09-22');
    expect(payload.ai_answers).toEqual({
      ky_thuat: 'ok',
      dong_tien: 'ok',
      noi_bo: 'neu',
      tin_tuc: 'ok',
      dinh_gia: 'ok',
    });
    expect(payload.unavailable_layers).toEqual([]);

    const missing = buildFrozenDataset({
      symbol: 'VNM',
      insight: { ...insight, layers: { ...insight.layers, L3: { statusLabel: 'Không rõ' } } },
      financialDashboard: dashboard,
      ohlcv,
      observedAt: new Date('2026-09-23T02:00:00Z'),
    });
    expect(missing.ai_answers).not.toHaveProperty('dong_tien');
    expect(missing.unavailable_layers).toContain('dong_tien');
  });

  it('finishes providers before the transaction and persists a hidden-answer snapshot', async () => {
    let inTransaction = false;
    let insertedPayload: Record<string, unknown> | undefined;
    const tx: SqlClient = {
      query: vi.fn(
        async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
          if (sql.includes('from cap4_progress')) return [{ id: 'cap4' }] as unknown as T[];
          if (sql.includes('from users') && sql.includes('for update'))
            return [{ id: 'u1' }] as unknown as T[];
          if (sql.includes('from journey_reading_datasets')) return [] as T[];
          if (sql.includes('insert into journey_reading_datasets')) {
            insertedPayload = JSON.parse(String(values?.[5])) as Record<string, unknown>;
            return [
              {
                id: 'd1',
                user_id: 'u1',
                symbol: 'VNM',
                trading_date: '2026-09-22',
                created_at: values?.[3],
                dataset_hash: values?.[4],
                payload: insertedPayload,
              },
            ] as unknown as T[];
          }
          return [] as T[];
        },
      ) as SqlClient['query'],
    };
    const database = {
      transaction: vi.fn(async <T>(operation: (client: SqlClient) => Promise<T>) => {
        inTransaction = true;
        try {
          return await operation(tx);
        } finally {
          inTransaction = false;
        }
      }),
    };
    const assertOutside = () => expect(inTransaction).toBe(false);
    const service = new JourneyIdentityService(
      database as never,
      {} as never,
      {} as never,
      { get: vi.fn() } as never,
      {
        insight: vi.fn(async () => {
          assertOutside();
          return insight;
        }),
      } as never,
      {
        getDashboard: vi.fn(async () => {
          assertOutside();
          return { data: dashboard };
        }),
      } as never,
      {
        getOhlcv: vi.fn(async () => {
          assertOutside();
          return ohlcv;
        }),
      } as never,
    );

    const response = await service.createDataset('u1', 'VNM');

    expect(response).toEqual(expect.objectContaining({ id: 'd1', symbol: 'VNM' }));
    expect(response).not.toHaveProperty('ai_answers');
    expect(response).not.toHaveProperty('source_snapshot');
    expect(insertedPayload?.ai_answers).toEqual(expect.objectContaining({ dinh_gia: 'ok' }));
    expect(insertedPayload?.source_snapshot).toBeTruthy();
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it('freezes a graduated mascot once and never rerolls the assigned profile', async () => {
    const payload = buildFrozenDataset({
      symbol: 'VNM',
      insight,
      financialDashboard: dashboard,
      ohlcv,
      observedAt: new Date('2026-09-23T02:00:00Z'),
    });
    let profile: Record<string, unknown> | null = null;
    let profileWrites = 0;
    const tx: SqlClient = {
      query: vi.fn(
        async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
          if (sql.includes('from users') && sql.includes('for update'))
            return [{ id: 'u1' }] as unknown as T[];
          if (sql.includes('from cap6_progress'))
            return [{ graduated_at: '2026-10-01T00:00:00Z' }] as unknown as T[];
          if (sql.includes('from cap4_progress'))
            return [{ entered_at: '2026-09-01T00:00:00Z' }] as unknown as T[];
          if (sql.includes('from bot_mascot_profiles')) return (profile ? [profile] : []) as T[];
          if (sql.includes('join journey_reading_datasets')) {
            return [
              {
                id: 'a1',
                user_id: 'u1',
                dataset_id: 'd1',
                symbol: 'VNM',
                trading_date: '2026-09-22',
                completed_at: '2026-09-23T03:00:00Z',
                revealed_at: '2026-09-23T04:00:00Z',
                answers: payload.ai_answers,
                source: 'learning',
                mode: 'thuc_chien',
                record_status: 'valid',
                proof_version: 'commit_then_reveal_v1',
                dataset_user_id: 'u1',
                dataset_symbol: 'VNM',
                dataset_trading_date: '2026-09-22',
                dataset_created_at: '2026-09-23T02:00:00Z',
                dataset_hash: digest(payload),
                payload,
              },
            ] as unknown as T[];
          }
          if (sql.includes('insert into bot_mascot_profiles')) {
            profileWrites += 1;
            profile = {
              id: 'p1',
              user_id: values?.[0],
              mascot_rules_version: values?.[1],
              assignment_status: values?.[2],
              mascot_id: values?.[3],
              dominant_layer: values?.[4],
              assignment_basis: values?.[5],
              window_start: values?.[6],
              window_end: values?.[7],
              valid_pair_count: values?.[8],
              match_counts: JSON.parse(String(values?.[9])),
              tied_layers: JSON.parse(String(values?.[10])),
              selected_assessment_refs: JSON.parse(String(values?.[11])),
              dataset_hash: values?.[12],
              excluded_records_summary: JSON.parse(String(values?.[13])),
              assigned_at: values?.[14],
              created_at: '2026-10-01T00:00:01Z',
              updated_at: '2026-10-01T00:00:01Z',
            };
            return [] as T[];
          }
          return [] as T[];
        },
      ) as SqlClient['query'],
    };
    const database = {
      transaction: <T>(operation: (client: SqlClient) => Promise<T>) => operation(tx),
    };
    const service = new JourneyIdentityService(
      database as never,
      {} as never,
      {} as never,
      { get: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.initializeAfterGraduation('u1')).resolves.toEqual(
      expect.objectContaining({ id: expect.any(String), valid_pair_count: 1 }),
    );
    await expect(service.initializeAfterGraduation('u1')).resolves.toEqual(
      expect.objectContaining({ id: expect.any(String), valid_pair_count: 1 }),
    );
    expect(profileWrites).toBe(1);
  });
});
