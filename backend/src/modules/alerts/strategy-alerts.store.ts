import type { Side } from '../quant/v2/index.js';
import type {
  AlertEvaluationStore,
  AlertEventRow,
  AlertScope,
  AlertSource,
  AlertVersionRow,
  AlertWithVersion,
  EventFilter,
  StateSummary,
} from './strategy-alerts.types.js';
import type { SharedConfig } from '../quant/v2/index.js';

/** Maximum number of non-deleted alerts per user (technical safety cap, not a plan limit). */
export const MAX_ALERTS_PER_USER = 100;

export type OwnedListInfo = {
  id: string;
  name: string;
  tickers: string[];
  as_of: string;
};

export type OwnedRunInfo = {
  id: string;
  shared_revision: number;
  symbol: string;
  start: string;
  end: string;
  created_at: Date;
  config: SharedConfig | null;
};

/** A candidate version computed by the service (conditions, scope and sides already validated). */
export type NewVersionInput = {
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
};

export type CreateAlertInput = {
  user_id: string;
  name: string;
  enabled: boolean;
  version: NewVersionInput;
  idempotency_key: string | null;
  request_hash: string;
};

export type UpdateAlertInput = {
  name?: string;
  enabled?: boolean;
  /** A changed definition: becomes version current + 1 (skipped when its hash equals the current). */
  version?: NewVersionInput;
  expected_version?: number;
};

/**
 * Persistence of Strategy alert definitions and events (faked in unit tests). Every mutating
 * method is one transaction and enforces ownership, name uniqueness and the per-user cap.
 */
export interface StrategyAlertsStore extends AlertEvaluationStore {
  /** Active, non-index symbols of the catalog among `symbols` (uppercase). */
  activeSymbols(symbols: readonly string[]): Promise<Set<string>>;
  findOwnedList(userId: string, listId: string): Promise<OwnedListInfo | null>;
  findOwnedSucceededRun(userId: string, runId: string): Promise<OwnedRunInfo | null>;

  list(userId: string): Promise<AlertWithVersion[]>;
  get(userId: string, alertId: string): Promise<AlertWithVersion | null>;
  versions(alertId: string): Promise<AlertVersionRow[]>;
  stateSummaries(alertIds: readonly string[]): Promise<StateSummary[]>;

  create(input: CreateAlertInput): Promise<AlertWithVersion>;
  update(userId: string, alertId: string, input: UpdateAlertInput): Promise<AlertWithVersion>;
  /** Soft delete + pause: history (events, versions) is kept. false when not found. */
  remove(userId: string, alertId: string): Promise<boolean>;

  listEvents(
    userId: string,
    filter: EventFilter,
  ): Promise<{ items: AlertEventRow[]; total: number }>;
  getEvent(userId: string, eventId: string): Promise<AlertEventRow | null>;
}
