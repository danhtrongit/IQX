/**
 * Builds the `SessionInput` of session D from a store bundle. The Backtest calls it for every
 * session of its range and the Bot for its one session, so prices, GTGD TB20 and signals of both
 * engines come from the same code (Q2, R15).
 */

import { loadTechnicalRegistry } from '../quant/v2/technical-registry.js';
import type { RegistryEntry } from '../quant/v2/types.js';
import { sessionStrategyOf, strategyConfigHash } from './content.js';
import type {
  PriceSeriesBundle,
  SessionInput,
  SessionStrategy,
  SignalCache,
  SignalProvider,
  StrategyContent,
  SymbolSessionInput,
  SymbolSignals,
} from './contracts.js';
import {
  barIndexAt,
  barIndexAtOrBefore,
  computeSymbolSignals,
  decodeTri,
  gtgd20At,
  TRI_TRUE,
  validClose,
} from './signals.js';
import { STRATEGY_RULES } from './constants.js';

export function createSignalProvider(
  content: StrategyContent,
  bundle: PriceSeriesBundle,
  options: {
    registry?: readonly RegistryEntry[];
    cache?: SignalCache;
    config_hash?: string;
    /**
     * First calendar session whose signals are needed (Backtest: the range start; Bot: D). Values
     * are identical for any choice (indicators always run from the first bar); this only skips work.
     */
    from_session_idx?: number;
  } = {},
): SignalProvider {
  const registry = options.registry ?? loadTechnicalRegistry();
  const configHash = options.config_hash ?? strategyConfigHash(content);
  const local = new Map<string, SymbolSignals | null>();
  return (symbol) => {
    if (local.has(symbol)) return local.get(symbol)!;
    const series = bundle.symbols[symbol];
    const signals = series
      ? computeSymbolSignals(content, series, bundle.calendar, {
          registry,
          cache: options.cache,
          config_hash: configHash,
          market: bundle.market,
          from_session_idx: options.from_session_idx,
        })
      : null;
    local.set(symbol, signals);
    return signals;
  };
}

export type BuildSessionInputOptions = {
  bundle: PriceSeriesBundle;
  /** Index of D in `bundle.calendar`. */
  session_idx: number;
  /** null = no strategy chosen (Bot §5.6). */
  content: StrategyContent | null;
  /** Buy universe at D (store-eligible). */
  universe: readonly string[];
  /** Symbols held at the start of D. */
  held: readonly string[];
  signals: SignalProvider | null;
  /** Sell-side issues per symbol (journaled; a due position is still sold, R05). */
  sell_issues?: Readonly<Record<string, string>>;
  registry?: readonly RegistryEntry[];
  /** Precomputed `sessionStrategyOf(content)` (hot loops). */
  strategy?: SessionStrategy | null;
  /**
   * Keep only universe members whose Buy signal is true (plus held symbols). `stepSession` reads
   * nothing else, so the result is identical; the Backtest uses it, the Bot may keep every member
   * for its per-symbol journal.
   */
  buy_candidates_only?: boolean;
};

function symbolInput(
  bundle: PriceSeriesBundle,
  symbol: string,
  sessionIdx: number,
  signals: SignalProvider | null,
  needBuy: boolean,
  needSell: boolean,
): SymbolSessionInput {
  const series = bundle.symbols[symbol];
  if (!series) {
    return {
      close_vnd: null,
      last_close_vnd: null,
      gtgd20_vnd: null,
      buy_signal: null,
      sell_signal: null,
    };
  }
  const barIdx = barIndexAt(series, sessionIdx);
  const close = barIdx >= 0 ? series.close[barIdx] : undefined;
  const lastIdx = barIdx >= 0 ? barIdx : barIndexAtOrBefore(series, sessionIdx);
  const last = lastIdx >= 0 ? series.close[lastIdx] : undefined;
  const sig = barIdx >= 0 && (needBuy || needSell) ? (signals?.(symbol) ?? null) : null;
  const buySignal = needBuy && sig ? decodeTri(sig.buy[barIdx]) : null;
  return {
    close_vnd: validClose(close) ? BigInt(Math.round(close)) : null,
    last_close_vnd: validClose(last) ? BigInt(Math.round(last)) : null,
    // Only buy candidates are ranked: GTGD TB20 is computed for them alone.
    gtgd20_vnd:
      buySignal === true ? gtgd20At(series, barIdx, STRATEGY_RULES.liquidity_window) : null,
    buy_signal: buySignal,
    sell_signal: needSell && sig ? decodeTri(sig.sell[barIdx]) : null,
  };
}

export function buildSessionInput(options: BuildSessionInputOptions): SessionInput {
  const { bundle, session_idx: sessionIdx, content } = options;
  const session = bundle.calendar[sessionIdx];
  if (session === undefined) throw new Error(`session index ${sessionIdx} outside the calendar`);
  const registry = options.registry ?? loadTechnicalRegistry();
  const strategy =
    options.strategy !== undefined
      ? options.strategy
      : content
        ? sessionStrategyOf(content, registry)
        : null;
  const held = new Set(options.held);
  const universe = [
    ...new Set(options.universe.map((symbol) => symbol.trim().toUpperCase())),
  ].sort();
  const symbols: Record<string, SymbolSessionInput> = {};
  const buyActive = Boolean(strategy?.buy_enabled);
  for (const symbol of universe) {
    if (held.has(symbol)) continue;
    if (options.buy_candidates_only) {
      const series = bundle.symbols[symbol];
      const at = series && buyActive ? barIndexAt(series, sessionIdx) : -1;
      const sig = at >= 0 ? options.signals?.(symbol) : null;
      if (!sig || sig.buy[at] !== TRI_TRUE) continue;
    }
    symbols[symbol] = symbolInput(bundle, symbol, sessionIdx, options.signals, buyActive, false);
  }
  for (const symbol of held) {
    const input = symbolInput(
      bundle,
      symbol,
      sessionIdx,
      options.signals,
      false,
      Boolean(strategy?.sell_enabled),
    );
    const issue = options.sell_issues?.[symbol];
    symbols[symbol] = issue ? { ...input, sell_issue: issue } : input;
  }
  return { session, strategy, universe, symbols };
}
