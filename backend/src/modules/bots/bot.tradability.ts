/**
 * The Bot trades active HOSE stocks only. The very same predicate selects the symbols the
 * market snapshot may deliver and validates every symbol of a user-applied buy universe, so
 * a list can never contain a symbol the Bot would later refuse as "not tradable".
 *
 * Restricted-securities status (cảnh báo / kiểm soát / hạn chế giao dịch) is intentionally NOT
 * part of this static predicate: it is time-varying and is checked per symbol per session.
 */
export const BOT_TRADABLE_SYMBOL_SQL = `is_active = true
  and upper(exchange) = 'HOSE'
  and coalesce(is_index, false) = false
  and lower(asset_type) = 'stock'`;

export type SymbolTradability = 'tradable' | 'unknown_symbol' | 'not_tradable';

type SymbolRow = {
  symbol: string;
  is_active: boolean | null;
  exchange: string | null;
  is_index: boolean | null;
  asset_type: string | null;
};

export function classifyBotSymbol(row: SymbolRow | undefined): SymbolTradability {
  if (!row) return 'unknown_symbol';
  const tradable =
    row.is_active === true &&
    (row.exchange ?? '').toUpperCase() === 'HOSE' &&
    row.is_index !== true &&
    (row.asset_type ?? '').toLowerCase() === 'stock';
  return tradable ? 'tradable' : 'not_tradable';
}
