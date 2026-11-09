import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

/** Hợp đồng phản hồi của API bản tin (cho OpenAPI và client sinh tự động). */

export const openApi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

const num = z.number();
const nullableNum = z.number().nullable();
const iso = z.string();
const date = z.string();

const levelsSchema = z.object({
  r1: nullableNum,
  r2: nullableNum,
  s1: nullableNum,
  s2: nullableNum,
  pa: nullableNum,
  pt: nullableNum,
  na: nullableNum,
  nt: nullableNum,
});

const publishedSummarySchema = z.object({
  close: num,
  change: num,
  change_pct: num,
  pick_count: z.number().int(),
  slot_counts: z.array(z.number().int()),
});

const fileInfoSchema = z.object({
  variant: z.enum(['desktop', 'mobile']),
  revision: z.number().int(),
  file_name: z.string(),
  byte_size: z.number().int(),
  page_count: z.number().int(),
  page_width: num,
  page_height: num,
  url: z.string(),
  download_url: z.string(),
});

const publicBulletinSchema = z.object({
  trade_date: date,
  published_at: iso,
  updated_at: iso.nullable(),
  revision: z.number().int(),
  summary: publishedSummarySchema.nullable(),
  files: z.array(fileInfoSchema),
});

export const latestBulletinResponseSchema = z.object({ bulletin: publicBulletinSchema.nullable() });
export const bulletinByDateResponseSchema = z.object({ bulletin: publicBulletinSchema.nullable() });

export const archiveResponseSchema = z.object({
  items: z.array(publicBulletinSchema),
  total: z.number().int(),
  page: z.number().int(),
  has_more: z.boolean(),
  retention_months: z.number().int(),
});

const trackingSummarySchema = z.object({
  tracking_count: z.number().int(),
  today_count: z.number().int(),
  profit_count: z.number().int(),
  profit_base: z.number().int(),
  average_return: nullableNum,
  index_return: nullableNum,
});

export const trackingResponseSchema = z.object({
  as_of: date.nullable(),
  slot: z.number().int().nullable(),
  summary: trackingSummarySchema,
  items: z.array(
    z.object({
      symbol: z.string(),
      slot: z.number().int(),
      first_trade_date: date,
      entry_price: num,
      price: nullableNum,
      return_pct: nullableNum,
      sessions: z.number().int(),
      is_today: z.boolean(),
    }),
  ),
});

export const pushSlotResponseSchema = z.object({
  slot: z.number().int(),
  trade_date: date,
  picks: z.number().int(),
  passed_count: z.number().int(),
  pushed_at: iso,
});

const statusSchema = z.enum(['draft', 'public', 'unpublic']);

export const adminListResponseSchema = z.object({
  items: z.array(
    z.object({
      trade_date: date,
      status: statusSchema,
      data_ready: z.boolean(),
      published_at: iso.nullable(),
      updated_at: iso.nullable(),
      edited_at: iso.nullable(),
      actor_name: z.string().nullable(),
      error_count: z.number().int().nullable(),
    }),
  ),
  retention_months: z.number().int(),
});

const checksSchema = z.object({
  errors: z.number().int(),
  warnings: z.number().int(),
  checked_at: iso,
  items: z.array(
    z.object({
      level: z.enum(['error', 'warn', 'info']),
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  ),
});

const slotSnapshotSchema = z.object({
  slot: z.number().int(),
  trade_date: date,
  display_name: z.string(),
  filter_id: z.string(),
  filter_name: z.string(),
  filter_version: z.number().int(),
  result_id: z.string(),
  conditions: z.array(z.string()),
  passed_count: z.number().int(),
  picks: z.array(
    z.object({
      symbol: z.string(),
      close: num,
      change_pct: nullableNum,
      value_bn: nullableNum,
    }),
  ),
  chart: z
    .object({
      symbol: z.string(),
      d: z.array(z.string()),
      o: z.array(num),
      h: z.array(num),
      l: z.array(num),
      c: z.array(num),
      v: z.array(num),
    })
    .nullable(),
  pushed_by: z.string().nullable(),
  pushed_at: iso,
});

export const adminDetailResponseSchema = z.object({
  trade_date: date,
  status: statusSchema,
  data_ready: z.boolean(),
  data_ready_at: iso.nullable(),
  content: z.object({
    trend: z.string(),
    momentum: z.string(),
    liquidity: z.string(),
    levels: levelsSchema,
  }),
  metrics: z
    .object({
      close: num,
      change: num,
      change_pct: num,
      volume_millions: num,
      volume_ma20_millions: nullableNum,
      value_bn: nullableNum,
      advances: nullableNum,
      unchanged: nullableNum,
      declines: nullableNum,
      sma20: nullableNum,
      sma50: nullableNum,
      sma200: nullableNum,
      rsi: nullableNum,
      rsi_previous: nullableNum,
      macd: nullableNum,
      signal: nullableNum,
      histogram: nullableNum,
    })
    .nullable(),
  suggestions: z.array(
    z.object({ label: z.string(), value: num, side: z.enum(['resistance', 'support']) }),
  ),
  model_available: z.boolean(),
  slots: z.array(z.object({ slot: z.number().int(), snapshot: slotSnapshotSchema.nullable() })),
  slots_locked: z.boolean(),
  checks: checksSchema,
  has_changes: z.boolean(),
  can_publish: z.boolean(),
  published_revision: z.number().int().nullable(),
  published_at: iso.nullable(),
  updated_at: iso.nullable(),
  published_by_name: z.string().nullable(),
  files: z.array(fileInfoSchema),
  history: z.array(
    z.object({
      action: z.enum(['publish', 'republish', 'unpublish']),
      by: z.string().nullable(),
      at: iso,
      previous_revision: z.number().int().nullable(),
      revision: z.number().int().nullable(),
    }),
  ),
  retention_months: z.number().int(),
});

export const adminCheckResponseSchema = z.object({ checks: checksSchema });

export const adminPreviewResponseSchema = z.object({
  variant: z.enum(['desktop', 'mobile']),
  ready: z.boolean(),
  pages: z.array(z.object({ svg: z.string(), width: num, height: num })),
  overflow: z.array(z.enum(['trend', 'momentum', 'liquidity'])),
});

export const pushContextResponseSchema = z.object({
  trade_date: date.nullable(),
  status: statusSchema.nullable(),
  locked: z.boolean(),
  slots: z.array(
    z.object({
      slot: z.number().int(),
      default_name: z.string().nullable(),
      pushed: z
        .object({
          pushed_at: iso,
          display_name: z.string(),
          picks: z.number().int(),
          passed_count: z.number().int(),
        })
        .nullable(),
    }),
  ),
});
