import {
  createSeriesCache,
  CURRENT_INDICATOR_IDS,
  evaluateIndicatorSide,
  evaluateRow,
  isFiniteNumber,
  loadTechnicalRegistry,
  validateSideRows,
  type Bar,
  type ConditionRow,
  type ParamsRegistryEntry,
  type RegistryEntry,
  type Rule,
  type RowEvaluation,
  type RowsRegistryEntry,
  type SeriesCache,
  type SideConfig,
} from '../quant/v2/index.js';
import type { DefinitionIssue, RowsTechnicalItem, TechnicalItem } from './screener.definition.js';
import { METRIC_REASONS } from './screener.metrics.js';

/**
 * Kỹ thuật (Bộ lọc 4.0 §3): the condition rows of the Bot / Backtest, evaluated by the SAME shared
 * evaluator (`evaluateIndicatorSide`) on closed daily bars up to the session T. This module only
 * (1) validates and shapes the stored rows, (2) calls that evaluator and (3) turns each evaluated
 * row into a result cell (value at T, sort value, status). It has no indicator math of its own.
 */

/** The 16 offered indicators: 15 row-based + Volume (registry order). */
export const TECHNICAL_INDICATOR_IDS: readonly string[] = CURRENT_INDICATOR_IDS;

export const VOLUME_MIN_SESSIONS = 5;
export const VOLUME_MAX_SESSIONS = 100;
export const VOLUME_MIN_FACTOR = 0.5;
export const VOLUME_MAX_FACTOR = 3;
export const VOLUME_FACTOR_STEP = 0.1;
const VOLUME_OPS = ['>', '<'] as const;
const STEP_TOLERANCE = 1e-6;

/** One result cell of a technical condition row (value, sort value and status at session T). */
export type TechnicalCellData = {
  /** Stable key: the row id (`rsi.level`) or `volume.r1` / `volume.r2`. */
  key: string;
  indicator: string;
  row_id: string;
  /** Short column title, e.g. `RSI14`, `MACD / Signal`, `KL / 1,1×TB20 (nghìn cp)`. */
  label: string;
  /** `ok`: evaluated (true or false). `missing`: NO_SIGNAL; the row can neither pass nor fail. */
  status: 'ok' | 'missing';
  /** The row's verdict at T; null = NO_SIGNAL. */
  result: boolean | null;
  /** Comparison applied (`>`, `<`, `cross_up`, `break_upper`…). */
  op: string | null;
  /** Values at T (the left operand, the right operand, and a third for Bollinger bands). */
  value: number | null;
  value2: number | null;
  value3: number | null;
  /** Formatted for the table (vi-VN), e.g. `0,41 / 0,28`; null when not computable. */
  display: string | null;
  /** What a click on the column title sorts by (spec §4.3); null sorts last. */
  sort_value: number | null;
  /** The same operands one session earlier; null for rows that already compare two sessions. */
  previous: {
    value: number | null;
    value2: number | null;
    value3: number | null;
    /** The same text format as `display`, for the operands one session earlier. */
    display: string | null;
  } | null;
  /** Rows that compare T with T−N (`.trend`, previous bar, width, histogram): N. */
  lag: number | null;
  /** The row's own stored values (period, threshold, op…), for the detail dialog. */
  params: Record<string, number | string>;
  reason?: string;
  reason_code?: string;
};

export type TechnicalColumnSpec = { key: string; indicator: string; row_id: string };

const registryById = (): Map<string, RegistryEntry> =>
  new Map(loadTechnicalRegistry().map((entry) => [entry.id, entry]));

const isRows = (entry: RegistryEntry): entry is RowsRegistryEntry => entry.model === 'rows';

/** `Mua · dòng 2: …` of the Bot validator → `RSI · Dòng 2: …` (spec §3.5: no Mua/Bán tab here). */
function rewriteMessage(message: string, name: string): string {
  return message
    .replace(/^Mua · dòng (\d+): /, `${name} · Dòng $1: `)
    .replace(`${name} Mua`, name);
}

