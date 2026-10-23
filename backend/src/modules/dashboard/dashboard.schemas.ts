/**
 * Hợp đồng dữ liệu của Dashboard phân tích (spec §11): thiết lập theo tài khoản, danh mục 33
 * chỉ tiêu và số liệu theo khuôn biểu đồ. Các schema này vừa là ràng buộc runtime (pipe
 * `StandardSchemaValidationPipe`) vừa là nguồn OpenAPI.
 */
import { z } from 'zod';

import { METRIC_STATUSES } from '../screener/screener.metrics.js';
import {
  DASHBOARD_CHART_KINDS,
  DASHBOARD_CHART_NAMES,
  DASHBOARD_CHARTS,
  DASHBOARD_PERIOD_MODES,
} from './dashboard.catalog.js';

export const dashboardChartNameSchema = z.enum(DASHBOARD_CHART_NAMES);

export const dashboardPeriodModeSchema = z.enum(DASHBOARD_PERIOD_MODES);

/** Số kỳ của một biểu đồ (spec §5.2): quý 4/5/8/12/20, năm 3/5/10. */
export const dashboardQuarterCountSchema = z.union([
  z.literal(4),
  z.literal(5),
  z.literal(8),
  z.literal(12),
  z.literal(20),
]);

export const dashboardYearCountSchema = z.union([
  z.literal(3),
  z.literal(5),
  z.literal(10),
]);

export const dashboardPeriodCountsSchema = z
  .object({
    q: dashboardQuarterCountSchema.optional(),
    y: dashboardYearCountSchema.optional(),
  })
  .strict();

/** Thiết lập một tài khoản (spec §6.1). */
export const dashboardSettingsInputSchema = z
  .object({
    /** Danh sách biểu đồ và thứ tự hiển thị. */
    charts: z.array(dashboardChartNameSchema).max(DASHBOARD_CHARTS.length),
    /** Chế độ kỳ chung cho cả dashboard. */
    per: dashboardPeriodModeSchema,
    /** Số kỳ riêng của từng biểu đồ (chỉ cần lưu chỗ khác mặc định 5). */
    nks: z.partialRecord(dashboardChartNameSchema, dashboardPeriodCountsSchema),
  })
  .strict()
  .superRefine((settings, context) => {
    const seen = new Set<string>();
    settings.charts.forEach((name, index) => {
      if (seen.has(name))
        context.addIssue({
          code: 'custom',
          path: ['charts', index],
          message: `Biểu đồ '${name}' bị lặp trong danh sách`,
        });
      seen.add(name);
    });
  });

export type DashboardSettingsInput = z.infer<typeof dashboardSettingsInputSchema>;

export const dashboardSettingsSchema = z.object({
  charts: z.array(dashboardChartNameSchema),
  per: dashboardPeriodModeSchema,
  nks: z.partialRecord(dashboardChartNameSchema, dashboardPeriodCountsSchema),
});

export type DashboardSettings = z.infer<typeof dashboardSettingsSchema>;

export const dashboardSavedSettingsSchema = dashboardSettingsSchema.extend({
  revision: z.number().int(),
  updated_at: z.string(),
});

/** Danh mục 33 chỉ tiêu theo 6 nhóm (spec §8) + cờ không áp dụng cho ngân hàng (spec §7). */
export const dashboardCatalogSchema = z.array(
  z.object({
    group: z.string(),
    items: z.array(
      z.object({
        name: dashboardChartNameSchema,
        /** Khuôn biểu đồ (spec §9): biết trước khuôn cố định theo năm để hiện ô số kỳ ngay (DB-05e). */
        kind: z.enum(DASHBOARD_CHART_KINDS),
        na_for_bank: z.boolean(),
      }),
    ),
  }),
);

export type DashboardCatalog = z.infer<typeof dashboardCatalogSchema>;

