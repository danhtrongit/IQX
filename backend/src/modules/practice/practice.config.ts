import {
  RULE_VERSION,
  SCHEMA_VERSION,
  defaultRows,
  effectiveField,
  isRowsEntry,
  loadTechnicalRegistry,
  validateConfig,
  validateSideRows,
  type ConditionRow,
  type ParamsRegistryEntry,
  type ParamsSideConfig,
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
  PracticeParamsConfig,
  PracticeParamsForm,
  PracticeParamsSide,
  PracticeRowsConfig,
  PracticeRowsSide,
  PracticeSideInput,
  PracticeValidationError,
} from './practice.types.js';

const SIDES: readonly Side[] = ['buy', 'sell'];
const SIDE_LABEL: Record<Side, string> = { buy: 'Mua', sell: 'Bán' };

/** SPEC V3 §6.1.5: the pre-V3 per-indicator shape is refused, never mapped. */
export const OUTDATED_FORMAT_MESSAGE =
  'Định dạng điều kiện cũ không còn được hỗ trợ. Tải lại để dùng mẫu điều kiện mới.';

/**
 * Stored error of a run that was locked in the pre-V3 condition format and never finished
 * (`computing` / `failed`): the trigger freezes its config, so it can neither be retried nor
 * converted. A new start for the same case replaces it.
 */
export const OUTDATED_RUN_ERROR = Object.freeze({
  code: 'PRACTICE_CONFIG_OUTDATED',
  message:
    'Lượt này đã khóa theo định dạng điều kiện cũ nên không thể tính tiếp. Bắt đầu lại tình huống này với mẫu điều kiện mới.',
});

