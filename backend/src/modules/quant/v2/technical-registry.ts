import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CALCULATION_VERSION,
  CONDITION_ROW_IDS,
  CURRENT_INDICATOR_IDS,
  LEGACY_REMOVED_INDICATOR_IDS,
  LEGACY_RULE_VERSION,
  RULE_VERSION,
  type LegacyRegistryEntry,
  type RegistryEntry,
} from './types.js';

const REGISTRY_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'registry');
/** Versioned assets copied into `dist` by scripts/copy-assets.ts. */
const TECHNICAL_REGISTRY_PATH = join(REGISTRY_DIRECTORY, 'technical-registry.json');
/** The 19 removed indicators; read-only history, never offered or validated as current. */
const LEGACY_REGISTRY_PATH = join(REGISTRY_DIRECTORY, 'legacy-technical-registry.json');

const compareOp = z.enum([
  '>',
  '<',
  'cross_up',
  'cross_down',
  'reenter_lower',
  'reenter_upper',
  'break_upper',
  'break_lower',
  'cross_up_middle',
  'cross_down_middle',
  'break_high',
  'break_low',
]);
const membershipOp = z.enum(['∈', '∉']);

/** Offsets only look back (0 = current bar, -1 = previous bar); look-ahead is rejected. */
const seriesOperand = z.strictObject({
  kind: z.literal('series'),
  key: z.string().min(1),
  offset: z.number().int().max(0).optional(),
  offset_param: z.string().min(1).optional(),
});
const paramOperand = z.strictObject({ kind: z.literal('param'), key: z.string().min(1) });
const constantOperand = z.strictObject({ kind: z.literal('constant'), value: z.number() });
const operand = z.discriminatedUnion('kind', [seriesOperand, paramOperand, constantOperand]);

const compareRule = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['compare', 'cross']),
  enabled: z.boolean().optional(),
  lhs: operand,
  op: compareOp,
  rhs: operand,
  allowed_ops: z.array(compareOp).min(1),
});
const membershipRule = z.strictObject({
  id: z.string().min(1),
  kind: z.literal('membership'),
  enabled: z.boolean().optional(),
  lhs: operand,
  op: membershipOp,
  rhs: z.strictObject({
    kind: z.literal('interval').optional(),
    lower: operand,
    upper: operand,
    bounds: z.literal('open').optional(),
  }),
  allowed_ops: z.array(membershipOp).min(1),
});
const rule = z.union([compareRule, membershipRule]);

const field = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['integer', 'number']),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: z.string(),
  api_scale: z.number(),
  wire_unit: z.string(),
  options: z.array(z.number()).min(1).optional(),
});

const side = z.strictObject({
  enabled: z.boolean(),
  params: z.record(z.string(), z.number()),
  rules: z.array(rule),
  field_overrides: z.record(z.string(), field.partial()).optional(),
});

const validation = z.looseObject({
  cross_fields: z.array(
    z.strictObject({ left: z.string(), op: z.enum(['<', '>']), right: z.string() }),
  ),
});

const commonEntryShape = {
  id: z.string().min(1),
  name: z.string().min(1),
  chapter: z.number().int(),
  lesson_id: z
    .string()
    .regex(/^ch\d{2}-l\d{2}$/)
    .nullable(),
  calculation_version: z.literal(CALCULATION_VERSION),
  family: z.enum(['state', 'event']),
  formula: z.string(),
  seed_and_missing: z.string(),
  availability: z.enum(['ohlcv', 'needs_history_context']),
};

/** Params-based entry (the 19 legacy indicators and, in the current registry, Volume). */
function paramsEntrySchema<V extends string>(ruleVersion: V) {
  return z
    .looseObject({
      ...commonEntryShape,
      buy: side,
      sell: side,
      fields: z.array(field).min(1),
      rule_version: z.literal(ruleVersion),
      validation: validation.optional(),
    })
    .superRefine((value, ctx) => {
      const keys = value.fields.map((f) => f.key).sort();
      for (const sideName of ['buy', 'sell'] as const) {
        const template = value[sideName];
        const paramKeys = Object.keys(template.params).sort();
        if (JSON.stringify(paramKeys) !== JSON.stringify(keys)) {
          ctx.addIssue({
            code: 'custom',
            message: `${value.id}.${sideName}: params must match fields`,
          });
        }
        for (const templateRule of template.rules) {
          const allowed: readonly string[] = templateRule.allowed_ops;
          if (!allowed.includes(templateRule.op)) {
            ctx.addIssue({
              code: 'custom',
              message: `${value.id}.${sideName}.${templateRule.id}: op not allowed`,
            });
          }
        }
      }
    });
}

const rowNumberField = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['integer', 'number']),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  options: z.array(z.number()).min(1).optional(),
});
const rowEnumField = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal('enum'),
  options: z.array(z.strictObject({ value: z.string().min(1), label: z.string().min(1) })).min(1),
});
const rowValues = z.record(z.string(), z.union([z.number(), z.string()]));
const rowDefinition = z.strictObject({
  id: z.string().min(1),
  sentence: z.string().min(1),
  fields: z.array(z.discriminatedUnion('type', [rowNumberField, rowEnumField])),
  constraints: z.array(
    z.strictObject({ left: z.string().min(1), op: z.literal('<'), right: z.string().min(1) }),
  ),
  default_enabled: z.boolean(),
  buy: rowValues,
  sell: rowValues,
});

const SENTENCE_FIELD = /\{([a-z_]+)\}/g;

