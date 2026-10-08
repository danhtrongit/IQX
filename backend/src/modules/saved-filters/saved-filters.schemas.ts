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

export const listQuerySchema = z
  .object({
    /** Also return lists created only to feed "Áp dụng cho Bot" (hidden from "Danh mục đã lưu"). */
    include_internal: z
      .preprocess((value) => value === 'true' || value === true, z.boolean())
      .default(false),
  })
  .strict();
export type ListQuery = z.infer<typeof listQuerySchema>;

// ---------------------------------------------------------------------------
// Saved result snapshots and lists created from a server-held filter result (spec §8).

/** `all` = every row that passed in the whole result (all pages); `subset` = these symbols. */
export const selectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('all') }),
  z.strictObject({
    mode: z.literal('subset'),
    symbols: z
      .array(ticker)
      .min(1)
      .max(MAX_LIST_TICKERS)
      .transform((values) => [...new Set(values)]),
  }),
]);
export type SelectionInput = z.infer<typeof selectionSchema>;

const visibilitySchema = z.enum(['saved', 'internal']);

const filterLink = {
  filter_id: z.uuid().optional(),
  filter_version: z.number().int().min(1).optional(),
};
const filterPairRule = (value: { filter_id?: string; filter_version?: number }) =>
  value.filter_version === undefined || value.filter_id !== undefined;
const filterPairIssue = {
  message: 'filter_version cần đi kèm filter_id',
  path: ['filter_version'],
};

/** Source of a snapshot/list: the server-held run (`run_id`, owner only). Rows are never client-supplied. */
export const resultSnapshotCreateSchema = z
  .strictObject({
    name: resourceName,
    run_id: z.uuid(),
    selection: selectionSchema,
    ...filterLink,
    visibility: visibilitySchema.default('saved'),
    idempotency_key: idempotencyKey.optional(),
  })
  .refine(filterPairRule, filterPairIssue);
export type ResultSnapshotCreateInput = z.infer<typeof resultSnapshotCreateSchema>;

/**
 * Creates a list whose tickers and evidence come from a result: either a server-held run
 * (`run_id`, a result snapshot is created in the same transaction) or an existing snapshot.
 */
export const listFromResultSchema = z
  .strictObject({
    name: resourceName,
    run_id: z.uuid().optional(),
    result_snapshot_id: z.uuid().optional(),
    selection: selectionSchema,
    ...filterLink,
    visibility: visibilitySchema.default('saved'),
    idempotency_key: idempotencyKey.optional(),
  })
  .refine((value) => (value.run_id === undefined) !== (value.result_snapshot_id === undefined), {
    message: 'Chỉ chọn một nguồn: run_id hoặc result_snapshot_id',
    path: ['run_id'],
  })
  .refine(filterPairRule, filterPairIssue);
export type ListFromResultInput = z.infer<typeof listFromResultSchema>;

export const resultSnapshotQuerySchema = z
  .object({
    include_internal: z
      .preprocess((value) => value === 'true' || value === true, z.boolean())
      .default(false),
  })
  .strict();
export type ResultSnapshotQuery = z.infer<typeof resultSnapshotQuerySchema>;

// Response schemas (OpenAPI only; handlers build these shapes in the service).
const timestamp = z.iso.datetime();

export const filterVersionSummarySchema = z
  .object({ version: z.number().int(), definition_hash: z.string(), created_at: timestamp })
  .strict();

export const legacyReviewSchema = z
  .object({
    stored_schema_version: z.literal('2.0'),
    legacy_period: z.enum(['TTM', 'annual', 'quarter']),
    needs_review: z.boolean(),
    rules: z.array(
      z.object({
        rule_id: z.string(),
        metric_id: z.string(),
        legacy_period: z.enum(['TTM', 'annual', 'quarter']),
        mapped_period: z.string(),
        status: z.enum(['ok', 'needs_review']),
        reason: z.string().nullable(),
      }),
    ),
  })
  .strict();

export const savedFilterSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    current_version: z.number().int(),
    version: z.number().int(),
    /** Always schema 3.0: a stored 2.0 version is mapped on read, never rewritten. */
    definition: filterDefinitionSchema,
    /** Schema version of the stored row (2.0 = filter-wide period mapped onto every rule). */
    stored_schema_version: z.string(),
    /** Present for a stored 2.0 version; `needs_review` rules must get a new period before running. */
    legacy_review: legacyReviewSchema.nullable(),
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
    /** `internal` lists only back "Áp dụng cho Bot" from a result; they are not in the saved list. */
    visibility: visibilitySchema,
    result_snapshot_id: z.uuid().nullable(),
    run_id: z.uuid().nullable(),
    /** Criteria/cutoff evidence recorded when the list was created from a result; null otherwise. */
    provenance: z.record(z.string(), z.unknown()).nullable(),
    created_at: timestamp,
  })
  .strict();
export type SavedList = z.infer<typeof savedListSchema>;

export const savedListCollectionSchema = z.object({ items: z.array(savedListSchema) }).strict();

export const resultSnapshotSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    visibility: visibilitySchema,
    run_id: z.uuid().nullable(),
    filter_id: z.uuid().nullable(),
    filter_version: z.number().int().nullable(),
    definition_hash: z.string(),
    /** Data cutoff of the run: when the figures were resolved. Not the save time. */
    as_of: timestamp,
    run_at: timestamp,
    data_source: z.string(),
    calculation_version: z.string(),
    registry_version: z.string(),
    selection: z.object({ mode: z.enum(['all', 'subset']), symbols: z.array(z.string()) }),
    symbols: z.array(z.string()),
    totals: z.record(z.string(), z.unknown()),
    row_count: z.number().int(),
    /** The real save time. */
    created_at: timestamp,
  })
  .strict();
export type ResultSnapshotSummary = z.infer<typeof resultSnapshotSummarySchema>;

export const resultSnapshotSchema = resultSnapshotSummarySchema
  .extend({
    /** Criteria (definition 3.0) the run used, frozen. */
    definition: filterDefinitionSchema,
    /** Rows of the saved symbols with per-cell values, statuses, actual periods and provenance. */
    rows: z.array(z.record(z.string(), z.unknown())),
  })
  .strict();
export type ResultSnapshot = z.infer<typeof resultSnapshotSchema>;

export const resultSnapshotCollectionSchema = z
  .object({ items: z.array(resultSnapshotSummarySchema) })
  .strict();
