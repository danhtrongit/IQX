import { HttpException } from '@nestjs/common';

import {
  defaultConfig,
  loadTechnicalRegistry,
  validateConfig,
  type IndicatorConfig,
  type RegistryEntry,
  type SharedConfig,
} from '../quant/v2/index.js';
import {
  filterDefinitionSchema,
  type FilterDefinition,
} from '../saved-filters/saved-filters.definition.js';
import {
  canonicalizeV4,
  enabledTechnical,
  type ScreenerDefinitionV4,
  type TechnicalItem,
} from '../screener/screener.definition.js';
import { mergeIndicatorPatch } from '../strategy-config/strategy-config.service.js';
import { indicatorConfigSchema } from '../strategy-config/strategy-config.schemas.js';
import {
  IQX_FIELD_LIMITS,
  IQX_MAX_HOLDING,
  type IqxTemplateKind,
} from './iqx-templates.schemas.js';

/** One problem of a template, on the field the admin frame shows it under. */
export type IqxFieldError = { field: string; message: string };

export type IqxFilterContent = {
  name: string;
  idea: string;
  origin: string;
  when_wrong: string;
  pair_slug: string | null;
  definition: FilterDefinition;
};

export type IqxStrategyDefinition = {
  /** Rổ của chiến lược IQX: chỉ VN30 hoặc VN100 (spec Bot và Chiến lược v2.0 §7.1). */
  universe: { type: 'vn30' | 'vn100' };
  indicators: Record<string, IndicatorConfig>;
  max_holding: number;
};

export type IqxStrategyContent = {
  name: string;
  idea: string;
  origin: string;
  when_wrong: string;
  definition: IqxStrategyDefinition;
};

export type IqxContent = IqxFilterContent | IqxStrategyContent;

export type IqxValidation =
  { ok: true; content: IqxContent } | { ok: false; errors: IqxFieldError[] };

const INFO_LABELS = {
  name: 'Tên',
  idea: 'Ý tưởng',
  origin: 'Nguồn gốc',
  when_wrong: 'Khi nào dễ sai',
} as const;

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Tên, Ý tưởng, Nguồn gốc, Khi nào dễ sai (§5.3): required, trimmed, within their limits. */
export function infoErrors(input: Record<string, unknown>): IqxFieldError[] {
  const errors: IqxFieldError[] = [];
  for (const field of ['name', 'idea', 'origin', 'when_wrong'] as const) {
    const value = textOf(input[field]);
    const label = INFO_LABELS[field];
    const max = IQX_FIELD_LIMITS[field];
    if (!value) errors.push({ field, message: `${label}: bắt buộc nhập.` });
    else if ([...value].length > max)
      errors.push({ field, message: `${label}: tối đa ${max} ký tự.` });
  }
  const idea = textOf(input.idea);
  // "1 câu": no sentence end followed by another sentence.
  if (idea && /[.!?…]\s+\S/u.test(idea))
    errors.push({ field: 'idea', message: 'Ý tưởng: chỉ viết 1 câu.' });
  return errors;
}

/** Switched-on conditions of a definition 4.0: fundamental rules plus enabled technical rows (Khối lượng counts two). */
export function filterConditionCount(
  definition: Pick<FilterDefinition, 'rules' | 'technical'>,
): number {
  const technical = enabledTechnical((definition.technical ?? []) as TechnicalItem[]);
  return (
    definition.rules.length +
    technical.reduce((sum, item) => sum + ('rules' in item ? item.rules.length : 2), 0)
  );
}

const pathText = (path: ReadonlyArray<PropertyKey>): string =>
  ['definition', ...path.map((part) => String(part))].join('.');

/** The Bộ lọc 4.0 validator of saved filters, plus "at least one condition" (§5.4). */
export function validateFilterDefinition(
  definition: unknown,
): { ok: true; definition: FilterDefinition } | { ok: false; errors: IqxFieldError[] } {
  if (definition && typeof definition === 'object' && 'origin' in definition)
    return {
      ok: false,
      errors: [{ field: 'definition.origin', message: 'Bộ lọc IQX không mang trường nguồn gốc.' }],
    };
  const parsed = filterDefinitionSchema.safeParse(definition);
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        field: pathText(issue.path),
        message: issue.message,
      })),
    };
  const canonical = canonicalizeV4(
    parsed.data as unknown as ScreenerDefinitionV4,
  ) as unknown as FilterDefinition;
  if (filterConditionCount(canonical) < 1)
    return {
      ok: false,
      errors: [{ field: 'definition', message: 'Bộ lọc cần ít nhất một điều kiện.' }],
    };
  return { ok: true, definition: { ...canonical, columns: [] } };
}

const isSideOn = (indicator: IndicatorConfig | undefined, side: 'buy' | 'sell'): boolean =>
  !!indicator &&
  indicator.master_enabled &&
  indicator[side].enabled &&
  indicator[side].rules.some((rule) => (rule as { enabled?: boolean }).enabled !== false);

/**
 * The Bot condition validator (`validateConfig`, both tabs, every row) over the registry defaults
 * with the template's indicators merged in exactly like a saved PATCH, plus §5.4 / v2.0 §7.2: one
 * switched-on Mua row, one switched-on Bán row, Giữ tối đa 3–250, basket VN30 or VN100.
 */
