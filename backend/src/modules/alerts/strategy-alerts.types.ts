import type { SharedConfig, Side } from '../quant/v2/index.js';
import type {
  AlertEventKind,
  AlertStateRow,
  EvaluationPlan,
  StateResult,
} from './strategy-alerts.evaluation.js';

/** Where the pinned conditions came from (the snapshot itself lives in `config`). */
export type AlertSource =
  | {
      kind: 'shared_config';
      revision: number;
      saved_at: string;
      stored_config_hash: string;
    }
  | {
      kind: 'backtest_run';
      run_id: string;
      shared_revision: number;
      symbol: string;
      start: string;
      end: string;
      run_created_at: string;
    };

/**
 * Watched scope. A saved list is referenced by id (lists are immutable snapshots, so its
 * version is fixed at 1) and the tickers chosen at save time are kept in `symbols`: deleting the
 * list or re-running its filter never changes the alert.
 */
export type AlertScope =
  | { kind: 'symbols' }
  | {
      kind: 'saved_list';
      list_id: string;
      list_version: 1;
      list_name: string;
      list_as_of: string;
      list_ticker_count: number;
    };

export type AlertVersionRow = {
  alert_id: string;
  version: number;
  source: AlertSource;
  config: SharedConfig;
  config_hash: string;
  schema_version: string;
  rule_version: string;
  calculation_version: string;
  scope: AlertScope;
  symbols: string[];
  sides: Side[];
  definition_hash: string;
  created_at: Date;
};

export type AlertRow = {
  id: string;
  user_id: string;
  name: string;
  enabled: boolean;
  current_version: number;
  observation_epoch: number;
  observation_started_at: Date;
  paused_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type AlertWithVersion = AlertRow & { version_row: AlertVersionRow };

export type StateSummary = {
  alert_id: string;
  version: number;
  total: number;
  true_count: number;
  false_count: number;
  unknown_count: number;
  blocked_count: number;
  last_session: string | null;
  last_evaluated_at: Date | null;
};

export type AlertEventRow = {
  id: string;
  user_id: string;
  alert_id: string;
  alert_version: number;
  alert_name: string;
  symbol: string;
  side: Side;
  signal_session: string;
  event_kind: AlertEventKind;
  message: string;
  evaluated_at: Date;
  data_version: string;
  config_hash: string;
  rule_version: string;
  calculation_version: string;
  previous_valid_result: boolean | null;
  previous_valid_session: string | null;
  evidence: Record<string, unknown>;
  created_at: Date;
};

export type EventFilter = {
  side?: Side;
  alert_id?: string;
  symbol?: string;
  offset: number;
  limit: number;
};

/** An enabled alert (current version) the job has to look at. */
export type EvaluationTarget = {
  alert_id: string;
  user_id: string;
  name: string;
  version: number;
  epoch: number;
  config: SharedConfig;
  config_hash: string;
  rule_version: string;
  calculation_version: string;
  symbols: string[];
  sides: Side[];
};

export type ApplyEvaluationInput = {
  target: EvaluationTarget;
  symbol: string;
  side: Side;
  session: string;
  evaluated_at: Date;
  result: boolean | null;
  reason: string | null;
  data_version: string;
  evidence: Record<string, unknown>;
};

export type ApplyEvaluationOutcome = {
  plan: EvaluationPlan;
  /** A new event row was written (false when deduplicated or when nothing was emitted). */
  event_created: boolean;
  /** The durable unique key already held an event for this alert version/symbol/side/session. */
  duplicate: boolean;
  result: StateResult;
};

/** Persistence used by the end-of-session evaluator (faked in unit tests). */
export interface AlertEvaluationStore {
  /** Enabled, undeleted alerts of active, entitled users (current version only). */
  listTargets(): Promise<EvaluationTarget[]>;
  /** States of the given alerts (all versions are harmless; the evaluator filters by version). */
  loadStates(alertIds: readonly string[]): Promise<AlertStateRow[]>;
  /**
   * Atomically (one transaction, row lock on the state): plan the transition from the stored
   * state, write the state and — when the plan emits one — the event under the durable unique
   * key (alert, version, symbol, side, signal_session) with ON CONFLICT DO NOTHING.
   */
  applyEvaluation(input: ApplyEvaluationInput): Promise<ApplyEvaluationOutcome>;
}
