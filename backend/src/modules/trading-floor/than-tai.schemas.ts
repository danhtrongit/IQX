/**
 * Schema Zod của API Thần Tài v2 (thân, tham số) và schema OpenAPI của các phản hồi. JSON camelCase như
 * hợp đồng (`backend/docs/than-tai/CONTRACT.md`); thời gian là epoch ms.
 */

import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

import { DIRECTIONS, HANG_LIST, HANH_LIST } from './than-tai.logic.js';

export const openapi = (schema: z.ZodType): SchemaObject =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

// ---------- thân và tham số ----------

export const thanTaiPredictBodySchema = z.strictObject({ direction: z.enum(DIRECTIONS) });
export type ThanTaiPredictBody = z.infer<typeof thanTaiPredictBodySchema>;

/** Số mã thật sự (0–3) và định dạng do service kiểm tra để trả đúng mã lỗi `QUA_3_MA`/`MA_KHONG_HOP_LE`. */
export const thanTaiCauBodySchema = z.strictObject({
  tickers: z.array(z.string().max(16)).max(10),
});
export type ThanTaiCauBody = z.infer<typeof thanTaiCauBodySchema>;

export const thanTaiLaIdParamSchema = z.coerce.number().int().min(1).max(2_147_483_647);
export const thanTaiQueIdParamSchema = z.coerce.number().int().min(1).max(64);
export const thanTaiHanhParamSchema = z.enum(HANH_LIST);

