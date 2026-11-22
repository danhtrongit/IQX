/**
 * Strategy content (§10.2, D14): normalisation, validation (§3.4, §2.2, §7.2) and canonical hash.
 * `config_hash = sha256(canonicalJson(normalised content))`; a saved list hashes with its symbols.
 */

import { z } from 'zod';

import { validateConfig } from '../quant/v2/config.js';
import { canonicalJson, sha256Hex } from '../quant/v2/hash.js';
import { loadTechnicalRegistry } from '../quant/v2/technical-registry.js';
import {
  RULE_VERSION,
  SCHEMA_VERSION,
  type IndicatorConfig,
  type RegistryEntry,
  type Side,
  type SharedConfig,
} from '../quant/v2/types.js';
import { STRATEGY_RULES } from './constants.js';
import type {
  StrategyContent,
  StrategyContentKind,
  StrategyUniverse,
  StrategyValidationIssue,
  StrategyValidationResult,
} from './contracts.js';

const SYMBOL = /^[A-Z0-9]{2,10}$/;

const universeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('vn30') }).strict(),
  z.object({ type: z.literal('vn100') }).strict(),
  z
    .object({
      type: z.literal('saved_list'),
      list_id: z.string().trim().min(1).max(64),
      list_name: z.string().trim().min(1).max(120),
      symbols: z.array(z.string()).max(1_000),
    })
    .strict(),
]);

/** Shape only; rows/params are checked by the V3 validator (`validateConfig`). */
export const strategyContentSchema = z
  .object({
    universe: universeSchema,
    indicators: z.record(z.string(), z.unknown()),
    max_holding: z.number(),
    sell_only: z.boolean().optional(),
  })
  .strict();

const MAX_HOLDING_MESSAGE = `Giữ tối đa phải từ ${STRATEGY_RULES.max_holding_min} đến ${STRATEGY_RULES.max_holding_max} phiên, số nguyên.`;

export const UNIVERSE_EMPTY_MESSAGE = 'Danh mục này không có mã nào thuộc VN100.';

/** Uppercase, trimmed, unique, sorted symbols (stable hash of a copied list). */
export function normalizeSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].sort();
}

function normalizeUniverse(universe: StrategyUniverse): StrategyUniverse {
  if (universe.type !== 'saved_list') return { type: universe.type };
  return {
    type: 'saved_list',
    list_id: universe.list_id.trim(),
    list_name: universe.list_name.trim(),
    symbols: normalizeSymbols(universe.symbols),
  };
}

/** Canonical form stored and hashed: `sell_only` only when true, symbols normalised. */
export function normalizeStrategyContent(content: StrategyContent): StrategyContent {
  return {
    universe: normalizeUniverse(content.universe),
    indicators: content.indicators,
    max_holding: content.max_holding,
    ...(content.sell_only === true ? { sell_only: true } : {}),
  };
}

export function strategyConfigHash(content: StrategyContent): string {
  return sha256Hex(canonicalJson(normalizeStrategyContent(content)));
}

/** The content as a V3 shared config, for the existing evaluator and validator. */
export function contentAsSharedConfig(content: Pick<StrategyContent, 'indicators'>): SharedConfig {
  return {
    schema_version: SCHEMA_VERSION,
    revision: 1,
    rule_version: RULE_VERSION,
    indicators: content.indicators,
  };
}

/** An indicator side counts when its master and side switches are ON and ≥1 row is enabled. */
export function sideRowEnabled(item: IndicatorConfig | undefined, side: Side): boolean {
  if (!item?.master_enabled) return false;
  const config = item[side];
  if (!config?.enabled) return false;
  return Array.isArray(config.rules) && config.rules.some((rule) => rule.enabled !== false);
}

/** Registry ids whose `side` has at least one enabled row (registry order). */
export function activeIndicatorIds(
  content: Pick<StrategyContent, 'indicators'>,
  side: Side,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): string[] {
  return registry
    .filter((entry) => sideRowEnabled(content.indicators[entry.id], side))
    .map((entry) => entry.id);
}

export type ValidateStrategyOptions = {
  kind?: StrategyContentKind;
  registry?: readonly RegistryEntry[];
  /** When set, a saved list keeps only these symbols (the store's VN100) before validation. */
  eligibleSymbols?: ReadonlySet<string>;
};

/**
 * Validates and normalises a strategy content.
 * - `STRATEGY_INVALID`: shape, V3 rows/params, Giữ tối đa 3–250 integer, ≥1 enabled Buy row (unless
 *   `sell_only`, which only converted strategies may carry), IQX: VN30/VN100 and ≥1 enabled Sell row.
 * - `UNIVERSE_EMPTY`: a saved list with no symbol left (after the eligibility filter).
 */
