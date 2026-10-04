import { runBacktest } from '../backtest.js';
import { validateConfig } from '../config.js';
import { EngineRunError } from '../errors.js';
import { canonicalJson, configHash, sha256Hex } from '../hash.js';
import { loadTechnicalRegistry } from '../technical-registry.js';
import type {
  Bar,
  EngineValidationError,
  Kpis,
  OpenPosition,
  ParamPath,
  RegistryEntry,
  RunOptions,
  RunResult,
  SharedConfig,
} from '../types.js';
import { AdvancedEngineError } from './errors.js';

/**
 * Chapter 2 research runs (ADVANCED-CAPABILITIES §1–§3), ported from the spec
 * reference `assets/research.js` (sensitivity / outsideSample / walkForward).
 * Every candidate is a deep copy of the immutable base config with exactly one
 * parameter replaced; nothing here writes the shared config or picks a "best"
 * configuration for the user.
 */

/** Reference cap on candidates per sweep; production limits must follow real infrastructure. */
export const SENSITIVITY_MAX_CANDIDATES = 100;

export type ResearchOptions = Partial<RunOptions>;

export type SensitivityGrid = { path: ParamPath; values: number[] };

export type SensitivityCandidate = {
  /** Position of the value in the requested grid (fixed tie-break order). */
  index: number;
  value: number;
  ok: boolean;
  /** Vietnamese reason when the candidate was rejected (validation or run error). */
  error: string | null;
  errors: EngineValidationError[];
  config_hash: string;
  data_hash: string;
  kpis: Kpis | null;
  n_trades: number | null;
  actual_start: string | null;
  actual_end: string | null;
};

export type SensitivityResult = {
  type: 'sensitivity';
  /** The whole candidate region is returned; no candidate is marked as the best one. */
  policy: 'whole_region_no_best_pick';
  path: ParamPath;
  values: number[];
  base_config_hash: string;
  data_hash: string;
  candidates: SensitivityCandidate[];
};

export type OutOfSampleSpec = { split_date: string };

export type OutOfSampleAttempt = {
  kind: 'out_of_sample';
  split_date: string;
  config_hash: string;
  data_hash: string;
  train: { start: string; end: string };
  test: { start: string; end: string };
  selection: 'fixed_config';
  note: string;
};

export type OutOfSampleResult = {
  type: 'out_of_sample_fixed_config';
  split_date: string;
  config_hash: string;
  data_hash: string;
  /** Segment strictly before `split_date`. */
  train: RunResult;
  /** Segment from `split_date`; earlier bars only warm indicators up (no trades before the segment). */
  test: RunResult;
  attempt: OutOfSampleAttempt;
};

export type WalkForwardCriterion =
  'net_return' | 'cagr' | 'max_drawdown' | 'profit_factor' | 'win_rate';
export const WALK_FORWARD_CRITERIA: readonly WalkForwardCriterion[] = [
  'net_return',
  'cagr',
  'max_drawdown',
  'profit_factor',
  'win_rate',
];

export type WalkForwardSpec = {
  path: ParamPath;
  values: number[];
  train_bars: number;
  test_bars: number;
  /** Must be ≥ test_bars so test windows never overlap. */
  step_bars: number;
  /** Higher is better for every criterion (max_drawdown is ≤ 0); null criterion → ineligible. */
  criterion: WalkForwardCriterion;
  min_trades: number;
};

export type WalkForwardTrainCandidate = {
  index: number;
  value: number;
  ok: boolean;
  error: string | null;
  n_trades: number | null;
  criterion_value: number | null;
  eligible: boolean;
};

export type WalkForwardWindow = {
  index: number;
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  status: 'tested' | 'no_eligible_candidate';
  selected: number | null;
  selected_index: number | null;
  train_criterion: number | null;
  train_return: number | null;
  test_return: number | null;
  test_max_drawdown: number | null;
  n_trades: number | null;
  test_kpis: Kpis | null;
  open_position: OpenPosition | null;
  test_config_hash: string | null;
  test_snapshot: RunResult['snapshot'] | null;
  train_candidates: WalkForwardTrainCandidate[];
};

export type WalkForwardResult = {
  type: 'walk_forward_windows';
  policy: 'non_overlapping_tests; independently_funded_windows; no_aggregate_portfolio_return';
  path: ParamPath;
  values: number[];
  criterion: WalkForwardCriterion;
  min_trades: number;
  train_bars: number;
  test_bars: number;
  step_bars: number;
  base_config_hash: string;
  data_hash: string;
  windows: WalkForwardWindow[];
};

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** sha256 of the canonical JSON of the bar series a run was computed on. */
export function dataHash(bars: readonly Bar[]): string {
  return sha256Hex(canonicalJson(bars));
}

