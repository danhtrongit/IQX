import { z } from 'zod';

import { filterDefinitionSchema } from './saved-filters.definition.js';

export const MAX_LIST_TICKERS = 500;

const resourceName = z.string().trim().min(1).max(120);
const idempotencyKey = z.string().min(8).max(128);
const ticker = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((value) => value.toUpperCase());
const scopeValue = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);

export const savedResourceIdSchema = z.uuid();

export const filterCreateSchema = z
  .object({
    name: resourceName,
    definition: filterDefinitionSchema,
    idempotency_key: idempotencyKey.optional(),
  })
  .strict();
export type FilterCreateInput = z.infer<typeof filterCreateSchema>;

export const filterUpdateSchema = z
  .object({
    name: resourceName.optional(),
    definition: filterDefinitionSchema,
  })
  .strict();
export type FilterUpdateInput = z.infer<typeof filterUpdateSchema>;

export const filterGetQuerySchema = z
  .object({ version: z.coerce.number().int().min(1).optional() })
  .strict();
export type FilterGetQuery = z.infer<typeof filterGetQuerySchema>;

export const listCreateSchema = z
  .object({
    name: resourceName,
    filter_id: z.uuid().optional(),
    filter_version: z.number().int().min(1).optional(),
    tickers: z
      .array(ticker)
      .max(MAX_LIST_TICKERS)
      // Uppercase, unique, first-seen order.
      .transform((values) => [...new Set(values)]),
    as_of: z.iso.date(),
    data_source: z.string().trim().min(1).max(120),
    scope: z
      .record(z.string().min(1).max(64), scopeValue)
      .refine((value) => Object.keys(value).length <= 20, {
        message: 'Phạm vi có tối đa 20 khóa',
      }),
    idempotency_key: idempotencyKey.optional(),
  })
  .strict()
  .refine((value) => value.filter_version === undefined || value.filter_id !== undefined, {
    message: 'filter_version cần đi kèm filter_id',
    path: ['filter_version'],
  });
export type ListCreateInput = z.infer<typeof listCreateSchema>;

// Response schemas (OpenAPI only; handlers build these shapes in the service).
const timestamp = z.iso.datetime();

export const filterVersionSummarySchema = z
  .object({ version: z.number().int(), definition_hash: z.string(), created_at: timestamp })
  .strict();

export const savedFilterSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    current_version: z.number().int(),
    version: z.number().int(),
    definition: filterDefinitionSchema,
    definition_hash: z.string(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .strict();
export type SavedFilterSummary = z.infer<typeof savedFilterSummarySchema>;

export const savedFilterSchema = savedFilterSummarySchema
  .extend({ versions: z.array(filterVersionSummarySchema) })
  .strict();
export type SavedFilter = z.infer<typeof savedFilterSchema>;

export const savedFilterListSchema = z
  .object({ items: z.array(savedFilterSummarySchema) })
  .strict();

export const savedListSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.literal('static_retrospective'),
    filter_id: z.uuid().nullable(),
    filter_version: z.number().int().nullable(),
    tickers: z.array(z.string()),
    as_of: z.iso.date(),
    data_source: z.string(),
    scope: z.record(z.string(), scopeValue),
    created_at: timestamp,
  })
  .strict();
export type SavedList = z.infer<typeof savedListSchema>;

export const savedListCollectionSchema = z.object({ items: z.array(savedListSchema) }).strict();
