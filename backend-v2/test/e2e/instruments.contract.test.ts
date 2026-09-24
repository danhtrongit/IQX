import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMockApiApp, type InstrumentRepositoryStub } from '../helpers/api-app.js';
import { makeSymbolRow } from '../helpers/symbols.js';

describe('instrument HTTP contracts', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('serves a camelCase v2 envelope and preserves bigint prices as strings', async () => {
    const repository: InstrumentRepositoryStub = {
      search: vi.fn().mockResolvedValue({
        rows: [makeSymbolRow({ currentPriceVnd: 9_007_199_254_740_993n })],
        total: 21,
      }),
      findBySymbol: vi.fn(),
    };
    app = await createMockApiApp(repository);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?q=vcb&page=2&page_size=1&include_indices=false',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.json()).toMatchObject({
      data: [
        {
          symbol: 'VCB',
          currentPriceVnd: '9007199254740993',
          targetPriceVnd: '100000',
          isIndex: false,
        },
      ],
      meta: {
        pagination: { page: 2, page_size: 1, total: 21, total_pages: 21 },
        request_id: expect.any(String),
      },
    });
    expect(repository.search).toHaveBeenCalledWith({
      q: 'vcb',
      page: 2,
      page_size: 1,
      include_indices: false,
    });
  });

  it('does not coerce include_indices=false to true', async () => {
    const repository: InstrumentRepositoryStub = {
      search: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      findBySymbol: vi.fn(),
    };
    app = await createMockApiApp(repository);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/instruments?include_indices=false',
    });

    expect(response.statusCode).toBe(200);
    expect(repository.search).toHaveBeenCalledWith(
      expect.objectContaining({ include_indices: false }),
    );
    expect(response.json()).toMatchObject({
      data: [],
      meta: { pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 } },
    });
  });

  it('returns nullable detail fields and excludes internal source URLs in v2', async () => {
    const row = makeSymbolRow({
      name: null,
      currentPriceVnd: null,
      targetPriceVnd: null,
      lastSyncedAt: null,
      sourceUrl: 'https://must-not-leak.example.test',
    });
    const repository: InstrumentRepositoryStub = {
      search: vi.fn(),
      findBySymbol: vi.fn().mockResolvedValue(row),
    };
    app = await createMockApiApp(repository);

    const response = await app.inject({ method: 'GET', url: '/api/v2/instruments/vcb' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toMatchObject({
      id: row.id,
      symbol: 'VCB',
      name: null,
      currentPriceVnd: null,
      targetPriceVnd: null,
      lastSyncedAt: null,
      createdAt: '2026-09-23T01:02:03.123456',
      updatedAt: '2026-09-23T01:02:03.123456',
    });
    expect(body.data).not.toHaveProperty('sourceUrl');
    expect(body.meta.request_id).toEqual(expect.any(String));
  });

  it('returns a stable v2 404 error envelope', async () => {
    const repository: InstrumentRepositoryStub = {
      search: vi.fn(),
      findBySymbol: vi.fn().mockResolvedValue(null),
    };
    app = await createMockApiApp(repository);

    const response = await app.inject({ method: 'GET', url: '/api/v2/instruments/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.json()).toEqual({
      error: {
        code: 'INSTRUMENT_NOT_FOUND',
        message: 'Không tìm thấy mã chứng khoán: MISSING',
      },
      request_id: expect.any(String),
    });

    const legacy = await app.inject({
      method: 'GET',
      url: '/api/v1/market-data/reference/symbols/missing',
    });
    expect(legacy.statusCode).toBe(404);
    expect(legacy.json()).toEqual({
      detail: 'Không tìm thấy mã chứng khoán: MISSING',
    });
  });

  it('retains the exact bare v1 search shape with safe integer prices', async () => {
    const repository: InstrumentRepositoryStub = {
      search: vi.fn().mockResolvedValue({ rows: [makeSymbolRow()], total: 1 }),
      findBySymbol: vi.fn(),
    };
    app = await createMockApiApp(repository);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market-data/reference/symbols/search?q=vcb',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          symbol: 'VCB',
          name: 'Ngân hàng TMCP Ngoại thương Việt Nam',
          short_name: 'Vietcombank',
          exchange: 'HOSE',
          asset_type: 'stock',
          is_index: false,
          logo_url: 'https://cdn.example.test/vcb.svg',
          current_price_vnd: 88000,
          target_price_vnd: 100000,
          upside_pct: 13.64,
          icb_lv1: 'Financials',
          icb_lv2: 'Banks',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    });
  });

  it('fails safely instead of corrupting an unsafe bigint in v1', async () => {
    const repository: InstrumentRepositoryStub = {
      search: vi.fn().mockResolvedValue({
        rows: [makeSymbolRow({ currentPriceVnd: 9_007_199_254_740_993n })],
        total: 1,
      }),
      findBySymbol: vi.fn(),
    };
    app = await createMockApiApp(repository);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market-data/reference/symbols/search',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      detail: 'Đã xảy ra lỗi hệ thống',
      code: 'LEGACY_INTEGER_OUT_OF_RANGE',
    });
  });

  it('retains the v1 snake_case detail including source_url', async () => {
    const row = makeSymbolRow();
    const repository: InstrumentRepositoryStub = {
      search: vi.fn(),
      findBySymbol: vi.fn().mockResolvedValue(row),
    };
    app = await createMockApiApp(repository);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/market-data/reference/symbols/vcb',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: row.id,
      symbol: 'VCB',
      short_name: 'Vietcombank',
      source_url: 'https://upstream.example.test/vcb',
      current_price_vnd: 88000,
      last_synced_at: '2026-09-23T01:02:03.654321+00:00',
      created_at: '2026-09-23T01:02:03.123456',
      updated_at: '2026-09-23T01:02:03.123456',
    });
  });
});