export function validateStrategyContent(
  input: unknown,
  options: ValidateStrategyOptions = {},
): StrategyValidationResult {
  const kind = options.kind ?? 'user';
  const registry = options.registry ?? loadTechnicalRegistry();
  const parsed = strategyContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'STRATEGY_INVALID',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  const raw = parsed.data;
  const issues: StrategyValidationIssue[] = [];
  const maxHolding = raw.max_holding;
  if (
    !Number.isInteger(maxHolding) ||
    maxHolding < STRATEGY_RULES.max_holding_min ||
    maxHolding > STRATEGY_RULES.max_holding_max
  ) {
    issues.push({ path: 'max_holding', message: MAX_HOLDING_MESSAGE });
  }
  for (const error of validateConfig(
    { ...contentAsSharedConfig({ indicators: raw.indicators as Record<string, IndicatorConfig> }) },
    registry,
  )) {
    issues.push({ path: error.path, message: error.message });
  }
  const content = normalizeStrategyContent({
    universe: raw.universe,
    indicators: raw.indicators as Record<string, IndicatorConfig>,
    max_holding: maxHolding,
    ...(raw.sell_only !== undefined ? { sell_only: raw.sell_only } : {}),
  });
  const sellOnly = content.sell_only === true;
  if (sellOnly && kind !== 'converted') {
    issues.push({ path: 'sell_only', message: 'Chỉ chiến lược chuyển đổi mới được "chỉ bán".' });
  }
  if (issues.length === 0) {
    const buyIds = activeIndicatorIds(content, 'buy', registry);
    const sellIds = activeIndicatorIds(content, 'sell', registry);
    if (sellOnly && buyIds.length > 0) {
      issues.push({ path: 'indicators', message: 'Chiến lược chỉ bán không có dòng Mua.' });
    }
    if (!sellOnly && buyIds.length === 0) {
      issues.push({ path: 'indicators', message: 'Cần ít nhất một dòng Mua đang bật.' });
    }
    if (kind === 'iqx' && sellIds.length === 0) {
      issues.push({ path: 'indicators', message: 'Chiến lược IQX cần ít nhất một dòng Bán đang bật.' });
    }
  }
  if (kind === 'iqx' && content.universe.type === 'saved_list') {
    issues.push({ path: 'universe.type', message: 'Rổ chiến lược IQX chỉ là VN30 hoặc VN100.' });
  }
  if (content.universe.type === 'saved_list') {
    const universe = content.universe;
    if (universe.symbols.some((symbol) => !SYMBOL.test(symbol))) {
      issues.push({ path: 'universe.symbols', message: 'Mã cổ phiếu không hợp lệ.' });
    }
    if (options.eligibleSymbols) {
      const eligible = options.eligibleSymbols;
      universe.symbols = universe.symbols.filter((symbol) => eligible.has(symbol));
    }
    if (universe.symbols.length > STRATEGY_RULES.max_basket_symbols) {
      issues.push({
        path: 'universe.symbols',
        message: `Rổ tối đa ${STRATEGY_RULES.max_basket_symbols} mã.`,
      });
    }
  }
  if (issues.length > 0) return { ok: false, code: 'STRATEGY_INVALID', issues };
  if (content.universe.type === 'saved_list' && content.universe.symbols.length === 0) {
    return {
      ok: false,
      code: 'UNIVERSE_EMPTY',
      issues: [{ path: 'universe.symbols', message: UNIVERSE_EMPTY_MESSAGE }],
    };
  }
  return { ok: true, content, config_hash: strategyConfigHash(content) };
}

/** `SessionStrategy` of a content (Giữ tối đa and which sides can act). */
export function sessionStrategyOf(
  content: StrategyContent,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): { max_holding: number; buy_enabled: boolean; sell_enabled: boolean } {
  return {
    max_holding: content.max_holding,
    buy_enabled: content.sell_only !== true && activeIndicatorIds(content, 'buy', registry).length > 0,
    sell_enabled: activeIndicatorIds(content, 'sell', registry).length > 0,
  };
}

/** Short label of a universe: `VN30`, `VN100` or the saved list name. */
export function universeLabel(universe: StrategyUniverse): string {
  if (universe.type === 'saved_list') return universe.list_name;
  return universe.type === 'vn30' ? 'VN30' : 'VN100';
}
