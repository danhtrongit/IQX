import {
  canonicalJson,
  sha256Hex,
  sideSignalsWithEvidence,
  type Bar,
  type SharedConfig,
  type Side,
  type TracedRuleEvaluation,
  type Tri,
} from '../quant/v2/index.js';

/**
 * End-of-session alert evaluation (Strategy spec §4.4-§4.5), kept pure so that the job, the
 * SQL store and the tests share one definition of the transition table.
 *
 * Three-valued results (true / false / unknown) come from the 16-indicator v2 engine
 * (`sideSignalsWithEvidence`): missing or insufficient data is `null`, never false.
 */

/** Messages are condition matches, never trades: "Bot đã mua/bán" is never used. */
export const SIDE_LABEL: Record<Side, 'Mua' | 'Bán'> = { buy: 'Mua', sell: 'Bán' };
export const signalMessage = (side: Side): string => `Thỏa điều kiện ${SIDE_LABEL[side]}`;

export type AlertEventKind = 'first_observation' | 'new_signal';

export const EVENT_KIND_LABEL: Record<AlertEventKind, string> = {
  first_observation: 'Đang thỏa ở lần kiểm tra đầu',
  new_signal: 'Tín hiệu mới: trước đó chưa thỏa điều kiện',
};

/** Latest VALID (true/false) evaluation of one (alert version, symbol, side); null = none yet. */
export type ValidState = {
  last_valid_result: boolean | null;
  last_valid_session: string | null;
};

export type StateResult = 'true' | 'false' | 'unknown';
export const triToResult = (value: Tri): StateResult =>
  value === true ? 'true' : value === false ? 'false' : 'unknown';

export type Transition = {
  next: ValidState;
  result: StateResult;
  /** The event to record, if any. `true → true`, `any → false` and `unknown` never record one. */
  event: { kind: AlertEventKind } | null;
};

/**
 * §4.4 transition table:
 *  - no valid check yet + true  → "Đang thỏa ở lần kiểm tra đầu" (never a claimed crossing);
 *  - false + true               → new signal;
 *  - true + true                → still satisfied, nothing repeated;
 *  - true/false + false         → state updated, nothing emitted when the condition is lost;
 *  - anything + unknown         → "chưa đánh giá được", the previous valid state is kept, so
 *                                 true → unknown → true is not a new signal.
 */
export function transition(prev: ValidState, current: Tri, session: string): Transition {
  if (current === null) return { next: { ...prev }, result: 'unknown', event: null };
  const next: ValidState = { last_valid_result: current, last_valid_session: session };
  if (current === false) return { next, result: 'false', event: null };
  if (prev.last_valid_result === null)
    return { next, result: 'true', event: { kind: 'first_observation' } };
  if (prev.last_valid_result === false)
    return { next, result: 'true', event: { kind: 'new_signal' } };
  return { next, result: 'true', event: null };
}

/** Stored state row of one (alert version, symbol, side). */
export type AlertStateRow = {
  alert_id: string;
  version: number;
  symbol: string;
  side: Side;
  epoch: number;
  last_valid_result: boolean | null;
  last_valid_session: string | null;
  last_result: StateResult;
  last_session: string | null;
  last_reason: string | null;
  attempts: number;
};

/** Unknown results are retried within a session at most this many times (feed hiccups, not forever). */
export const MAX_UNKNOWN_ATTEMPTS = 6;

/**
 * Is this pair due for `session`? A pair is done once it has a valid (true/false) result for
 * the session in the current observation epoch; unknown results are retried a few times.
 * A resume (higher `epoch`) makes every pair due again: observation starts fresh, while the
 * event dedupe key still prevents a second event for the same session.
 */
export function isPairDue(
  state: Pick<AlertStateRow, 'epoch' | 'last_result' | 'last_session' | 'attempts'> | undefined,
  alertEpoch: number,
  session: string,
): boolean {
  if (!state) return true;
  if (state.epoch < alertEpoch) return true;
  if (state.last_session === null || state.last_session < session) return true;
  if (state.last_session > session) return false;
  if (state.last_result !== 'unknown') return false;
  return state.attempts < MAX_UNKNOWN_ATTEMPTS;
}