const viNumber = (value: number): string => String(value).replace('.', ',');

/** Spec §3.5 for Khối lượng, plus structure; the 15 row-based indicators use the Bot's validator. */
function volumeIssues(item: TechnicalItem, index: number): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const path = ['technical', index];
  const add = (field: string, code: string, message: string) =>
    issues.push({ path: [...path, field], code, message: `Khối lượng · ${message}` });
  const record = item as unknown as Record<string, unknown>;
  const { sessions, factor, ops } = record;
  if (
    !isFiniteNumber(sessions) ||
    !Number.isInteger(sessions) ||
    sessions < VOLUME_MIN_SESSIONS ||
    sessions > VOLUME_MAX_SESSIONS
  )
    add(
      'sessions',
      'SESSIONS',
      `Số phiên tham chiếu phải từ ${VOLUME_MIN_SESSIONS} đến ${VOLUME_MAX_SESSIONS}, số nguyên.`,
    );
  if (!isFiniteNumber(factor) || factor < VOLUME_MIN_FACTOR || factor > VOLUME_MAX_FACTOR) {
    add(
      'factor',
      'FACTOR',
      `Hệ số khối lượng phải từ ${viNumber(VOLUME_MIN_FACTOR)} đến ${viNumber(VOLUME_MAX_FACTOR)}.`,
    );
  } else {
    const steps = (factor - VOLUME_MIN_FACTOR) / VOLUME_FACTOR_STEP;
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE)
      add('factor', 'FACTOR_STEP', `Hệ số khối lượng phải theo bước ${viNumber(VOLUME_FACTOR_STEP)}.`);
  }
  if (
    !Array.isArray(ops) ||
    ops.length !== 2 ||
    ops.some((op) => !(VOLUME_OPS as readonly unknown[]).includes(op))
  )
    add('ops', 'OPS', 'Dấu so sánh của hai dòng chỉ chọn > hoặc <.');
  return issues;
}

/**
 * Semantic validation of the stored technical items (spec §3.5, §6.1): known indicators, each at most
 * once, and the Bot's own row rules with their messages (`RSI · Dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên.`).
 * Pure; the UI shows the same texts and the server checks them again.
 */
export function technicalIssues(items: readonly TechnicalItem[]): DefinitionIssue[] {
  const byId = registryById();
  const seen = new Set<string>();
  const issues: DefinitionIssue[] = [];
  items.forEach((item, index) => {
    const entry = byId.get(item.indicator);
    if (!entry) {
      issues.push({
        path: ['technical', index, 'indicator'],
        code: 'INDICATOR_UNKNOWN',
        message: `Chỉ báo không được hỗ trợ: ${item.indicator}.`,
      });
      return;
    }
    if (seen.has(item.indicator))
      issues.push({
        path: ['technical', index, 'indicator'],
        code: 'INDICATOR_DUPLICATE',
        message: `${entry.name}: mỗi chỉ báo chỉ được thêm một lần.`,
      });
    seen.add(item.indicator);
    if (!isRows(entry)) {
      if (item.indicator !== 'volume' || !('sessions' in item))
        issues.push({
          path: ['technical', index],
          code: 'INDICATOR_SHAPE',
          message: `${entry.name}: cấu hình không hợp lệ.`,
        });
      else issues.push(...volumeIssues(item, index));
      return;
    }
    if (!('rules' in item) || !Array.isArray(item.rules)) {
      issues.push({
        path: ['technical', index, 'rules'],
        code: 'INDICATOR_SHAPE',
        message: `${entry.name}: thiếu các dòng điều kiện.`,
      });
      return;
    }
    for (const error of validateSideRows(
      entry,
      'buy',
      { enabled: true, rules: item.rules },
      `technical.${index}`,
    ))
      issues.push({
        path: error.path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
        code: 'ROW_INVALID',
        message: rewriteMessage(error.message, entry.name),
      });
  });
  return issues;
}

