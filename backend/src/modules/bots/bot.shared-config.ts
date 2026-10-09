import {
  configHash,
  evaluateRuleWithEvidence,
  loadTechnicalRegistry,
  sideSignals,
  sideSignalsWithEvidence,
  validateConfig,
  type Bar,
  type RegistryEntry,
  type SharedConfig,
  type Side,
  type SideSignalsEvidence,
  type Tri,
} from '../quant/v2/index.js';
import {
  BOT_POLICY_HASH,
  BOT_POLICY_SNAPSHOT,
  canonicalHash,
  type BotPolicySnapshot,
} from './bot.domain.js';
import {
  LEGACY_ACADEMY_POLICY_HASH,
  LEGACY_ACADEMY_POLICY_VERSION,
  LEGACY_BOT_V1_RULE_HASH,
  isLegacyBotV1Snapshot,
} from './bot.legacy.js';
import type {
  BotConditionSnapshot,
  BotMarketSnapshotInput,
  BotSharedConfigSignals,
  BotUniversePin,
} from './bot.types.js';

export const BOT_SHARED_CONFIG_WARMUP_SESSIONS = 400;
export const BOT_SHARED_CONFIG_MARKET_SYMBOL = 'VNINDEX';

export type BotSharedConfigPin = {
  revision: number;
  config_hash: string;
  effective_session: string;
};

/** Immutable receipt of an `iqx-bot-v1.0` run: policy + config pin + grants + universe pin. */
export type BotRuleSnapshot = BotPolicySnapshot & {
  shared_config: BotSharedConfigPin | null;
  granted_capabilities: string[];
  data_hash: string;
  /** The buy universe captured with this run (the policy's own `universe` key is static). */
  universe_pin: BotUniversePin | null;
};

/** Receipt layout of the retired `iqx-bot-academy-activation-1` policy (verification only). */
export type BotAcademyRuleSnapshot = Record<string, unknown> & {
  shared_config: BotSharedConfigPin | null;
  granted_capabilities: string[];
  data_hash: string;
};

export type BotRuleReceipt = {
  snapshot: BotRuleSnapshot;
  hash: string;
  policyVersion: typeof BOT_POLICY_SNAPSHOT.policy_version;
};

export type BotReceiptKind = 'bot' | 'academy' | 'legacy-v1';

export type BotReceiptVerification = {
  valid: boolean;
  pin: BotSharedConfigPin | null;
  kind: BotReceiptKind | null;
  /** Policy version string of a valid policy receipt (`null` for frozen V1 receipts). */
  policyVersion: string | null;
  grantedCapabilities: string[];
  dataHash: string | null;
  universe: BotUniversePin | null;
};

export type BotExitReason = 'academy_sell';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{64}$/;

export function parseSharedConfigPin(value: unknown): BotSharedConfigPin | null {
  if (!isRecord(value)) return null;
  const { revision, config_hash: configHashValue, effective_session: session } = value;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return null;
  if (typeof configHashValue !== 'string' || !HASH.test(configHashValue)) return null;
  if (typeof session !== 'string' || !DATE.test(session)) return null;
  return { revision, config_hash: configHashValue, effective_session: session };
}

