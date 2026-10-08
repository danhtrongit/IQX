import {
  loadTechnicalRegistry,
  validateConfig,
  type RegistryEntry,
  type SharedConfig,
  type Side,
} from '../quant/v2/index.js';
import type { BotSideBlock, BotSideStatus } from './bot.types.js';

/**
 * Per-side gate of the effective shared Buy/Sell config (Bot SPEC section 7.3).
 *
 * `E_buy` / `E_sell` are the indicators that are master ON with the side ON. When any of
 * them is invalid, unauthorized, no longer supported, or flagged `legacy_needs_review`, the
 * WHOLE side is blocked with an explicit reason. A participant is never dropped from the set
 * so that the remaining conditions are ANDed (that would trade on a different strategy).
 */
export type SideGate = {
  status: BotSideStatus;
  /** Valid participating indicator ids (registry order); empty when inactive or blocked. */
  indicator_ids: string[];
  block: BotSideBlock | null;
};

export type ConfigGate = Record<Side, SideGate>;

/** Indicator ids per side that a legacy mapping reports as `legacy_needs_review`. */
export type LegacyReviewFlags = Record<Side, string[]>;

const SIDES: readonly Side[] = ['buy', 'sell'];
const LEGACY_STATUS = 'legacy_needs_review';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sideIds(config: SharedConfig, side: Side): string[] {
  return Object.entries(config.indicators)
    .filter(([, item]) => Boolean(item?.master_enabled && item[side]?.enabled))
    .map(([id]) => id);
}

function flagIds(value: unknown, fallback: string[]): string[] {
  if (value === true) return fallback;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

/**
 * Integration point with the strategy-config legacy mapping. It is read defensively from
 * whatever the shared-config reader returns, so a missing field simply means "no legacy
 * review". Recognised shapes, on the effective revision or on the `current()` state:
 *   - `legacy`: the LegacyConfigReview of a historical revision; a side whose status is
 *     `legacy_needs_review` is blocked with the removed indicators as the reason;
 *   - `legacy_needs_review` / `legacy_review`: `true`, `string[]` (applies to both sides) or
 *     `{ buy?: true | string[]; sell?: true | string[] }`;
 *   - `config.indicators[id].legacy_status === 'legacy_needs_review'`, applied to every side
 *     where that indicator participates.
 * Adjust only this function if the mapping exposes the flag under a different shape.
 */
export function readLegacyReview(config: SharedConfig, ...sources: unknown[]): LegacyReviewFlags {
  const flags: LegacyReviewFlags = { buy: [], sell: [] };
  const add = (side: Side, ids: string[]) => {
    for (const id of ids) if (!flags[side].includes(id)) flags[side].push(id);
  };
  for (const source of sources) {
    if (!isRecord(source)) continue;
    // strategy-config reader: `legacy` is the LegacyConfigReview of a historical revision.
    const review = source.legacy;
    if (isRecord(review)) {
      for (const side of SIDES) {
        const sideReview = review[side];
        if (!isRecord(sideReview) || sideReview.status !== LEGACY_STATUS) continue;
        const ids = flagIds(sideReview.indicators, []);
        add(side, ids.length ? ids : ['legacy_config']);
      }
    }
    const raw = source.legacy_needs_review ?? source.legacy_review;
    if (raw === undefined || raw === null || raw === false) continue;
    if (isRecord(raw)) {
      for (const side of SIDES) add(side, flagIds(raw[side], sideIds(config, side)));
    } else {
      for (const side of SIDES) add(side, flagIds(raw, sideIds(config, side)));
    }
  }
  for (const [id, item] of Object.entries(config.indicators)) {
    const marker = (item as unknown as Record<string, unknown> | undefined)?.legacy_status;
    if (marker !== LEGACY_STATUS) continue;
    for (const side of SIDES) if (sideIds(config, side).includes(id)) add(side, [id]);
  }
  return flags;
}

type PendingBlock = { reason: BotSideBlock['reason']; id: string | null; detail: string };

function toBlock(blocks: readonly PendingBlock[]): BotSideBlock {
  const reason = blocks.every((block) => block.reason === LEGACY_STATUS)
    ? LEGACY_STATUS
    : 'config_invalid_or_unauthorized';
  const details = [...new Set(blocks.map((block) => block.detail))];
  return {
    reason,
    detail: details.slice(0, 3).join(' ') + (details.length > 3 ? ` (+${details.length - 3})` : ''),
    indicator_ids: [
      ...new Set(blocks.flatMap((block) => (block.id === null ? [] : [block.id]))),
    ].sort(),
  };
}

export function gateConfigSides(
  config: SharedConfig,
  grants: ReadonlySet<string> | readonly string[],
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
  legacy: LegacyReviewFlags = { buy: [], sell: [] },
): ConfigGate {
  const known = new Set(registry.map((entry) => entry.id));
  const participants: Record<Side, string[]> = {
    buy: sideIds(config, 'buy'),
    sell: sideIds(config, 'sell'),
  };
  const blocks: Record<Side, PendingBlock[]> = { buy: [], sell: [] };
  const participates = (id: string, side: Side) => participants[side].includes(id);

  for (const side of SIDES) {
    for (const id of participants[side]) {
      if (!known.has(id)) {
        blocks[side].push({
          reason: LEGACY_STATUS,
          id,
          detail: `Chỉ báo ${id} không còn được hỗ trợ; cần điều chỉnh cấu hình.`,
        });
      }
    }
    for (const id of legacy[side]) {
      blocks[side].push({
        reason: LEGACY_STATUS,
        id,
        detail: `Cấu hình cũ của chỉ báo ${id} cần được xem lại trước khi chạy.`,
      });
    }
  }

  for (const error of validateConfig(config, registry, grants)) {
    const side = /^indicators\.([^.]+)\.(buy|sell)(?:\.|$)/.exec(error.path);
    if (side) {
      const [, id, which] = side as unknown as [string, string, Side];
      if (participates(id, which)) {
        blocks[which].push({ reason: 'config_invalid_or_unauthorized', id, detail: error.message });
      }
      continue;
    }
    const indicator = /^indicators\.([^.]+)(?:\.|$)/.exec(error.path);
    if (indicator) {
      const id = indicator[1]!;
      // Unsupported ids were already reported as legacy; structural issues of an indicator
      // that no side uses cannot change a decision.
      if (!known.has(id)) continue;
      for (const which of SIDES) {
        if (participates(id, which)) {
          blocks[which].push({
            reason: 'config_invalid_or_unauthorized',
            id,
            detail: error.message,
          });
        }
      }
      continue;
    }
    for (const which of SIDES) {
      blocks[which].push({
        reason: 'config_invalid_or_unauthorized',
        id: null,
        detail: error.message,
      });
    }
  }

  const gate = (side: Side): SideGate => {
    if (blocks[side].length) {
      return { status: 'blocked', indicator_ids: [], block: toBlock(blocks[side]) };
    }
    const ids = registry.map((entry) => entry.id).filter((id) => participates(id, side));
    return ids.length
      ? { status: 'active', indicator_ids: ids, block: null }
      : { status: 'inactive', indicator_ids: [], block: null };
  };
  return { buy: gate('buy'), sell: gate('sell') };
}

/** Gate used when no usable config can be read at all: both sides are blocked. */
export function blockedGate(detail: string): ConfigGate {
  const block: BotSideBlock = {
    reason: 'config_invalid_or_unauthorized',
    detail,
    indicator_ids: [],
  };
  return {
    buy: { status: 'blocked', indicator_ids: [], block },
    sell: { status: 'blocked', indicator_ids: [], block: { ...block } },
  };
}
