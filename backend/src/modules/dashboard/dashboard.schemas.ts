/**
 * Hợp đồng dữ liệu của Dashboard phân tích v2 (spec §11): thiết lập theo tài khoản và theo ngành,
 * danh mục 62 chỉ tiêu và số liệu theo khuôn biểu đồ. Các schema này vừa là ràng buộc runtime
 * (pipe `StandardSchemaValidationPipe`) vừa là nguồn OpenAPI.
 */
import { z } from 'zod';

import { INDUSTRIES } from '../financials/financials.industry.js';
import { METRIC_STATUSES } from '../screener/screener.metrics.js';
import {
  DASHBOARD_CHART_KINDS,
  DASHBOARD_CHART_NAMES,
  DASHBOARD_CHARTS,
  DASHBOARD_PERIOD_MODES,
} from './dashboard.catalog.js';

export const dashboardChartNameSchema = z.enum(DASHBOARD_CHART_NAMES);

/** Ngành của mã theo mẫu báo cáo tài chính (§1.3): `thuong`, `nh`, `ck`, `bh`. */
export const dashboardIndustrySchema = z.enum(INDUSTRIES);

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

/** Thiết lập theo ngành (§6.1): mỗi ngành một thiết lập; ngành chưa lưu nhận bộ mặc định (§6.3). */
export const dashboardIndustrySettingsSchema = z.object({
  thuong: dashboardSettingsSchema,
  nh: dashboardSettingsSchema,
  ck: dashboardSettingsSchema,
  bh: dashboardSettingsSchema,
});

export type DashboardIndustrySettings = z.infer<typeof dashboardIndustrySettingsSchema>;

export const dashboardSavedSettingsSchema = dashboardSettingsSchema.extend({
  nganh: dashboardIndustrySchema,
  revision: z.number().int(),
  updated_at: z.string(),
});

/**
 * Danh mục chỉ tiêu theo ngành (§3.2, §8): mỗi ngành có chương chung (Học viện Ch. 8) và chương
 * riêng, mỗi chương chia nhóm. `metric_key` là khoá ổn định để nút "Học" nối tới bài học.
 */
export const dashboardCatalogSchema = z.object({
  industries: z.array(
    z.object({
      nganh: dashboardIndustrySchema,
      /** Nhãn ngành hiện cạnh mã: "Doanh nghiệp sản xuất", "Ngân hàng", "Chứng khoán", "Bảo hiểm". */
      label: z.string(),
      /** Số chỉ tiêu của ngành: 33, 28, 27 hoặc 25 (§3.1). */
      total: z.number().int(),
      /** Bộ mặc định 6 biểu đồ của ngành (§6.3). */
      default_charts: z.array(dashboardChartNameSchema),
      chapters: z.array(
        z.object({
          /** Tiêu đề nhóm cấp 1: "Chỉ tiêu chung", "Chỉ tiêu ngân hàng"... (Học viện v4.1 §6.2). */
          chapter: z.string(),
          /**
           * Chương cố định của danh mục Học viện v4 (8–12) chứa bài học của các chỉ tiêu. Không phải số chương người
           * học thấy (mỗi nhóm đánh số lại, Học viện v4.1 §2): không hiển thị.
           */
          academy_chapter: z.number().int(),
          groups: z.array(
            z.object({
              group: z.string(),
              items: z.array(
                z.object({
                  name: dashboardChartNameSchema,
                  metric_key: z.string(),
                  /** Khuôn biểu đồ (spec §9): biết trước khuôn cố định theo năm để hiện ô số kỳ ngay (DB-05e). */
                  kind: z.enum(DASHBOARD_CHART_KINDS),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
});

export type DashboardCatalog = z.infer<typeof dashboardCatalogSchema>;

const dashboardSeriesPointSchema = z.object({
  /** Tên đường/cột; ghi đúng loại doanh thu của ngành (§8.1), ví dụ "TOI quý này". */
  name: z.string(),
  /** `null` = kỳ không tính được (spec §10), không phải số 0. */
  v: z.array(z.number().nullable()),
});

export const dashboardSeriesSchema = z.object({
  labels: z.array(z.string()),
  /** Một đường, hoặc hai đường ở khuôn A/B của chỉ tiêu ngành (§9). */
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
  /** Mốc tham chiếu: PEG = 1 (khuôn F2), combined ratio = 100 (khuôn B, §9). */
  ref: z.number().optional(),
  /** Daily series of a kind-F chart (the valuation endpoint carries the real one). */
  v: z.array(z.number().nullable()).optional(),
});

/** Ngành của một mã (§1.3), để client chọn đúng danh mục và thiết lập trước khi hỏi số liệu. */
export const dashboardIndustryResponseSchema = z.object({
  symbol: z.string(),
  nganh: dashboardIndustrySchema,
  label: z.string(),
});

export const dashboardFundamentalResponseSchema = z.object({
  symbol: z.string(),
  /** Ngành của mã theo mẫu báo cáo tài chính (§1.3). */
  nganh: dashboardIndustrySchema,
  /** Chế độ kỳ mặc định của client; response luôn có cả hai chế độ. */
  per: dashboardPeriodModeSchema,
  charts: z.record(z.string(), dashboardChartSchema),
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
  nganh: dashboardIndustrySchema,
  /** Dãy ngày dùng chung cho mọi chuỗi định giá. */
  dates: z.array(z.string()),
  charts: z.record(z.string(), dashboardValuationChartSchema),
});

/** Query của `GET /api/v2/fundamental/:symbol`: danh sách chỉ tiêu (của ngành mã) và chế độ kỳ. */
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
