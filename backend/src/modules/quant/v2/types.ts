/**
 * Frozen public types of the bot-v2 indicator/rule/backtest engine
 * (`calculation_version = iqx-ta-2.0`, `rule_version = iqx-rules-4.0`: exactly 16 indicators).
 *
 * This module is the contract between the engine lane (quant/v2/**), the shared
 * config + backtests lane (modules/strategy-config/**) and the Bot integration.
 * Do not rename or remove exported members; additive optional fields are allowed.
 *
 * Since `iqx-rules-4.0` (SPEC V3, indicator conditions) 15 of the 16 indicators are
 * row-based: every Mua/Bán condition row carries its own periods, threshold and operator
 * (`model: 'rows'`). Volume keeps its side-level params + rules (`model: 'legacy_params'`).
 *
 * The legacy 38-factor engine (quant/catalog.ts, conditions.ts, indicators.ts,
 * backtest.engine.ts) is untouched and keeps its SMA-seeded formulas
 * (LEGACY-38-FACTOR-MAPPING: keep_legacy). Nothing here may change its output.
 */

export const SCHEMA_VERSION = '3.0' as const;
/** Shared-config schema versions of earlier documents; only used to detect an outdated document. */
export const HISTORICAL_SCHEMA_VERSIONS = Object.freeze(['2.0'] as const);
export const CALCULATION_VERSION = 'iqx-ta-2.0' as const;
/**
 * Current registry/rule contract: the 16 indicators, 15 of them with per-row conditions
 * (SPEC V3, 27 rows per tab).
 */
export const RULE_VERSION = 'iqx-rules-4.0' as const;
/** Previous 35-indicator registry; only used to read/verify historical configs and receipts. */
export const LEGACY_RULE_VERSION = 'iqx-rules-2.0' as const;
/**
 * Rule versions of earlier shared configs (`iqx-rules-3.0`: SPEC V2 side-level params;
 * `iqx-rules-2.0`: 35 indicators). They are only used to recognise an outdated document,
 * never to map its conditions (SPEC V3 §6.1.5): an outdated document is reset to defaults.
 */
export const HISTORICAL_RULE_VERSIONS = Object.freeze([
  'iqx-rules-3.0',
  LEGACY_RULE_VERSION,
] as const);
export const ENGINE_VERSION = 'iqx-engine-2.0' as const;
/** CAGR uses 252/N sessions, matching the legacy engine convention. */
export const FORMULA_VERSION = 'iqx-kpi-2.0' as const;

/** The 16 indicators offered by the current registry, in registry order. */
export const CURRENT_INDICATOR_IDS = Object.freeze([
  'rsi',
  'macd',
  'ma',
  'bollinger',
  'volume',
  'ema',
  'ma_cross',
  'dmi',
  'stochastic',
  'cci',
  'obv',
  'mfi',
  'cmf',
  'donchian',
  'roc',
  'williams_r',
] as const);
export type CurrentIndicatorId = (typeof CURRENT_INDICATOR_IDS)[number];

/**
 * Stable row ids of the 15 row-based indicators (SPEC V3 §3), per indicator in sentence order.
 * Row counts per tab in spec order: 3·3·1·2·3·2·1·1·1·1·3·1·2·2·1 (27 rows). Volume is not
 * row-based and has no entry.
 */
export const CONDITION_ROW_IDS = Object.freeze({
  rsi: ['rsi.level', 'rsi.trend'],
  macd: ['macd.signal', 'macd.zero', 'macd.hist'],
  ma: ['ma.price_cross', 'ma.ma_cross', 'ma.trend'],
  bollinger: ['bollinger.price_action', 'bollinger.price_dir', 'bollinger.width'],
  ema: ['ema.price_cross', 'ema.ma_cross', 'ema.trend'],
  ma_cross: ['ma_cross.cross'],
  dmi: ['dmi.di', 'dmi.adx'],
  stochastic: ['stochastic.level', 'stochastic.kd_cross'],
  cci: ['cci.cross'],
  obv: ['obv.sma', 'obv.breakout'],
  mfi: ['mfi.cross'],
  cmf: ['cmf.cross'],
  donchian: ['donchian.break'],
  roc: ['roc.cross'],
  williams_r: ['williams_r.cross'],
} as const);
export type ConditionIndicatorId = keyof typeof CONDITION_ROW_IDS;
export type ConditionRowId = (typeof CONDITION_ROW_IDS)[ConditionIndicatorId][number];
/** The 15 row-based indicators, in registry order. */
export const CONDITION_INDICATOR_IDS = Object.freeze(
  CURRENT_INDICATOR_IDS.filter((id): id is ConditionIndicatorId => id in CONDITION_ROW_IDS),
);

