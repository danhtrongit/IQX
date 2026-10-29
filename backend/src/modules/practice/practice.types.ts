import type {
  NoSignalReason,
  Operand,
  RowDefinition,
  RowSideConfig,
  RuleOp,
  Side,
  Tri,
} from '../quant/v2/index.js';

/**
 * Side of a row-based indicator (the 15 indicators, SPEC V3 §1.4): the tab switch and one
 * self-contained condition row per registry row (own periods, threshold and operator).
 */
export type PracticeRowsSide = RowSideConfig;

/**
 * Side of a params-based indicator (Volume, unchanged by SPEC V3): side-level params and the
 * operator chosen per stable registry rule id. A config in this shape for a row-based
 * indicator is the pre-V3 format and is never mapped (SPEC V3 §6.1.5).
 */
export type PracticeParamsSide = {
  enabled: boolean;
  params: Record<string, number>;
  ops: Record<string, RuleOp>;
  rules_enabled?: Record<string, boolean>;
};

export type PracticeSideInput = PracticeRowsSide | PracticeParamsSide;

export type PracticeRowsConfig = {
  buy: PracticeRowsSide;
  sell: PracticeRowsSide;
  hold_max_sessions: number;
};

export type PracticeParamsConfig = {
  buy: PracticeParamsSide;
  sell: PracticeParamsSide;
  hold_max_sessions: number;
};

/** Practice config of one indicator: rows (15 indicators) or params + operators (Volume). */
export type PracticeConfig = PracticeRowsConfig | PracticeParamsConfig;

export type PracticeValidationError = {
  path: string;
  message: string;
  /** Row validation: the tab and the 1-based row number of the error. */
  side?: Side;
  row?: number;
};

export type RuleEvidenceRow = {
  /** Row id (`rsi.level`); Volume and runs locked before SPEC V3 carry `r1`, `r2`. */
  rule_id: string;
  kind: 'compare' | 'cross' | 'membership';
  op: RuleOp;
  left_label: string;
  right_label: string;
  /** Registry sentence of the row with the values it ran with (`RSI 14 < 30`). Absent on older runs. */
  label?: string;
  /** The row's own stored values (periods, threshold, operator code). Absent on older runs. */
  values?: Record<string, number | string>;
  lhs: number | null;
  rhs: number | null;
  rhs_lower?: number | null;
  rhs_upper?: number | null;
  previous_lhs?: number | null;
  previous_rhs?: number | null;
  /** true / false / null (missing data). */
  result: Tri;
  missing: boolean;
};

/** Evidence of one decision (signal close). Taken from the locked snapshot, never recomputed. */
export type DecisionEvidence = {
  side: Side;
  /** Session index (Phiên 1 = first test session) of the close where the decision was made. */
  signal_session: number;
  enabled: boolean;
  /** `null` when there is no signal (`status = no_signal`) or a needed value is missing. */
  result: Tri;
  /** `no_signal` when the tab is off or no row is enabled (SPEC V3 §1.3). Absent on older runs. */
  status?: 'ok' | 'no_signal';
  reason?: NoSignalReason | null;
  /** Volume: the side params. Row-based indicators carry their values on each rule. */
  params: Record<string, number>;
  rules: RuleEvidenceRow[];
};

export type TimeExitEvidence = {
  hold_max_sessions: number;
  /** i - entry + 1 at the signal close. */
  held_sessions_at_signal: number;
  due: boolean;
};

export type BuyLeg = {
  signal_session: number;
  session: number;
  price: number;
  fee: number;
  total_cost: number;
  evidence: DecisionEvidence;
};

export type SellLeg = {
  signal_session: number;
  session: number;
  price: number;
  fee: number;
  net_proceeds: number;
  /** Primary reason: `indicator` when the sell condition met (even if time was also due). */
  reason: 'indicator' | 'max_holding';
  indicator_met: boolean;
  time_due: boolean;
  evidence: DecisionEvidence;
  time_exit: TimeExitEvidence;
};

export type PracticeTrade = {
  /** 1-based number of the filled buy this trade belongs to. */
  ordinal: number;
  status: 'closed' | 'open';
  qty: number;
  buy: BuyLeg;
  sell: SellLeg | null;
  /** exit session - entry session; for an open position: last session - entry session so far. */
  holding_sessions: number;
  pnl_kind: 'realized' | 'unrealized';
  pnl_vnd: number;
  /** Ratio (0.05 = 5%) of pnl over entry total (qty x price + buy fee). */
  pnl_ratio: number;
  /** Open position only: the last valid close the position is marked at. */
  mark: { session: number; price: number; market_value: number } | null;
};

export type PendingOrder = {
  side: Side;
  signal_session: number;
  reason: 'indicator' | 'max_holding' | 'buy_signal';
  time_due: boolean;
  /** No valid open exists inside the test window: the order stays unfilled. */
  status: 'unfilled_end_of_window';
};

export type MissedBuy = {
  signal_session: number;
  fill_session: number;
  price: number;
  cash: number;
};

export type ChartEvent = {
  side: Side;
  session: number;
  price: number;
  trade_ordinal: number;
  reason?: 'indicator' | 'max_holding';
};

export type PracticeKpis = {
  capital_initial: number;
  cash_end: number;
  open_position_value: number | null;
  nav_end: number | null;
  /** (cash_end + open position value at last valid close) / initial - 1; null when unvaluable. */
  total_return: number | null;
  valuation: 'ok' | 'missing';
  /** Number of FILLED buys (not signals, not sells, not pending). */
  buy_count: number;
  closed_trade_count: number;
  open_position: boolean;
  insufficient_cash_buys: number;
};

export type PracticeFormField = {
  key: string;
  label: string;
  type: 'integer' | 'number';
  min: number;
  max: number;
  step: number;
  unit: string;
  options?: number[];
};

export type PracticeFormRule = {
  rule_id: string;
  kind: 'compare' | 'cross' | 'membership';
  default_enabled?: boolean;
  default_op: RuleOp;
  allowed_ops: RuleOp[];
  /** Operand labels at the registry default params (the client re-labels with its own params). */
  left_label: string;
  right_label: string;
  lhs: Operand;
  rhs: Operand | { lower: Operand; upper: Operand };
};

export type PracticeFormSide = { fields: PracticeFormField[]; rules: PracticeFormRule[] };

/**
 * Form of a row-based indicator: the registry rows themselves (sentence with `{field}`
 * placeholders, fields with ranges/options, constraints, default switch and default values per
 * tab). The client renders the two tabs from `rows` and needs no other registry call.
 */
export type PracticeRowsForm = {
  model: 'rows';
  indicator_id: string;
  rows: RowDefinition[];
  defaults: PracticeRowsConfig;
};

/** Form of a params-based indicator (Volume): effective field domains and rule templates. */
export type PracticeParamsForm = {
  model: 'legacy_params';
  indicator_id: string;
  buy: PracticeFormSide;
  sell: PracticeFormSide;
  cross_fields: Array<{ left: string; op: '<' | '>'; right: string }>;
  defaults: PracticeParamsConfig;
};

export type PracticeForm = PracticeRowsForm | PracticeParamsForm;