function normalizedCapabilities(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

export function botRuleReceipt(
  pin: BotSharedConfigPin | null,
  grantedCapabilities: readonly string[],
  dataHash: string,
  universe: BotUniversePin | null = null,
): BotRuleReceipt {
  if (!HASH.test(dataHash)) throw new Error('Bot receipt data hash must be a SHA-256 hex value');
  if (pin !== null && parseSharedConfigPin(pin) === null) {
    throw new Error('Bot receipt shared-config pin is invalid');
  }
  if (universe !== null && parseUniversePin(universe) === null) {
    throw new Error('Bot receipt universe pin is invalid');
  }
  const snapshot: BotRuleSnapshot = {
    ...BOT_POLICY_SNAPSHOT,
    shared_config: pin,
    granted_capabilities: normalizedCapabilities(grantedCapabilities),
    data_hash: dataHash,
    universe_pin: universe,
  };
  return {
    snapshot,
    hash: canonicalHash(snapshot),
    policyVersion: BOT_POLICY_SNAPSHOT.policy_version,
  };
}

export function parseUniversePin(value: unknown): BotUniversePin | null {
  if (!isRecord(value)) return null;
  const { kind, revision, status, effective_session: session, symbols_hash: hash } = value;
  if (kind !== 'vn30' && kind !== 'custom') return null;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return null;
  if (status !== 'verified' && status !== 'unavailable') return null;
  if (session !== null && (typeof session !== 'string' || !DATE.test(session))) return null;
  if (hash !== null && (typeof hash !== 'string' || !HASH.test(hash))) return null;
  return { kind, revision, status, effective_session: session, symbols_hash: hash };
}

const invalidReceipt = (): BotReceiptVerification => ({
  valid: false,
  pin: null,
  kind: null,
  policyVersion: null,
  grantedCapabilities: [],
  dataHash: null,
  universe: null,
});

function sortedCapabilities(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  const capabilities = value as string[];
  return JSON.stringify(capabilities) === JSON.stringify(normalizedCapabilities(capabilities))
    ? [...capabilities]
    : null;
}

/**
 * Verify immutable receipts: the current `iqx-bot-v1.0` policy, the retired
 * `iqx-bot-academy-activation-1` policy (read-only history) and the frozen V1 format.
 */
export function verifyRuleReceipt(
  ruleSnapshot: unknown,
  ruleHash: string | null,
): BotReceiptVerification {
  if (!isRecord(ruleSnapshot) || typeof ruleHash !== 'string') return invalidReceipt();

  if (ruleSnapshot.policy_version === BOT_POLICY_SNAPSHOT.policy_version) {
    const {
      shared_config: rawPin,
      granted_capabilities: rawCapabilities,
      data_hash: dataHash,
      universe_pin: rawUniverse,
      ...policy
    } = ruleSnapshot;
    const pin = rawPin === null ? null : parseSharedConfigPin(rawPin);
    const universe = rawUniverse === null ? null : parseUniversePin(rawUniverse);
    const capabilities = sortedCapabilities(rawCapabilities);
    if (
      (rawPin !== null && pin === null) ||
      (rawUniverse !== null && universe === null) ||
      capabilities === null ||
      canonicalHash(policy) !== BOT_POLICY_HASH ||
      canonicalHash(ruleSnapshot) !== ruleHash ||
      typeof dataHash !== 'string' ||
      !HASH.test(dataHash)
    ) {
      return invalidReceipt();
    }
    return {
      valid: true,
      pin,
      kind: 'bot',
      policyVersion: BOT_POLICY_SNAPSHOT.policy_version,
      grantedCapabilities: capabilities,
      dataHash,
      universe,
    };
  }

  if (ruleSnapshot.policy_version === LEGACY_ACADEMY_POLICY_VERSION) {
    const {
      shared_config: rawPin,
      granted_capabilities: rawCapabilities,
      data_hash: dataHash,
      ...policy
    } = ruleSnapshot;
    const pin = rawPin === null ? null : parseSharedConfigPin(rawPin);
    const capabilities = sortedCapabilities(rawCapabilities);
    if (
      (rawPin !== null && pin === null) ||
      capabilities === null ||
      canonicalHash(policy) !== LEGACY_ACADEMY_POLICY_HASH ||
      canonicalHash(ruleSnapshot) !== ruleHash ||
      typeof dataHash !== 'string' ||
      !HASH.test(dataHash)
    ) {
      return invalidReceipt();
    }
    return {
      valid: true,
      pin,
      kind: 'academy',
      policyVersion: LEGACY_ACADEMY_POLICY_VERSION,
      grantedCapabilities: capabilities,
      dataHash,
      universe: null,
    };
  }

  if (!('shared_config' in ruleSnapshot)) {
    return isLegacyBotV1Snapshot(ruleSnapshot) && ruleHash === LEGACY_BOT_V1_RULE_HASH
      ? {
          valid: true,
          pin: null,
          kind: 'legacy-v1',
          policyVersion: null,
          grantedCapabilities: [],
          dataHash: null,
          universe: null,
        }
      : invalidReceipt();
  }
  const { shared_config: rawPin, ...base } = ruleSnapshot;
  const pin = parseSharedConfigPin(rawPin);
  if (!pin || !isLegacyBotV1Snapshot(base) || canonicalHash(ruleSnapshot) !== ruleHash) {
    return invalidReceipt();
  }
  return {
    valid: true,
    pin,
    kind: 'legacy-v1',
    policyVersion: null,
    grantedCapabilities: [],
    dataHash: null,
    universe: null,
  };
}

/** Registry indicators whose master and `side` switches are both ON. */
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

export type PinnedSharedConfigValidation =
  | { valid: true; buyActiveIds: string[]; sellActiveIds: string[] }
  | { valid: false; errors: string[] };

/** Validate authorization, schema/rules and hash/revision before forming active sets. */
export function validatePinnedSharedConfig(
  config: SharedConfig,
  pin: BotSharedConfigPin,
  grantedCapabilities: readonly string[],
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): PinnedSharedConfigValidation {
  const errors = validateConfig(config, registry, grantedCapabilities).map(
    (error) => `${error.path}: ${error.message}`,
  );
  if (config.revision !== pin.revision)
    errors.push('revision: pinned revision does not match config');
  if (configHash(config) !== pin.config_hash) errors.push('config_hash: pinned hash drift');
  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    buyActiveIds: activeSideIndicators(config, 'buy', registry).map((entry) => entry.id),
    sellActiveIds: activeSideIndicators(config, 'sell', registry).map((entry) => entry.id),
  };
}

