import { canonicalJson } from './hash.js';
import { isFiniteNumber } from './indicators.js';
import { loadTechnicalRegistry } from './technical-registry.js';
import {
  RULE_VERSION,
  SCHEMA_VERSION,
  type EngineValidationError,
  type IndicatorConfig,
  type RegistryEntry,
  type RegistryField,
  type Side,
  type SharedConfig,
} from './types.js';

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const SIDES: readonly Side[] = ['buy', 'sell'];
const SIDE_LABEL: Record<Side, string> = { buy: 'Mua', sell: 'Bán' };
const CONFIG_KEYS = new Set([
  'schema_version',
  'revision',
  'rule_version',
  'indicators',
  'saved_at',
]);
const INDICATOR_KEYS = new Set(['master_enabled', 'buy', 'sell']);
const SIDE_KEYS = new Set(['enabled', 'params', 'rules']);
/** Step tolerance of the reference engine (`|(v-min)/step - round| ≤ 1e-6`). */
const STEP_TOLERANCE = 1e-6;

/** Capability id that unlocks enabling an indicator (CONTRACTS §2). */
export const indicatorCapability = (indicatorId: string): string => `indicator:${indicatorId}`;

/** Every registry indicator, master OFF, sides/params/rules copied from the registry templates. */
export function defaultConfig(
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SharedConfig {
  const indicators: Record<string, IndicatorConfig> = {};
  for (const entry of registry) {
    indicators[entry.id] = {
      master_enabled: false,
      buy: {
        enabled: entry.buy.enabled,
        params: jsonCopy(entry.buy.params),
        rules: jsonCopy(entry.buy.rules),
      },
      sell: {
        enabled: entry.sell.enabled,
        params: jsonCopy(entry.sell.params),
        rules: jsonCopy(entry.sell.rules),
      },
    };
  }
  return { schema_version: SCHEMA_VERSION, revision: 1, rule_version: RULE_VERSION, indicators };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Registry field with the side-specific `field_overrides` applied. */
export function effectiveField(
  entry: RegistryEntry,
  side: Side,
  field: RegistryField,
): RegistryField {
  return { ...field, ...(entry[side].field_overrides?.[field.key] ?? {}) };
}

const isGrantList = (
  grants: ReadonlySet<string> | readonly string[],
): grants is readonly string[] => Array.isArray(grants);

function hasGrant(grants: ReadonlySet<string> | readonly string[], capability: string): boolean {
  return isGrantList(grants) ? grants.includes(capability) : grants.has(capability);
}

function validateParams(
  entry: RegistryEntry,
  side: Side,
  params: unknown,
  path: string,
  errors: EngineValidationError[],
): void {
  if (!isRecord(params)) {
    errors.push({ path, message: `${entry.id} ${SIDE_LABEL[side]}: thiếu tham số.` });
    return;
  }
  for (const key of Object.keys(params)) {
    if (!entry.fields.some((f) => f.key === key)) {
      errors.push({ path: `${path}.${key}`, message: `${entry.id}: tham số không hợp lệ ${key}.` });
    }
  }
  for (const raw of entry.fields) {
    const field = effectiveField(entry, side, raw);
    const value = params[field.key];
    const fieldPath = `${path}.${field.key}`;
    const prefix = `${entry.id} ${SIDE_LABEL[side]}: ${field.label}`;
    if (!isFiniteNumber(value)) {
      errors.push({ path: fieldPath, message: `${prefix} phải là số hữu hạn.` });
      continue;
    }
    if (field.type === 'integer' && !Number.isInteger(value)) {
      errors.push({ path: fieldPath, message: `${prefix} phải là số nguyên.` });
    }
    if (value < field.min || value > field.max) {
      errors.push({
        path: fieldPath,
        message: `${prefix} phải trong khoảng ${field.min}–${field.max}.`,
      });
      continue;
    }
    const steps = (value - field.min) / field.step;
    if (Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE) {
      errors.push({ path: fieldPath, message: `${prefix} phải theo bước ${field.step}.` });
    }
  }
  for (const cross of entry.validation?.cross_fields ?? []) {
    const left = params[cross.left];
    const right = params[cross.right];
    if (!isFiniteNumber(left) || !isFiniteNumber(right)) continue;
    const ok = cross.op === '<' ? left < right : left > right;
    if (ok) continue;
    const leftLabel = entry.fields.find((f) => f.key === cross.left)?.label ?? cross.left;
    const rightLabel = entry.fields.find((f) => f.key === cross.right)?.label ?? cross.right;
    const relation = cross.op === '<' ? 'nhỏ hơn' : 'lớn hơn';
    errors.push({
      path: `${path}.${cross.left}`,
      message: `${entry.id} ${SIDE_LABEL[side]}: ${leftLabel} phải ${relation} ${rightLabel}.`,
    });
  }
}

function validateRules(
  entry: RegistryEntry,
  side: Side,
  rules: unknown,
  path: string,
  errors: EngineValidationError[],
): void {
  const templates = entry[side].rules;
  if (!Array.isArray(rules) || rules.length !== templates.length) {
    errors.push({ path, message: `${entry.id} ${SIDE_LABEL[side]}: sai số dòng điều kiện.` });
    return;
  }
  templates.forEach((template, i) => {
    const rule: unknown = rules[i];
    const rulePath = `${path}.${i}`;
    if (!isRecord(rule)) {
      errors.push({ path: rulePath, message: `${entry.id}: điều kiện không hợp lệ.` });
      return;
    }
    const allowed: readonly string[] = template.allowed_ops;
    if (typeof rule.op !== 'string' || !allowed.includes(rule.op)) {
      errors.push({ path: `${rulePath}.op`, message: `${entry.id}: toán tử không hợp lệ.` });
    }
    if (canonicalJson({ ...rule, op: template.op }) !== canonicalJson(template)) {
      errors.push({
        path: rulePath,
        message: `${entry.id}: không được sửa operand của điều kiện.`,
      });
    }
  });
}

function validateSide(
  entry: RegistryEntry,
  side: Side,
  value: unknown,
  path: string,
  errors: EngineValidationError[],
): void {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    errors.push({ path, message: `${entry.id}: thiếu cấu hình ${SIDE_LABEL[side]}.` });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!SIDE_KEYS.has(key))
      errors.push({ path: `${path}.${key}`, message: `${entry.id}: trường không hợp lệ ${key}.` });
  }
  validateParams(entry, side, value.params, `${path}.params`, errors);
  validateRules(entry, side, value.rules, `${path}.rules`, errors);
}