/** One error per tab: the config is in the pre-V3 shape. */
export const outdatedFormatErrors = (): PracticeValidationError[] =>
  SIDES.map((side) => ({ path: side, message: OUTDATED_FORMAT_MESSAGE, side }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

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

// ------------------------------------------------------------------ shape of a stored config

/** The side carries condition rows (no side-level params). */
export const isRowsSide = (side: PracticeSideInput): side is PracticeRowsSide =>
  Array.isArray((side as { rules?: unknown }).rules);

export const isRowsConfig = (config: PracticeConfig): config is PracticeRowsConfig =>
  isRowsSide(config.buy) && isRowsSide(config.sell);

/**
 * true when `config` has the shape of the indicator's current model: for a row-based indicator
 * both tabs carry exactly the registry row ids in registry order (no `params`/`ops`), for Volume
 * both tabs carry `params` and `ops`. Values are not checked (`validatePracticeConfig` does).
 * Anything else is the pre-V3 format (SPEC V3 §6.1.5).
 */
export function isCurrentPracticeConfig(
  entry: RegistryEntry,
  config: unknown,
): config is PracticeConfig {
  if (!isRecord(config)) return false;
  for (const side of SIDES) {
    const value = config[side];
    if (!isRecord(value)) return false;
    if (isRowsEntry(entry)) {
      if ('params' in value || 'ops' in value || !Array.isArray(value.rules)) return false;
      const ids = value.rules.map((row: unknown) => (isRecord(row) ? row.id : undefined));
      if (JSON.stringify(ids) !== JSON.stringify(entry.rows.map((row) => row.id))) return false;
    } else if ('rules' in value || !isRecord(value.params) || !isRecord(value.ops)) {
      return false;
    }
  }
  return true;
}

// ------------------------------------------------------------------ defaults

const defaultParamsSide = (entry: ParamsRegistryEntry, side: Side): PracticeParamsSide => ({
  enabled: true,
  params: { ...entry[side].params },
  ops: Object.fromEntries(entry[side].rules.map((rule) => [rule.id, rule.op])),
});

/**
 * Registry defaults of an indicator, both sides ON and hold 60. A new practice draft starts with
 * both sides ON (Bot SPEC §7.2); the registry tab switch is OFF for the Bot and is never copied
 * here. Row-based indicators start with the SPEC V3 §3 rows (values and switches); Volume with
 * the registry template params and operators.
 */
export function defaultPracticeConfig(entry: RegistryEntry): PracticeConfig {
  if (isRowsEntry(entry)) {
    return {
      buy: { enabled: true, rules: defaultRows(entry, 'buy') },
      sell: { enabled: true, rules: defaultRows(entry, 'sell') },
      hold_max_sessions: HOLD_MAX_DEFAULT,
    };
  }
  return {
    buy: defaultParamsSide(entry, 'buy'),
    sell: defaultParamsSide(entry, 'sell'),
    hold_max_sessions: HOLD_MAX_DEFAULT,
  };
}

/**
 * The draft as the product sees it. A stored draft in the pre-V3 shape is treated as the V3
 * defaults of the indicator, keeping only what the format change does not touch: the Mua/Bán
 * switches and the maximum holding time (SPEC V3 §6.1). The stored row is not rewritten here;
 * the next draft save replaces it.
 */
export function currentDraft(entry: RegistryEntry, stored: unknown): PracticeConfig {
  if (isCurrentPracticeConfig(entry, stored)) return stored;
  const defaults = defaultPracticeConfig(entry);
  const source = isRecord(stored) ? stored : {};
  const switchOf = (side: Side): boolean => {
    const value = source[side];
    return isRecord(value) && typeof value.enabled === 'boolean' ? value.enabled : true;
  };
  const hold = source.hold_max_sessions;
  const holdMaxSessions =
    typeof hold === 'number' &&
    Number.isInteger(hold) &&
    hold >= HOLD_MAX_MIN &&
    hold <= HOLD_MAX_MAX
      ? hold
      : defaults.hold_max_sessions;
  return {
    ...defaults,
    buy: { ...defaults.buy, enabled: switchOf('buy') },
    sell: { ...defaults.sell, enabled: switchOf('sell') },
    hold_max_sessions: holdMaxSessions,
  } as PracticeConfig;
}

/**
 * true for a run that never finished (`computing` / `failed`) and was locked in the pre-V3
 * condition format. Its frozen config cannot be read by the current engine; a `succeeded` run
 * is never outdated in this sense (it is shown from its stored result, untouched).
 */
export const isOutdatedUnfinishedRun = (
  entry: RegistryEntry,
  run: { status: string; config: unknown },
): boolean => run.status !== 'succeeded' && !isCurrentPracticeConfig(entry, run.config);

// ------------------------------------------------------------------ preview

/** What a preview request may carry (the schema's output). */
export type PreviewInput = {
  buy_rows?: readonly ConditionRow[];
  sell_rows?: readonly ConditionRow[];
  buy_params?: Record<string, number>;
  sell_params?: Record<string, number>;
};

const WRONG_MODEL_ROWS =
  'Chỉ báo này dùng điều kiện theo dòng, không có tham số chung của một phía.';
const WRONG_MODEL_PARAMS =
  'Chỉ báo này dùng tham số chung của từng phía, không có điều kiện theo dòng.';

/**
 * The saved draft with the sent rows / params applied on top (a tab that is not sent keeps the
 * draft), and the errors that stop the chart. Only what is drawn is checked: the ENABLED rows of
 * a sent tab (a half-edited disabled row never blocks the chart; it still blocks Start). The
 * tab switches are the draft's: a preview never changes them.
 */
export function previewCandidate(
  entry: RegistryEntry,
  draft: PracticeConfig,
  input: PreviewInput,
): { candidate: PracticeConfig; errors: PracticeValidationError[] } {
  const errors: PracticeValidationError[] = [];
  const sent = (side: Side): { rows?: readonly ConditionRow[]; params?: Record<string, number> } =>
    side === 'buy'
      ? { rows: input.buy_rows, params: input.buy_params }
      : { rows: input.sell_rows, params: input.sell_params };

  if (isRowsEntry(entry)) {
    const base = draft as PracticeRowsConfig;
    const sideOf = (side: Side): PracticeRowsSide => {
      const { rows, params } = sent(side);
      if (params !== undefined) {
        errors.push({ path: `${side}_params`, message: WRONG_MODEL_ROWS, side });
      }
      return rows === undefined
        ? base[side]
        : { enabled: base[side].enabled, rules: rows.map((row) => ({ ...row })) };
    };
    const candidate: PracticeRowsConfig = {
      buy: sideOf('buy'),
      sell: sideOf('sell'),
      hold_max_sessions: base.hold_max_sessions,
    };
    for (const side of SIDES) {
      if (sent(side).rows === undefined) continue;
      for (const error of validateSideRows(entry, side, candidate[side], side)) {
        const row = error.row === undefined ? undefined : candidate[side].rules[error.row - 1];
        if (row?.enabled !== false) errors.push(error);
      }
    }
    return { candidate, errors };
  }

  const base = draft as PracticeParamsConfig;
  for (const side of SIDES) {
    if (sent(side).rows !== undefined) {
      errors.push({ path: `${side}_rows`, message: WRONG_MODEL_PARAMS, side });
    }
  }
  const candidate: PracticeParamsConfig = {
    buy: { ...base.buy, params: input.buy_params ?? base.buy.params },
    sell: { ...base.sell, params: input.sell_params ?? base.sell.params },
    hold_max_sessions: base.hold_max_sessions,
  };
  errors.push(
    ...validatePracticeConfig(entry, candidate, { requireBuy: false }).filter((error) =>
      error.path.includes('.params'),
    ),
  );
  return { candidate, errors };
}

// ------------------------------------------------------------------ engine input

/** Template rules of one Volume side with the chosen operators applied (operands never change). */
function rulesWithOps(
  entry: ParamsRegistryEntry,
  side: Side,
  ops: Record<string, RuleOp>,
  rulesEnabled?: Record<string, boolean>,
): Rule[] {
  return entry[side].rules.map((rule) => {
    const chosen = ops[rule.id];
    const allowed: readonly string[] = rule.allowed_ops;
    const enabled = rulesEnabled?.[rule.id] !== undefined ? rulesEnabled[rule.id] : rule.enabled;
    return {
      ...rule,
      ...(enabled !== undefined ? { enabled } : {}),
      op: chosen !== undefined && allowed.includes(chosen) ? chosen : rule.op,
    } as Rule;
  });
}

/**
 * Engine-ready side config: rows are passed as they are (each row evaluates with its own
 * values), Volume gets its template rules with the chosen operators. Call only after
 * `validatePracticeConfig` returned no errors.
 */
export function toSideConfig(
  entry: RegistryEntry,
  side: Side,
  input: PracticeSideInput,
): SideConfig {
  if (isRowsEntry(entry)) {
    if (!isRowsSide(input)) throw new Error(`practice side ${side} is not in the rows format`);
    return { enabled: input.enabled, rules: input.rules.map((row) => ({ ...row })) };
  }
  if (isRowsSide(input)) throw new Error(`practice side ${side} is not in the params format`);
  const paramsSide: ParamsSideConfig = {
    enabled: input.enabled,
    params: { ...input.params },
    rules: rulesWithOps(entry, side, input.ops, input.rules_enabled),
  };
  return paramsSide;
}

// ------------------------------------------------------------------ validation

/** One Volume config validated against the registry domains, operators and stable rule ids. */
function validateParamsConfig(
  entry: ParamsRegistryEntry,
  config: PracticeParamsConfig,
): PracticeValidationError[] {
  const errors: PracticeValidationError[] = [];
  const sides = {} as Record<Side, ParamsSideConfig>;
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
    if (input.rules_enabled !== undefined) {
      for (const [id, enabledVal] of Object.entries(input.rules_enabled)) {
        if (!knownIds.has(id)) {
          errors.push({
            path: `${side}.rules_enabled.${id}`,
            message: `${SIDE_LABEL[side]}: điều kiện không tồn tại.`,
          });
        } else if (typeof enabledVal !== 'boolean') {
          errors.push({
            path: `${side}.rules_enabled.${id}`,
            message: `${SIDE_LABEL[side]}: trạng thái điều kiện không hợp lệ.`,
          });
        }
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
      rules: rulesWithOps(entry, side, input.ops, input.rules_enabled),
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

/**
 * Validate a practice config against the registry (single-indicator validation). Row-based
 * indicators use the shared row validator (SPEC V3 §4: Vietnamese per-row messages, both tabs,
 * disabled rows included); Volume keeps its field domains, cross-field constraints and allowed
 * operators. A config in the other model's shape is refused as the pre-V3 format. Both sides
 * are always validated, even when a side is switched off, so a locked config is always clean.
 * Returns [] when valid.
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

  if (!isCurrentPracticeConfig(entry, config)) {
    errors.push(...outdatedFormatErrors());
    return errors;
  }
  if (isRowsEntry(entry)) {
    // Shape-checked above: both sides carry rows.
    for (const side of SIDES) {
      errors.push(...validateSideRows(entry, side, config[side], side));
    }
    return errors;
  }
  errors.push(...validateParamsConfig(entry, config as PracticeParamsConfig));
  return errors;
}

// ------------------------------------------------------------------ canonical form

/** Canonical form (registry order of rows/fields/params/ops) used for hashing and for storing a locked config. */
export function normalizePracticeConfig(
  entry: RegistryEntry,
  config: PracticeConfig,
): PracticeConfig {
  if (isRowsEntry(entry)) {
    const rowsConfig = config as PracticeRowsConfig;
    const side = (name: Side): PracticeRowsSide => {
      const input = rowsConfig[name];
      return {
        enabled: input.enabled,
        rules: entry.rows.map((definition) => {
          const row = input.rules.find((item) => item.id === definition.id);
          const normalized: ConditionRow = {
            id: definition.id,
            enabled: row?.enabled === true,
          };
          for (const field of definition.fields) {
            const value = row?.[field.key];
            if (value !== undefined) normalized[field.key] = value;
          }
          return normalized;
        }),
      };
    };
    return {
      buy: side('buy'),
      sell: side('sell'),
      hold_max_sessions: config.hold_max_sessions,
    };
  }
  const paramsConfig = config as PracticeParamsConfig;
  const side = (name: Side): PracticeParamsSide => {
    const input = paramsConfig[name];
    const hasCustomRulesEnabled =
      input.rules_enabled !== undefined &&
      entry[name].rules.some(
        (rule) =>
          input.rules_enabled?.[rule.id] !== undefined &&
          input.rules_enabled[rule.id] !== (rule.enabled ?? true),
      );
    return {
      enabled: input.enabled,
      params: Object.fromEntries(
        entry.fields.map((field) => [field.key, input.params[field.key]]),
      ) as Record<string, number>,
      ops: Object.fromEntries(
        entry[name].rules.map((rule) => [rule.id, input.ops[rule.id] ?? rule.op]),
      ) as Record<string, RuleOp>,
      ...(hasCustomRulesEnabled
        ? {
            rules_enabled: Object.fromEntries(
              entry[name].rules.map((rule) => [
                rule.id,
                input.rules_enabled?.[rule.id] ?? rule.enabled ?? true,
              ]),
            ),
          }
        : {}),
    };
  };
  return { buy: side('buy'), sell: side('sell'), hold_max_sessions: config.hold_max_sessions };
}

// ------------------------------------------------------------------ form descriptor

/**
 * Everything a client needs to render the two-sided form without the Premium strategy registry.
 * Row-based indicators embed the registry rows (sentence, fields with ranges/options,
 * constraints, defaults) and the V3 defaults used by the "Mặc định" button; Volume gets its
 * effective field domains and rule templates. Defaults never include hold or money.
 */
export function practiceForm(entry: RegistryEntry): PracticeForm {
  if (isRowsEntry(entry)) {
    return {
      model: 'rows',
      indicator_id: entry.id,
      rows: structuredClone(entry.rows),
      defaults: defaultPracticeConfig(entry) as PracticeRowsConfig,
    };
  }
  const defaults = defaultPracticeConfig(entry) as PracticeParamsConfig;
  const side = (name: Side): PracticeParamsForm['buy'] => ({
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
        ...(effective.options ? { options: [...effective.options] } : {}),
      };
    }),
    rules: entry[name].rules.map((rule) => {
      const labels = ruleLabels(rule, entry, defaults[name].params);
      return {
        rule_id: rule.id,
        kind: rule.kind,
        ...(rule.enabled !== undefined ? { default_enabled: rule.enabled } : {}),
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
    model: 'legacy_params',
    indicator_id: entry.id,
    buy: side('buy'),
    sell: side('sell'),
    cross_fields: (entry.validation?.cross_fields ?? []).map((cross) => ({ ...cross })),
    defaults,
  };
}
