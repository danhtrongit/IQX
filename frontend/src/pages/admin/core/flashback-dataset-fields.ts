/**
 * Mô tả các tham số của kho dữ liệu Flashback (spec v2.2 §5) cho giao diện quản trị: nhãn, đơn vị,
 * khoảng hợp lệ, lúc nào có hiệu lực, và đổi qua lại giữa đơn vị hiển thị với đơn vị của máy chủ.
 *
 * Máy chủ giữ tỷ lệ ở dạng thập phân (0,025) và tiền ở đơn vị đồng (3.000.000.000); giao diện hiện
 * 2,5% và 3 tỷ đồng cho dễ đọc rồi đổi ngược khi gửi. Máy chủ vẫn kiểm tra lại mọi khoảng giá trị.
 */
import { formatNumber } from "@/lib/format"

import type { DatasetConfig, DatasetConfigPatch, DatasetPriceSource } from "./flashback-dataset-api"

export type DatasetNumericKey = Exclude<keyof DatasetConfigPatch, "priceSources">

export type DatasetNumericField = {
  key: DatasetNumericKey
  label: string
  /** Đơn vị hiển thị, đứng sau giá trị. */
  unit: string
  min: number
  max: number
  step: number
  integer: boolean
  /** Khi nào thay đổi có hiệu lực. */
  note: string
  toDisplay: (wire: number) => number
  toWire: (display: number) => number
}

/** Làm tròn để số đổi đơn vị không lòi ra phần thập phân do sai số dấu phẩy động. */
const round = (value: number, digits: number): number => Number(value.toFixed(digits))

const identity = (value: number) => value
const percent = {
  toDisplay: (wire: number) => round(wire * 100, 6),
  toWire: (display: number) => round(display / 100, 8),
}
const billions = {
  toDisplay: (wire: number) => round(wire / 1e9, 6),
  toWire: (display: number) => Math.round(display * 1e9),
}

export const DATASET_APPLIES_NEXT_BUILD = "Áp dụng từ lần làm mới kho kế tiếp."
const APPLIES_NOW = "Áp dụng ngay cho ván mới."

export const DATASET_NUMERIC_FIELDS: DatasetNumericField[] = [
  {
    key: "warmupSessions",
    label: "Số phiên khởi tạo chỉ báo (W)",
    unit: "phiên",
    min: 100,
    max: 500,
    step: 1,
    integer: true,
    note: "Áp dụng ngay khi cắt đề. Mã không đủ lịch sử chỉ bị loại ở lần làm mới kế tiếp.",
    toDisplay: identity,
    toWire: identity,
  },
  {
    key: "minMonthsAgo",
    label: "Khoảng cách tối thiểu tới hôm nay",
    unit: "tháng",
    min: 0,
    max: 60,
    step: 1,
    integer: true,
    note: APPLIES_NOW,
    toDisplay: identity,
    toWire: identity,
  },
  {
    key: "maxGapSessions",
    label: "Khoảng nghỉ tối đa",
    unit: "phiên",
    min: 0,
    max: 60,
    step: 1,
    integer: true,
    note: "Ghi cứng vào kho khi tạo nên chỉ có hiệu lực từ lần làm mới kho kế tiếp.",
    toDisplay: identity,
    toWire: identity,
  },
  {
    key: "maxZeroVolumeRatio",
    label: "Tỷ lệ phiên khối lượng 0 tối đa",
    unit: "% số phiên hiện",
    min: 0,
    max: 50,
    step: 0.1,
    integer: false,
    note: `${APPLIES_NOW} Luôn cho phép tối thiểu 1 phiên.`,
    ...percent,
  },
  {
    key: "minLiquidityVnd",
    label: "Thanh khoản bình quân tối thiểu",
    unit: "tỷ đồng/phiên",
    min: 0,
    max: 1000,
    step: 0.1,
    integer: false,
    note: APPLIES_NOW,
    ...billions,
  },
  {
    key: "minDailyVolatility",
    label: "Độ lệch chuẩn lợi suất tối thiểu (phiên chơi)",
    unit: "%",
    min: 0,
    max: 20,
    step: 0.1,
    integer: false,
    note: APPLIES_NOW,
    ...percent,
  },
  {
    key: "minSymbols",
    label: "Số mã tối thiểu để kích hoạt kho",
    unit: "mã",
    min: 1,
    max: 500,
    step: 1,
    integer: true,
    note: DATASET_APPLIES_NEXT_BUILD,
    toDisplay: identity,
    toWire: identity,
  },
  {
    key: "refreshDelayDays",
    label: "Chờ sau kỳ cơ cấu rồi mới làm mới",
    unit: "ngày",
    min: 0,
    max: 60,
    step: 1,
    integer: true,
    note: "Áp dụng cho lần kiểm tra làm mới tự động kế tiếp.",
    toDisplay: identity,
    toWire: identity,
  },
]