/** Giới hạn độ dài của nội dung do quản trị sửa. */
export const THAN_TAI_LIMITS = {
  luan: 1200,
  chot: 120,
  tenHao: 40,
  haoVan: 600,
  haoNghia: 600,
  queTen: 80,
  chuHan: 20,
  tuong: 300,
  thoan: 1000,
  thoanNghia: 600,
  nganhItem: 60,
  nganhMax: 20,
  mauMax: 6,
  mauTen: 40,
  huong: 40,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

const hasAny = (body: Record<string, unknown>): boolean =>
  Object.values(body).some((value) => value !== undefined);

export const thanTaiLaPatchSchema = z
  .strictObject({
    tenHao: text(THAN_TAI_LIMITS.tenHao).optional(),
    haoVan: text(THAN_TAI_LIMITS.haoVan).optional(),
    haoNghia: text(THAN_TAI_LIMITS.haoNghia).optional(),
    hang: z.enum(HANG_LIST).optional(),
    luan: text(THAN_TAI_LIMITS.luan).optional(),
    chot: text(THAN_TAI_LIMITS.chot).optional(),
    active: z.boolean().optional(),
  })
  .refine(hasAny, { message: 'Cần ít nhất một trường để sửa' });
export type ThanTaiLaPatch = z.infer<typeof thanTaiLaPatchSchema>;

export const thanTaiQuePatchSchema = z
  .strictObject({
    ten: text(THAN_TAI_LIMITS.queTen).optional(),
    chuHan: text(THAN_TAI_LIMITS.chuHan).optional(),
    tuong: text(THAN_TAI_LIMITS.tuong).optional(),
    thoan: text(THAN_TAI_LIMITS.thoan).optional(),
    thoanNghia: text(THAN_TAI_LIMITS.thoanNghia).optional(),
  })
  .refine(hasAny, { message: 'Cần ít nhất một trường để sửa' });
export type ThanTaiQuePatch = z.infer<typeof thanTaiQuePatchSchema>;

const mauItem = z.strictObject({
  ten: text(THAN_TAI_LIMITS.mauTen),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Màu phải có dạng #RRGGBB'),
});

export const thanTaiHanhPatchSchema = z
  .strictObject({
    nganh: z.array(text(THAN_TAI_LIMITS.nganhItem)).min(1).max(THAN_TAI_LIMITS.nganhMax).optional(),
    mau: z.array(mauItem).min(1).max(THAN_TAI_LIMITS.mauMax).optional(),
    huong: text(THAN_TAI_LIMITS.huong).optional(),
  })
  .refine(hasAny, { message: 'Cần ít nhất một trường để sửa' });
export type ThanTaiHanhPatch = z.infer<typeof thanTaiHanhPatchSchema>;

// ---------- phản hồi ----------

const hang = z.enum(HANG_LIST);
const hanh = z.enum(HANH_LIST);

const hanhGroup = z.object({ hanh, label: z.string(), nganh: z.array(z.string()) });
const mau = z.object({ ten: z.string(), hex: z.string() });
const trigram = z.object({ key: z.string(), ten: z.string(), symbol: z.string() });

const day = z.object({
  date: z.string(),
  canChi: z.string(),
  napAm: z.string(),
  hanh,
  hanhLabel: z.string(),
  hop: z.array(hanhGroup),
  kieng: z.array(hanhGroup),
  mau: z.array(mau),
  huong: z.string(),
});

const la = z.object({
  id: z.number().int(),
  hang,
  hangLabel: z.string(),
  que: z.object({
    id: z.number().int(),
    ten: z.string(),
    chuHan: z.string(),
    hao: z.string(),
    tren: trigram,
    duoi: trigram,
    tuong: z.string(),
    thoan: z.string(),
    thoanNghia: z.string(),
  }),
  haoDong: z.object({
    so: z.number().int(),
    ten: z.string(),
    van: z.string(),
    nghia: z.string(),
  }),
  luan: z.string(),
  chot: z.string(),
});

const direction = z.enum(DIRECTIONS);

const today = z.object({
  status: z.enum(['chua_khan', 'dang_do', 'da_xong', 'het_gio']),
  step: z.number().int().min(1).max(4),
  serverTime: z.number(),
  deadline: z.number(),
  day,
  vnindexRef: z.number().nullable(),
  la: la.nullable(),
  prediction: direction.nullable(),
  tickers: z.array(z.string()).nullable(),
});

const results = z.object({
  total: z.number().int(),
  up: z.number().int(),
  flat: z.number().int(),
  down: z.number().int(),
  top5: z.array(z.object({ ticker: z.string(), count: z.number().int() })),
  asOf: z.number(),
});

const adminLa = z.object({
  id: z.number().int(),
  queId: z.number().int(),
  queTen: z.string(),
  chuHan: z.string(),
  hao: z.string(),
  queTren: z.string(),
  queDuoi: z.string(),
  tuong: z.string(),
  thoan: z.string(),
  thoanNghia: z.string(),
  haoDong: z.number().int(),
  tenHao: z.string(),
  haoVan: z.string(),
  haoNghia: z.string(),
  hang,
  luan: z.string(),
  chot: z.string(),
  active: z.boolean(),
  updatedAt: z.number(),
});

const adminQue = z.object({
  id: z.number().int(),
  ten: z.string(),
  chuHan: z.string(),
  hao: z.string(),
  queTren: z.string(),
  queDuoi: z.string(),
  tuong: z.string(),
  thoan: z.string(),
  thoanNghia: z.string(),
  updatedAt: z.number(),
});

const adminHanh = z.object({
  hanh,
  nganh: z.array(z.string()),
  mau: z.array(mau),
  huong: z.string(),
  updatedAt: z.number(),
});

export const THAN_TAI_TODAY_SCHEMA = openapi(today);
export const THAN_TAI_RESULTS_SCHEMA = openapi(results);
export const THAN_TAI_ADMIN_LA_LIST_SCHEMA = openapi(z.object({ items: z.array(adminLa) }));
export const THAN_TAI_ADMIN_LA_SCHEMA = openapi(adminLa);
export const THAN_TAI_ADMIN_QUE_SCHEMA = openapi(adminQue);
export const THAN_TAI_ADMIN_HANH_LIST_SCHEMA = openapi(z.object({ items: z.array(adminHanh) }));
export const THAN_TAI_ADMIN_HANH_SCHEMA = openapi(adminHanh);
