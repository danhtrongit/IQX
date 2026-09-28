import type { LegacyWatchlistItem, WatchlistItem, WatchlistRow } from './watchlists.types.js';

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value.replace(' ', 'T');
}

function nullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}

export function toLegacyWatchlistItem(row: WatchlistRow): LegacyWatchlistItem {
  return {
    id: row.id,
    symbol: row.symbol,
    sort_order: row.sort_order,
    created_at: timestamp(row.created_at),
  };
}

export function toWatchlistItem(row: WatchlistRow): WatchlistItem {
  return {
    id: row.id,
    symbol: row.symbol,
    sortOrder: row.sort_order,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    instrument: {
      name: row.instrument_name,
      shortName: row.instrument_short_name,
      exchange: row.instrument_exchange,
      assetType: row.instrument_asset_type,
      logoUrl: row.instrument_logo_url,
      isActive: row.instrument_is_active,
    },
    provenance: {
      huntFilter: row.hunt_filter,
      huntSignal: row.hunt_signal,
      huntAt: nullableTimestamp(row.hunt_at),
    },
    consensus: {
      supportingLayers: row.consensus_today,
      previousSupportingLayers: row.consensus_prev,
      evaluatedLayers: row.consensus_da_cham,
      evaluatedAt: nullableTimestamp(row.consensus_at),
      status: row.status,
    },
  };
}
