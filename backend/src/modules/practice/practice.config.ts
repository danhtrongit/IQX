import {
  RULE_VERSION,
  SCHEMA_VERSION,
  effectiveField,
  loadTechnicalRegistry,
  validateConfig,
  type RegistryEntry,
  type Rule,
  type RuleOp,
  type Side,
  type SideConfig,
} from '../quant/v2/index.js';
import {
  HOLD_MAX_DEFAULT,
  HOLD_MAX_MAX,
  HOLD_MAX_MIN,
  isPracticeIndicatorId,
} from './practice.constants.js';
import { ruleLabels } from './practice.labels.js';
import type {
  PracticeConfig,
  PracticeForm,
  PracticeSideInput,
  PracticeValidationError,
} from './practice.types.js';

const SIDES: readonly Side[] = ['buy', 'sell'];
const SIDE_LABEL: Record<Side, string> = { buy: 'Mua', sell: 'Bán' };

/**
 * Registry entry of a practice indicator, or null when the id is not one of the 16 supported
 * indicators (or the registry does not carry a plain-OHLCV entry for it).
 */
export function practiceEntry(
  indicatorId: string,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): RegistryEntry | null {
  if (!isPracticeIndicatorId(indicatorId)) return null;
  const entry = registry.find((item) => item.id === indicatorId);
  // Context-dependent indicators (market/sector series) can never run on a single symbol's OHLCV.
  const availability: unknown = entry?.availability;
  return entry && availability !== 'needs_history_context' ? entry : null;
}

// A new practice draft starts with both sides ON (Bot SPEC §7.2); the registry template is
// OFF for the Bot and that state is never copied here.
const defaultSide = (entry: RegistryEntry, side: Side): PracticeSideInput => ({
  enabled: true,
  params: { ...entry[side].params },
  ops: Object.fromEntries(entry[side].rules.map((rule) => [rule.id, rule.op])),
});

/** Registry template of an indicator: both sides ON, template params/operators, hold 60. */
export function defaultPracticeConfig(entry: RegistryEntry): PracticeConfig {
  return {
    buy: defaultSide(entry, 'buy'),
    sell: defaultSide(entry, 'sell'),
    hold_max_sessions: HOLD_MAX_DEFAULT,
  };
}

/** Template rules of one side with the chosen operators applied (operands never change). */
function rulesWithOps(entry: RegistryEntry, side: Side, ops: Record<string, RuleOp>): Rule[] {
  return entry[side].rules.map((rule) => {
    const chosen = ops[rule.id];
    const allowed: readonly string[] = rule.allowed_ops;
    return {
      ...rule,
      op: chosen !== undefined && allowed.includes(chosen) ? chosen : rule.op,
    } as Rule;
  });
}

/** Engine-ready side config. Call only after `validatePracticeConfig` returned no errors. */
export function toSideConfig(
  entry: RegistryEntry,
  side: Side,
  input: PracticeSideInput,
): SideConfig {
  return {
    enabled: input.enabled,
    params: { ...input.params },
    rules: rulesWithOps(entry, side, input.ops),
  };
}

/**
 * Validate a practice config against the registry field domains, cross-field constraints and
 * allowed operators (single-indicator validation). Both sides are always validated, even when a
 * side is switched off, so a locked config is always clean. Returns [] when valid.
 */
