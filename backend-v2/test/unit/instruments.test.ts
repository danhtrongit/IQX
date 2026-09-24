import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { SymbolRow } from '../../src/platform/database/index.js';
import {
  escapeLikePattern,
  instrumentSearchQuerySchema,
  InstrumentsRepository,
  InstrumentsService,
  toInstrumentDetail,
  toInstrumentSummary,
  toLegacyInstrumentDetail,
} from '../../src/modules/market/instruments/index.js';

const row: SymbolRow = {
  id: 'd071c23b-4f40-491f-82c5-0a7692608a2e',
  symbol: 'VNM',
  name: null,
  shortName: 'Vinamilk',
  exchange: 'HOSE',
  assetType: 'stock',
  isIndex: false,
  currentPriceVnd: 61_800n,
  targetPriceVnd: null,
  upsidePct: null,
  logoUrl: null,
  logoSource: null,
  icbLv1: null,
  icbLv2: null,
  source: 'VIETCAP_SEARCH_BAR',
  sourceUrl: 'https://internal.example/upstream',
  lastSyncedAt: '2026-09-23 00:01:02.654321+00',
  isActive: true,
  createdAt: '2026-09-23 01:02:03.123456',
  updatedAt: '2026-09-23 04:05:06.987654',
};

describe('instrument schemas', () => {
  it('coerces the string false without treating it as truthy', () => {
    const parsed = instrumentSearchQuerySchema.parse({ include_indices: 'false' });
    expect(parsed.include_indices).toBe(false);
  });

  it('normalizes an empty search query to no query', () => {
    const parsed = instrumentSearchQuerySchema.parse({ q: '   ' });
    expect(parsed.q).toBeUndefined();
    expect(parsed.page).toBe(1);
    expect(parsed.page_size).toBe(20);
  });
});

describe('LIKE escaping', () => {
  it('escapes backslashes before percent and underscore wildcards', () => {
    expect(escapeLikePattern(String.raw`A\B%_`)).toBe(String.raw`A\\B\%\_`);
  });
});

describe('instrument mapping', () => {
  it('maps nullable and bigint fields without leaking sourceUrl in v2', () => {
    const summary = toInstrumentSummary(row);
    const detail = toInstrumentDetail(row);

    expect(summary.currentPriceVnd).toBe('61800');
    expect(summary.targetPriceVnd).toBeNull();
    expect(summary.name).toBeNull();
    expect(detail).not.toHaveProperty('sourceUrl');
    expect(detail.lastSyncedAt).toBe('2026-09-23T00:01:02.654321Z');
    expect(detail.createdAt).toBe('2026-09-23T01:02:03.123456');
    expect(detail.updatedAt).toBe('2026-09-23T04:05:06.987654');
  });

  it('normalizes non-UTC database offsets without changing the stored wall time', () => {
    const detail = toInstrumentDetail({
      ...row,
      lastSyncedAt: '2026-09-23 07:01:02.654321+0700',
    });

    expect(detail.lastSyncedAt).toBe('2026-09-23T07:01:02.654321+07:00');
  });

  it.each([
    {
      rawNaive: '2026-09-23 01:02:03',
      rawAware: '2026-09-23 01:02:03+00',
      expectedNaive: '2026-09-23T01:02:03',
      expectedAware: '2026-09-23T01:02:03Z',
    },
    {
      rawNaive: '2026-09-23 01:02:03.1',
      rawAware: '2026-09-23 01:02:03.1+00',
      expectedNaive: '2026-09-23T01:02:03.100000',
      expectedAware: '2026-09-23T01:02:03.100000Z',
    },
    {
      rawNaive: '2026-09-23 01:02:03.123',
      rawAware: '2026-09-23 01:02:03.123+00',
      expectedNaive: '2026-09-23T01:02:03.123000',
      expectedAware: '2026-09-23T01:02:03.123000Z',
    },
    {
      rawNaive: '2026-09-23 01:02:03.123456',
      rawAware: '2026-09-23 01:02:03.123456+00',
      expectedNaive: '2026-09-23T01:02:03.123456',
      expectedAware: '2026-09-23T01:02:03.123456Z',
    },
  ])(
    'matches Pydantic fractional precision for $rawNaive',
    ({ rawNaive, rawAware, expectedNaive, expectedAware }) => {
      const detail = toInstrumentDetail({
        ...row,
        createdAt: rawNaive,
        updatedAt: rawNaive,
        lastSyncedAt: rawAware,
      });
      const legacy = toLegacyInstrumentDetail({
        ...row,
        createdAt: rawNaive,
        updatedAt: rawNaive,
        lastSyncedAt: rawAware,
      });

      expect(detail.createdAt).toBe(expectedNaive);
      expect(detail.updatedAt).toBe(expectedNaive);
      expect(detail.lastSyncedAt).toBe(expectedAware);
      expect(legacy.created_at).toBe(expectedNaive);
      expect(legacy.updated_at).toBe(expectedNaive);
      expect(legacy.last_synced_at).toBe(expectedAware);
    },
  );

  it('preserves safe v1 integers and rejects unsafe bigint values', () => {
    expect(toLegacyInstrumentDetail(row).current_price_vnd).toBe(61_800);

    expect(() =>
      toLegacyInstrumentDetail({
        ...row,
        currentPriceVnd: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      }),
    ).toThrow(InternalServerErrorException);
  });
});

describe('InstrumentsService', () => {
  it('returns 404 for a missing instrument', async () => {
    const repository = {
      search: vi.fn(),
      findBySymbol: vi.fn().mockResolvedValue(null),
    } as unknown as InstrumentsRepository;
    const service = new InstrumentsService(repository);

    await expect(service.getBySymbol('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 for an inactive instrument', async () => {
    const repository = {
      search: vi.fn(),
      findBySymbol: vi.fn().mockResolvedValue({ ...row, isActive: false }),
    } as unknown as InstrumentsRepository;
    const service = new InstrumentsService(repository);

    await expect(service.getBySymbol('vnm')).rejects.toBeInstanceOf(NotFoundException);
  });
});
