import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { ruleIssues } from '../screener/screener.definition.js';
import type {
  ScreenerApiUnit,
  ScreenerMetricId,
  ScreenerPeriod,
} from '../screener/screener.registry.js';

/**
 * Zod mirror of the screener's read-only `filter.schema.json` (JSON Schema 2020-12, schema
 * version 3.0: a period per rule). Enumerations and limits are read from the JSON file so the
 * saved-filter validation never drifts from the screener contract. Stored 2.0 versions are never
 * validated against this schema: they are mapped on read (`readStoredDefinition`).
 */
const enumOf = z.object({ enum: z.array(z.string()).min(1) });

const filterJsonSchemaShape = z.object({
  additionalProperties: z.literal(false),
  required: z.array(z.string()),
  properties: z.object({
    schema_version: z.object({ const: z.string() }),
    name: z.object({ minLength: z.number().int().min(0), maxLength: z.number().int().min(1) }),
    logic: z.object({ const: z.string() }),
    data_mode: z.object({ const: z.string() }),
    rules: z.object({
      items: z.object({
        required: z.array(z.string()),
        properties: z.object({
          metric_id: enumOf,
          period: enumOf,
          operator: enumOf,
          api_unit: enumOf,
        }),
      }),
    }),
    columns: z.object({ maxItems: z.number().int().min(1) }),
    scope: z.object({
      required: z.array(z.string()),
      properties: z.object({ market: z.object({}), sector: z.object({}) }),
    }),
  }),
});

export type FilterJsonSchemaShape = z.infer<typeof filterJsonSchemaShape>;

function filterSchemaPath(): string {
  const candidates = [
    join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'screener',
      'registry',
      'filter.schema.json',
    ),
    join(process.cwd(), 'src/modules/screener/registry/filter.schema.json'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Screener filter.schema.json asset is missing');
  return found;
}

let cachedJsonSchema: FilterJsonSchemaShape | undefined;

export function loadFilterJsonSchema(): FilterJsonSchemaShape {
  cachedJsonSchema ??= filterJsonSchemaShape.parse(
    JSON.parse(readFileSync(filterSchemaPath(), 'utf8')),
  );
  return cachedJsonSchema;
}

function asEnum(values: string[]): [string, ...string[]] {
  return values as [string, ...string[]];
}

function buildFilterDefinitionSchema(json: FilterJsonSchemaShape) {
  const { properties } = json;
  const ruleProps = properties.rules.items.properties;
  const rule = z
    .object({
      id: z.string(),
      metric_id: z.enum(asEnum(ruleProps.metric_id.enum)),
      period: z.enum(asEnum(ruleProps.period.enum)),
      operator: z.enum(asEnum(ruleProps.operator.enum)),
      value: z.number().finite(),
      api_unit: z.enum(asEnum(ruleProps.api_unit.enum)),
    })
    .strict();
  const column = z
    .object({
      metric_id: z.enum(asEnum(ruleProps.metric_id.enum)),
      period: z.enum(asEnum(ruleProps.period.enum)),
    })
    .strict();
  const scope = z.object({ market: z.string(), sector: z.string() }).strict();
  return z
    .object({
      schema_version: z.literal(properties.schema_version.const),
      name: z.string().min(properties.name.minLength).max(properties.name.maxLength),
      logic: z.literal(properties.logic.const),
      data_mode: z.literal(properties.data_mode.const).default(properties.data_mode.const),
      rules: z.array(rule),
      columns: z.array(column).max(properties.columns.maxItems).optional(),
      scope,
    })
    .strict()
    .superRefine((definition, context) => {
      const issues = ruleIssues(
        definition.rules.map((item) => ({
          metric_id: item.metric_id as ScreenerMetricId,
          period: item.period as ScreenerPeriod,
          operator: item.operator as '>' | '<',
          api_unit: item.api_unit as ScreenerApiUnit,
        })),
        (definition.columns ?? []).map((item) => ({
          metric_id: item.metric_id as ScreenerMetricId,
          period: item.period as ScreenerPeriod,
        })),
      );
      for (const issue of issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    });
}

/** Saved-filter definition (schema 3.0) validated exactly like `filter.schema.json`. */
export const filterDefinitionSchema = buildFilterDefinitionSchema(loadFilterJsonSchema());

export type FilterDefinition = z.infer<typeof filterDefinitionSchema>;