export function validateStrategyDefinition(
  definition: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): { ok: true; definition: IqxStrategyDefinition } | { ok: false; errors: IqxFieldError[] } {
  const errors: IqxFieldError[] = [];
  const record =
    definition && typeof definition === 'object' ? (definition as Record<string, unknown>) : {};
  const maxHolding = record.max_holding;
  if (
    typeof maxHolding !== 'number' ||
    !Number.isInteger(maxHolding) ||
    maxHolding < IQX_MAX_HOLDING.min ||
    maxHolding > IQX_MAX_HOLDING.max
  )
    errors.push({
      field: 'definition.max_holding',
      message: `Giữ tối đa phải từ ${IQX_MAX_HOLDING.min} đến ${IQX_MAX_HOLDING.max} phiên, số nguyên.`,
    });
  const universe = record.universe as { type?: unknown } | undefined;
  const universeType =
    universe &&
    typeof universe === 'object' &&
    Object.keys(universe).length === 1 &&
    (universe.type === 'vn30' || universe.type === 'vn100')
      ? universe.type
      : null;
  if (!universeType)
    errors.push({ field: 'definition.universe', message: 'Rổ mã: chọn VN30 hoặc VN100.' });
  for (const key of Object.keys(record)) {
    if (key !== 'indicators' && key !== 'max_holding' && key !== 'universe')
      errors.push({ field: `definition.${key}`, message: `Trường không hợp lệ: ${key}.` });
  }
  const raw = record.indicators;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ field: 'definition.indicators', message: 'Thiếu cấu hình chỉ báo.' });
    return { ok: false, errors };
  }
  const indicators: Record<string, IndicatorConfig> = {};
  const known = new Set(registry.map((entry) => entry.id));
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(id)) {
      errors.push({
        field: `definition.indicators.${id}`,
        message: `Chỉ báo không được hỗ trợ: ${id}.`,
      });
      continue;
    }
    const parsed = indicatorConfigSchema.safeParse(value);
    if (!parsed.success) {
      errors.push({
        field: `definition.indicators.${id}`,
        message: `${id}: cấu hình chỉ báo không hợp lệ.`,
      });
      continue;
    }
    indicators[id] = parsed.data as IndicatorConfig;
  }
  if (errors.length) return { ok: false, errors };

  let merged: SharedConfig;
  try {
    merged = { ...mergeIndicatorPatch(defaultConfig(registry), indicators), revision: 1 };
  } catch (error) {
    const message =
      error instanceof HttpException
        ? String((error.getResponse() as { message?: unknown }).message ?? error.message)
        : String(error);
    return { ok: false, errors: [{ field: 'definition.indicators', message }] };
  }
  for (const issue of validateConfig(merged, registry))
    errors.push({ field: `definition.${issue.path}`, message: issue.message });
  if (errors.length) return { ok: false, errors };

  const used = Object.values(merged.indicators);
  if (!used.some((item) => isSideOn(item, 'buy')))
    errors.push({ field: 'definition.buy', message: 'Chưa bật chỉ báo Mua nào.' });
  if (!used.some((item) => isSideOn(item, 'sell')))
    errors.push({ field: 'definition.sell', message: 'Chưa bật chỉ báo Bán nào.' });
  if (errors.length) return { ok: false, errors };

  // Only the indicators the template carries; normalised exactly as a saved PATCH would store them.
  const stored: Record<string, IndicatorConfig> = {};
  for (const id of Object.keys(indicators)) stored[id] = merged.indicators[id]!;
  return {
    ok: true,
    definition: {
      universe: { type: universeType! },
      indicators: stored,
      max_holding: maxHolding as number,
    },
  };
}

/** Full check of a template's content for publish (§5.3, §5.4), pair slug excluded (needs the DB). */
export function validateContent(
  kind: IqxTemplateKind,
  input: Record<string, unknown>,
): IqxValidation {
  const errors = infoErrors(input);
  const info = {
    name: textOf(input.name),
    idea: textOf(input.idea),
    origin: textOf(input.origin),
    when_wrong: textOf(input.when_wrong),
  };
  if (kind === 'filter') {
    // The definition is named after the item (the form has no name box in compose mode).
    const raw = input.definition;
    const named =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>), name: info.name || 'Bộ lọc IQX' }
        : raw;
    const definition = validateFilterDefinition(named);
    if (!definition.ok) errors.push(...definition.errors);
    for (const key of Object.keys(input)) {
      if (!['name', 'idea', 'origin', 'when_wrong', 'pair_slug', 'definition'].includes(key))
        errors.push({ field: key, message: `Trường không hợp lệ: ${key}.` });
    }
    if (errors.length || !definition.ok) return { ok: false, errors };
    const pair = typeof input.pair_slug === 'string' && input.pair_slug ? input.pair_slug : null;
    return {
      ok: true,
      content: {
        ...info,
        pair_slug: pair,
        definition: { ...definition.definition, name: info.name },
      },
    };
  }
  const definition = validateStrategyDefinition(input.definition);
  if (!definition.ok) errors.push(...definition.errors);
  for (const key of Object.keys(input)) {
    if (!['name', 'idea', 'origin', 'when_wrong', 'definition'].includes(key))
      errors.push({ field: key, message: `Trường không hợp lệ: ${key}.` });
  }
  if (errors.length || !definition.ok) return { ok: false, errors };
  return { ok: true, content: { ...info, definition: definition.definition } };
}