export type EvaluationPlan =
  | { skip: 'stale_session' | 'already_evaluated' | 'attempts_exhausted' }
  | {
      skip: null;
      next: ValidState;
      result: StateResult;
      attempts: number;
      epoch: number;
      event: { kind: AlertEventKind; previous: ValidState } | null;
    };

/**
 * What to persist for one evaluation, given the locked state row (or none). Shared by the SQL
 * store and the in-memory fake so both apply the identical rules.
 */
export function planEvaluation(
  state: AlertStateRow | undefined,
  alertEpoch: number,
  session: string,
  current: Tri,
): EvaluationPlan {
  const fresh = !state || state.epoch < alertEpoch;
  const prev: ValidState = fresh
    ? { last_valid_result: null, last_valid_session: null }
    : { last_valid_result: state.last_valid_result, last_valid_session: state.last_valid_session };
  if (!fresh && state) {
    if (state.last_session !== null && state.last_session > session)
      return { skip: 'stale_session' };
    if (state.last_session === session && state.last_result !== 'unknown')
      return { skip: 'already_evaluated' };
    if (state.last_session === session && state.attempts >= MAX_UNKNOWN_ATTEMPTS)
      return { skip: 'attempts_exhausted' };
  }
  const outcome = transition(prev, current, session);
  const sameSession = !fresh && state?.last_session === session;
  return {
    skip: null,
    next: outcome.next,
    result: outcome.result,
    attempts: sameSession ? (state?.attempts ?? 0) + 1 : 1,
    epoch: alertEpoch,
    event: outcome.event ? { kind: outcome.event.kind, previous: prev } : null,
  };
}

const ICT_OFFSET_MINUTES = 7 * 60;
/** Daily bars are treated as final from 15:45 Asia/Ho_Chi_Minh on a trading day (after the close). */
export const ALERT_EOD_READY_MINUTE = 15 * 60 + 45;

export function isEodEvaluationDue(date: Date): boolean {
  const minutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + ICT_OFFSET_MINUTES) % (24 * 60);
  return minutes >= ALERT_EOD_READY_MINUTE;
}

export type SideEvaluation = {
  result: Tri;
  /** Why the result is unknown (null when true/false). */
  reason: string | null;
  indicator_ids: string[];
  rules: TracedRuleEvaluation[];
};

/** Indicators that decide `side` in a config: master ON and the side ON. */
export function activeIndicatorIds(config: SharedConfig, side: Side): string[] {
  return Object.entries(config.indicators)
    .filter(([, item]) => item.master_enabled === true && item[side].enabled === true)
    .map(([id]) => id)
    .sort();
}

/**
 * Evaluates one side of a pinned config on the bar of `session`. Only a bar dated exactly
 * `session` counts: a forming or earlier candle is never presented as the end-of-session state.
 */
export function evaluateSide(
  config: SharedConfig,
  bars: readonly Bar[],
  side: Side,
  session: string,
): SideEvaluation {
  const ids = activeIndicatorIds(config, side);
  if (!ids.length)
    return { result: null, reason: 'no_active_condition', indicator_ids: [], rules: [] };
  const last = bars[bars.length - 1];
  if (!last || last.date !== session)
    return { result: null, reason: 'no_bar_for_session', indicator_ids: ids, rules: [] };
  const evidence = sideSignalsWithEvidence(config, bars, side)[bars.length - 1];
  if (!evidence)
    return { result: null, reason: 'no_bar_for_session', indicator_ids: ids, rules: [] };
  return {
    result: evidence.result,
    reason: evidence.result === null ? 'insufficient_or_missing_data' : null,
    indicator_ids: evidence.active_indicator_ids,
    rules: evidence.rules,
  };
}

/** Version of the daily bars an evaluation used (full OHLCV series up to the session). */
export function barsDataVersion(bars: readonly Bar[]): string {
  return sha256Hex(
    canonicalJson(
      bars.map((bar) => [bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume]),
    ),
  );
}

/** Hash that decides whether an edit changes the definition (and so needs a new version). */
export function definitionHash(parts: {
  config_hash: string;
  symbols: readonly string[];
  sides: readonly string[];
  scope: { kind: string; list_id?: string };
}): string {
  return sha256Hex(
    canonicalJson({
      config_hash: parts.config_hash,
      symbols: [...parts.symbols].sort(),
      sides: [...parts.sides].sort(),
      scope: parts.scope,
    }),
  );
}
