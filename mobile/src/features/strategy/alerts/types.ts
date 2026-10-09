export type AlertSide = 'buy' | 'sell';
export type AlertStatus = 'watching' | 'paused' | 'unchecked' | 'waiting_data' | 'config_error';

export type AlertSource =
  | { kind: 'shared_config'; revision: number }
  | { kind: 'backtest_run'; symbol: string; start: string; end: string; shared_revision: number; run_id?: string };
export type AlertSourceInput = { kind: 'shared_config'; revision: number } | { kind: 'backtest_run'; run_id: string };

export type AlertScope =
  | { kind: 'symbols' }
  | { kind: 'saved_list'; list_id: string; list_name: string };
export type AlertScopeInput = { kind: 'symbols'; symbols: string[] };

export type SideDetail = { valid: boolean; indicator_ids: string[]; watched?: boolean };
export type SidesDetail = Record<AlertSide, SideDetail>;

export type AlertVersion = {
  version?: number;
  sides: AlertSide[];
  symbols: string[];
  sides_detail: SidesDetail;
  source: AlertSource;
  scope: AlertScope;
  created_at?: string;
};

export type StrategyAlert = {
  id: string;
  name: string;
  enabled: boolean;
  status: AlertStatus;
  current_version: number;
  version: AlertVersion;
  last_check: { session: string | null; pairs_expected: number; pairs_checked: number };
};

export type AlertDetail = StrategyAlert & { versions?: (AlertVersion & { version: number })[] };

export type AlertSourcePreview = {
  source: { kind: 'shared_config' | 'backtest_run'; revision?: number; shared_revision?: number; symbol?: string };
  sides_detail: SidesDetail;
  suggested_symbol: string | null;
};

export type RuleEvidence = {
  id: string;
  indicator: string;
  side: AlertSide;
  op: string;
  lhs: number | null;
  rhs: number | null;
  rhs_lower?: number | null;
  rhs_upper?: number | null;
  result: boolean | null;
  missing: boolean;
  previous_lhs?: number | null;
  previous_rhs?: number | null;
};

export type AlertEvent = {
  id: string;
  signal_session: string;
  symbol: string;
  side: AlertSide;
  side_label: string;
  message: string;
  alert_id: string;
  alert_name: string;
  alert_version: number;
  event_kind?: string;
  event_kind_label?: string;
  evaluated_at?: string;
  previous_valid_result?: boolean | null;
  previous_valid_session?: string | null;
  evidence: {
    bar?: { date: string; open: number; high: number; low: number; close: number; volume: number } | null;
    indicator_ids: string[];
    indicator_params: Record<string, Record<string, number>>;
    rules: RuleEvidence[];
  };
};

export type AlertEventPage = { items: AlertEvent[]; total: number; offset?: number; limit?: number };

export type ConfigRevision = { revision: number; saved_at: string };
export type RunRow = {
  run_id: string;
  kind: string;
  status: string;
  symbol: string;
  start: string;
  end: string;
  shared_revision: number;
  created_at: string;
};
