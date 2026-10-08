import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CALCULATION_VERSION,
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

function entrySchema<V extends string>(ruleVersion: V) {
  return z
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

/** Registry document: unique ids that are exactly the expected indicator set. */
function registrySchema<V extends string>(ruleVersion: V, expectedIds: readonly string[]) {
  return z
    .array(entrySchema(ruleVersion))
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

const currentRegistrySchema = registrySchema(RULE_VERSION, CURRENT_INDICATOR_IDS);
const legacyRegistrySchema = registrySchema(LEGACY_RULE_VERSION, LEGACY_REMOVED_INDICATOR_IDS);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Validate a raw technical registry document: exactly the 16 indicators of `iqx-rules-3.0`. */
export function parseTechnicalRegistry(raw: unknown): RegistryEntry[] {
  return currentRegistrySchema.parse(raw);
}

/** Validate the legacy-only registry document: exactly the 19 removed `iqx-rules-2.0` indicators. */
export function parseLegacyTechnicalRegistry(raw: unknown): LegacyRegistryEntry[] {
  return legacyRegistrySchema.parse(raw);
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
