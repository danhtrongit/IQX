/**
 * Frozen public types of the bot-v2 indicator/rule/backtest engine
 * (IQX Academy handoff v2.0.0, `calculation_version = iqx-ta-2.0`).
 *
 * This module is the contract between the engine lane (quant/v2/**), the shared
 * config + backtests lane (modules/strategy-config/**) and the Bot integration.
 * Do not rename or remove exported members; additive optional fields are allowed.
 *
 * The legacy 38-factor engine (quant/catalog.ts, conditions.ts, indicators.ts,
 * backtest.engine.ts) is untouched and keeps its SMA-seeded formulas
 * (LEGACY-38-FACTOR-MAPPING: keep_legacy). Nothing here may change its output.
 */

export const SCHEMA_VERSION = '2.0' as const;
export const CALCULATION_VERSION = 'iqx-ta-2.0' as const;
export const RULE_VERSION = 'iqx-rules-2.0' as const;
export const ENGINE_VERSION = 'iqx-engine-2.0' as const;
/** CAGR uses 252/N sessions, matching the legacy engine convention. */
export const FORMULA_VERSION = 'iqx-kpi-2.0' as const;

/** Three-valued logic: true, false, or unknown (missing data). */
export type Tri = boolean | null;

export type CompareOp = '>' | '<';
export type MembershipOp = '∈' | '∉';
export type RuleOp = CompareOp | MembershipOp;

export type SeriesOperand = { kind: 'series'; key: string; offset?: number };
export type ParamOperand = { kind: 'param'; key: string };
export type ConstantOperand = { kind: 'constant'; value: number };
export type Operand = SeriesOperand | ParamOperand | ConstantOperand;

export type CompareRule = {
  id: string;
  kind: 'compare' | 'cross';
  lhs: Operand;
  op: CompareOp;
  rhs: Operand;
  allowed_ops: CompareOp[];
};
export type MembershipRule = {
  id: string;
  kind: 'membership';
  lhs: Operand;
  op: MembershipOp;
  /** Registry templates carry `kind: 'interval'` and `bounds: 'open'` (strict on both ends). */
  rhs: { kind?: 'interval'; lower: Operand; upper: Operand; bounds?: 'open' };
  allowed_ops: MembershipOp[];
};
export type Rule = CompareRule | MembershipRule;

export type Side = 'buy' | 'sell';

export type SideConfig = {
  enabled: boolean;
  /** Display units per registry field (`api_scale = 1`), e.g. ATR% 5 means 5%. */
  params: Record<string, number>;
  /** Same length/order/operands as the registry template; only `op` may differ. */
  rules: Rule[];
};

export type IndicatorConfig = { master_enabled: boolean; buy: SideConfig; sell: SideConfig };

/** Exactly `00-MASTER/SCHEMAS/shared-config.schema.json` (schema 2.0). */
export type SharedConfig = {
  schema_version: typeof SCHEMA_VERSION;
  revision: number;
  rule_version: typeof RULE_VERSION;
  indicators: Record<string, IndicatorConfig>;
};

export type RegistryField = {
  key: string;
  label: string;
  type: 'integer' | 'number';
  min: number;
  max: number;
  step: number;
  unit: string;
  api_scale: number;
  wire_unit: string;
};

export type RegistrySide = {
  enabled: boolean;
  params: Record<string, number>;
  rules: Rule[];
  field_overrides?: Record<string, Partial<RegistryField>>;
};

export type RegistryCrossField = { left: string; op: CompareOp; right: string };

/** Registry `validation` block; `cross_fields` are enforced by `validateConfig`. */
export type RegistryValidation = { cross_fields: RegistryCrossField[]; [extra: string]: unknown };

export type RegistryEntry = {
  id: string;
  name: string;
  chapter: number;
  lesson_id: string;
  calculation_version: typeof CALCULATION_VERSION;
  family: 'state' | 'event';
  formula: string;
  seed_and_missing: string;
  buy: RegistrySide;
  sell: RegistrySide;
  fields: RegistryField[];
  availability: 'ohlcv' | 'needs_history_context';
  rule_version: typeof RULE_VERSION;
  validation?: RegistryValidation;
  [extra: string]: unknown;
};

