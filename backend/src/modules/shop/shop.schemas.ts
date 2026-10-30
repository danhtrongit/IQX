import { z } from 'zod';

import { MASCOT_IDS, MASCOT_OWNERSHIP_SOURCES } from './shop.catalog.js';

const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'idempotency_key chỉ gồm chữ, số và ._:-');

const mascotIdField = z.string().trim().min(1).max(24);

/** Server-side authoritative values are resolved again; these fields only confirm what was shown. */
export const purchaseBodySchema = z
  .object({
    mascot_id: mascotIdField,
    expected_price_xu: z.number().int().min(0).max(1_000_000),
    catalog_version: z.string().trim().min(1).max(64),
    idempotency_key: idempotencyKey,
  })
  .strict();

export const activeMascotBodySchema = z
  .object({
    mascot_id: mascotIdField,
    expected_revision: z.number().int().min(1).max(2_147_483_647),
  })
  .strict();

/** Tiến hoá linh thú: lên cấp 2 (10.000 xu) rồi mới lên cấp 3 (30.000 xu). */
export const evolveBodySchema = z
  .object({
    target_level: z.union([z.literal(2), z.literal(3)]),
    expected_price_xu: z.number().int().min(0).max(1_000_000),
    idempotency_key: idempotencyKey,
  })
  .strict();

/** Premium mua bằng xu: 3.000 xu cho 30 ngày. */
export const premiumPurchaseBodySchema = z
  .object({
    plan_id: z.string().uuid().optional(),
    days: z.number().int().min(1).max(365).optional(),
    expected_price_xu: z.number().int().min(0).max(1_000_000),
    idempotency_key: idempotencyKey,
  })
  .strict();

/** Đổi xu hai chiều với tiền Demo Trading: 1 xu = 10.000 VND. */
export const demoExchangeBodySchema = z
  .object({
    direction: z.enum(['xu_to_cash', 'cash_to_xu']),
    amount: z.number().int().min(1).max(100_000_000_000),
    idempotency_key: idempotencyKey,
  })
  .strict();

export const purchaseKeyParamSchema = idempotencyKey;

/** Mascot id in the path; the service resolves it against the catalog. */
export const petIdParamSchema = z.string().trim().min(1).max(24);

export const ledgerQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^[1-9]\d{0,17}$/, 'cursor không hợp lệ')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PurchaseBody = z.output<typeof purchaseBodySchema>;
export type ActiveMascotBody = z.output<typeof activeMascotBodySchema>;
export type EvolveBody = z.output<typeof evolveBodySchema>;
export type PremiumPurchaseBody = z.output<typeof premiumPurchaseBodySchema>;
export type DemoExchangeBody = z.output<typeof demoExchangeBodySchema>;
export type LedgerQuery = z.output<typeof ledgerQuerySchema>;

const mascotId = z.enum(MASCOT_IDS);
const isoTime = z.string();

const walletSchema = z.object({ balance: z.number().int(), last_seq: z.number().int() });
const activeSchema = z.object({
  mascot_id: mascotId,
  revision: z.number().int(),
  updated_at: isoTime.nullable(),
});

export const catalogEntrySchema = z.object({
  mascot_id: mascotId,
  name: z.string(),
  price_xu: z.number().int(),
  for_sale: z.boolean(),
  is_default: z.boolean(),
  sort_order: z.number().int(),
  asset_slug: z.string(),
  asset_root: z.string(),
});

const ownedSchema = z.object({
  mascot_id: mascotId,
  source: z.enum(MASCOT_OWNERSHIP_SOURCES),
  acquired_at: isoTime.nullable(),
});

const petLevelSchema = z.object({
  mascot_id: mascotId,
  level: z.number().int().min(1).max(3),
  updated_at: isoTime.nullable(),
});