export function validatePracticeConfig(
  entry: RegistryEntry,
  config: PracticeConfig,
  options: { requireBuy: boolean },
): PracticeValidationError[] {
  const errors: PracticeValidationError[] = [];

  if (options.requireBuy && !config.buy.enabled) {
    errors.push({ path: 'buy.enabled', message: 'Bật điều kiện Mua để bắt đầu.' });
  }
  if (
    typeof config.hold_max_sessions !== 'number' ||
    !Number.isInteger(config.hold_max_sessions) ||
    config.hold_max_sessions < HOLD_MAX_MIN ||
    config.hold_max_sessions > HOLD_MAX_MAX
  ) {
    errors.push({
      path: 'hold_max_sessions',
      message: `Thời gian giữ: nhập số nguyên từ ${HOLD_MAX_MIN} đến 1.000 phiên.`,
    });
  }

  const sides = {} as Record<Side, SideConfig>;
  for (const side of SIDES) {
    const input = config[side];
    const templateRules = entry[side].rules;
    const knownIds = new Set(templateRules.map((rule) => rule.id));
    for (const id of Object.keys(input.ops)) {
      if (!knownIds.has(id)) {
        errors.push({
          path: `${side}.ops.${id}`,
          message: `${SIDE_LABEL[side]}: điều kiện không tồn tại.`,
        });
      }
    }
    for (const rule of templateRules) {
      const chosen = input.ops[rule.id];
      const allowed: readonly string[] = rule.allowed_ops;
      if (chosen === undefined) {
        errors.push({
          path: `${side}.ops.${rule.id}`,
          message: `${SIDE_LABEL[side]}: thiếu toán tử cho điều kiện ${rule.id}.`,
        });
      } else if (!allowed.includes(chosen)) {
        errors.push({
          path: `${side}.ops.${rule.id}`,
          message: `${SIDE_LABEL[side]}: toán tử không hợp lệ.`,
        });
      }
    }
    sides[side] = {
      enabled: input.enabled,
      params: input.params,
      rules: rulesWithOps(entry, side, input.ops),
    };
  }

  const issues = validateConfig(
    {
      schema_version: SCHEMA_VERSION,
      revision: 1,
      rule_version: RULE_VERSION,
      indicators: {
        [entry.id]: { master_enabled: false, buy: sides.buy, sell: sides.sell },
      },
    },
    [entry],
  );
  const prefix = `indicators.${entry.id}.`;
  for (const issue of issues) {
    // Rule-level problems were reported above through the stable rule ids.
    if (!issue.path.startsWith(prefix) || issue.path.includes('.rules')) continue;
    errors.push({ path: issue.path.slice(prefix.length), message: issue.message });
  }
  return errors;
}

/** Canonical form (registry order of params/ops) used for hashing and for storing a locked config. */
export function normalizePracticeConfig(
  entry: RegistryEntry,
  config: PracticeConfig,
): PracticeConfig {
  const side = (name: Side): PracticeSideInput => {
    const input = config[name];
    return {
      enabled: input.enabled,
      params: Object.fromEntries(
        entry.fields.map((field) => [field.key, input.params[field.key]]),
      ) as Record<string, number>,
      ops: Object.fromEntries(
        entry[name].rules.map((rule) => [rule.id, input.ops[rule.id] ?? rule.op]),
      ) as Record<string, RuleOp>,
    };
  };
  return { buy: side('buy'), sell: side('sell'), hold_max_sessions: config.hold_max_sessions };
}

/**
 * Everything a client needs to render the two-sided form without the Premium strategy registry:
 * effective field domains per side, rule templates (stable ids, allowed operators, operands) and
 * the registry defaults used by the "Mặc định" button (params/operators only, never hold or money).
 */
export function practiceForm(entry: RegistryEntry): PracticeForm {
  const defaults = defaultPracticeConfig(entry);
  const side = (name: Side) => ({
    fields: entry.fields.map((field) => {
      const effective = effectiveField(entry, name, field);
      return {
        key: effective.key,
        label: effective.label,
        type: effective.type,
        min: effective.min,
        max: effective.max,
        step: effective.step,
        unit: effective.unit,
      };
    }),
    rules: entry[name].rules.map((rule) => {
      const labels = ruleLabels(rule, entry, defaults[name].params);
      return {
        rule_id: rule.id,
        kind: rule.kind,
        default_op: rule.op,
        allowed_ops: [...rule.allowed_ops] as RuleOp[],
        left_label: labels.left,
        right_label: labels.right,
        lhs: rule.lhs,
        rhs:
          rule.kind === 'membership' ? { lower: rule.rhs.lower, upper: rule.rhs.upper } : rule.rhs,
      };
    }),
  });
  return {
    indicator_id: entry.id,
    buy: side('buy'),
    sell: side('sell'),
    cross_fields: (entry.validation?.cross_fields ?? []).map((cross) => ({ ...cross })),
    defaults,
  };
}
