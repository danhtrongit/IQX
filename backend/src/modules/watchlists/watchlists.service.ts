import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import { MAX_WATCHLIST_ITEMS, type WatchlistProvenance } from './watchlists.schemas.js';
import type { WatchlistRow } from './watchlists.types.js';

type EligibleStockRow = {
  symbol: string;
  is_active: boolean;
  is_index: boolean;
  asset_type: string | null;
};

const WATCHLIST_SELECT = `
  SELECT
    wi.id,
    wi.user_id,
    wi.symbol,
    wi.sort_order,
    wi.hunt_filter,
    wi.hunt_signal,
    wi.hunt_at,
    wi.consensus_today,
    wi.consensus_prev,
    wi.consensus_da_cham,
    wi.consensus_at,
    wi.status,
    wi.created_at,
    wi.updated_at,
    s.name AS instrument_name,
    s.short_name AS instrument_short_name,
    s.exchange AS instrument_exchange,
    s.asset_type AS instrument_asset_type,
    s.logo_url AS instrument_logo_url,
    s.is_active AS instrument_is_active
  FROM watchlist_items wi
  LEFT JOIN symbols s ON s.symbol = wi.symbol
`;

/**
 * Shared stock-eligibility rule for ordinary watchlists and Cap 5 hunting.
 * NULL asset types are deliberately rejected: unknown is not the same as stock.
 */
export async function assertEligibleStock(client: SqlClient, rawSymbol: string): Promise<string> {
  const symbol = rawSymbol.trim().toUpperCase();
  const [row] = await client.query<EligibleStockRow>(
    `SELECT symbol, is_active, is_index, asset_type
       FROM symbols
      WHERE symbol = $1
      LIMIT 1`,
    [symbol],
  );
  if (!row || !row.is_active) {
    throw new BadRequestException({
      code: 'WATCHLIST_SYMBOL_NOT_FOUND',
      message: `Mã ${symbol} không tồn tại`,
    });
  }
  if (row.is_index || row.asset_type?.toLowerCase() !== 'stock') {
    throw new BadRequestException({
      code: 'WATCHLIST_STOCK_REQUIRED',
      message: `Mã ${symbol} không phải là cổ phiếu`,
    });
  }
  return symbol;
}

@Injectable()
export class WatchlistsService {
  constructor(private readonly database: DatabaseService) {}

  listForUser(userId: string, client: SqlClient = this.database): Promise<WatchlistRow[]> {
    return client.query<WatchlistRow>(
      `${WATCHLIST_SELECT}
       WHERE wi.user_id = $1
       ORDER BY wi.sort_order ASC, wi.created_at ASC`,
      [userId],
    );
  }

  async getForUser(
    userId: string,
    symbol: string,
    client: SqlClient = this.database,
  ): Promise<WatchlistRow | null> {
    const [row] = await client.query<WatchlistRow>(
      `${WATCHLIST_SELECT}
       WHERE wi.user_id = $1 AND wi.symbol = $2
       LIMIT 1`,
      [userId, symbol.trim().toUpperCase()],
    );
    return row ?? null;
  }