/**
 * Validate a shared config against `shared-config.schema.json` and the registry
 * templates. With `grants`, enabling an indicator (master ON) additionally
 * requires the learned capability `indicator:<id>`. Returns [] when valid.
 */
export function validateConfig(
  config: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
  grants?: ReadonlySet<string> | readonly string[],
): EngineValidationError[] {
  const errors: EngineValidationError[] = [];
  if (!isRecord(config)) return [{ path: '', message: 'Thiếu cấu hình.' }];
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.has(key))
      errors.push({ path: key, message: `Trường cấu hình không hợp lệ: ${key}.` });
  }
  if (config.schema_version !== SCHEMA_VERSION) {
    errors.push({ path: 'schema_version', message: `schema_version phải là ${SCHEMA_VERSION}.` });
  }
  if (config.rule_version !== RULE_VERSION) {
    errors.push({ path: 'rule_version', message: `rule_version phải là ${RULE_VERSION}.` });
  }
  if (
    typeof config.revision !== 'number' ||
    !Number.isInteger(config.revision) ||
    config.revision < 1
  ) {
    errors.push({ path: 'revision', message: 'revision phải là số nguyên ≥ 1.' });
  }
  if (
    config.saved_at !== undefined &&
    (typeof config.saved_at !== 'string' || Number.isNaN(Date.parse(config.saved_at)))
  ) {
    errors.push({ path: 'saved_at', message: 'saved_at phải là thời điểm ISO 8601.' });
  }
  const indicators = config.indicators;
  if (!isRecord(indicators)) {
    errors.push({ path: 'indicators', message: 'Thiếu danh sách chỉ báo.' });
    return errors;
  }
  const byId = new Map(registry.map((entry) => [entry.id, entry]));
  for (const id of Object.keys(indicators)) {
    if (!byId.has(id))
      errors.push({ path: `indicators.${id}`, message: `Chỉ báo không được hỗ trợ: ${id}.` });
  }
  for (const entry of registry) {
    const id = entry.id;
    const path = `indicators.${id}`;
    const item = indicators[id];
    if (item === undefined) {
      errors.push({ path, message: `Thiếu cấu hình chỉ báo: ${id}.` });
      continue;
    }
    if (!isRecord(item)) {
      errors.push({ path, message: `${id}: cấu hình chỉ báo không hợp lệ.` });
      continue;
    }
    for (const key of Object.keys(item)) {
      if (!INDICATOR_KEYS.has(key))
        errors.push({ path: `${path}.${key}`, message: `${id}: trường không hợp lệ ${key}.` });
    }
    if (typeof item.master_enabled !== 'boolean') {
      errors.push({
        path: `${path}.master_enabled`,
        message: `${id}: master_enabled phải là boolean.`,
      });
    }
    if (item.master_enabled === true) {
      if (grants !== undefined && !hasGrant(grants, indicatorCapability(id))) {
        errors.push({ path: `${path}.master_enabled`, message: `Chỉ báo chưa mở: ${id}.` });
      }
      const buy = item.buy;
      const sell = item.sell;
      const buyOn = isRecord(buy) && buy.enabled === true;
      const sellOn = isRecord(sell) && sell.enabled === true;
      if (!buyOn && !sellOn) {
        errors.push({ path: `${path}.master_enabled`, message: `${id}: chưa chọn Mua hoặc Bán.` });
      }
    }
    for (const side of SIDES) validateSide(entry, side, item[side], `${path}.${side}`, errors);
  }
  return errors;
}
