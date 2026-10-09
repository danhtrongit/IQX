import { Injectable } from '@nestjs/common';

import { MarketDataService } from '../market-data/market-data.service.js';
import { isObject, stableHash } from './integration.utils.js';

export type IndexConstituents = {
  index_code: string;
  /** Sorted unique uppercase symbols. */
  symbols: string[];
  source: string;
  source_hash: string;
};

/** Constituent counts an index must have; anything else is treated as a broken feed. */
const EXPECTED_SIZE: Readonly<Record<string, number>> = Object.freeze({ VN30: 30 });
const SYMBOL = /^[A-Z0-9]{2,10}$/;
const INDEX_CODE = /^[A-Z0-9]{2,16}$/;

export function normalizeIndexCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!INDEX_CODE.test(code)) throw new Error(`Invalid index code: ${value}`);
  return code;
}

/**
 * Reads the CURRENT constituents of an index through the existing market-data group endpoint
 * (`GET /api/v2/market-data/reference/groups/:group/symbols`). The feed has no history, so
 * callers must only store the result for the session it was observed on.
 */
@Injectable()
export class IndexMembershipProvider {
  constructor(private readonly market: MarketDataService) {}

  async fetchCurrent(indexCode: string): Promise<IndexConstituents> {
    const code = normalizeIndexCode(indexCode);
    const response = await this.market.groupSymbols(code);
    const rows: unknown = response.data;
    const symbols = [
      ...new Set(
        (Array.isArray(rows) ? rows : [])
          .map((row) => (isObject(row) ? row.symbol : row))
          .map((value) => (typeof value === 'string' ? value.trim().toUpperCase() : ''))
          .filter(Boolean),
      ),
    ].sort();
    const invalid = symbols.filter((symbol) => !SYMBOL.test(symbol));
    if (invalid.length) {
      throw new Error(`${code} constituents contain invalid symbols: ${invalid.join(',')}`);
    }
    const expected = EXPECTED_SIZE[code];
    if (!symbols.length || (expected !== undefined && symbols.length !== expected)) {
      throw new Error(
        `${code} constituents incomplete: received ${symbols.length}` +
          (expected === undefined ? '' : `, expected ${expected}`),
      );
    }
    const meta = response.meta;
    return {
      index_code: code,
      symbols,
      source: `${meta.source}:${meta.raw_endpoint}?group=${code}`.slice(0, 160),
      source_hash: stableHash({ index_code: code, symbols }),
    };
  }
}