export function needsMarketContext(
  config: SharedConfig,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): boolean {
  return [
    ...activeSideIndicators(config, 'buy', registry),
    ...activeSideIndicators(config, 'sell', registry),
  ].some((entry) => entry.availability === 'needs_history_context');
}

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

export function sessionSideSignalWithEvidence(
  config: SharedConfig,
  bars: readonly Bar[] | null,
  side: Side,
  session: string,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SideSignalsEvidence {
  if (!bars?.length || bars.at(-1)?.date !== session) {
    return missingSideSignalEvidence(config, side, registry);
  }
  return sideSignalsWithEvidence(config, bars, side, registry).at(-1)!;
}

/** Evidence for an active side when the intended session bar is unavailable. */
export function missingSideSignalEvidence(
  config: SharedConfig,
  side: Side,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SideSignalsEvidence {
  const active = activeSideIndicators(config, side, registry);
  if (!active.length) return { result: false, active_indicator_ids: [], rules: [] };
  return {
    result: null,
    active_indicator_ids: active.map((entry) => entry.id),
    rules: active.flatMap((entry) => {
      const sideConfig = config.indicators[entry.id]![side];
      return sideConfig.rules.map((rule) => ({
        id: rule.id,
        indicator: entry.id,
        side,
        op: rule.op,
        ...evaluateRuleWithEvidence(rule, {}, sideConfig.params, 0),
      }));
    }),
  };
}

export function conditionSnapshot(
  buy: SideSignalsEvidence,
  sell: SideSignalsEvidence,
): BotConditionSnapshot {
  return {
    buy_active_ids: [...buy.active_indicator_ids].sort(),
    sell_active_ids: [...sell.active_indicator_ids].sort(),
    rules: [...buy.rules, ...sell.rules],
  };
}

/**
 * Universe symbols whose Buy conditions are worth evaluating: official close, verified
 * tradable status and a 20-session average traded value. Anything else is skipped with a
 * per-symbol reason at buy time, so no history is fetched for it.
 */
export function sharedConfigBuySymbols(input: BotMarketSnapshotInput): string[] {
  const universe = input.universe;
  if (!universe || universe.status !== 'verified') return [];
  const eligible = universe.symbols
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .filter((symbol) => {
      const row = input.symbols[symbol];
      return (
        row?.close_is_official === true &&
        row.security_status_verified === true &&
        row.tradable_security_status === true &&
        row.trading_value_avg20_vnd !== undefined &&
        row.trading_value_avg20_vnd !== null
      );
    });
  return [...new Set(eligible)].sort();
}

function signalMap(value: unknown): Record<string, boolean | null> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, item]) => item === null || typeof item === 'boolean')) return null;
  return Object.fromEntries(entries) as Record<string, boolean | null>;
}

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

/** Buy-side verdict from the frozen signals; `null` means the symbol may be bought. */
export function sharedConfigBuyBlock(
  signals: BotSharedConfigSignals | null,
  symbol: string,
):
  | 'no_active_buy_conditions'
  | 'config_invalid_or_unauthorized'
  | 'legacy_needs_review'
  | 'academy_buy_not_met'
  | 'academy_condition_missing'
  | null {
  if (!signals) return 'no_active_buy_conditions';
  if (signals.buy_status === 'blocked')
    return signals.buy_block?.reason ?? 'config_invalid_or_unauthorized';
  if (!signals.buy_active) return 'no_active_buy_conditions';
  const signal = signals.buy[symbol];
  if (signal === true) return null;
  return signal === false ? 'academy_buy_not_met' : 'academy_condition_missing';
}

/** Sell-side verdict; stops no longer exist, only the effective Sell conditions can exit. */
export function sharedConfigExitReason(
  signals: BotSharedConfigSignals | null,
  symbol: string,
): BotExitReason | null {
  if (!signals?.sell_active) return null;
  return signals.sell[symbol] === true ? 'academy_sell' : null;
}