function assertGrid(values: unknown): asserts values is number[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > SENSITIVITY_MAX_CANDIDATES) {
    throw new AdvancedEngineError(
      'GRID_INVALID',
      `Lưới cần 1–${SENSITIVITY_MAX_CANDIDATES} giá trị.`,
    );
  }
}

function assertPath(
  config: SharedConfig,
  path: ParamPath,
  registry: readonly RegistryEntry[],
): void {
  const entry = registry.find((e) => e.id === path?.indicator);
  const sideOk = path?.side === 'buy' || path?.side === 'sell';
  const params = sideOk ? config.indicators?.[path.indicator]?.[path.side]?.params : undefined;
  if (!entry || !sideOk || !entry.fields.some((f) => f.key === path.key) || !params) {
    throw new AdvancedEngineError('PATH_INVALID', 'Đường tham số không hợp lệ.');
  }
}

/** Deep copy of `config` with exactly one parameter replaced. */
function withParam(config: SharedConfig, path: ParamPath, value: number): SharedConfig {
  const candidate = jsonCopy(config);
  const item = candidate.indicators[path.indicator];
  if (!item) throw new AdvancedEngineError('PATH_INVALID', 'Đường tham số không hợp lệ.');
  item[path.side].params[path.key] = value;
  return candidate;
}

type CandidateRun = { candidate: SensitivityCandidate; run: RunResult | null };

function runCandidate(
  index: number,
  candidateConfig: SharedConfig,
  value: number,
  bars: readonly Bar[],
  options: ResearchOptions,
  registry: readonly RegistryEntry[],
  barsHash: string,
): CandidateRun {
  const base = {
    index,
    value,
    config_hash: configHash(candidateConfig),
    data_hash: barsHash,
  };
  const rejected = (error: string, errors: EngineValidationError[]): CandidateRun => ({
    candidate: {
      ...base,
      ok: false,
      error,
      errors,
      kpis: null,
      n_trades: null,
      actual_start: null,
      actual_end: null,
    },
    run: null,
  });
  // Type, domain, step and cross-field (fast < slow) checks of the schema.
  const errors = validateConfig(candidateConfig, registry);
  if (errors.length) return rejected(errors.map((e) => e.message).join('\n'), errors);
  try {
    const run = runBacktest(candidateConfig, bars, options, registry);
    return {
      candidate: {
        ...base,
        ok: true,
        error: null,
        errors: [],
        kpis: run.kpis,
        n_trades: run.kpis.n_trades,
        actual_start: run.snapshot.actual_start,
        actual_end: run.snapshot.actual_end,
      },
      run,
    };
  } catch (error) {
    if (error instanceof EngineRunError) return rejected(error.message, error.errors);
    throw error;
  }
}

function sweep(
  config: SharedConfig,
  bars: readonly Bar[],
  options: ResearchOptions,
  path: ParamPath,
  values: readonly number[],
  registry: readonly RegistryEntry[],
  barsHash: string,
): CandidateRun[] {
  return values.map((value, index) =>
    runCandidate(index, withParam(config, path, value), value, bars, options, registry, barsHash),
  );
}

/**
 * Parameter sensitivity: one run per value on the same data/range/assumptions,
 * each candidate validated independently. Invalid values are reported with
 * `ok:false` instead of aborting the sweep. The base config is never mutated.
 *
 * @throws AdvancedEngineError GRID_INVALID | PATH_INVALID
 */