/** The evaluator's side config for one stored item (always an enabled side: rows carry their own switch). */
export function sideConfigOf(item: TechnicalItem, entry: RegistryEntry): SideConfig {
  if (isRows(entry)) return { enabled: true, rules: (item as RowsTechnicalItem).rules };
  const volume = item as unknown as { sessions: number; factor: number; ops: [string, string] };
  const params = entry as ParamsRegistryEntry;
  return {
    enabled: true,
    params: { lookback: volume.sessions, mult: volume.factor },
    // Same templates as the Bot's stored Volume side; only the two operators come from the filter.
    rules: params.buy.rules.map((rule, position) => ({
      ...rule,
      op: (volume.ops[position] ?? rule.op) as typeof rule.op,
    })) as Rule[],
  };
}

/** Columns the result table shows: one per enabled row (Volume: both rows), in definition order. */
export function technicalColumns(items: readonly TechnicalItem[]): TechnicalColumnSpec[] {
  const out: TechnicalColumnSpec[] = [];
  for (const item of items) {
    if (item.indicator === 'volume') {
      for (const id of ['r1', 'r2'])
        out.push({ key: `volume.${id}`, indicator: 'volume', row_id: id });
      continue;
    }
    for (const row of (item as RowsTechnicalItem).rules)
      if (row.enabled === true) out.push({ key: row.id, indicator: item.indicator, row_id: row.id });
  }
  return out;
}

/** Number of switched-on condition rows (a Volume item always counts its two rows). */
export function enabledRowCount(items: readonly TechnicalItem[]): number {
  return technicalColumns(items).length;
}

// ---------------------------------------------------------------------------------------------
// Presentation of one evaluated row.

const formatters = new Map<number, Intl.NumberFormat>();
function viFormat(value: number, decimals: number): string {
  let formatter = formatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, formatter);
  }
  return formatter.format(value);
}

type Pick = 'ratio' | 'diff' | 'value' | 'pct_b';
type Presentation = {
  label: string;
  pair: boolean;
  decimals: number;
  scale: number;
  suffix: string;
  sort: Pick;
  /** Rows that already hold two sessions in (value, value2): `lag` is N. */
  lag: number | null;
  /** Close with both Bollinger bands: three values shown. */
  triple?: boolean;
};

const num = (values: Readonly<Record<string, number | string>>, key: string): number => {
  const value = values[key];
  return typeof value === 'number' ? value : Number.NaN;
};

const text = (values: Readonly<Record<string, number | string>>, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};

const single = (label: string, decimals: number, sort: Pick = 'value'): Presentation => ({
  label,
  pair: false,
  decimals,
  scale: 1,
  suffix: '',
  sort,
  lag: null,
});
const pair = (
  label: string,
  decimals: number,
  sort: Pick,
  extra: Partial<Presentation> = {},
): Presentation => ({
  label,
  pair: true,
  decimals,
  scale: 1,
  suffix: '',
  sort,
  lag: null,
  ...extra,
});

