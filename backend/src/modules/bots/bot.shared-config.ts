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
import { LEGACY_BOT_V1_RULE_HASH, isLegacyBotV1Snapshot } from './bot.legacy.js';
import type {
  BotConditionSnapshot,
  BotMarketSnapshotInput,
  BotSharedConfigSignals,
} from './bot.types.js';

export const BOT_SHARED_CONFIG_WARMUP_SESSIONS = 400;
export const BOT_SHARED_CONFIG_MARKET_SYMBOL = 'VNINDEX';

export type BotSharedConfigPin = {
  revision: number;
  config_hash: string;
  effective_session: string;
};

export type BotAcademyRuleSnapshot = BotPolicySnapshot & {
  shared_config: BotSharedConfigPin | null;
  granted_capabilities: string[];
  data_hash: string;
};

export type BotRuleReceipt = {
  snapshot: BotAcademyRuleSnapshot;
  hash: string;
  policyVersion: typeof BOT_POLICY_SNAPSHOT.policy_version;
};

export type BotReceiptVerification = {
  valid: boolean;
  pin: BotSharedConfigPin | null;
  kind: 'academy' | 'legacy-v1' | null;
  policyVersion: typeof BOT_POLICY_SNAPSHOT.policy_version | null;
  grantedCapabilities: string[];
  dataHash: string | null;
};

export type BotExitReason = 'stop_loss' | 'academy_sell';

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
): BotRuleReceipt {
  if (!HASH.test(dataHash)) throw new Error('Bot receipt data hash must be a SHA-256 hex value');
  if (pin !== null && parseSharedConfigPin(pin) === null) {
    throw new Error('Bot receipt shared-config pin is invalid');
  }
  const snapshot: BotAcademyRuleSnapshot = {
    ...BOT_POLICY_SNAPSHOT,
    shared_config: pin,
    granted_capabilities: normalizedCapabilities(grantedCapabilities),
    data_hash: dataHash,
  };
  return {
    snapshot,
    hash: canonicalHash(snapshot),
    policyVersion: BOT_POLICY_SNAPSHOT.policy_version,
  };
}

const invalidReceipt = (): BotReceiptVerification => ({
  valid: false,
  pin: null,
  kind: null,
  policyVersion: null,
  grantedCapabilities: [],
  dataHash: null,
});

/** Verify immutable Academy receipts and the frozen V1 historical format. */
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
      ...policy
    } = ruleSnapshot;
    const pin = rawPin === null ? null : parseSharedConfigPin(rawPin);
    if (rawPin !== null && pin === null) return invalidReceipt();
    if (
      !Array.isArray(rawCapabilities) ||
      !rawCapabilities.every((item) => typeof item === 'string')
    ) {
      return invalidReceipt();
    }
    const capabilities = rawCapabilities as string[];
    if (
      canonicalHash(policy) !== BOT_POLICY_HASH ||
      canonicalHash(ruleSnapshot) !== ruleHash ||
      typeof dataHash !== 'string' ||
      !HASH.test(dataHash) ||
      JSON.stringify(capabilities) !== JSON.stringify(normalizedCapabilities(capabilities))
    ) {
      return invalidReceipt();
    }
    return {
      valid: true,
      pin,
      kind: 'academy',
      policyVersion: BOT_POLICY_SNAPSHOT.policy_version,
      grantedCapabilities: [...capabilities],
      dataHash,
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

export function sharedConfigBuyBlock(
  signals: BotSharedConfigSignals | null,
  symbol: string,
): 'no_active_buy_conditions' | 'academy_buy_not_met' | 'academy_condition_missing' | null {
  if (!signals?.buy_active) return 'no_active_buy_conditions';
  const signal = signals.buy[symbol];
  if (signal === true) return null;
  return signal === false ? 'academy_buy_not_met' : 'academy_condition_missing';
}

export function sharedConfigExitReason(
  stopSignal: 'stop_loss' | null,
  signals: BotSharedConfigSignals | null,
  symbol: string,
): BotExitReason | null {
  if (stopSignal) return stopSignal;
  if (!signals?.sell_active) return null;
  return signals.sell[symbol] === true ? 'academy_sell' : null;
}