/**
 * The 19 indicators removed from the product. They are never offered or validated as
 * current; the ids are only used to recognise them inside historical (iqx-rules-2.0) configs.
 */
export const LEGACY_REMOVED_INDICATOR_IDS = Object.freeze([
  'adx',
  'atr',
  'atr_percent',
  'relative_volume',
  'n_day_high',
  'n_day_low',
  'distance_52w_high',
  'gap',
  'distance_support',
  'distance_resistance',
  'keltner',
  'bb_width',
  'psar',
  'rs_market',
  'rs_sector',
  'ad_line',
  'breadth_ma50',
  'new_high_low',
  'index_ma',
] as const);
export type LegacyRemovedIndicatorId = (typeof LEGACY_REMOVED_INDICATOR_IDS)[number];

/** Three-valued logic: true, false, or unknown (missing data). */
export type Tri = boolean | null;

export type CompareOp =
  | '>'
  | '<'
  | 'cross_up'
  | 'cross_down'
  | 'reenter_lower'
  | 'reenter_upper'
  | 'break_upper'
  | 'break_lower'
  | 'cross_up_middle'
  | 'cross_down_middle'
  | 'break_high'
  | 'break_low';
export type MembershipOp = '∈' | '∉';
export type RuleOp = CompareOp | MembershipOp;

export type SeriesOperand = {
  kind: 'series';
  key: string;
  offset?: number;
  offset_param?: string;
};
export type ParamOperand = { kind: 'param'; key: string };
export type ConstantOperand = { kind: 'constant'; value: number };
export type Operand = SeriesOperand | ParamOperand | ConstantOperand;

export type CompareRule = {
  id: string;
  kind: 'compare' | 'cross';
  enabled?: boolean;
  lhs: Operand;
  op: CompareOp;
  rhs: Operand;
  allowed_ops: CompareOp[];
};
export type MembershipRule = {
  id: string;
  kind: 'membership';
  enabled?: boolean;
  lhs: Operand;
  op: MembershipOp;
  /** Registry templates carry `kind: 'interval'` and `bounds: 'open'` (strict on both ends). */
  rhs: { kind?: 'interval'; lower: Operand; upper: Operand; bounds?: 'open' };
  allowed_ops: MembershipOp[];
};
export type Rule = CompareRule | MembershipRule;

export type ResolvedValue = number | null;
export type ResolvedRuleRhs = ResolvedValue;

export type RuleEvaluationEvidence = {
  lhs: ResolvedValue;
  rhs: ResolvedRuleRhs;
  /** Membership rules retain both resolved interval bounds additively. */
  rhs_lower?: ResolvedValue;
  rhs_upper?: ResolvedValue;
  result: Tri;
  /** A required operand for this evaluation was absent or non-finite. */
  missing: boolean;
  /** Cross rules additionally depend on the previous bar's resolved operands. */
  previous_lhs?: ResolvedValue;
  previous_rhs?: ResolvedValue;
};

export type Side = 'buy' | 'sell';

export type TracedRuleEvaluation = RuleEvaluationEvidence & {
  id: string;
  indicator: string;
  side: Side;
  /**
   * Comparison the evaluation applied. Row conditions report their own `op`, or their
   * `action` (Bollinger/OBV), or the direction as `>` (lên/tăng/mở rộng) / `<` (xuống/giảm/thu hẹp).
   */
  op: RuleOp;
  /** Row conditions: the row's own stored values (periods, threshold, op…); volume: its params. */
  values?: RowValues;
};

/** Per-indicator result inside one side (SPEC V3 §1.3). `no_signal` always has `result: null`. */
export type IndicatorSideStatus = 'ok' | 'no_signal';
export type NoSignalReason = 'indicator_off' | 'side_off' | 'no_rows';

export type IndicatorSideSummary = {
  indicator: string;
  status: IndicatorSideStatus;
  reason: NoSignalReason | null;
  result: Tri;
};

export type SideSignalsEvidence = {
  result: Tri;
  active_indicator_ids: string[];
  rules: TracedRuleEvaluation[];
  /** Per active indicator status (additive; absent on evidence built outside the engine). */
  indicators?: IndicatorSideSummary[];
};

/** Values of one condition row: numbers (periods, thresholds) and enum codes (op, dir…). */
export type RowValues = Record<string, number | string>;

/** One stored condition row of a row-based indicator: its stable id, switch and own values. */
export type ConditionRow = {
  id: string;
  enabled: boolean;
  [field: string]: number | string | boolean;
};

