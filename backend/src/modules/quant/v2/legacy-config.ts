import { validateConfig } from './config.js';
import { defaultConfigV4 } from './conditions/defaults.js';
import { isCurrentFormat } from './conditions/format.js';
import { loadTechnicalRegistry } from './technical-registry.js';
import {
  CURRENT_INDICATOR_IDS,
  RULE_VERSION,
  SCHEMA_VERSION,
  type EngineValidationError,
  type RegistryEntry,
  type SharedConfig,
  type Side,
} from './types.js';

/**
 * Stored shared configs that are not in the current format (`iqx-rules-4.0`, schema 3.0) are
 * outdated: `iqx-rules-3.0` (SPEC V2, side-level params) and `iqx-rules-2.0` (35 indicators).
 * SPEC V3 §6.1 forbids mapping their conditions: an outdated document is reset to the SPEC V3
 * defaults, keeping only the user's switches (indicator master, Mua and Bán tabs) of the current
 * indicators. Volume (unchanged by V3) is copied verbatim when it is still valid.
 *
 * A removed indicator that was master ON with an enabled side makes that side
 * `legacy_needs_review` (Bot spec §7.3: a removed rule is never silently removed from the AND).
 */

export type LegacySideStatus = 'ok' | 'legacy_needs_review';

export type LegacySideReview = {
  status: LegacySideStatus;
  /** Removed indicators that were master ON with this side ON (the reason for the review). */
  indicators: string[];
};

export type LegacyConfigReview = {
  /** `rule_version` of the stored document. */
  from_rule_version: string;
  /** true when the stored document is not in the current format (outdated). */
  legacy: boolean;
  /** true when the conditions were reset to the SPEC V3 defaults (outdated document). */
  reset: boolean;
  /** Every indicator id in the stored document that is not one of the current 16. */
  removed_indicators: string[];
  /** Current indicators absent from the stored document (defaulted to OFF). */
  defaulted_indicators: string[];
  buy: LegacySideReview;
  sell: LegacySideReview;
  /** Either side is `legacy_needs_review`. */
  needs_review: boolean;
};

export type LegacyConfigMapping = {
  /** The stored config itself when current, else the switch-preserving reset (`iqx-rules-4.0`). */
  config: SharedConfig;
  review: LegacyConfigReview;
  /** `validateConfig(config)` without grants; non-empty when the stored 16 entries are invalid. */
  validation_errors: EngineValidationError[];
};

export type LegacyConfigMappingResult =
  { ok: true; mapping: LegacyConfigMapping } | { ok: false; errors: EngineValidationError[] };

