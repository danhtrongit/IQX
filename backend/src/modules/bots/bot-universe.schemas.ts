import { z } from 'zod';

export const MAX_UNIVERSE_SYMBOLS = 500;

const idempotencyKey = z.string().min(8).max(128);
const ticker = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9._-]+$/)
  .transform((value) => value.toUpperCase());

/** Deduplicated (first seen) uppercase selection; an empty selection is rejected. */
export const applyListSchema = z
  .strictObject({
    list_id: z.uuid(),
    symbols: z
      .array(ticker)
      .min(1)
      .max(MAX_UNIVERSE_SYMBOLS)
      .transform((values) => [...new Set(values)]),
    expected_revision: z.number().int().min(0),
    idempotency_key: idempotencyKey,
  })
  .refine((value) => value.symbols.length > 0, { message: 'Chưa chọn mã nào', path: ['symbols'] });
export type ApplyListInput = z.infer<typeof applyListSchema>;

export const revertVn30Schema = z.strictObject({
  expected_revision: z.number().int().min(0),
  idempotency_key: idempotencyKey,
});
export type RevertVn30Input = z.infer<typeof revertVn30Schema>;

export const cancelPendingSchema = z.strictObject({
  expected_revision: z.number().int().min(1),
});
export type CancelPendingInput = z.infer<typeof cancelPendingSchema>;

// Response schemas (documentation only; the service builds these shapes).
const timestamp = z.iso.datetime();
const sessionDate = z.iso.date();

export const universeStatusSchema = z.enum([
  'implicit',
  'pending',
  'effective',
  'cancelled',
  'superseded',
  'calendar_unavailable',
]);

export const universeSourceSchema = z.object({
  kind: z.enum(['vn30', 'custom']),
  /** 0 = the implicit VN30 default (no revision row). */
  revision: z.number().int().min(0),
  name: z.string(),
  saved_list_id: z.uuid().nullable(),
  list_as_of: sessionDate.nullable(),
  effective_session: sessionDate.nullable(),
  status: universeStatusSchema,
  requested_at: timestamp.nullable(),
  cancelled_at: timestamp.nullable(),
  superseded_by: z.number().int().nullable(),
  symbol_count: z.number().int().nullable(),
  provenance: z.record(z.string(), z.unknown()),
});

export const universeSymbolSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  exchange: z.string().nullable(),
});

export const universeStateSchema = z.object({
  /** Latest revision number (0 = none); send it back as `expected_revision`. */
  revision: z.number().int().min(0),
  server_date: sessionDate,
  effective: universeSourceSchema.extend({
    symbols: z.array(universeSymbolSchema),
    /** Index membership session backing a VN30 source; null for custom lists. */
    membership_session: sessionDate.nullable(),
    unavailable_reason: z.string().nullable(),
  }),
  pending: universeSourceSchema.nullable(),
  history: z.array(universeSourceSchema),
});
export type UniverseState = z.infer<typeof universeStateSchema>;
export type UniverseSourceView = z.infer<typeof universeSourceSchema>;

export const universeMutationSchema = z.object({
  request: universeSourceSchema,
  state: universeStateSchema,
});
export type UniverseMutationResult = z.infer<typeof universeMutationSchema>;