/** Row-based entry: fields match the sentence, defaults are complete and inside their domains. */
const rowsEntrySchema = z
  .looseObject({
    ...commonEntryShape,
    rule_version: z.literal(RULE_VERSION),
    model: z.literal('rows'),
    rows: z.array(rowDefinition).min(1),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const expected: readonly string[] =
      (CONDITION_ROW_IDS as Record<string, readonly string[]>)[value.id] ?? [];
    const ids = value.rows.map((row) => row.id);
    if (JSON.stringify(ids) !== JSON.stringify(expected)) {
      issue(`${value.id}: rows must be exactly ${expected.join(', ') || '(none)'}`);
    }
    for (const row of value.rows) {
      const keys = row.fields.map((f) => f.key);
      const placeholders = [...row.sentence.matchAll(SENTENCE_FIELD)].map((m) => m[1]);
      if (JSON.stringify(placeholders) !== JSON.stringify(keys)) {
        issue(`${row.id}: sentence placeholders must list the fields in order`);
      }
      for (const constraint of row.constraints) {
        if (!keys.includes(constraint.left) || !keys.includes(constraint.right)) {
          issue(`${row.id}: constraint on an unknown field`);
        }
      }
      for (const sideName of ['buy', 'sell'] as const) {
        const values = row[sideName];
        if (JSON.stringify(Object.keys(values).sort()) !== JSON.stringify([...keys].sort())) {
          issue(`${row.id}.${sideName}: default values must match fields`);
          continue;
        }
        for (const f of row.fields) {
          const v = values[f.key];
          const ok =
            f.type === 'enum'
              ? f.options.some((o) => o.value === v)
              : typeof v === 'number' &&
                v >= f.min &&
                v <= f.max &&
                (f.options === undefined || f.options.includes(v));
          if (!ok) issue(`${row.id}.${sideName}.${f.key}: default outside the field domain`);
        }
        for (const c of row.constraints) {
          const left = values[c.left];
          const right = values[c.right];
          if (!(typeof left === 'number' && typeof right === 'number' && left < right)) {
            issue(`${row.id}.${sideName}: default breaks ${c.left} < ${c.right}`);
          }
        }
      }
    }
  });

const currentEntrySchema = z.union([
  rowsEntrySchema,
  paramsEntrySchema(RULE_VERSION).and(z.looseObject({ model: z.literal('legacy_params') })),
]);

/** Registry document: unique ids that are exactly the expected indicator set. */
function registrySchema<T extends { id: string }>(
  entry: z.ZodType<T>,
  expectedIds: readonly string[],
) {
  return z
    .array(entry)
    .min(1)
    .superRefine((entries, ctx) => {
      const seen = new Set<string>();
      for (const item of entries) {
        if (seen.has(item.id))
          ctx.addIssue({ code: 'custom', message: `duplicate indicator id ${item.id}` });
        seen.add(item.id);
      }
      const expected = new Set(expectedIds);
      const missing = expectedIds.filter((id) => !seen.has(id));
      const unexpected = [...seen].filter((id) => !expected.has(id));
      if (missing.length || unexpected.length) {
        ctx.addIssue({
          code: 'custom',
          message: `registry must contain exactly ${expectedIds.length} indicators (missing: ${
            missing.join(', ') || 'none'
          }; unexpected: ${unexpected.join(', ') || 'none'})`,
        });
      }
    });
}

const currentRegistrySchema = registrySchema(currentEntrySchema, CURRENT_INDICATOR_IDS);
const legacyRegistrySchema = registrySchema(
  paramsEntrySchema(LEGACY_RULE_VERSION),
  LEGACY_REMOVED_INDICATOR_IDS,
);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Validate a raw technical registry document: exactly the 16 indicators of `iqx-rules-4.0`,
 * the 15 row-based ones with exactly their `CONDITION_ROW_IDS` and Volume params-based.
 */
export function parseTechnicalRegistry(raw: unknown): RegistryEntry[] {
  const entries = currentRegistrySchema.parse(raw) as RegistryEntry[];
  for (const entry of entries) {
    const rowBased = entry.id in CONDITION_ROW_IDS;
    if (rowBased !== (entry.model === 'rows')) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: [entry.id, 'model'],
          message: `${entry.id}: model must be ${rowBased ? 'rows' : 'legacy_params'}`,
          input: entry.model,
        },
      ]);
    }
  }
  return entries;
}

/** Validate the legacy-only registry document: exactly the 19 removed `iqx-rules-2.0` indicators. */
export function parseLegacyTechnicalRegistry(raw: unknown): LegacyRegistryEntry[] {
  return legacyRegistrySchema.parse(raw) as LegacyRegistryEntry[];
}

let memoizedRegistry: RegistryEntry[] | undefined;
let memoizedLegacyRegistry: LegacyRegistryEntry[] | undefined;

/** Load, validate and deep-freeze `registry/technical-registry.json` once per process. */
export function loadTechnicalRegistry(): RegistryEntry[] {
  memoizedRegistry ??= deepFreeze(
    parseTechnicalRegistry(JSON.parse(readFileSync(TECHNICAL_REGISTRY_PATH, 'utf8')) as unknown),
  );
  return memoizedRegistry;
}

/**
 * Load, validate and deep-freeze `registry/legacy-technical-registry.json` once per process.
 * Legacy history only: use it to read or verify historical configs and receipts, never to offer
 * or validate an indicator as current.
 */
export function loadLegacyTechnicalRegistry(): LegacyRegistryEntry[] {
  memoizedLegacyRegistry ??= deepFreeze(
    parseLegacyTechnicalRegistry(JSON.parse(readFileSync(LEGACY_REGISTRY_PATH, 'utf8')) as unknown),
  );
  return memoizedLegacyRegistry;
}
