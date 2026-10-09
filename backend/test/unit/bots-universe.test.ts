import { describe, expect, it, vi } from 'vitest';

import { universeSymbolsHash } from '../../src/modules/bots/bot-universe.service.js';
import {
  applyListSchema,
  cancelPendingSchema,
  revertVn30Schema,
} from '../../src/modules/bots/bot-universe.schemas.js';
import { classifyBotSymbol } from '../../src/modules/bots/bot.tradability.js';
import { IndexMembershipProvider } from '../../src/modules/market-integration/index-membership.provider.js';
import { IndexMembershipService } from '../../src/modules/market-integration/index-membership.service.js';
import {
  nextEffectiveSession,
  tradingDayPredicate,
} from '../../src/modules/strategy-config/strategy-config.calendar.js';

const LIST = '10000000-0000-4000-8000-000000000001';
const KEY = 'idempotency-key-1';

describe('buy universe request schemas', () => {
  it('S01 uppercases and deduplicates the selection, keeping first-seen order', () => {
    const parsed = applyListSchema.parse({
      list_id: LIST,
      symbols: [' fpt ', 'VCB', 'FPT', 'vcb'],
      expected_revision: 0,
      idempotency_key: KEY,
    });
    expect(parsed.symbols).toEqual(['FPT', 'VCB']);
  });

  it('S02 rejects an empty selection, unknown keys, bad ids and tickers', () => {
    const base = { list_id: LIST, symbols: ['FPT'], expected_revision: 0, idempotency_key: KEY };
    expect(applyListSchema.safeParse({ ...base, symbols: [] }).success).toBe(false);
    expect(applyListSchema.safeParse({ ...base, list_id: 'not-a-uuid' }).success).toBe(false);
    expect(applyListSchema.safeParse({ ...base, symbols: ['<script>'] }).success).toBe(false);
    expect(applyListSchema.safeParse({ ...base, effective_session: '2020-01-01' }).success).toBe(
      false,
    );
    expect(applyListSchema.safeParse({ ...base, user_id: 'x' }).success).toBe(false);
    expect(applyListSchema.safeParse({ ...base, expected_revision: -1 }).success).toBe(false);
    expect(applyListSchema.safeParse({ ...base, idempotency_key: 'short' }).success).toBe(false);
    expect(
      applyListSchema.safeParse({
        ...base,
        symbols: Array.from({ length: 501 }, (_, index) => `S${index}`),
      }).success,
    ).toBe(false);
  });

  it('S03 revert and cancel take only a revision (and a key for revert); no client dates', () => {
    expect(revertVn30Schema.safeParse({ expected_revision: 2, idempotency_key: KEY }).success).toBe(
      true,
    );
    expect(revertVn30Schema.safeParse({ expected_revision: 2 }).success).toBe(false);
    expect(cancelPendingSchema.safeParse({ expected_revision: 1 }).success).toBe(true);
    expect(cancelPendingSchema.safeParse({ expected_revision: 0 }).success).toBe(false);
    expect(
      cancelPendingSchema.safeParse({ expected_revision: 1, effective_session: '2026-01-01' })
        .success,
    ).toBe(false);
  });

  it('S04 the symbols hash ignores order and case', () => {
    expect(universeSymbolsHash(['vcb', 'FPT'])).toBe(universeSymbolsHash(['FPT', 'VCB', 'FPT']));
    expect(universeSymbolsHash(['FPT'])).not.toBe(universeSymbolsHash(['FPT', 'VCB']));
  });
});

describe('tradability and effective session', () => {
  it('T01 only active HOSE stocks that are not indices are tradable for the Bot', () => {
    const base = {
      symbol: 'FPT',
      is_active: true,
      exchange: 'HOSE',
      is_index: false,
      asset_type: 'stock',
    };
    expect(classifyBotSymbol(base)).toBe('tradable');
    expect(classifyBotSymbol({ ...base, exchange: 'hose', asset_type: 'STOCK' })).toBe('tradable');
    expect(classifyBotSymbol(undefined)).toBe('unknown_symbol');
    expect(classifyBotSymbol({ ...base, is_active: false })).toBe('not_tradable');
    expect(classifyBotSymbol({ ...base, exchange: 'HNX' })).toBe('not_tradable');
    expect(classifyBotSymbol({ ...base, is_index: true })).toBe('not_tradable');
    expect(classifyBotSymbol({ ...base, asset_type: 'etf' })).toBe('not_tradable');
  });

  it('T02 the effective session is the first trading day AFTER the Vietnam save date', () => {
    const predicate = tradingDayPredicate({ holidays: JSON.stringify(['2026-10-02']) })!;
    // 17:30 UTC on Thursday 2026-10-01 is already Friday 00:30 in Vietnam (a holiday).
    expect(nextEffectiveSession(new Date('2026-10-01T17:30:00Z'), predicate)).toBe('2026-10-05');
    // Saved before the open on Wednesday: still strictly after the save date.
    expect(nextEffectiveSession(new Date('2026-09-30T00:30:00Z'), predicate)).toBe('2026-10-01');
    expect(tradingDayPredicate({ holidays: '{}' })).toBeNull();
    expect(tradingDayPredicate(null)).toBeNull();
  });
});

