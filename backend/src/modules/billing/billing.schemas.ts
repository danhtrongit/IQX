import { z } from 'zod';

const uuid = z.string().uuid();
const optionalDate = z.string().datetime({ offset: true }).optional();

export const planIdParamsSchema = z.object({ plan_id: uuid });
export const userIdParamsSchema = z.object({ user_id: uuid });
export const orderIdParamsSchema = z.object({ order_id: uuid });
export const subscriptionIdParamsSchema = z.object({ sub_id: uuid });
export const ipnLogIdParamsSchema = z.object({ log_id: uuid });

export const planCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
  price_vnd: z.coerce.number().int().positive().max(2_147_483_647),
  duration_days: z.coerce.number().int().positive().max(3_650),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
});

export const planUpdateSchema = planCreateSchema
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const checkoutSchema = z.object({ plan_id: uuid });
export const adminGrantSchema = z.object({
  plan_id: uuid,
  note: z.string().trim().max(1000).nullable().optional(),
});

export const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(20),
  status: z.string().trim().min(1).optional(),
  grant_type: z.string().trim().min(1).optional(),
  user_id: uuid.optional(),
  plan_id: uuid.optional(),
  date_from: optionalDate,
  date_to: optionalDate,
  search: z.string().trim().min(1).max(200).optional(),
});

export const refundSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  // Orders use PostgreSQL INTEGER, so this bound is both exact in JSON and
  // cannot exceed the original order amount.
  amount_vnd: z.coerce.number().int().positive().max(2_147_483_647).optional(),
});
export const markPaidSchema = z.object({ note: z.string().trim().min(1).max(1000) });
export const reconcileSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
});

export const subscriptionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(20),
  status: z.string().trim().min(1).optional(),
  plan_id: uuid.optional(),
  user_id: uuid.optional(),
  expiring_within_days: z.coerce.number().int().min(1).max(3650).optional(),
});
export const cancelSubscriptionSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
export const extendSubscriptionSchema = z.object({
  days: z.coerce.number().int().positive().max(3650),
  reason: z.string().trim().max(1000).nullable().optional(),
});

const queryBoolean = z.preprocess((value) => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean());

export const ipnListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(20),
  secret_key_valid: queryBoolean.optional(),
  result_status: z.string().trim().min(1).optional(),
  date_from: optionalDate,
  date_to: optionalDate,
  search: z.string().trim().min(1).max(200).optional(),
});

const nullableShortString = z.string().max(1000).nullable().optional();
export const ipnPayloadSchema = z
  .object({
    timestamp: z.number().int().nullable().optional(),
    notification_type: nullableShortString,
    order: z
      .object({
        id: nullableShortString,
        order_id: nullableShortString,
        order_status: nullableShortString,
        order_currency: nullableShortString,
        order_amount: nullableShortString,
        order_invoice_number: nullableShortString,
        order_description: nullableShortString,
      })
      .passthrough()
      .nullable()
      .optional(),
    transaction: z
      .object({
        id: nullableShortString,
        payment_method: nullableShortString,
        transaction_id: nullableShortString,
        transaction_type: nullableShortString,
        transaction_date: nullableShortString,
        transaction_status: nullableShortString,
        transaction_amount: nullableShortString,
        transaction_currency: nullableShortString,
        authentication_status: nullableShortString,
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type PlanCreateInput = z.output<typeof planCreateSchema>;
export type PlanUpdateInput = z.output<typeof planUpdateSchema>;
export type PaymentListQuery = z.output<typeof paymentListQuerySchema>;
export type SubscriptionListQuery = z.output<typeof subscriptionListQuerySchema>;
export type IpnListQuery = z.output<typeof ipnListQuerySchema>;
