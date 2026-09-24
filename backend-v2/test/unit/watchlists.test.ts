import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService, SqlClient } from '../../src/platform/database/index.js';
import {
  addWatchlistItemSchema,
  reorderWatchlistSchema,
  watchlistSymbolSchema,
} from '../../src/modules/watchlists/watchlists.schemas.js';
import {
  assertEligibleStock,
  WatchlistsService,
} from '../../src/modules/watchlists/watchlists.service.js';

function clientWithRows(
  ...rows: Record<string, unknown>[][]
): SqlClient & { query: ReturnType<typeof vi.fn> } {
  return { query: vi.fn().mockImplementation(() => Promise.resolve(rows.shift() ?? [])) };
}

describe('watchlist schemas', () => {
  it('normalizes symbols and enforces the legacy 50-item limit', () => {
    expect(addWatchlistItemSchema.parse({ symbol: ' vnm ' })).toEqual({ symbol: 'VNM' });
    expect(watchlistSymbolSchema.safeParse('../VNM').success).toBe(false);
    expect(
      reorderWatchlistSchema.safeParse({ symbols: Array.from({ length: 51 }, (_, i) => `S${i}`) })
        .success,
    ).toBe(false);
  });

  it('rejects duplicate reorder entries after normalization', () => {
    expect(reorderWatchlistSchema.safeParse({ symbols: ['vnm', 'VNM'] }).success).toBe(false);
  });
});

describe('shared stock eligibility', () => {
  it('accepts only an active, non-index stock', async () => {
    const client = clientWithRows([
      { symbol: 'VNM', is_active: true, is_index: false, asset_type: 'STOCK' },
    ]);
    await expect(assertEligibleStock(client, 'vnm')).resolves.toBe('VNM');
  });

  it.each([
    ['missing', undefined],
    ['inactive', { symbol: 'VNM', is_active: false, is_index: false, asset_type: 'stock' }],
    ['index', { symbol: 'VNINDEX', is_active: true, is_index: true, asset_type: 'stock' }],
    ['unknown asset type', { symbol: 'VNM', is_active: true, is_index: false, asset_type: null }],
    ['fund', { symbol: 'E1VFVN30', is_active: true, is_index: false, asset_type: 'fund' }],
  ])('rejects %s instruments', async (_case, row) => {
    const client = clientWithRows(row ? [row] : []);
    await expect(assertEligibleStock(client, 'vnm')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WatchlistsService ownership and mutations', () => {
  it('scopes every list query to the authenticated user', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new WatchlistsService({ query } as unknown as DatabaseService);
    await service.listForUser('user-a');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('wi.user_id = $1'), ['user-a']);
  });

  it('converts a concurrent unique violation into a domain conflict', async () => {
    const transaction = clientWithRows(
      [{ symbol: 'VNM', is_active: true, is_index: false, asset_type: 'stock' }],
      [],
      [{ count: 1 }],
    );
    transaction.query.mockImplementationOnce(() =>
      Promise.resolve([{ symbol: 'VNM', is_active: true, is_index: false, asset_type: 'stock' }]),
    );
    transaction.query.mockImplementationOnce(() => Promise.resolve([]));
    transaction.query.mockImplementationOnce(() => Promise.resolve([{ count: 1 }]));
    transaction.query.mockImplementationOnce(() => Promise.reject({ code: '23505' }));
    const database = {
      transaction: (operation: (client: SqlClient) => Promise<unknown>) => operation(transaction),
    } as unknown as DatabaseService;
    const service = new WatchlistsService(database);
    await expect(service.addForUser('user-a', 'VNM')).rejects.toBeInstanceOf(ConflictException);
  });

  it('deletes only the owned watchlist row and preserves durable Cap 5/trading history', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 'item-a' }]);
    const database = {
      transaction: (operation: (client: SqlClient) => Promise<unknown>) => operation({ query }),
    } as unknown as DatabaseService;
    const service = new WatchlistsService(database);
    await service.removeForUser('user-a', 'vnm');
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('DELETE FROM watchlist_items');
    expect(sql).toContain('user_id = $1');
    expect(sql).not.toContain('cap5_hunt_log');
    expect(sql).not.toContain('order_kehoach');
    expect(query.mock.calls[0]?.[1]).toEqual(['user-a', 'VNM']);
  });

  it('does not reveal another user item as deletable', async () => {
    const database = {
      transaction: (operation: (client: SqlClient) => Promise<unknown>) =>
        operation({ query: vi.fn().mockResolvedValue([]) }),
    } as unknown as DatabaseService;
    const service = new WatchlistsService(database);
    await expect(service.removeForUser('user-a', 'VNM')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects reorder lists containing symbols not owned by the user', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ symbol: 'VNM' }]);
    const database = {
      transaction: (operation: (client: SqlClient) => Promise<unknown>) => operation({ query }),
    } as unknown as DatabaseService;
    const service = new WatchlistsService(database);
    await expect(service.reorderForUser('user-a', ['FPT'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
