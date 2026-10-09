import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { ACADEMY_GRANTS, type AcademyGrantsPort } from '../academy/academy.ports.js';
import {
  QUANT_MARKET_DATA,
  type HistoricalBars,
  type QuantMarketDataProvider,
} from '../quant/quant.types.js';
import {
  indicatorCapability,
  loadTechnicalRegistry,
  sha256Hex,
  validateConfig,
  type Bar,
  type Side,
} from '../quant/v2/index.js';
import {
  activeIndicatorIds,
  barsDataVersion,
  evaluateSide,
  isPairDue,
  type AlertStateRow,
  type SideEvaluation,
} from './strategy-alerts.evaluation.js';
import { StrategyAlertsRepository } from './strategy-alerts.repository.js';
import type {
  AlertEvaluationStore,
  ApplyEvaluationInput,
  EvaluationTarget,
} from './strategy-alerts.types.js';

/** Sessions of history fetched before the session so 252-period / multi-stage indicators are warm. */
export const ALERT_WARMUP_SESSIONS = 400;
/** Daily data readiness is read from the market benchmark's bar of the session. */
export const ALERT_READINESS_SYMBOL = 'VNINDEX';
const FETCH_CONCURRENCY = 4;

export type EvaluationSummary = {
  session: string;
  /** Set when nothing was evaluated; the job reports `skipped` with this reason. */
  skipped?: 'daily_data_not_ready' | 'market_data_unavailable' | 'no_active_alerts';
  alerts: number;
  pairs_due: number;
  pairs_evaluated: number;
  results: { true: number; false: number; unknown: number };
  events_created: number;
  duplicates: number;
  skipped_pairs: number;
  symbols_without_bar: number;
  errors: number;
};

const emptySummary = (session: string): EvaluationSummary => ({
  session,
  alerts: 0,
  pairs_due: 0,
  pairs_evaluated: 0,
  results: { true: 0, false: 0, unknown: 0 },
  events_created: 0,
  duplicates: 0,
  skipped_pairs: 0,
  symbols_without_bar: 0,
  errors: 0,
});

type Pair = { target: EvaluationTarget; symbol: string; side: Side };

async function mapLimit<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await work(items[index] as T);
    }
  });
  await Promise.all(lanes);
}

const toBars = (history: HistoricalBars, session: string): Bar[] =>
  history.records
    .filter((record) => record.time <= session)
    .map((record) => ({
      date: record.time,
      open: record.open,
      high: record.high,
      low: record.low,
      close: record.close,
      volume: record.volume,
    }));

/**
 * End-of-session evaluation of Strategy alerts (spec §4.4-§4.5). Runs on completed daily bars
 * only: the benchmark must already have the bar of `session`, and each symbol's own bar must
 * carry that exact date. Every (alert version, symbol, side) gets a three-valued result; events
 * are written under a durable unique key, so retries and parallel workers never duplicate one.
 * No order is placed and nothing is sent outside the web history.
 */
@Injectable()
export class StrategyAlertEvaluator {
  private readonly logger = new Logger(StrategyAlertEvaluator.name);

  constructor(
    @Inject(StrategyAlertsRepository) private readonly store: AlertEvaluationStore,
    @Inject(ACADEMY_GRANTS) private readonly grants: AcademyGrantsPort,
    @Optional()
    @Inject(QUANT_MARKET_DATA)
    private readonly market?: QuantMarketDataProvider,
  ) {}