/**
 * One adjusted daily observation. Context fields are only required by
 * `needs_history_context` indicators (rs_market, rs_sector, ad_line,
 * breadth_ma50, new_high_low, index_ma); when absent those series are missing
 * (null), never zero.
 */
export type Bar = {
  date: string; // YYYY-MM-DD, strictly increasing
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  market?: number | null;
  sector?: number | null;
  advances?: number | null;
  declines?: number | null;
  above50?: number | null;
  eligible?: number | null;
  newHigh?: number | null;
  newLow?: number | null;
  coverage?: number | null;
};

/** Named output series of one indicator instance, aligned to the bars. */
export type SeriesMap = Record<string, Array<number | null>>;

export type Execution = 'same_close' | 'next_open';

/** CLEAN_TECH_2.0 — every exit/sizing property is explicit (EXECUTION-PROFILE.md). */
export type ExecutionProfile = {
  stop_loss: 'none';
  take_profit_pct: null;
  max_holding: null;
  trailing: 'none';
  position_size: 'all_cash';
  lot_size: number;
  min_held_bars: number;
};

export const CLEAN_TECH_2_0: ExecutionProfile = Object.freeze({
  stop_loss: 'none',
  take_profit_pct: null,
  max_holding: null,
  trailing: 'none',
  position_size: 'all_cash',
  lot_size: 100,
  min_held_bars: 2,
}) as ExecutionProfile;

export type RunOptions = {
  capital: number; // default 100_000_000
  fee_buy: number; // default 0.0015
  fee_sell: number; // default 0.0025
  lot: number; // default 100
  /** Default `next_open` (matches the spec reference engine); `same_close` is the labelled demo assumption. */
  execution: Execution;
  min_held_bars: number; // default 2 (legacy-compatible simulation, not settlement)
  start: string;
  end: string;
};

export type CurvePoint = {
  date: string;
  value: number;
  return_pct: number;
  buy_hold_pct: number;
  market_pct: number | null;
  phase?: 'before_first_execution';
};

export type ClosedTrade = {
  number: number;
  qty: number;
  entry_date: string;
  entry_signal_date: string;
  entry_price: number;
  exit_date: string;
  exit_signal_date: string;
  exit_price: number;
  hold: number;
  pnl: number;
  pnl_pct: number;
  exit_reason: string;
  /** Advanced exits only: all exit conditions true on the same bar. */
  concurrent_reasons?: string[];
};

export type OpenPosition = {
  qty: number;
  price: number;
  cost: number;
  index: number;
  date: string;
  signal_date: string;
  last_price: number;
  market_value: number;
  unrealized_pnl: number;
};

export type CanceledOrder = { reason: 'end_of_range'; action: Side; signalIndex: number };

export type Kpis = {
  net_return: number;
  cagr: number;
  max_drawdown: number;
  n_trades: number;
  n_wins: number;
  win_rate: number | null;
  buy_hold_return: number;
  market_return: number | null;
  profit_factor: number | null;
};

export type RunResult = {
  schema_version: typeof SCHEMA_VERSION;
  engine_version: typeof ENGINE_VERSION;
  calculation_version: typeof CALCULATION_VERSION;
  rule_version: typeof RULE_VERSION;
  formula_version: typeof FORMULA_VERSION;
  profile: ExecutionProfile;
  snapshot: {
    config: SharedConfig;
    options: RunOptions;
    actual_start: string;
    actual_end: string;
    bar_count: number;
  };
  initial: CurvePoint;
  /** Full curve and full trade history — never truncated. */
  curve: CurvePoint[];
  trades: ClosedTrade[];
  open_position: OpenPosition | null;
  cash: number;
  canceled: CanceledOrder[];
  kpis: Kpis;
};

/** Typed, bounded boolean expression across indicator sides (Chapter 16 logic groups). */
export type LogicNode =
  | { type: 'indicator'; indicator_id: string }
  | { type: 'and' | 'or'; children: LogicNode[] }
  | { type: 'not'; child: LogicNode };

export const LOGIC_MAX_DEPTH = 4;
export const LOGIC_MAX_CHILDREN = 16;

export type ParamPath = { indicator: string; side: Side; key: string };

export type EngineValidationError = { path: string; message: string };
