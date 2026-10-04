import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CALCULATION_VERSION, RULE_VERSION, type RegistryEntry } from './types.js';

/** Versioned asset copied into `dist` by scripts/copy-assets.ts. */
const TECHNICAL_REGISTRY_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'registry',
  'technical-registry.json',
);

const compareOp = z.enum(['>', '<']);
const membershipOp = z.enum(['∈', '∉']);

/** Offsets only look back (0 = current bar, -1 = previous bar); look-ahead is rejected. */
const seriesOperand = z.strictObject({
  kind: z.literal('series'),
  key: z.string().min(1),
  offset: z.number().int().max(0).optional(),
});
const paramOperand = z.strictObject({ kind: z.literal('param'), key: z.string().min(1) });
const constantOperand = z.strictObject({ kind: z.literal('constant'), value: z.number() });
const operand = z.discriminatedUnion('kind', [seriesOperand, paramOperand, constantOperand]);

const compareRule = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['compare', 'cross']),
  lhs: operand,
  op: compareOp,
  rhs: operand,
  allowed_ops: z.array(compareOp).min(1),
});
const membershipRule = z.strictObject({
  id: z.string().min(1),
  kind: z.literal('membership'),
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
});

const side = z.strictObject({
  enabled: z.boolean(),
  params: z.record(z.string(), z.number()),
  rules: z.array(rule),
  field_overrides: z.record(z.string(), field.partial()).optional(),
});

const validation = z.looseObject({
  cross_fields: z.array(z.strictObject({ left: z.string(), op: compareOp, right: z.string() })),
});

const entry = z
  .looseObject({
    id: z.string().min(1),
    name: z.string().min(1),
    chapter: z.number().int(),
    lesson_id: z.string().min(1),
    calculation_version: z.literal(CALCULATION_VERSION),
    family: z.enum(['state', 'event']),
    formula: z.string(),
    seed_and_missing: z.string(),
    buy: side,
    sell: side,
    fields: z.array(field).min(1),
    availability: z.enum(['ohlcv', 'needs_history_context']),
    rule_version: z.literal(RULE_VERSION),
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

const registrySchema = z
  .array(entry)
  .min(1)
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    for (const item of entries) {
      if (seen.has(item.id))
        ctx.addIssue({ code: 'custom', message: `duplicate indicator id ${item.id}` });
      seen.add(item.id);
    }
  });

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Validate a raw technical registry document (the 35-entry `iqx-ta-2.0` JSON). */
export function parseTechnicalRegistry(raw: unknown): RegistryEntry[] {
  return registrySchema.parse(raw);
}

let memoizedRegistry: RegistryEntry[] | undefined;

/** Load, validate and deep-freeze `registry/technical-registry.json` once per process. */
export function loadTechnicalRegistry(): RegistryEntry[] {
  memoizedRegistry ??= deepFreeze(
    parseTechnicalRegistry(JSON.parse(readFileSync(TECHNICAL_REGISTRY_PATH, 'utf8')) as unknown),
  );
  return memoizedRegistry;
}
