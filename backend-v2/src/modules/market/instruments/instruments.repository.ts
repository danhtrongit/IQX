import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';

import { DatabaseService, symbols, type SymbolRow } from '../../../platform/database/index.js';
import type { InstrumentSearchQuery } from './instruments.schemas.js';

export interface InstrumentSearchRows {
  rows: SymbolRow[];
  total: number;
}

/** Escape LIKE metacharacters in the same order as the legacy repository. */
export function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

@Injectable()
export class InstrumentsRepository {
  constructor(private readonly database: DatabaseService) {}

  async search(params: InstrumentSearchQuery): Promise<InstrumentSearchRows> {
    return this.database.read(async (db) => {
      const filters: SQL[] = [eq(symbols.isActive, true)];

      if (!params.include_indices) {
        filters.push(eq(symbols.isIndex, false));
      }
      if (params.exchange) {
        filters.push(eq(symbols.exchange, params.exchange.toUpperCase()));
      }
      if (params.asset_type) {
        filters.push(eq(symbols.assetType, params.asset_type.toLowerCase()));
      }

      const cleaned = params.q?.trim().toUpperCase();
      let rank: SQL<number> | undefined;
      if (cleaned) {
        const escaped = escapeLikePattern(cleaned);
        const containsPattern = `%${escaped}%`;
        const prefixPattern = `${escaped}%`;

        filters.push(sql`(
          ${symbols.symbol} ILIKE ${containsPattern} ESCAPE '\\'
          OR ${symbols.name} ILIKE ${containsPattern} ESCAPE '\\'
          OR ${symbols.shortName} ILIKE ${containsPattern} ESCAPE '\\'
        )`);
        rank = sql<number>`CASE
          WHEN ${symbols.symbol} = ${cleaned} THEN 1
          WHEN ${symbols.symbol} ILIKE ${prefixPattern} ESCAPE '\\' THEN 2
          ELSE 3
        END`;
      }

      const where = and(...filters);
      const [countRow] = await db
        .select({ total: sql<number>`count(*)::integer` })
        .from(symbols)
        .where(where);

      const rows = await db
        .select()
        .from(symbols)
        .where(where)
        .orderBy(...(rank ? [rank, asc(symbols.symbol)] : [asc(symbols.symbol)]))
        .offset((params.page - 1) * params.page_size)
        .limit(params.page_size);

      return { rows, total: countRow?.total ?? 0 };
    });
  }

  async findBySymbol(symbol: string): Promise<SymbolRow | null> {
    return this.database.read(async (db) => {
      const [row] = await db
        .select()
        .from(symbols)
        .where(eq(symbols.symbol, symbol.toUpperCase()))
        .limit(1);

      return row ?? null;
    });
  }
}