function market(symbols: unknown) {
  return {
    groupSymbols: vi.fn().mockResolvedValue({
      data: symbols,
      meta: {
        source: 'VCI',
        source_priority: 1,
        fallback_used: false,
        as_of: '2026-09-30',
        raw_endpoint: 'trading/price/symbols/getByGroup',
      },
    }),
  };
}

const thirty = Array.from({ length: 30 }, (_, index) => ({
  symbol: `s${String(index).padStart(2, '0')}`,
}));

describe('index membership provider', () => {
  it('M01 reads the VCI group endpoint and returns a sorted, hashed constituent list', async () => {
    const provider = new IndexMembershipProvider(market([...thirty].reverse()) as never);
    const result = await provider.fetchCurrent('vn30');
    expect(result.index_code).toBe('VN30');
    expect(result.symbols).toHaveLength(30);
    expect(result.symbols[0]).toBe('S00');
    expect(result.source).toContain('getByGroup?group=VN30');
    expect(result.source_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('M02 refuses a truncated, empty or malformed constituent feed', async () => {
    await expect(
      new IndexMembershipProvider(market(thirty.slice(0, 29)) as never).fetchCurrent('VN30'),
    ).rejects.toThrow('incomplete');
    await expect(
      new IndexMembershipProvider(market([]) as never).fetchCurrent('VN30'),
    ).rejects.toThrow('incomplete');
    await expect(
      new IndexMembershipProvider(market('nope') as never).fetchCurrent('VN30'),
    ).rejects.toThrow('incomplete');
    await expect(
      new IndexMembershipProvider(
        market([...thirty.slice(0, 29), { symbol: 'A B' }]) as never,
      ).fetchCurrent('VN30'),
    ).rejects.toThrow('invalid symbols');
    await expect(
      new IndexMembershipProvider(market(thirty) as never).fetchCurrent('bad code!'),
    ).rejects.toThrow('Invalid index code');
  });
});

describe('index membership service', () => {
  function fixture(existing: Record<string, unknown>[] = []) {
    const rows = [...existing];
    const database = {
      query: vi.fn(async (sql: string, values: unknown[]) => {
        const text = sql.replace(/\s+/g, ' ');
        if (text.includes('insert into index_membership_snapshots')) {
          if (rows.some((row) => row.session_date === values[1])) return [];
          rows.push({
            index_code: values[0],
            session_date: values[1],
            symbols: values[2],
            source: values[3],
            fetched_at: values[4],
            source_hash: values[5],
          });
          return [{ index_code: values[0] }];
        }
        if (text.includes('session_date <= $2::date')) {
          return rows.filter((row) => String(row.session_date) <= String(values[1])).slice(-1);
        }
        return rows.filter((row) => row.session_date === values[1]);
      }),
    };
    const provider = {
      fetchCurrent: vi.fn().mockResolvedValue({
        index_code: 'VN30',
        symbols: ['FPT', 'VCB'],
        source: 'VCI:fixture',
        source_hash: 'a'.repeat(64),
      }),
    };
    return {
      rows,
      database,
      provider,
      service: new IndexMembershipService(database as never, provider as never),
    };
  }

  const NOW = new Date('2026-09-30T11:40:00Z'); // 18:40 on 2026-09-30 in Vietnam

  it('M03 stores the current session once and never rewrites it', async () => {
    const { service, provider, rows } = fixture();
    expect(await service.capture('VN30', '2026-09-30', NOW)).toMatchObject({
      status: 'stored',
      count: 2,
    });
    expect(await service.capture('VN30', '2026-09-30', NOW)).toMatchObject({ status: 'exists' });
    expect(provider.fetchCurrent).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it('M04 never stores a past or future session from today feed', async () => {
    const { service, provider, rows } = fixture();
    expect(await service.capture('VN30', '2026-09-29', NOW)).toMatchObject({
      status: 'not_current_session',
    });
    expect(await service.capture('VN30', '2026-10-01', NOW)).toMatchObject({
      status: 'not_current_session',
    });
    expect(provider.fetchCurrent).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it('M05 a failed fetch is reported, not stored, and ensureForSession tries once for today', async () => {
    const { service, provider, rows } = fixture();
    provider.fetchCurrent.mockRejectedValue(new Error('boom'));
    expect(await service.capture('VN30', '2026-09-30', NOW)).toMatchObject({
      status: 'unavailable',
      reason: 'boom',
    });
    expect(await service.ensureForSession('VN30', '2026-09-30', NOW)).toBeNull();
    expect(provider.fetchCurrent).toHaveBeenCalledTimes(2);
    // A past session is never fetched at all.
    expect(await service.ensureForSession('VN30', '2026-09-29', NOW)).toBeNull();
    expect(provider.fetchCurrent).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([]);
  });

  it('M06 ensureForSession returns the stored snapshot without fetching', async () => {
    const { service, provider } = fixture([
      {
        index_code: 'VN30',
        session_date: '2026-09-30',
        symbols: ['VNM', 'FPT', 'VNM'],
        source: 'stored',
        fetched_at: '2026-09-30T11:40:00Z',
        source_hash: 'b'.repeat(64),
      },
    ]);
    const snapshot = await service.ensureForSession('VN30', '2026-09-30', NOW);
    expect(snapshot).toMatchObject({ symbols: ['FPT', 'VNM'], source: 'stored' });
    expect(provider.fetchCurrent).not.toHaveBeenCalled();
    expect((await service.latestOnOrBefore('VN30', '2026-10-05'))?.session_date).toBe('2026-09-30');
  });
});
