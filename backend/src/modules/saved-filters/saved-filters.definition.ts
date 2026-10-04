import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/**
 * Zod mirror of the screener's read-only `filter.schema.json` (JSON Schema 2020-12).
 * Enumerations and limits are read from the JSON file so the saved-filter
 * validation never drifts from the screener contract.
 */
const enumOf = z.object({ enum: z.array(z.string()).min(1) });

const filterJsonSchemaShape = z.object({
  additionalProperties: z.literal(false),
  required: z.array(z.string()),
  properties: z.object({
    schema_version: z.object({ const: z.string() }),
    name: z.object({ minLength: z.number().int().min(0), maxLength: z.number().int().min(1) }),
    logic: z.object({ const: z.string() }),
    rules: z.object({
      items: z.object({
        required: z.array(z.string()),
        properties: z.object({
          metric_id: enumOf,
          operator: enumOf,
          api_unit: enumOf,
        }),
      }),
    }),
    scope: z.object({
      required: z.array(z.string()),
      properties: z.object({ period: enumOf }),
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
  const rule = z
    .object({
      id: z.string(),
      metric_id: z.enum(asEnum(properties.rules.items.properties.metric_id.enum)),
      operator: z.enum(asEnum(properties.rules.items.properties.operator.enum)),
      value: z.number().finite(),
      api_unit: z.enum(asEnum(properties.rules.items.properties.api_unit.enum)),
    })
    .strict();
  const scope = z
    .object({
      market: z.string(),
      sector: z.string(),
      period: z.enum(asEnum(properties.scope.properties.period.enum)),
    })
    .strict();
  return z
    .object({
      schema_version: z.literal(properties.schema_version.const),
      name: z.string().min(properties.name.minLength).max(properties.name.maxLength),
      logic: z.literal(properties.logic.const),
      rules: z.array(rule),
      scope,
    })
    .strict();
}

/** Saved-filter definition validated exactly like `filter.schema.json`. */
export const filterDefinitionSchema = buildFilterDefinitionSchema(loadFilterJsonSchema());

export type FilterDefinition = z.infer<typeof filterDefinitionSchema>;
