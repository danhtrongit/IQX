import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseService, type SqlClient } from '../../src/platform/database/database.service.js';
import { BotService } from '../../src/modules/bots/bot.service.js';
import { Cap5Service } from '../../src/modules/journey/cap5/cap5.service.js';
import type { HuntBar, HuntDataSource } from '../../src/modules/journey/cap5/cap5.types.js';
import { HUNT_FILTERS } from '../../src/modules/journey/cap5/cap5.types.js';
import { CAP6_POST_GRADUATION_HOOKS } from '../../src/modules/journey/cap6/cap6.types.js';
import { Cap6Service } from '../../src/modules/journey/cap6/cap6.service.js';

const bars = (volume: number): HuntBar[] =>
  Array.from({ length: 21 }, (_, index) => ({
    time: `2026-09-${String(index + 1).padStart(2, '0')}`,
    open: 10_000,
    high: 10_100,
    low: 9_900,
    close: 10_000,
    volume: index === 20 ? volume : 1_000,
    gtgdVnd: 2_000_000_000,
  }));

const source: HuntDataSource = {
  dailyBars: async (symbols: readonly string[]) =>
    new Map(symbols.map((symbol) => [symbol, bars(5_000)])),
  netFlow: async () => new Map([['AAA', [1, 1, 1, 1, 1]]]),
  restrictedSymbols: async () => new Set<string>(),
};

type Call = { sql: string; values: readonly unknown[] | undefined };

/** A database that has no journey rows at all: every cap5_progress lookup returns nothing. */
function fakeDatabase(options: { progress?: boolean } = {}) {
  const calls: Call[] = [];
  const respond = async (sql: string, values?: readonly unknown[]) => {
    calls.push({ sql, values });
    if (/from symbols\s+where is_active/i.test(sql) && /upper\(symbol\) symbol/.test(sql)) {
      return [{ symbol: 'AAA' }, { symbol: 'BBB' }];
    }
    if (/FROM symbols\s+WHERE symbol/i.test(sql)) {
      return [{ symbol: 'FPT', is_active: true, is_index: false, asset_type: 'stock' }];
    }
    if (/from cap5_progress/i.test(sql)) return options.progress ? [{ id: 'p1' }] : [];
    if (/delete from watchlist_items/i.test(sql)) return [{ id: 'w1' }];
    if (/from watchlist_items where user_id = \$1 and upper\(symbol\)/i.test(sql)) return [];
    if (/count\(\*\)::text count from watchlist_items/i.test(sql)) return [{ count: '0' }];
    if (/select \* from watchlist_items where id = \$1/i.test(sql)) {
      return [{ id: values?.[0], user_id: 'u', symbol: 'FPT', hunt_filter: 'kl' }];
    }
    if (/select \* from watchlist_items where user_id/i.test(sql)) return [];
    if (/from cap5_hunt_log/i.test(sql) && /^\s*select/i.test(sql)) return [];
    return [];
  };
  const client: SqlClient = { query: respond as SqlClient['query'] };
  const database = {
    query: respond,
    transaction: async <T>(operation: (tx: SqlClient) => Promise<T>) => operation(client),
  };
  return { calls, database: database as unknown as DatabaseService };
}

const touchedProgress = (calls: Call[]) => calls.some((call) => /cap5_progress/i.test(call.sql));
const touchedHuntLog = (calls: Call[]) => calls.some((call) => /cap5_hunt_log/i.test(call.sql));

describe('Săn mã is independent of the level journey', () => {
  it('serves the hunt index with no cap5 progress and no cap4 graduation', async () => {
    const { calls, database } = fakeDatabase();
    const service = new Cap5Service(database, source);
    const index = await service.huntIndex();
    expect(touchedProgress(calls)).toBe(false);
    expect(index.bo_loc.map((filter) => filter.ma)).toEqual([...HUNT_FILTERS]);
    expect(index.bo_loc.map((filter) => filter.ma)).toEqual([
      'ngoai',
      'tudoanh',
      'kl',
      'dinh',
      'tang',
    ]);
    expect(index.bo_loc.every((filter) => filter.kha_dung)).toBe(true);
    expect(index.so_ma_trong_ro).toBe(2);
    expect(index.hien_thi_toi_da).toBe(10);
  });

  it('serves each hunt result without cap5 progress and keeps the filter conditions', async () => {
    const { calls, database } = fakeDatabase();
    const service = new Cap5Service(database, source);
    const result = await service.huntResult('kl');
    expect(touchedProgress(calls)).toBe(false);
    expect(result).toMatchObject({
      ma: 'kl',
      kha_dung: true,
      dieu_kien: 'Khối lượng ≥ 2× trung bình 20 phiên',
      xep_hang_theo: 'Tỷ lệ khối lượng/TB20',
      hien_thi_toi_da: 10,
    });
    expect(result.items.length).toBeGreaterThan(0);
    await expect(service.huntResult('khong_co')).rejects.toMatchObject({
      response: { code: 'HUNT_FILTER_NOT_FOUND' },
    });
  });

  it('adds a watchlist item without journey progress and never creates cap5 rows', async () => {
    const { calls, database } = fakeDatabase();
    const service = new Cap5Service(database, source);
    const row = await service.addWatchlist('user-1', { symbol: 'fpt', hunt_filter: 'kl' });
    expect(row).toMatchObject({ symbol: 'FPT', hunt_filter: 'kl' });
    expect(calls.some((c) => /insert into watchlist_items/i.test(c.sql))).toBe(true);
    expect(
      calls.some((c) => /insert into cap5_progress|insert into cap5_hunt_log/i.test(c.sql)),
    ).toBe(false);
    expect(touchedHuntLog(calls)).toBe(false);
  });

  it('still maintains the legacy hunt log for users who already entered Cap 5', async () => {
    const { calls, database } = fakeDatabase({ progress: true });
    const service = new Cap5Service(database, source);
    await service.addWatchlist('user-1', { symbol: 'FPT', hunt_filter: 'dinh' });
    expect(calls.some((c) => /insert into cap5_hunt_log/i.test(c.sql))).toBe(true);
  });

  it('removes and lists the watchlist without journey progress', async () => {
    const { calls, database } = fakeDatabase();
    const service = new Cap5Service(database, source);
    await expect(service.removeWatchlist('user-1', 'fpt')).resolves.toBeUndefined();
    const list = await service.watchlist('user-1');
    expect(list).toMatchObject({ items: [], so_luong: 0, toi_da: 50 });
    expect(touchedProgress(calls)).toBe(false);
  });
});

describe('Cap 6 graduation is not required by anything', () => {
  it('constructs Cap6Service without the post-graduation hooks provider', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        Cap6Service,
        { provide: DatabaseService, useValue: {} },
        { provide: Cap5Service, useValue: {} },
      ],
    }).compile();
    expect(moduleRef.get(Cap6Service)).toBeInstanceOf(Cap6Service);
    expect(Reflect.getMetadata('optional:paramtypes', Cap6Service)).toContain(2);
  });

  it('keeps the legacy hook and workspace onboarding on the same BotService.initialize', () => {
    expect(CAP6_POST_GRADUATION_HOOKS).toBeDefined();
    expect(typeof BotService.prototype.initialize).toBe('function');
  });
});