/** Giá trị một tham số số để hiện trong bảng: số kèm đơn vị. */
export function formatDatasetNumeric(field: DatasetNumericField, wire: number): string {
  return `${formatNumber(field.toDisplay(wire))} ${field.unit}`
}

export type DatasetSourceChoice = {
  value: string
  sources: DatasetPriceSource[]
  label: string
  note: string
}

export const DATASET_SOURCE_CHOICES: DatasetSourceChoice[] = [
  {
    value: "DNSE,VCI",
    sources: ["DNSE", "VCI"],
    label: "DNSE trước, VCI dự phòng",
    note: "Mặc định. DNSE có lịch sử từ khoảng năm 2012.",
  },
  {
    value: "VCI,DNSE",
    sources: ["VCI", "DNSE"],
    label: "VCI trước, DNSE dự phòng",
    note: "Lịch sử từ ngày lên sàn. Cần chọn để có điểm cắt trước năm 2012.",
  },
  { value: "DNSE", sources: ["DNSE"], label: "Chỉ DNSE", note: "Không dùng VCI khi DNSE lỗi." },
  { value: "VCI", sources: ["VCI"], label: "Chỉ VCI", note: "Không dùng DNSE." },
]

/** Thứ tự nguồn giá ở dạng chữ cho bảng tham số. */
export function describePriceSources(sources: readonly DatasetPriceSource[]): string {
  const known = DATASET_SOURCE_CHOICES.find((choice) => choice.sources.join(",") === sources.join(","))
  return known?.label ?? sources.join(", ")
}

/** Giá trị đang nhập của từng ô, ở đơn vị hiển thị. */
export type DatasetDrafts = Record<DatasetNumericKey, string>

export function initialDrafts(config: DatasetConfig): DatasetDrafts {
  return Object.fromEntries(
    DATASET_NUMERIC_FIELDS.map((field) => [field.key, String(field.toDisplay(config[field.key]))]),
  ) as DatasetDrafts
}

/** Thông báo lỗi của một ô nhập, hoặc `null` nếu hợp lệ. */
export function datasetFieldError(field: DatasetNumericField, draft: string): string | null {
  const value = draft.trim() === "" ? Number.NaN : Number(draft)
  if (!Number.isFinite(value)) return "Nhập một số."
  if (field.integer && !Number.isInteger(value)) return "Nhập số nguyên."
  if (value < field.min || value > field.max) return `Nhập số từ ${field.min} đến ${field.max}.`
  return null
}

/** Chỉ các khoá đã đổi so với máy chủ, ở đơn vị của máy chủ. Gọi khi mọi ô đã hợp lệ. */
export function buildDatasetPatch(
  config: DatasetConfig,
  drafts: DatasetDrafts,
  sourceValue: string,
): DatasetConfigPatch {
  const patch: DatasetConfigPatch = {}
  for (const field of DATASET_NUMERIC_FIELDS) {
    const wire = field.toWire(Number(drafts[field.key]))
    if (Math.abs(wire - config[field.key]) > 1e-12) patch[field.key] = wire
  }
  const choice = DATASET_SOURCE_CHOICES.find((item) => item.value === sourceValue)
  if (choice && choice.sources.join(",") !== config.priceSources.join(",")) patch.priceSources = choice.sources
  return patch
}
