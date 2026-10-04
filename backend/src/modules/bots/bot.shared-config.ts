import {
  loadTechnicalRegistry,
  sideSignals,
  type Bar,
  type RegistryEntry,
  type SharedConfig,
  type Side,
  type Tri,
} from '../quant/v2/index.js';
import {
  BOT_RULE_HASH,
  BOT_RULE_SNAPSHOT,
  canonicalHash,
  type BotRuleSnapshot,
} from './bot.domain.js';
import type { BotMarketSnapshotInput, BotSharedConfigSignals } from './bot.types.js';

/**
 * Bot integration with the shared Buy/Sell config (BOT_SHARED_CONFIG_ENABLED).
 * The shared config only adds an entry filter and an exit reason on top of the
 * frozen Bot v1 rules; stop L1, take-profit, budget and sizing limits are untouched.
 */

export const BOT_SHARED_CONFIG_SELL_REASON = 'shared_config_sell';
/** Enough history for the longest registry lookback (index_ma 300) plus seeds. */
export const BOT_SHARED_CONFIG_WARMUP_SESSIONS = 400;
export const BOT_SHARED_CONFIG_MARKET_SYMBOL = 'VNINDEX';

export type BotSharedConfigPin = {
  revision: number;
  config_hash: string;
  effective_session: string;
};

export type BotRuleReceipt = {
  snapshot: BotRuleSnapshot | (BotRuleSnapshot & { shared_config: BotSharedConfigPin });
  hash: string;
};

export type BotExitReason = 'stop_loss' | 'take_profit' | typeof BOT_SHARED_CONFIG_SELL_REASON;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{64}$/;

export function parseSharedConfigPin(value: unknown): BotSharedConfigPin | null {
  if (!isRecord(value)) return null;
  const { revision, config_hash: configHash, effective_session: session } = value;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return null;
  if (typeof configHash !== 'string' || !HASH.test(configHash)) return null;
  if (typeof session !== 'string' || !DATE.test(session)) return null;
  return { revision, config_hash: configHash, effective_session: session };
}

/**
 * Rule snapshot + hash stored on the run receipt. Without a pin this is exactly
 * the frozen Bot v1 snapshot/hash, so flag-off receipts stay byte-identical.
 */
export function botRuleReceipt(pin: BotSharedConfigPin | null): BotRuleReceipt {
  if (!pin) return { snapshot: BOT_RULE_SNAPSHOT, hash: BOT_RULE_HASH };
  const snapshot = {
    ...BOT_RULE_SNAPSHOT,
    shared_config: {
      revision: pin.revision,
      config_hash: pin.config_hash,
      effective_session: pin.effective_session,
    },
  };
  return { snapshot, hash: canonicalHash(snapshot) };
}

/**
 * A receipt is supported when its v1 part hashes to BOT_RULE_HASH and, if a shared
 * config is pinned, the stored rule hash covers that pin.
 */
export function verifyRuleReceipt(
  ruleSnapshot: unknown,
  ruleHash: string | null,
): { valid: boolean; pin: BotSharedConfigPin | null } {
  if (!isRecord(ruleSnapshot) || !('shared_config' in ruleSnapshot)) {
    return {
      valid: ruleHash === BOT_RULE_HASH && canonicalHash(ruleSnapshot) === BOT_RULE_HASH,
      pin: null,
    };
  }
  const { shared_config: raw, ...base } = ruleSnapshot;
  const pin = parseSharedConfigPin(raw);
  const valid =
    pin !== null &&
    canonicalHash(base) === BOT_RULE_HASH &&
    ruleHash === canonicalHash(ruleSnapshot);
  return { valid, pin: valid ? pin : null };
}

/** Registry indicators whose master and `side` switches are both ON (same rule as `sideSignals`). */
export function activeSideIndicators(
  config: SharedConfig,
  side: Side,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): RegistryEntry[] {
  return registry.filter((entry) => {
    const item = config.indicators[entry.id];
    return Boolean(item?.master_enabled && item[side].enabled);
  });
}

/** Whether any active indicator needs VN-Index/context fields on the bars. */
export function needsMarketContext(
  config: SharedConfig,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): boolean {
  return [
    ...activeSideIndicators(config, 'buy', registry),
    ...activeSideIndicators(config, 'sell', registry),
  ].some((entry) => entry.availability === 'needs_history_context');
}

/**
 * Side signal on the session's own completed bar. A history that does not end on
 * `session` is missing data (null), never a stale signal.
 */
export function sessionSideSignal(
  config: SharedConfig,
  bars: readonly Bar[] | null,
  side: Side,
  session: string,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): Tri {
  if (!bars?.length || bars.at(-1)?.date !== session) return null;
  return sideSignals(config, bars, side, registry).at(-1) ?? null;
}

/** Symbols the Bot may evaluate for entry: every snapshot row that came from a V1 filter. */
export function sharedConfigBuySymbols(input: BotMarketSnapshotInput): string[] {
  const symbols = Object.entries(input.symbols)
    .filter(([, row]) => Boolean(row.filter_ids?.length))
    .map(([symbol]) => symbol.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(symbols)].sort();
}

function signalMap(value: unknown): Record<string, boolean | null> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => item === null || typeof item === 'boolean')) return null;
  return Object.fromEntries(entries) as Record<string, boolean | null>;
}

/** Frozen signals of a snapshot, accepted only when they belong to the receipt's pin. */
export function parseSharedConfigSignals(
  value: unknown,
  pin: BotSharedConfigPin,
): BotSharedConfigSignals | null {
  if (!isRecord(value)) return null;
  const own = parseSharedConfigPin(value);
  if (
    !own ||
    own.revision !== pin.revision ||
    own.config_hash !== pin.config_hash ||
    own.effective_session !== pin.effective_session
  ) {
    return null;
  }
  const buy = signalMap(value.buy);
  const sell = signalMap(value.sell);
  if (!buy || !sell || typeof value.buy_active !== 'boolean') return null;
  if (typeof value.sell_active !== 'boolean' || !isRecord(value.data)) return null;
  return value as BotSharedConfigSignals;
}

/**
 * Additional entry filter. Inactive Buy side → null (Bot v1 entry unchanged);
 * otherwise only a `true` signal lets the candidate through.
 */
export function sharedConfigBuyBlock(
  signals: BotSharedConfigSignals | null,
  symbol: string,
): 'shared_config_buy_false' | 'shared_config_buy_missing' | null {
  if (!signals?.buy_active) return null;
  const signal = signals.buy[symbol];
  if (signal === true) return null;
  return signal === false ? 'shared_config_buy_false' : 'shared_config_buy_missing';
}

/** Stop L1 / take-profit always win; the shared Sell signal is evaluated after them. */
export function sharedConfigExitReason(
  v1Signal: 'stop_loss' | 'take_profit' | null,
  signals: BotSharedConfigSignals | null,
  symbol: string,
): BotExitReason | null {
  if (v1Signal) return v1Signal;
  if (!signals?.sell_active) return null;
  return signals.sell[symbol] === true ? BOT_SHARED_CONFIG_SELL_REASON : null;
}