export const shopStateSchema = z.object({
  catalog_version: z.string(),
  catalog: z.array(catalogEntrySchema),
  wallet: walletSchema,
  totals: z.object({
    earned_xu: z.number().int(),
    spent_xu: z.number().int(),
    lessons_rewarded: z.number().int(),
  }),
  owned: z.array(ownedSchema),
  owned_count: z.number().int(),
  total_count: z.number().int(),
  active: activeSchema,
  /** False until POST /workspace/ensure (or a first purchase/switch) materialises the rows. */
  provisioned: z.boolean(),
  /** Cấp tiến hoá của từng linh thú (1 = chưa tiến hoá). */
  pet_levels: z.array(petLevelSchema),
  /** Giá Premium mua bằng xu và số ngày được cộng. */
  premium_price_xu: z.number().int(),
  premium_duration_days: z.number().int(),
  /** Tỷ giá đổi xu <-> tiền Demo Trading. */
  exchange: z.object({
    cash_per_xu: z.number().int(),
    min_exchange_cash_vnd: z.number().int(),
  }),
});

export const ledgerItemSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  kind: z.enum([
    'lesson_first_completion',
    'mascot_purchase',
    'pet_purchase',
    'pet_evolve',
    'premium_purchase',
    'demo_deposit',
    'demo_withdraw',
    'adjustment',
    'flashback_fee',
    'flashback_reward',
    'flashback_stake',
    'flashback_win',
    'flashback_refund',
  ]),
  delta: z.number().int(),
  balance_after: z.number().int(),
  created_at: isoTime,
  label: z.object({
    lesson_key: z.string().nullable(),
    lesson_id: z.string().nullable(),
    mascot_id: z.string().nullable(),
    mascot_name: z.string().nullable(),
  }),
});

export const ledgerPageSchema = z.object({
  items: z.array(ledgerItemSchema),
  next_cursor: z.string().nullable(),
});

const purchaseRecordSchema = z.object({
  id: z.string(),
  mascot_id: mascotId,
  price_xu: z.number().int(),
  catalog_version: z.string(),
  idempotency_key: z.string(),
  ledger_id: z.string(),
  created_at: isoTime,
});

export const purchaseResultSchema = z.object({
  /** `purchased`: this key bought it (also on replay); `already_owned`: nothing was charged. */
  status: z.enum(['purchased', 'already_owned']),
  replayed: z.boolean(),
  purchase: purchaseRecordSchema.nullable(),
  wallet: walletSchema,
  owned: z.array(ownedSchema),
  active: activeSchema,
  catalog_version: z.string(),
});

export const purchaseStatusSchema = z.object({
  idempotency_key: z.string(),
  status: z.enum(['completed', 'not_found']),
  purchase: purchaseRecordSchema.nullable(),
  wallet: walletSchema,
});

export const activeMascotResultSchema = z.object({
  changed: z.boolean(),
  active: activeSchema,
});

export const evolveResultSchema = z.object({
  /** `evolved`: this key paid for the step (also on replay). */
  status: z.enum(['evolved']),
  replayed: z.boolean(),
  mascot_id: mascotId,
  level: z.number().int().min(2).max(3),
  previous_level: z.number().int().min(1).max(3),
  price_xu: z.number().int(),
  wallet: walletSchema,
  pet_levels: z.array(petLevelSchema),
});

export const premiumPurchaseResultSchema = z.object({
  /** `purchased`: this key bought the Premium days (also on replay). */
  status: z.enum(['purchased']),
  replayed: z.boolean(),
  price_xu: z.number().int(),
  days_granted: z.number().int(),
  plan_id: z.string().nullable(),
  starts_at: isoTime,
  ends_at: isoTime,
  wallet: walletSchema,
});

export const demoExchangeResultSchema = z.object({
  direction: z.enum(['xu_to_cash', 'cash_to_xu']),
  /** The amount the client sent: xu for `xu_to_cash`, VND for `cash_to_xu`. */
  amount: z.number().int(),
  xu_delta: z.number().int(),
  cash_delta_vnd: z.number().int(),
  balance_xu: z.number().int(),
  cash_available_vnd: z.number().int(),
  net_deposited_cash_vnd: z.number().int(),
  cash_per_xu: z.number().int(),
  replayed: z.boolean(),
});