/** Column title, display format and sort rule of each row (mockup `EVAL` table; spec §4.2-§4.3). */
function presentation(
  rowId: string,
  values: Readonly<Record<string, number | string>>,
): Presentation {
  const period = num(values, 'period');
  switch (rowId) {
    case 'ma.price_cross':
      return pair(`Giá / SMA${period}`, 2, 'ratio');
    case 'ma.ma_cross':
      return pair(`SMA${num(values, 'fast')} / SMA${num(values, 'slow')}`, 2, 'ratio');
    case 'ma.trend':
      return pair(`SMA${period} nay / ${period} phiên trước`, 2, 'diff', { lag: period });
    case 'ema.price_cross':
      return pair(`Giá / EMA${period}`, 2, 'ratio');
    case 'ema.ma_cross':
      return pair(`EMA${num(values, 'fast')} / EMA${num(values, 'slow')}`, 2, 'ratio');
    case 'ema.trend':
      return pair(`EMA${period} nay / ${period} phiên trước`, 2, 'diff', { lag: period });
    case 'ma_cross.cross':
      return pair(`MA Cross ${num(values, 'fast')} / ${num(values, 'slow')}`, 2, 'ratio');
    case 'rsi.level':
      return single(`RSI${period}`, 1);
    case 'rsi.trend':
      return pair(`RSI${period} nay / ${period} phiên trước`, 1, 'diff', { lag: period });
    case 'macd.signal':
      return pair('MACD / Signal', 2, 'diff');
    case 'macd.zero':
      return single(`MACD ${num(values, 'fast')}/${num(values, 'slow')}`, 2);
    case 'macd.hist':
      return pair('Histogram nay / trước', 2, 'value', { lag: 1 });
    case 'stochastic.level':
      return single(`%K ${num(values, 'k')},${num(values, 'smooth')}`, 1);
    case 'stochastic.kd_cross':
      return pair('%K / %D', 1, 'ratio');
    case 'cci.cross':
      return single(`CCI${period}`, 1);
    case 'mfi.cross':
      return single(`MFI${period}`, 1);
    case 'roc.cross':
      return single(`ROC${period} (%)`, 1);
    case 'williams_r.cross':
      return single(`Williams %R${period}`, 1);
    case 'cmf.cross':
      return single(`CMF${period}`, 3);
    case 'bollinger.price_action':
      return pair(`Giá / BB${period} dưới · trên`, 2, 'pct_b', { triple: true });
    case 'bollinger.price_dir':
      return pair('Giá nay / trước', 2, 'ratio', { lag: 1 });
    case 'bollinger.width':
      return pair('Độ rộng BB nay / trước', 2, 'value', { scale: 100, suffix: '%', lag: 1 });
    case 'donchian.break':
      return pair(
        `Giá / Donchian${period} ${text(values, 'band') === 'upper' ? 'trên' : 'dưới'}`,
        2,
        'ratio',
      );
    case 'dmi.di':
      return pair('+DI / −DI', 1, 'diff');
    case 'dmi.adx':
      return single(`ADX${period}`, 1);
    case 'obv.sma':
      return pair(`OBV / SMA${period}(OBV) (triệu)`, 1, 'diff', { scale: 1e-6 });
    case 'obv.breakout':
      return pair(
        `OBV / ${text(values, 'action') === 'break_high' ? 'đỉnh' : 'đáy'} ${period} phiên (triệu)`,
        1,
        'diff',
        { scale: 1e-6 },
      );
    case 'volume.r1':
      return pair('Giá nay / trước', 2, 'ratio', { lag: 1 });
    case 'volume.r2':
      return pair(
        `KL / ${viNumber(num(values, 'mult'))}×TB${num(values, 'lookback')} (nghìn cp)`,
        0,
        'ratio',
        { scale: 1e-3 },
      );
    default:
      return pair(rowId, 2, 'ratio');
  }
}

const finiteOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function sortValue(
  kind: Pick,
  a: number | null,
  b: number | null,
  c: number | null,
  close: number | null,
): number | null {
  if (kind === 'value') return a;
  if (a === null) return null;
  if (kind === 'ratio') return b === null || b === 0 ? null : a / b;
  if (kind === 'diff') return b === null ? null : a - b;
  // %B = (close − lower) / (upper − lower), the Bollinger action row.
  if (b === null || c === null || close === null || c === b) return null;
  return (close - b) / (c - b);
}

function display(spec: Presentation, a: number | null, b: number | null, c: number | null): string | null {
  if (a === null) return null;
  const one = (value: number | null): string =>
    value === null ? '—' : `${viFormat(value * spec.scale, spec.decimals)}${spec.suffix}`;
  if (spec.triple) return `${one(a)} / ${one(b)} · ${one(c)}`;
  return spec.pair ? `${one(a)} / ${one(b)}` : one(a);
}