  async isWatched(userId: string, symbol: string): Promise<boolean> {
    const rows = await this.database.query<{ present: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM watchlist_items WHERE user_id = $1 AND symbol = $2
       ) AS present`,
      [userId, symbol.trim().toUpperCase()],
    );
    return rows[0]?.present ?? false;
  }

  /**
   * Add a symbol while preserving optional server-generated Cap 5 provenance.
   * Callers which already own a transaction may pass it to keep their command atomic.
   */
  addForUser(
    userId: string,
    rawSymbol: string,
    provenance: WatchlistProvenance = {},
    client?: SqlClient,
  ): Promise<WatchlistRow> {
    if (client) return this.addInTransaction(client, userId, rawSymbol, provenance);
    return this.database.transaction((transaction) =>
      this.addInTransaction(transaction, userId, rawSymbol, provenance),
    );
  }

  async removeForUser(userId: string, rawSymbol: string): Promise<void> {
    const symbol = rawSymbol.trim().toUpperCase();
    const rows = await this.database.transaction((transaction) =>
      transaction.query<{ id: string }>(
        `DELETE FROM watchlist_items
          WHERE user_id = $1 AND symbol = $2
        RETURNING id`,
        [userId, symbol],
      ),
    );
    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'WATCHLIST_ITEM_NOT_FOUND',
        message: `Mã ${symbol} không có trong danh sách`,
      });
    }
    // Intentionally do not delete cap5_hunt_log or order_kehoach: those rows
    // are durable learning/trading history, not children of the current list.
  }

  reorderForUser(userId: string, rawSymbols: string[]): Promise<WatchlistRow[]> {
    const symbols = rawSymbols.map((symbol) => symbol.trim().toUpperCase());
    return this.database.transaction(async (transaction) => {
      await lockUserWatchlist(transaction, userId);
      const current = await transaction.query<{ symbol: string }>(
        `SELECT symbol
           FROM watchlist_items
          WHERE user_id = $1
          ORDER BY sort_order ASC, created_at ASC
          FOR UPDATE`,
        [userId],
      );
      const currentSet = new Set(current.map((row) => row.symbol));
      if (
        new Set(symbols).size !== symbols.length ||
        symbols.length !== currentSet.size ||
        symbols.some((symbol) => !currentSet.has(symbol))
      ) {
        throw new BadRequestException({
          code: 'WATCHLIST_REORDER_MISMATCH',
          message: 'Danh sách sắp xếp phải chứa đúng các mã đang theo dõi',
        });
      }
      if (symbols.length > 0) {
        await transaction.query(
          `UPDATE watchlist_items AS wi
              SET sort_order = ordered.position - 1,
                  updated_at = now()
             FROM unnest($2::text[]) WITH ORDINALITY AS ordered(symbol, position)
            WHERE wi.user_id = $1 AND wi.symbol = ordered.symbol`,
          [userId, symbols],
        );
      }
      return this.listForUser(userId, transaction);
    });
  }

  private async addInTransaction(
    transaction: SqlClient,
    userId: string,
    rawSymbol: string,
    provenance: WatchlistProvenance,
  ): Promise<WatchlistRow> {
    const symbol = await assertEligibleStock(transaction, rawSymbol);
    await lockUserWatchlist(transaction, userId);
    const [{ count = 0 } = {}] = await transaction.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM watchlist_items WHERE user_id = $1`,
      [userId],
    );
    if (count >= MAX_WATCHLIST_ITEMS) {
      throw new BadRequestException({
        code: 'WATCHLIST_LIMIT_REACHED',
        message: `Danh sách yêu thích tối đa ${MAX_WATCHLIST_ITEMS} mã`,
      });
    }

    try {
      await transaction.query(
        `INSERT INTO watchlist_items (
           id, user_id, symbol, sort_order,
           hunt_filter, hunt_signal, hunt_at, created_at, updated_at
         )
         VALUES (
           $1, $2, $3,
           COALESCE((SELECT max(sort_order) + 1 FROM watchlist_items WHERE user_id = $2), 0),
           $4, $5, $6, now(), now()
         )`,
        [
          randomUUID(),
          userId,
          symbol,
          provenance.huntFilter ?? null,
          provenance.huntSignal ?? null,
          provenance.huntAt ?? null,
        ],
      );
    } catch (error) {
      if (postgresCode(error) === '23505') {
        throw new ConflictException({
          code: 'WATCHLIST_ITEM_EXISTS',
          message: `Mã ${symbol} đã có trong danh sách`,
        });
      }
      throw error;
    }

    const row = await this.getForUser(userId, symbol, transaction);
    if (!row) throw new Error('Inserted watchlist item was not returned');
    return row;
  }
}

async function lockUserWatchlist(client: SqlClient, userId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [userId]);
}

function postgresCode(error: unknown): string | undefined {
  let value: unknown = error;
  for (let depth = 0; depth < 4 && typeof value === 'object' && value !== null; depth += 1) {
    const candidate = value as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') return candidate.code;
    value = candidate.cause;
  }
  return undefined;
}
