import {
  AdvancedEngineError,
  outOfSample,
  runSystem,
  sensitivity,
  walkForward,
  type AdvancedEngineErrorCode,
  type OutOfSampleResult,
  type SensitivityResult,
  type SystemOptions,
  type SystemProfile,
  type SystemResult,
  type SystemSymbolData,
  type UniverseMembership,
  type WalkForwardCriterion,
  type WalkForwardResult,
} from '../quant/v2/advanced/index.js';
import {
  EngineRunError,
  runBacktest,
  type Bar,
  type EngineRunErrorCode,
  type EngineValidationError,
  type ParamPath,
  type RunOptions,
  type RunResult,
  type SharedConfig,
} from '../quant/v2/index.js';

export type ResearchJob =
  | { kind: 'sensitivity'; path: ParamPath; values: number[] }
  | { kind: 'out_of_sample'; split_date: string }
  | {
      kind: 'walk_forward';
      path: ParamPath;
      values: number[];
      train_bars: number;
      test_bars: number;
      step_bars: number;
      criterion: WalkForwardCriterion;
      min_trades: number;
    };

export type SystemJob = {
  symbols: SystemSymbolData[];
  options: SystemOptions;
  universe: UniverseMembership[] | null;
};

/**
 * Everything one run needs, already resolved by the service (saved config,
 * canonical bars, explicit options). Structured-clone safe so it can cross a
 * worker boundary.
 */
export type BacktestJob = {
  config: SharedConfig;
  bars: Bar[];
  options: RunOptions;
  research: ResearchJob | null;
  system: SystemJob | null;
};

export type ResearchResult = SensitivityResult | OutOfSampleResult | WalkForwardResult;

/** CONTRACTS §4.1 `system_result` (the full ledger stays server-side; only its size is returned). */
export type SystemRunSummary = Pick<
  SystemResult,
  'curve' | 'trades' | 'positions_open' | 'kpis' | 'ledger_size' | 'applied'
>;

export type BacktestJobOutput = {
  /** CLEAN_TECH_2.0 run of the saved config on the requested symbol and range. */
  result: RunResult;
  research_result: ResearchResult | null;
  system_result: SystemRunSummary | null;
  system_profile: SystemProfile | null;
};

/**
 * Run the baseline backtest plus the optional research or system payload. Pure
 * and synchronous; candidate configs exist only inside this call and are never
 * written anywhere.
 *
 * @throws EngineRunError | AdvancedEngineError
 */
export function executeBacktestJob(job: BacktestJob): BacktestJobOutput {
  const result = runBacktest(job.config, job.bars, job.options);
  let research: ResearchResult | null = null;
  if (job.research?.kind === 'sensitivity') {
    research = sensitivity(job.config, job.bars, job.options, {
      path: job.research.path,
      values: job.research.values,
    });
  } else if (job.research?.kind === 'out_of_sample') {
    research = outOfSample(job.config, job.bars, job.options, {
      split_date: job.research.split_date,
    });
  } else if (job.research?.kind === 'walk_forward') {
    const { kind: _kind, ...spec } = job.research;
    research = walkForward(job.config, job.bars, job.options, spec);
  }
  if (!job.system) {
    return { result, research_result: research, system_result: null, system_profile: null };
  }
  const system = runSystem({
    config: job.config,
    symbols: job.system.symbols,
    options: job.options,
    system: job.system.options,
    ...(job.system.universe ? { universe: job.system.universe } : {}),
  });
  return {
    result,
    research_result: research,
    system_result: {
      curve: system.curve,
      trades: system.trades,
      positions_open: system.positions_open,
      kpis: system.kpis,
      ledger_size: system.ledger_size,
      applied: system.applied,
    },
    system_profile: system.profile,
  };
}

export type SerializedJobError = {
  name: 'EngineRunError' | 'AdvancedEngineError' | 'Error';
  code: string | null;
  message: string;
  errors: EngineValidationError[];
};

/** Engine errors lose their class across `postMessage`; keep code/errors explicitly. */
export function serializeJobError(error: unknown): SerializedJobError {
  if (error instanceof EngineRunError || error instanceof AdvancedEngineError) {
    return {
      name: error.name as SerializedJobError['name'],
      code: error.code,
      message: error.message,
      errors: error.errors,
    };
  }
  return {
    name: 'Error',
    code: null,
    message: error instanceof Error ? error.message : String(error),
    errors: [],
  };
}

export function deserializeJobError(error: SerializedJobError): Error {
  if (error.name === 'EngineRunError')
    return new EngineRunError(error.code as EngineRunErrorCode, error.message, error.errors);
  if (error.name === 'AdvancedEngineError')
    return new AdvancedEngineError(
      error.code as AdvancedEngineErrorCode,
      error.message,
      error.errors,
    );
  return new Error(error.message);
}
