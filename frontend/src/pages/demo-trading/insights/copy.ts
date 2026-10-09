/**
 * Static definitions + formatting shared by the hunt and Bot panels.
 *
 * Every string here is CLIENT-OWNED copy (labels, thresholds, table headers,
 * honest empty states). Anything that describes real data - disclosure text,
 * reason codes - stays server-owned and is never re-typed here.
 *
 * Icons are Lucide SVGs (the v2 rule: no emoji in our own copy).
 */
import type { ComponentType } from "react"
import { ChartColumn, Coins, Target, TrendingUp, Wallet } from "lucide-react"

export type Icon = ComponentType<{ className?: string }>

export const DASH = "-"

/* ── Hunt filters («Săn mã») ──────────────────────────────────────── */

export type HuntFilterKey = "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"

export type HuntFilterDef = {
  ma: HuntFilterKey
  Icon: Icon
  ten: string
  mo_ta: string
  dieu_kien: string
  ghi_chu_top: string
}

/** Approved order and wording of the five hunt groups (product definition, not market data). */
export const HUNT_FILTERS: readonly HuntFilterDef[] = [
  {
    ma: "ngoai",
    Icon: Coins,
    ten: "Khối ngoại gom",
    mo_ta: "Nước ngoài mua ròng nhiều tiền nhất",
    dieu_kien: "Mua ròng ≥3/5 phiên · tổng 5 phiên > 0",
    ghi_chu_top: "mã NN mua ròng mạnh nhất",
  },
  {
    ma: "tudoanh",
    Icon: Wallet,
    ten: "Tự doanh gom",
    mo_ta: "Tự doanh CTCK mua ròng nhiều nhất",
    dieu_kien: "Mua ròng ≥3/5 phiên · tổng 5 phiên > 0",
    ghi_chu_top: "mã tự doanh mua ròng mạnh nhất",
  },
  {
    ma: "kl",
    Icon: ChartColumn,
    ten: "Khối lượng đột biến",
    mo_ta: "Khối lượng bùng nổ so với thường ngày",
    dieu_kien: "KL phiên ≥2× trung bình 20 phiên",
    ghi_chu_top: "mã khối lượng bùng nổ mạnh nhất",
  },
  {
    ma: "dinh",
    Icon: Target,
    ten: "Vượt đỉnh 20 phiên",
    mo_ta: "Giá vừa vượt đỉnh cao nhất gần đây",
    dieu_kien: "Giá đóng cửa > đỉnh 20 phiên trước",
    ghi_chu_top: "mã vượt đỉnh dứt khoát nhất",
  },
  {
    ma: "tang",
    Icon: TrendingUp,
    ten: "Tăng mạnh kèm khối lượng",
    mo_ta: "Tăng giá mạnh kèm lực mua thật",
    dieu_kien: "Tăng ≥3% · KL ≥1,5× trung bình 20 phiên",
    ghi_chu_top: "mã tăng mạnh nhất có thanh khoản",
  },
]

export function huntFilterDef(ma: string | null | undefined): HuntFilterDef | undefined {
  return HUNT_FILTERS.find((f) => f.ma === ma)
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

const INT_VI = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const INT_EN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const PERCENT_VALUE = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })
const RATIO_PERCENT = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" })

/** `null`/unknown ⇒ "-". Never 0. */
export function formatInt(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? DASH : INT_VI.format(Math.round(value))
}

/** Ratio (`0.03`) ⇒ `3%`. Used by the Bot endpoints, which send ratios. */
export function formatRatioPercent(value: number | null | undefined, signed = false): string {
  if (value == null || !Number.isFinite(value)) return DASH
  if (!signed) return `${new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 2 }).format(value)}`
  return RATIO_PERCENT.format(value)
}

/** Already-percent value (`1.25` ⇒ `+1,25%`). The hunt/price-board wire sends percents, not ratios. */
export function formatSignedRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${PERCENT_VALUE.format(Math.abs(value))}%`
}

/** `+950,000đ` / `−50,000đ` / `0đ` (U+2212 minus, glued `đ`). */
export function formatVndSigned(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return DASH
  const rounded = Math.round(value)
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : ""
  return `${sign}${INT_EN.format(Math.abs(rounded))}đ`
}

/** `dd/mm/yyyy` in Asia/Ho_Chi_Minh; unparsable/empty ⇒ "-". */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return DASH
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return DASH
  return date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
}

/** `dd/mm/yy HH:mm` in Asia/Ho_Chi_Minh; unparsable/empty ⇒ "-". */
export function formatDateTimeVn(value: string | null | undefined): string {
  if (!value) return DASH
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return DASH
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })
}

/* ── Shared presentation tokens ─────────────────────────────────────────── */

/** Card shell matching the v2 token set (used by every insight block). */
export const CARD = "min-w-0 space-y-2 rounded-lg border border-border bg-card p-3 [&>*]:min-w-0"
export const SECTION_HEADER = "text-xs font-bold tracking-wider text-primary uppercase"
export const NOTE = "text-xs text-muted-foreground"
export const HINT = "text-xs leading-snug text-muted-foreground"