function cellFor(
  key: string,
  indicator: string,
  evaluation: RowEvaluation,
  cache: SeriesCache,
  i: number,
  stored: ConditionRow | undefined,
): TechnicalCellData {
  const values = evaluation.values;
  const rowKey = indicator === 'volume' ? `volume.${evaluation.id}` : evaluation.id;
  const spec = presentation(rowKey, values);
  // Bollinger action rows show the close with both bands; the third operand is the upper band.
  let a = finiteOrNull(evaluation.lhs);
  let b = finiteOrNull(evaluation.rhs);
  let c: number | null = null;
  let close: number | null = null;
  if (rowKey === 'bollinger.price_action') {
    const bands = cache.series('bollinger', { period: num(values, 'period'), k: num(values, 'mult') });
    a = finiteOrNull(cache.close()[i]);
    b = finiteOrNull(bands.lower?.[i]);
    c = finiteOrNull(bands.upper?.[i]);
    close = a;
  }
  const missing = evaluation.result === null;
  // NO_SIGNAL shows no operand at all: a half-computed pair ("124,50 / —") would read as a value.
  const hasPrevious = !missing && spec.lag === null && i > 0 && stored !== undefined;
  let previous: TechnicalCellData['previous'] = null;
  if (hasPrevious) {
    if (rowKey === 'bollinger.price_action') {
      const bands = cache.series('bollinger', { period: num(values, 'period'), k: num(values, 'mult') });
      const value = finiteOrNull(cache.close()[i - 1]);
      const value2 = finiteOrNull(bands.lower?.[i - 1]);
      const value3 = finiteOrNull(bands.upper?.[i - 1]);
      previous = { value, value2, value3, display: display(spec, value, value2, value3) };
    } else {
      const before = evaluateRow(stored, cache, i - 1);
      const value = finiteOrNull(before.lhs);
      const value2 = spec.pair ? finiteOrNull(before.rhs) : null;
      previous = { value, value2, value3: null, display: display(spec, value, value2, null) };
    }
  }
  return {
    key,
    indicator,
    row_id: evaluation.id,
    label: spec.label,
    status: missing ? 'missing' : 'ok',
    result: evaluation.result,
    op: String(evaluation.op),
    value: missing ? null : a,
    value2: missing ? null : spec.pair || c !== null ? b : null,
    value3: missing ? null : c,
    display: missing ? null : display(spec, a, spec.pair ? b : null, c),
    sort_value: missing ? null : sortValue(spec.sort, a, b, c, close),
    previous,
    lag: spec.lag === null ? null : (spec.lag as number),
    params: { ...values },
    ...(missing
      ? {
          reason: METRIC_REASONS.insufficientPriceHistory,
          reason_code: 'insufficient_price_history',
        }
      : {}),
  };
}

/** The stored values of one row (period, threshold, op…): what the column title and the dialog show. */
function paramsOf(spec: TechnicalColumnSpec, item: TechnicalItem): Record<string, number | string> {
  const params: Record<string, number | string> = {};
  if (item.indicator === 'volume') {
    const volume = item as unknown as { sessions: number; factor: number; ops: string[] };
    params.lookback = volume.sessions;
    params.mult = volume.factor;
    return params;
  }
  const row = (item as RowsTechnicalItem).rules.find((candidate) => candidate.id === spec.row_id);
  for (const [field, value] of Object.entries(row ?? {}))
    if (field !== 'id' && field !== 'enabled' && typeof value !== 'boolean')
      params[field] = value as number | string;
  return params;
}

