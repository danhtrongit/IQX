export type WatchlistRow = {
  id: string;
  user_id: string;
  symbol: string;
  sort_order: number;
  hunt_filter: string | null;
  hunt_signal: string | null;
  hunt_at: Date | string | null;
  consensus_today: number | null;
  consensus_prev: number | null;
  consensus_da_cham: number | null;
  consensus_at: Date | string | null;
  status: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  instrument_name: string | null;
  instrument_short_name: string | null;
  instrument_exchange: string | null;
  instrument_asset_type: string | null;
  instrument_logo_url: string | null;
  instrument_is_active: boolean | null;
};

export type LegacyWatchlistItem = {
  id: string;
  symbol: string;
  sort_order: number;
  created_at: string;
};

export type WatchlistItem = {
  id: string;
  symbol: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  instrument: {
    name: string | null;
    shortName: string | null;
    exchange: string | null;
    assetType: string | null;
    logoUrl: string | null;
    isActive: boolean | null;
  };
  provenance: {
    huntFilter: string | null;
    huntSignal: string | null;
    huntAt: string | null;
  };
  consensus: {
    supportingLayers: number | null;
    previousSupportingLayers: number | null;
    evaluatedLayers: number | null;
    evaluatedAt: string | null;
    status: string | null;
  };
};