/** Side of a row-based indicator (SPEC V3 §1.4): no side-level params. */
export type RowSideConfig = { enabled: boolean; rules: ConditionRow[] };

/** Side of a params-based indicator (Volume): side-level params + registry rule templates. */
export type ParamsSideConfig = {
  enabled: boolean;
  /** Display units per registry field (`api_scale = 1`), e.g. ATR% 5 means 5%. */
  params: Record<string, number>;
  /** Same length/order/operands as the registry template; only `op` may differ. */
  rules: Rule[];
};

/** A stored side: rows for the 15 row-based indicators, params + rules for Volume. */
export type SideConfig = RowSideConfig | ParamsSideConfig;

export type IndicatorConfig = { master_enabled: boolean; buy: SideConfig; sell: SideConfig };

/** Shared config document (schema 3.0, `iqx-rules-4.0`). */
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
  options?: number[];
};

export type RegistrySide = {
  enabled: boolean;
  params: Record<string, number>;
  rules: Rule[];
  field_overrides?: Record<string, Partial<RegistryField>>;
};

export type RegistryCrossField = { left: string; op: '<' | '>'; right: string };

/** Registry `validation` block; `cross_fields` are enforced by `validateConfig`. */
export type RegistryValidation = { cross_fields: RegistryCrossField[]; [extra: string]: unknown };

/** Numeric input of a condition row. `options` restricts it to a fixed list (SMA presets). */
export type RowNumberField = {
  key: string;
  /** Field label, also used in validation messages (HTML `aria-label`). */
  label: string;
  type: 'integer' | 'number';
  min: number;
  max: number;
  step: number;
  options?: number[];
};
export type RowEnumOption = { value: string; label: string };
/** Select input of a condition row: stable `value` codes, Vietnamese `label`s. */
export type RowEnumField = { key: string; label: string; type: 'enum'; options: RowEnumOption[] };
export type RowField = RowNumberField | RowEnumField;

/** `left < right` between two numeric fields of the same row (fast < slow). */
export type RowConstraint = { left: string; op: '<'; right: string };

/**
 * Definition of one condition row. `sentence` is the row text with `{field}` placeholders in
 * input order, e.g. `"RSI {period} {op} {threshold}"`; fixed text is shown verbatim.
 */
export type RowDefinition = {
  id: string;
  sentence: string;
  fields: RowField[];
  constraints: RowConstraint[];
  default_enabled: boolean;
  buy: RowValues;
  sell: RowValues;
};

type RegistryEntryCommon<RuleVersion extends string> = {
  id: string;
  name: string;
  chapter: number;
  lesson_id: string | null;
  calculation_version: typeof CALCULATION_VERSION;
  family: 'state' | 'event';
  formula: string;
  seed_and_missing: string;
  availability: 'ohlcv' | 'needs_history_context';
  rule_version: RuleVersion;
  [extra: string]: unknown;
};

type RegistryEntryOf<RuleVersion extends string> = RegistryEntryCommon<RuleVersion> & {
  buy: RegistrySide;
  sell: RegistrySide;
  fields: RegistryField[];
  validation?: RegistryValidation;
};

/** Row-based entry (15 indicators): every condition row is self-contained. */
export type RowsRegistryEntry = RegistryEntryCommon<typeof RULE_VERSION> & {
  model: 'rows';
  rows: RowDefinition[];
};

/** Params-based entry (Volume): side-level params and registry rule templates, unchanged. */
export type ParamsRegistryEntry = RegistryEntryOf<typeof RULE_VERSION> & { model: 'legacy_params' };

/** Entry of the current registry (`iqx-rules-4.0`): one of the 16 indicators. */
export type RegistryEntry = RowsRegistryEntry | ParamsRegistryEntry;

/**
 * Entry of the legacy-only registry (one of the 19 removed indicators). `chapter` and
 * `lesson_id` are legacy catalog positions; the entry is never offered or validated as current.
 */
export type LegacyRegistryEntry = RegistryEntryOf<typeof LEGACY_RULE_VERSION>;

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

/**
 * One numeric parameter of a shared config. Row-based indicators address a row field
 * (`rule` = row id, `key` = field); Volume addresses a side param (`rule` absent).
 */
export type ParamPath = { indicator: string; side: Side; key: string; rule?: string };

export type EngineValidationError = {
  path: string;
  message: string;
  /** Row validation (SPEC V3 §4): the tab and the 1-based row number of the error. */
  side?: Side;
  row?: number;
};