const SIDES: readonly Side[] = ['buy', 'sell'];
const CURRENT_IDS: ReadonlySet<string> = new Set(CURRENT_INDICATOR_IDS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Ids in `indicators` that are not part of the current 16 (removed or unknown). */
export function removedIndicatorIds(indicators: Record<string, unknown>): string[] {
  return Object.keys(indicators)
    .filter((id) => !CURRENT_IDS.has(id))
    .sort();
}

/**
 * true when a stored config is outdated (not in the current format, see `isCurrentFormat`) or
 * carries any indicator outside the 16. Pure; does not validate the values.
 */
export function isLegacyConfig(
  config: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): boolean {
  if (!isRecord(config)) return false;
  if (!isCurrentFormat(config, registry)) return true;
  return isRecord(config.indicators) && removedIndicatorIds(config.indicators).length > 0;
}

/** A removed indicator blocks a side unless it is provably OFF (master OFF or that side OFF). */
function blocksSide(item: unknown, side: Side): boolean {
  if (!isRecord(item)) return true;
  if (item.master_enabled === false) return false;
  const sideConfig = item[side];
  if (isRecord(sideConfig) && sideConfig.enabled === false) return false;
  return true;
}

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const storedSwitch = (value: unknown): boolean => value === true;

/**
 * SPEC V3 §6.1 reset: the default config with the stored switches of every current indicator
 * (`master_enabled`, `buy.enabled`, `sell.enabled`; anything not `true` is OFF). A master ON
 * with both tabs OFF becomes master OFF (the validator's rule). Volume is copied verbatim when
 * it is valid against the current registry. Row values are never taken from the document.
 */
export function resetToCurrentFormat(
  config: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SharedConfig {
  const reset = defaultConfigV4(registry);
  const stored = isRecord(config) && isRecord(config.indicators) ? config.indicators : {};
  if (
    isRecord(config) &&
    typeof config.revision === 'number' &&
    Number.isInteger(config.revision) &&
    config.revision >= 1
  ) {
    reset.revision = config.revision;
  }
  for (const entry of registry) {
    const item = stored[entry.id];
    const target = reset.indicators[entry.id];
    if (!isRecord(item) || !target) continue;
    if (entry.model === 'legacy_params') {
      const candidate = { ...reset, indicators: { ...reset.indicators, [entry.id]: item } };
      const errors = validateConfig(candidate, registry).filter((e) =>
        e.path.startsWith(`indicators.${entry.id}`),
      );
      if (!errors.length) {
        reset.indicators[entry.id] = jsonCopy(item) as typeof target;
        continue;
      }
    }
    target.buy.enabled = isRecord(item.buy) && storedSwitch(item.buy.enabled);
    target.sell.enabled = isRecord(item.sell) && storedSwitch(item.sell.enabled);
    target.master_enabled =
      storedSwitch(item.master_enabled) && (target.buy.enabled || target.sell.enabled);
  }
  return reset;
}

/**
 * Reads a stored shared config (current or outdated) in the current format.
 *
 * - A current-format document maps to itself (its values are reported by `validation_errors`,
 *   never repaired).
 * - An outdated document is reset to the SPEC V3 defaults keeping the switches
 *   (`resetToCurrentFormat`); its conditions are never mapped.
 * - Removed indicators are not copied; any that was master ON with an enabled side flips that
 *   side to `legacy_needs_review` and is listed in `review`.
 * - Current indicators missing from the stored document default to OFF (`defaulted_indicators`).
 */
export function mapLegacyConfig(
  config: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): LegacyConfigMappingResult {
  if (!isRecord(config)) return { ok: false, errors: [{ path: '', message: 'Thiếu cấu hình.' }] };
  const stored = config.indicators;
  if (!isRecord(stored))
    return { ok: false, errors: [{ path: 'indicators', message: 'Thiếu danh sách chỉ báo.' }] };

  const defaulted = registry.filter((entry) => stored[entry.id] === undefined).map((e) => e.id);
  const current = isCurrentFormat(config, registry);
  let mapped: SharedConfig;
  if (current) {
    const errors: EngineValidationError[] = [];
    const indicators: SharedConfig['indicators'] = {};
    const defaults = defaultConfigV4(registry);
    for (const entry of registry) {
      const item = stored[entry.id];
      if (item === undefined) {
        indicators[entry.id] = defaults.indicators[entry.id]!;
        continue;
      }
      if (!isRecord(item) || !isRecord(item.buy) || !isRecord(item.sell)) {
        errors.push({
          path: `indicators.${entry.id}`,
          message: `${entry.id}: cấu hình chỉ báo không hợp lệ.`,
        });
        continue;
      }
      indicators[entry.id] = jsonCopy(item) as SharedConfig['indicators'][string];
    }
    if (errors.length) return { ok: false, errors };
    mapped = {
      schema_version: SCHEMA_VERSION,
      revision:
        typeof config.revision === 'number' &&
        Number.isInteger(config.revision) &&
        config.revision >= 1
          ? config.revision
          : 1,
      rule_version: RULE_VERSION,
      indicators,
    };
  } else {
    mapped = resetToCurrentFormat(config, registry);
  }

  const removed = removedIndicatorIds(stored);
  const review = (side: Side): LegacySideReview => {
    const blocking = removed.filter((id) => blocksSide(stored[id], side));
    return {
      status: blocking.length ? 'legacy_needs_review' : 'ok',
      indicators: blocking,
    };
  };
  const buy = review(SIDES[0]!);
  const sell = review(SIDES[1]!);

  return {
    ok: true,
    mapping: {
      config: mapped,
      review: {
        from_rule_version: typeof config.rule_version === 'string' ? config.rule_version : '',
        legacy: isLegacyConfig(config, registry),
        reset: !current,
        removed_indicators: removed,
        defaulted_indicators: defaulted,
        buy,
        sell,
        needs_review: buy.status === 'legacy_needs_review' || sell.status === 'legacy_needs_review',
      },
      validation_errors: validateConfig(mapped, registry),
    },
  };
}
