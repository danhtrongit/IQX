import type { SymbolRow } from '../../src/platform/database/index.js';

const AWARE_TIMESTAMP = '2026-09-23 01:02:03.654321+00';
const NAIVE_TIMESTAMP = '2026-09-23 01:02:03.123456';

export function makeSymbolRow(overrides: Partial<SymbolRow> = {}): SymbolRow {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    symbol: 'VCB',
    name: 'Ngân hàng TMCP Ngoại thương Việt Nam',
    shortName: 'Vietcombank',
    exchange: 'HOSE',
    assetType: 'stock',
    isIndex: false,
    currentPriceVnd: 88_000n,
    targetPriceVnd: 100_000n,
    upsidePct: 13.64,
    logoUrl: 'https://cdn.example.test/vcb.svg',
    logoSource: 'legacy',
    icbLv1: 'Financials',
    icbLv2: 'Banks',
    source: 'legacy-db',
    sourceUrl: 'https://upstream.example.test/vcb',
    lastSyncedAt: AWARE_TIMESTAMP,
    isActive: true,
    createdAt: NAIVE_TIMESTAMP,
    updatedAt: NAIVE_TIMESTAMP,
    ...overrides,
  };
}
