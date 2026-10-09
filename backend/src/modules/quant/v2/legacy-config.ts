import { validateConfig } from './config.js';
import { loadTechnicalRegistry } from './technical-registry.js';
import {
  CURRENT_INDICATOR_IDS,
  LEGACY_RULE_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  type EngineValidationError,
  type IndicatorConfig,
  type RegistryEntry,
  type SharedConfig,
  type Side,
} from './types.js';

/**
 * Historical shared-config revisions (`iqx-rules-2.0`) hold 35 indicators; the current contract
 * (`iqx-rules-3.0`) holds exactly the 16 of the Bot spec. Old revisions stay readable: this
 * module maps them to the 16-indicator shape without ever dropping a rule silently.
 *
 * A removed indicator that was master ON with an enabled side makes that side
 * `legacy_needs_review`. The mapped config still carries the 16 entries' choices, but the
 * review status tells the Bot/Backtest to block that side instead of trading on the remaining
 * rules (Bot spec §7.3: a broken or removed rule is never silently removed from the AND).
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
  /** true when the stored document is not in the current 16-indicator contract. */
  legacy: boolean;
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
  /** The stored config in the current 16-indicator shape (`iqx-rules-3.0`). */
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
 * true when a stored config is not in the current contract: it carries the legacy
 * `rule_version` or any indicator outside the 16. Pure; does not validate the rest.
 */
export function isLegacyConfig(config: unknown): boolean {
  if (!isRecord(config)) return false;
  if (config.rule_version === LEGACY_RULE_VERSION) return true;
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

/**
 * Maps a stored shared config (current or legacy) to the current 16-indicator shape.
 *
 * - The 16 entries keep their stored choices (master, per-side enabled, params, operators).
 * - Removed indicators are not copied; any that was master ON with an enabled side flips that
 *   side to `legacy_needs_review` and is listed in `review`.
 * - Current indicators missing from the stored document default to OFF (listed in
 *   `defaulted_indicators`).
 * - A current-shape config maps to itself with every side `ok`.
 */
export function mapLegacyConfig(
  config: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): LegacyConfigMappingResult {
  if (!isRecord(config)) return { ok: false, errors: [{ path: '', message: 'Thiếu cấu hình.' }] };
  const stored = config.indicators;
  if (!isRecord(stored))
    return { ok: false, errors: [{ path: 'indicators', message: 'Thiếu danh sách chỉ báo.' }] };

  const errors: EngineValidationError[] = [];
  const indicators: Record<string, IndicatorConfig> = {};
  const defaulted: string[] = [];
  for (const entry of registry) {
    const item = stored[entry.id];
    if (item === undefined) {
      defaulted.push(entry.id);
      indicators[entry.id] = {
        master_enabled: false,
        buy: {
          enabled: false,
          params: jsonCopy(entry.buy.params),
          rules: jsonCopy(entry.buy.rules),
        },
        sell: {
          enabled: false,
          params: jsonCopy(entry.sell.params),
          rules: jsonCopy(entry.sell.rules),
        },
      };
      continue;
    }
    if (!isRecord(item) || !isRecord(item.buy) || !isRecord(item.sell)) {
      errors.push({
        path: `indicators.${entry.id}`,
        message: `${entry.id}: cấu hình chỉ báo không hợp lệ.`,
      });
      continue;
    }
    indicators[entry.id] = jsonCopy(item) as IndicatorConfig;
  }
  if (errors.length) return { ok: false, errors };

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

  const revision =
    typeof config.revision === 'number' && Number.isInteger(config.revision) && config.revision >= 1
      ? config.revision
      : 1;
  const mapped: SharedConfig = {
    schema_version: SCHEMA_VERSION,
    revision,
    rule_version: RULE_VERSION,
    indicators,
  };
  return {
    ok: true,
    mapping: {
      config: mapped,
      review: {
        from_rule_version: typeof config.rule_version === 'string' ? config.rule_version : '',
        legacy: isLegacyConfig(config),
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
