import { z } from 'zod';

const legacyBooleanValues = new Map<string, boolean>([
  ['0', false],
  ['false', false],
  ['f', false],
  ['no', false],
  ['n', false],
  ['off', false],
  ['1', true],
  ['true', true],
  ['t', true],
  ['yes', true],
  ['y', true],
  ['on', true],
]);

/** Match Pydantic's query-string boolean coercion without Boolean('false'). */
export const queryBooleanSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  return legacyBooleanValues.get(value.toLowerCase()) ?? value;
}, z.boolean());

const optionalFilterSchema = z
  .string()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export const instrumentSearchQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized ? normalized : undefined;
    }),
  exchange: optionalFilterSchema,
  asset_type: optionalFilterSchema,
  include_indices: queryBooleanSchema.default(false),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

export const instrumentSymbolSchema = z.string();

export type InstrumentSearchQuery = z.output<typeof instrumentSearchQuerySchema>;

const nullableStringSchema = z.string().nullable();
const nullableNumberSchema = z.number().nullable();

export const instrumentSummarySchema = z.object({
  symbol: z.string(),
  name: nullableStringSchema,
  shortName: nullableStringSchema,
  exchange: nullableStringSchema,
  assetType: nullableStringSchema,
  isIndex: z.boolean(),
  logoUrl: nullableStringSchema,
  currentPriceVnd: nullableStringSchema,
  targetPriceVnd: nullableStringSchema,
  upsidePct: nullableNumberSchema,
  icbLv1: nullableStringSchema,
  icbLv2: nullableStringSchema,
});

export const instrumentDetailSchema = instrumentSummarySchema.extend({
  id: z.string().uuid(),
  logoSource: nullableStringSchema,
  source: nullableStringSchema,
  lastSyncedAt: nullableStringSchema,
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const instrumentListResponseSchema = z.object({
  data: z.array(instrumentSummarySchema),
  meta: z.object({
    pagination: z.object({
      page: z.number().int().min(1),
      page_size: z.number().int().min(1),
      total: z.number().int().nonnegative(),
      total_pages: z.number().int().nonnegative(),
    }),
    // Added after the controller by ResponseMetadataInterceptor.
    request_id: z.string().optional(),
  }),
});

export const instrumentDetailResponseSchema = z.object({
  data: instrumentDetailSchema,
  meta: z.object({
    // Added after the controller by ResponseMetadataInterceptor.
    request_id: z.string().optional(),
  }),
});

export const instrumentNotFoundErrorSchema = z.object({
  error: z.object({
    code: z.literal('INSTRUMENT_NOT_FOUND'),
    message: z.string(),
  }),
  request_id: z.string(),
});

export const validationErrorSchema = z.object({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.array(z.union([z.string(), z.number()])).optional(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
  request_id: z.string(),
});

export type InstrumentSummary = z.infer<typeof instrumentSummarySchema>;
export type InstrumentDetail = z.infer<typeof instrumentDetailSchema>;
export type InstrumentListResponse = z.infer<typeof instrumentListResponseSchema>;
export type InstrumentDetailResponse = z.infer<typeof instrumentDetailResponseSchema>;

export const legacyInstrumentSearchItemSchema = z.object({
  symbol: z.string(),
  name: nullableStringSchema,
  short_name: nullableStringSchema,
  exchange: nullableStringSchema,
  asset_type: nullableStringSchema,
  is_index: z.boolean(),
  logo_url: nullableStringSchema,
  current_price_vnd: nullableNumberSchema,
  target_price_vnd: nullableNumberSchema,
  upside_pct: nullableNumberSchema,
  icb_lv1: nullableStringSchema,
  icb_lv2: nullableStringSchema,
});

export const legacyInstrumentDetailSchema = legacyInstrumentSearchItemSchema.extend({
  id: z.string().uuid(),
  logo_source: nullableStringSchema,
  source: nullableStringSchema,
  source_url: nullableStringSchema,
  last_synced_at: nullableStringSchema,
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const legacyInstrumentSearchResponseSchema = z.object({
  items: z.array(legacyInstrumentSearchItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  page_size: z.number().int().min(1),
  total_pages: z.number().int().nonnegative(),
});

export const legacyErrorSchema = z.object({
  detail: z.string(),
  code: z.string(),
});

export type LegacyInstrumentSearchItem = z.infer<typeof legacyInstrumentSearchItemSchema>;
export type LegacyInstrumentDetail = z.infer<typeof legacyInstrumentDetailSchema>;