/** Short column title of every enabled row (`RSI14`, `MACD / Signal`…), by column key. */
export function technicalColumnLabels(items: readonly TechnicalItem[]): Map<string, string> {
  const byIndicator = new Map(items.map((item) => [item.indicator, item]));
  return new Map(
    technicalColumns(items).map((spec) => [
      spec.key,
      presentation(spec.key, paramsOf(spec, byIndicator.get(spec.indicator)!)).label,
    ]),
  );
}

function missingCell(
  spec: TechnicalColumnSpec,
  item: TechnicalItem,
  reasonCode: 'no_session_bar' | 'insufficient_price_history',
): TechnicalCellData {
  const params = paramsOf(spec, item);
  const presented = presentation(spec.key, params);
  return {
    key: spec.key,
    indicator: spec.indicator,
    row_id: spec.row_id,
    label: presented.label,
    status: 'missing',
    result: null,
    op: null,
    value: null,
    value2: null,
    value3: null,
    display: null,
    sort_value: null,
    previous: null,
    lag: presented.lag,
    params,
    reason:
      reasonCode === 'no_session_bar'
        ? METRIC_REASONS.noSessionBar
        : METRIC_REASONS.insufficientPriceHistory,
    reason_code: reasonCode,
  };
}

export type TechnicalEvaluation = {
  /** One cell per enabled row, in column order. */
  cells: TechnicalCellData[];
  /** Every enabled row is true (also true when there is no enabled row). */
  passed: boolean;
  /** At least one enabled row is NO_SIGNAL: counted as "có điều kiện không tính được". */
  has_exception: boolean;
};

/**
 * Evaluates the enabled rows of `items` on `bars` (closed daily bars, oldest first) at session T:
 * the bar of T must be the last one, otherwise every row is NO_SIGNAL (`no_session_bar`). The
 * decision of each row comes from the shared evaluator; nothing is recomputed here.
 */
export function evaluateTechnical(
  items: readonly TechnicalItem[],
  bars: readonly Bar[] | null,
  session: string,
): TechnicalEvaluation {
  const columns = technicalColumns(items);
  if (!columns.length) return { cells: [], passed: true, has_exception: false };
  const byId = registryById();
  const hasBar = !!bars?.length && bars.at(-1)?.date === session;
  const cache = hasBar ? createSeriesCache(bars!) : null;
  const i = hasBar ? bars!.length - 1 : -1;
  const cells: TechnicalCellData[] = [];
  for (const item of items) {
    const itemColumns = columns.filter((column) => column.indicator === item.indicator);
    if (!itemColumns.length) continue;
    const entry = byId.get(item.indicator);
    if (!cache || !entry) {
      for (const column of itemColumns) cells.push(missingCell(column, item, 'no_session_bar'));
      continue;
    }
    const evaluation = evaluateIndicatorSide(item.indicator, sideConfigOf(item, entry), cache, i);
    const stored = isRows(entry) ? (item as RowsTechnicalItem).rules : [];
    for (const column of itemColumns) {
      const row = evaluation.rows.find((candidate) => candidate.id === column.row_id);
      if (!row) {
        cells.push(missingCell(column, item, 'insufficient_price_history'));
        continue;
      }
      cells.push(
        cellFor(
          column.key,
          item.indicator,
          row,
          cache,
          i,
          stored.find((candidate) => candidate.id === column.row_id),
        ),
      );
    }
  }
  return {
    cells,
    passed: cells.every((cell) => cell.result === true),
    has_exception: cells.some((cell) => cell.result === null),
  };
}

/** Closed-bar columns → the engine's `Bar[]` (`date` strictly increasing). */
export function toEngineBars(columns: {
  dates: readonly string[];
  open: readonly number[];
  high: readonly number[];
  low: readonly number[];
  close: readonly number[];
  volume: readonly number[];
}): Bar[] {
  return columns.dates.map((date, index) => ({
    date,
    open: columns.open[index]!,
    high: columns.high[index]!,
    low: columns.low[index]!,
    close: columns.close[index]!,
    volume: columns.volume[index]!,
  }));
}