export function sensitivity(
  config: SharedConfig,
  bars: readonly Bar[],
  options: ResearchOptions,
  grid: SensitivityGrid,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SensitivityResult {
  assertGrid(grid?.values);
  const base = jsonCopy(config);
  assertPath(base, grid.path, registry);
  const barsHash = dataHash(bars);
  const runs = sweep(base, bars, options, grid.path, grid.values, registry, barsHash);
  return {
    type: 'sensitivity',
    policy: 'whole_region_no_best_pick',
    path: jsonCopy(grid.path),
    values: [...grid.values],
    base_config_hash: configHash(base),
    data_hash: barsHash,
    candidates: runs.map((r) => r.candidate),
  };
}

function resolveRange(
  bars: readonly Bar[],
  options: ResearchOptions,
): { start: string; end: string } {
  return {
    start: options.start ?? bars[0]?.date ?? '',
    end: options.end ?? bars[bars.length - 1]?.date ?? '',
  };
}

/**
 * Chronological out-of-sample check with one frozen config: the train report
 * ends at the last bar before `split_date`, the test report starts at
 * `split_date`. The test run may warm indicators up on earlier bars but never
 * records a trade before the segment. This function does not certify that the
 * user never looked at or tuned on the later segment.
 *
 * @throws AdvancedEngineError SPLIT_INVALID; EngineRunError from the runs
 */
export function outOfSample(
  config: SharedConfig,
  bars: readonly Bar[],
  options: ResearchOptions,
  spec: OutOfSampleSpec,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): OutOfSampleResult {
  const frozen = jsonCopy(config);
  const range = resolveRange(bars, options);
  const split = spec?.split_date;
  if (
    typeof split !== 'string' ||
    !DATE_RE.test(split) ||
    split <= range.start ||
    split >= range.end
  ) {
    throw new AdvancedEngineError('SPLIT_INVALID', 'Mốc chia phải ở trong kỳ.');
  }
  const before = bars.filter((b) => b.date < split);
  const previous = before[before.length - 1]?.date;
  if (previous === undefined) throw new AdvancedEngineError('SPLIT_INVALID', 'Thiếu đoạn trước.');
  // The train run only ever sees bars before the split.
  const train = runBacktest(frozen, before, { ...options, end: previous }, registry);
  const test = runBacktest(frozen, bars, { ...options, start: split }, registry);
  const hash = configHash(frozen);
  const barsHash = dataHash(bars);
  return {
    type: 'out_of_sample_fixed_config',
    split_date: split,
    config_hash: hash,
    data_hash: barsHash,
    train,
    test,
    attempt: {
      kind: 'out_of_sample',
      split_date: split,
      config_hash: hash,
      data_hash: barsHash,
      train: { start: train.snapshot.actual_start, end: train.snapshot.actual_end },
      test: { start: test.snapshot.actual_start, end: test.snapshot.actual_end },
      selection: 'fixed_config',
      note: 'Cấu hình cố định trên hai đoạn; hàm này không tự chọn tham số và không chứng nhận đoạn sau chưa từng được xem.',
    },
  };
}

const isCount = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min;

function assertWalkForward(spec: WalkForwardSpec): void {
  const errors: EngineValidationError[] = [];
  if (!isCount(spec.train_bars, 1))
    errors.push({ path: 'train_bars', message: 'Số phiên huấn luyện phải là số nguyên ≥ 1.' });
  if (!isCount(spec.test_bars, 1))
    errors.push({ path: 'test_bars', message: 'Số phiên kiểm tra phải là số nguyên ≥ 1.' });
  if (
    !isCount(spec.step_bars, 1) ||
    (isCount(spec.test_bars, 1) && spec.step_bars < spec.test_bars)
  )
    errors.push({
      path: 'step_bars',
      message:
        'Bước tiến phải là số nguyên ≥ số phiên kiểm tra (các đoạn kiểm tra không chồng nhau).',
    });
  if (!WALK_FORWARD_CRITERIA.includes(spec.criterion))
    errors.push({ path: 'criterion', message: 'Tiêu chí chọn không hợp lệ.' });
  if (!isCount(spec.min_trades, 0))
    errors.push({ path: 'min_trades', message: 'Số giao dịch tối thiểu phải là số nguyên ≥ 0.' });
  if (errors.length) {
    throw new AdvancedEngineError(
      'WALK_FORWARD_INVALID',
      errors.map((e) => e.message).join('\n'),
      errors,
    );
  }
}

/**
 * Rolling walk-forward (reference `walkForward`): each window selects one
 * candidate using only its preceding train window (criterion desc, ties →
 * lowest candidate index, at least `min_trades` closed trades), then runs that
 * candidate on the following test window. Windows are independently funded
 * reports; no aggregate portfolio return is produced and open positions are
 * reported, never force-closed.
 *
 * @throws AdvancedEngineError GRID_INVALID | PATH_INVALID | WALK_FORWARD_INVALID | INSUFFICIENT_DATA
 */
export function walkForward(
  config: SharedConfig,
  bars: readonly Bar[],
  options: ResearchOptions,
  spec: WalkForwardSpec,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): WalkForwardResult {
  assertGrid(spec?.values);
  assertWalkForward(spec);
  const base = jsonCopy(config);
  assertPath(base, spec.path, registry);
  const range = resolveRange(bars, options);
  const indices: number[] = [];
  bars.forEach((bar, i) => {
    if (bar.date >= range.start && bar.date <= range.end) indices.push(i);
  });
  if (indices.length < spec.train_bars + spec.test_bars) {
    throw new AdvancedEngineError('INSUFFICIENT_DATA', 'Chưa đủ dữ liệu cho một cửa sổ.');
  }
  const dateAt = (i: number | undefined): string => {
    const date = i === undefined ? undefined : bars[i]?.date;
    if (date === undefined)
      throw new AdvancedEngineError('INSUFFICIENT_DATA', 'Chưa đủ dữ liệu cho một cửa sổ.');
    return date;
  };
  const windows: WalkForwardWindow[] = [];
  for (let p = spec.train_bars; p + spec.test_bars <= indices.length; p += spec.step_bars) {
    const trainEndIndex = indices[p - 1] ?? -1;
    const testEndIndex = indices[p + spec.test_bars - 1] ?? -1;
    const trainStart = dateAt(indices[p - spec.train_bars]);
    const trainEnd = dateAt(indices[p - 1]);
    const testStart = dateAt(indices[p]);
    const testEnd = dateAt(indices[p + spec.test_bars - 1]);
    // Selection data ends at the train window: later bars are not even visible.
    const trainBars = bars.slice(0, trainEndIndex + 1);
    const runs = sweep(
      base,
      trainBars,
      { ...options, start: trainStart, end: trainEnd },
      spec.path,
      spec.values,
      registry,
      dataHash(trainBars),
    );
    const trainCandidates: WalkForwardTrainCandidate[] = runs.map(({ candidate }) => {
      const criterionValue = candidate.kpis ? candidate.kpis[spec.criterion] : null;
      const eligible =
        candidate.ok &&
        typeof criterionValue === 'number' &&
        Number.isFinite(criterionValue) &&
        (candidate.n_trades ?? 0) >= spec.min_trades;
      return {
        index: candidate.index,
        value: candidate.value,
        ok: candidate.ok,
        error: candidate.error,
        n_trades: candidate.n_trades,
        criterion_value: criterionValue ?? null,
        eligible,
      };
    });
    let chosen: WalkForwardTrainCandidate | null = null;
    for (const row of trainCandidates) {
      if (!row.eligible || row.criterion_value === null) continue;
      if (chosen === null || row.criterion_value > (chosen.criterion_value ?? -Infinity))
        chosen = row;
    }
    const window = {
      index: windows.length,
      train_start: trainStart,
      train_end: trainEnd,
      test_start: testStart,
      test_end: testEnd,
      train_candidates: trainCandidates,
    };
    if (chosen === null) {
      windows.push({
        ...window,
        status: 'no_eligible_candidate',
        selected: null,
        selected_index: null,
        train_criterion: null,
        train_return: null,
        test_return: null,
        test_max_drawdown: null,
        n_trades: null,
        test_kpis: null,
        open_position: null,
        test_config_hash: null,
        test_snapshot: null,
      });
      continue;
    }
    const chosenRun = runs[chosen.index];
    const testConfig = withParam(base, spec.path, chosen.value);
    const test = runBacktest(
      testConfig,
      bars.slice(0, testEndIndex + 1),
      { ...options, start: testStart, end: testEnd },
      registry,
    );
    windows.push({
      ...window,
      status: 'tested',
      selected: chosen.value,
      selected_index: chosen.index,
      train_criterion: chosen.criterion_value,
      train_return: chosenRun?.candidate.kpis?.net_return ?? null,
      test_return: test.kpis.net_return,
      test_max_drawdown: test.kpis.max_drawdown,
      n_trades: test.kpis.n_trades,
      test_kpis: test.kpis,
      open_position: test.open_position,
      test_config_hash: configHash(testConfig),
      test_snapshot: test.snapshot,
    });
  }
  return {
    type: 'walk_forward_windows',
    policy: 'non_overlapping_tests; independently_funded_windows; no_aggregate_portfolio_return',
    path: jsonCopy(spec.path),
    values: [...spec.values],
    criterion: spec.criterion,
    min_trades: spec.min_trades,
    train_bars: spec.train_bars,
    test_bars: spec.test_bars,
    step_bars: spec.step_bars,
    base_config_hash: configHash(base),
    data_hash: dataHash(bars),
    windows,
  };
}
