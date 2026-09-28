import { z } from 'zod';

export const uuidParamSchema = z.uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

export const metricsRevenueQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const auditFilterSchema = z.object({
  admin_user_id: z.uuid().optional(),
  action_prefix: z.string().trim().min(1).max(80).optional(),
  target_entity: z.string().trim().min(1).max(60).optional(),
  target_id: z.string().trim().min(1).max(100).optional(),
  date_from: z.iso.datetime({ offset: true }).optional(),
  date_to: z.iso.datetime({ offset: true }).optional(),
});

export const auditQuerySchema = paginationSchema
  .extend(auditFilterSchema.shape)
  .refine((value) => !value.date_from || !value.date_to || value.date_from <= value.date_to, {
    message: 'date_from must not be after date_to',
    path: ['date_from'],
  });

export const auditExportQuerySchema = auditFilterSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(10_000).default(1_000),
  })
  .refine((value) => !value.date_from || !value.date_to || value.date_from <= value.date_to, {
    message: 'date_from must not be after date_to',
    path: ['date_from'],
  });

export const freezeAccountSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const unfreezeAccountSchema = z
  .object({
    reason: z.string().trim().max(1_000).optional(),
  })
  .strict();

export const cashAdjustSchema = z
  .object({
    amount_vnd: z
      .number()
      .int()
      .safe()
      .refine((value) => value !== 0, 'amount_vnd must not be 0'),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const accountListQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'suspended']).optional(),
  frozen_only: z.preprocess(
    (value) => (value === 'true' ? true : value === 'false' ? false : value),
    z.boolean().optional(),
  ),
  search: z.string().trim().min(1).max(200).optional(),
});

export const ordersQuerySchema = paginationSchema
  .extend({
    status: z.string().trim().min(1).max(32).optional(),
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9._-]{1,20}$/)
      .optional(),
    date_from: z.iso.date().optional(),
    date_to: z.iso.date().optional(),
  })
  .refine((value) => !value.date_from || !value.date_to || value.date_from <= value.date_to, {
    message: 'date_from must not be after date_to',
    path: ['date_from'],
  });

export const tradesQuerySchema = paginationSchema.extend({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9._-]{1,20}$/)
    .optional(),
});

export const ledgerQuerySchema = paginationSchema.extend({
  kind: z.string().trim().min(1).max(50).optional(),
});

export const settlementsQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'settled']).optional(),
});

export const tradingConfigUpdateSchema = z
  .object({
    initial_cash_vnd: z.number().int().positive().safe().optional(),
    buy_fee_rate_bps: z.number().int().min(0).max(10_000).optional(),
    sell_fee_rate_bps: z.number().int().min(0).max(10_000).optional(),
    sell_tax_rate_bps: z.number().int().min(0).max(10_000).optional(),
    settlement_mode: z.enum(['T0', 'T2']).optional(),
    board_lot_size: z.number().int().min(1).max(10_000).optional(),
    trading_enabled: z.boolean().optional(),
    holidays: z.array(z.iso.date()).max(366).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const resetAccountSchema = z
  .object({
    dry_run: z.boolean().default(false),
    reason: z.string().trim().min(1).max(500).default('Admin reset'),
  })
  .strict()
  .default({ dry_run: false, reason: 'Admin reset' });

export const resetAllSchema = z
  .object({
    confirm: z.literal('RESET_ALL'),
    dry_run: z.boolean().default(false),
    reason: z.string().trim().min(1).max(500).default('Admin reset all accounts'),
  })
  .strict();

export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditExportQuery = z.infer<typeof auditExportQuerySchema>;
export type FreezeAccountInput = z.infer<typeof freezeAccountSchema>;
export type UnfreezeAccountInput = z.infer<typeof unfreezeAccountSchema>;
export type CashAdjustInput = z.infer<typeof cashAdjustSchema>;
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
export type TradesQuery = z.infer<typeof tradesQuerySchema>;
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
export type SettlementsQuery = z.infer<typeof settlementsQuerySchema>;
export type TradingConfigUpdate = z.infer<typeof tradingConfigUpdateSchema>;
export type ResetAccountInput = z.infer<typeof resetAccountSchema>;
export type ResetAllInput = z.infer<typeof resetAllSchema>;
