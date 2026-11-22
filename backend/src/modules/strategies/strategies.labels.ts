import { defaultConfig } from '../quant/v2/index.js';
import type { StrategyContent, StrategyUniverse } from '../strategy-rules/index.js';
import { STRATEGY_RULES } from '../strategy-rules/index.js';

const VN_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** `dd/mm HH:mm` in Vietnam time (the label of a user strategy version, §4.7, §4.10). */
export function vnShortTimestamp(value: Date | string): string {
  const parts = Object.fromEntries(
    VN_PARTS.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.day}/${parts.month} ${hour}:${parts.minute}`;
}

export const userVersionLabel = (createdAt: Date | string) => `bản ${vnShortTimestamp(createdAt)}`;
export const iqxVersionLabel = (version: number) => `v${version}`;

/** `VN30`, `VN100` or the saved list name. */
export function universeLabelOf(universe: StrategyUniverse | undefined): string {
  if (!universe) return 'VN30';
  if (universe.type === 'saved_list') return universe.list_name;
  return universe.type === 'vn30' ? 'VN30' : 'VN100';
}

/** Number of symbols of a copied list; null for index baskets (depends on the session). */
export const universeCountOf = (universe: StrategyUniverse | undefined): number | null =>
  universe?.type === 'saved_list' ? universe.symbols.length : null;

/**
 * Stored IQX `definition` → strategy content. A definition only carries the indicators it uses;
 * the content is the full V3 map (registry defaults, every other indicator off), like a shared
 * config. v1 rows (published before update 22-11) carry no basket: they read as VN30.
 */
export function iqxDefinitionAsContent(
  definition: Record<string, unknown> | undefined,
): StrategyContent {
  const record = definition ?? {};
  const universe = record.universe as StrategyUniverse | undefined;
  const maxHolding = record.max_holding;
  return {
    universe:
      universe && (universe.type === 'vn30' || universe.type === 'vn100')
        ? { type: universe.type }
        : { type: 'vn30' },
    indicators: {
      ...defaultConfig().indicators,
      ...((record.indicators ?? {}) as StrategyContent['indicators']),
    },
    max_holding:
      typeof maxHolding === 'number' && Number.isInteger(maxHolding)
        ? maxHolding
        : STRATEGY_RULES.default_max_holding,
  };
}