  async evaluateSession(session: string, now: Date = new Date()): Promise<EvaluationSummary> {
    const summary = emptySummary(session);
    if (!this.market) return { ...summary, skipped: 'market_data_unavailable' };

    const targets = await this.store.listTargets();
    summary.alerts = targets.length;
    if (!targets.length) return { ...summary, skipped: 'no_active_alerts' };

    const states = await this.store.loadStates(targets.map((target) => target.alert_id));
    const stateKey = (alertId: string, version: number, symbol: string, side: Side) =>
      `${alertId}:${version}:${symbol}:${side}`;
    const stateByKey = new Map<string, AlertStateRow>(
      states.map((state) => [
        stateKey(state.alert_id, state.version, state.symbol, state.side),
        state,
      ]),
    );

    const due: Pair[] = [];
    for (const target of targets)
      for (const symbol of target.symbols)
        for (const side of target.sides)
          if (
            isPairDue(
              stateByKey.get(stateKey(target.alert_id, target.version, symbol, side)),
              target.epoch,
              session,
            )
          )
            due.push({ target, symbol, side });
    summary.pairs_due = due.length;
    if (!due.length) return summary;

    // Daily data must be complete before any alert is judged: the benchmark has this session's bar.
    try {
      const benchmark = await this.market.getHistoricalOhlcv(
        ALERT_READINESS_SYMBOL,
        session,
        session,
        { warmupSessions: 0 },
      );
      if (!benchmark.records.some((record) => record.time === session))
        return { ...summary, skipped: 'daily_data_not_ready' };
    } catch (error) {
      this.logger.warn(
        `Alert readiness check failed for ${session}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ...summary, skipped: 'market_data_unavailable' };
    }

    const grantsByUser = new Map<string, Promise<ReadonlySet<string>>>();
    const grantsOf = (userId: string) => {
      let cached = grantsByUser.get(userId);
      if (!cached) {
        cached = this.grants.grantedCapabilities(userId);
        grantsByUser.set(userId, cached);
      }
      return cached;
    };
    const registry = loadTechnicalRegistry();
    const invalidConfig = new Map<string, boolean>();
    const configInvalid = (target: EvaluationTarget): boolean => {
      const key = `${target.alert_id}:${target.version}`;
      let invalid = invalidConfig.get(key);
      if (invalid === undefined) {
        invalid = validateConfig(target.config, registry).length > 0;
        invalidConfig.set(key, invalid);
      }
      return invalid;
    };

    const bySymbol = new Map<string, Pair[]>();
    for (const pair of due) {
      const list = bySymbol.get(pair.symbol) ?? [];
      list.push(pair);
      bySymbol.set(pair.symbol, list);
    }

    await mapLimit([...bySymbol.entries()], FETCH_CONCURRENCY, async ([symbol, pairs]) => {
      let bars: Bar[] | null = null;
      let fetchFailed = false;
      try {
        bars = toBars(
          await this.market!.getHistoricalOhlcv(symbol, session, session, {
            warmupSessions: ALERT_WARMUP_SESSIONS,
          }),
          session,
        );
      } catch (error) {
        fetchFailed = true;
        this.logger.warn(
          `Alert bars unavailable for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!bars?.some((bar) => bar.date === session)) summary.symbols_without_bar += 1;
      const dataVersion = bars?.length
        ? barsDataVersion(bars)
        : sha256Hex(`no-bars:${symbol}:${session}`);

      for (const pair of pairs) {
        try {
          const granted = await grantsOf(pair.target.user_id);
          const locked = activeIndicatorIds(pair.target.config, pair.side).filter(
            (id) => !granted.has(indicatorCapability(id)),
          );
          let evaluation: SideEvaluation;
          if (configInvalid(pair.target))
            evaluation = { result: null, reason: 'config_invalid', indicator_ids: [], rules: [] };
          else if (locked.length)
            evaluation = {
              result: null,
              reason: 'capability_locked',
              indicator_ids: locked,
              rules: [],
            };
          else if (fetchFailed || !bars)
            evaluation = {
              result: null,
              reason: 'market_data_unavailable',
              indicator_ids: [],
              rules: [],
            };
          else evaluation = evaluateSide(pair.target.config, bars, pair.side, session);

          const lastBar = bars?.[bars.length - 1];
          const input: ApplyEvaluationInput = {
            target: pair.target,
            symbol,
            side: pair.side,
            session,
            evaluated_at: now,
            result: evaluation.result,
            reason: evaluation.reason,
            data_version: dataVersion,
            evidence: {
              session,
              bar:
                lastBar && lastBar.date === session
                  ? {
                      date: lastBar.date,
                      open: lastBar.open,
                      high: lastBar.high,
                      low: lastBar.low,
                      close: lastBar.close,
                      volume: lastBar.volume,
                    }
                  : null,
              indicator_ids: evaluation.indicator_ids,
              indicator_params: Object.fromEntries(
                evaluation.indicator_ids.flatMap((id) => {
                  const item = pair.target.config.indicators[id];
                  return item ? [[id, item[pair.side].params]] : [];
                }),
              ),
              rules: evaluation.rules,
              ...(evaluation.reason ? { reason: evaluation.reason } : {}),
            },
          };
          const outcome = await this.store.applyEvaluation(input);
          if (outcome.plan.skip !== null) {
            summary.skipped_pairs += 1;
            continue;
          }
          summary.pairs_evaluated += 1;
          summary.results[outcome.result] += 1;
          if (outcome.event_created) summary.events_created += 1;
          if (outcome.duplicate) summary.duplicates += 1;
        } catch (error) {
          summary.errors += 1;
          this.logger.warn(
            `Alert evaluation failed for ${pair.target.alert_id}/${symbol}/${pair.side}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    });
    return summary;
  }
}