const dashboardSeriesPointSchema = z.object({
  name: z.string(),
  /** `null` = kỳ không tính được (spec §10), không phải số 0. */
  v: z.array(z.number().nullable()),
});

export const dashboardSeriesSchema = z.object({
  labels: z.array(z.string()),
  main: z.array(dashboardSeriesPointSchema),
  sub: z
    .object({
      unit: z.string(),
      type: z.enum(['grouped', 'stacked']),
      series: z.array(dashboardSeriesPointSchema),
    })
    .optional(),
});

export const dashboardChartSchema = z.object({
  name: z.string(),
  kind: z.enum(DASHBOARD_CHART_KINDS),
  unit: z.string(),
  /** Số chữ số thập phân theo đơn vị (spec §10). */
  decimals: z.number().int(),
  status: z.enum(METRIC_STATUSES),
  /** Lý do biểu đồ trống (chỉ tiêu chưa có nguồn dữ liệu, chưa đủ lịch sử…). */
  note: z.string().optional(),
  /** Chú giải định nghĩa hiện cùng chú thích, ví dụ "Tiền gồm đầu tư tài chính ngắn hạn" (DB-06). */
  legend_note: z.string().optional(),
  q: dashboardSeriesSchema.optional(),
  y: dashboardSeriesSchema.optional(),
  labels: z.array(z.string()).optional(),
  main: z.array(dashboardSeriesPointSchema).optional(),
  mainUnit: z.string().optional(),
  hero: z.number().nullable().optional(),
  ref: z.number().optional(),
  /** Daily series of a kind-F chart (the valuation endpoint carries the real one). */
  v: z.array(z.number().nullable()).optional(),
});

/** Một biểu đồ của dashboard: có dữ liệu, hoặc không áp dụng cho mã ngân hàng. */
export const dashboardChartEntrySchema = z.union([
  z.object({ name: z.string(), na: z.literal(1) }),
  dashboardChartSchema,
]);

export const dashboardFundamentalResponseSchema = z.object({
  symbol: z.string(),
  /** Mã ngân hàng: 22 chỉ tiêu không áp dụng (spec §7). */
  is_bank: z.boolean(),
  /** Chế độ kỳ mặc định của client; response luôn có cả hai chế độ. */
  per: dashboardPeriodModeSchema,
  charts: z.record(z.string(), dashboardChartEntrySchema),
});

export const dashboardValuationChartSchema = z.object({
  name: z.string(),
  kind: z.literal('F'),
  unit: z.string(),
  /** `v[i]` là giá trị tại `dates[i]`. */
  v: z.array(z.number().nullable()),
});

export const dashboardValuationResponseSchema = z.object({
  symbol: z.string(),
  /** Dãy ngày dùng chung cho mọi chuỗi định giá. */
  dates: z.array(z.string()),
  charts: z.record(
    z.string(),
    z.union([
      z.object({ name: z.string(), na: z.literal(1) }),
      dashboardValuationChartSchema,
    ]),
  ),
});

/** Query của `GET /api/v2/fundamental/:symbol`: danh sách chỉ tiêu và chế độ kỳ. */
export const dashboardFundamentalQuerySchema = z.object({
  /** Tên chỉ tiêu, phân tách bằng dấu phẩy: "ROE,D/E,P/E". */
  charts: z.string().max(1000).optional(),
  per: dashboardPeriodModeSchema.default('q'),
});

export type DashboardFundamentalQuery = z.infer<typeof dashboardFundamentalQuerySchema>;

/** Query của `GET /api/v2/valuation/:symbol`: ngày bắt đầu và các chỉ tiêu định giá. */
export const dashboardValuationQuerySchema = z.object({
  /** Ngày bắt đầu của chuỗi (YYYY-MM-DD); tối đa 10 năm. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
    .optional(),
  charts: z.string().max(1000).optional(),
});

export type DashboardValuationQuery = z.infer<typeof dashboardValuationQuerySchema>;
