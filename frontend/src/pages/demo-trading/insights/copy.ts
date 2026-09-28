/**
 * Static definitions + formatting shared by the four insights panels.
 *
 * Every string here is CLIENT-OWNED copy ported from the legacy Đấu trường
 * screens (labels, thresholds, table headers, honest empty states). Anything
 * that describes real data - disclosure text, reason codes, watchlist notes,
 * consensus numbers, reading evidence lines - stays server-owned and is never
 * re-typed here.
 *
 * Icons are Lucide SVGs (the v2 rule: no emoji in our own copy).
 */
import type { ComponentType } from "react"
import {
  ChartColumn,
  Coins,
  Gem,
  Newspaper,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react"

export type Icon = ComponentType<{ className?: string }>

export const DASH = "-"

/* ── Five layers (Cấp 4 «Đọc 5 lớp», and Cấp 1's five buy reasons) ───────── */

export type Lop = "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia"
export type NhanDinhLop = "ok" | "neu" | "bad"

/** Canonical layer order - identical to the backend's `LOP_KEYS`. */
export const LOP_KEYS: readonly Lop[] = ["ky_thuat", "dong_tien", "noi_bo", "tin_tuc", "dinh_gia"]

export type LopDef = { lop: Lop; Icon: Icon; label: string; source: string }

/** spec §5.1 - the five layers, in the spec's order, with their real sources. */
export const LOP_DEFS: readonly LopDef[] = [
  { lop: "ky_thuat", Icon: Target, label: "Kỹ thuật", source: "AI Insight · L1 Xu hướng" },
  { lop: "dong_tien", Icon: Coins, label: "Dòng tiền", source: "AI Insight · L3 Dòng tiền (khối ngoại + tự doanh)" },
  { lop: "noi_bo", Icon: UserRound, label: "Nội bộ", source: "AI Insight · L4 Nội bộ (lãnh đạo mua)" },
  { lop: "tin_tuc", Icon: Newspaper, label: "Tin tức", source: "AI Insight · L5 Tin tức" },
  { lop: "dinh_gia", Icon: Gem, label: "Định giá", source: "AI Phân tích BCTC · KHỐI 02 Giá đắt hay rẻ" },
]

export function lopLabel(value: string | null | undefined): string {
  if (!value) return DASH
  return LOP_DEFS.find((def) => def.lop === value)?.label ?? value
}

/** The five buy reasons of Cấp 1 are the same five layers, in the same order. */
export const LY_DO_OPTIONS = LOP_DEFS

export const NHAN_DINH_OPTIONS: readonly { value: NhanDinhLop; label: string }[] = [
  { value: "ok", label: "Ủng hộ" },
  { value: "neu", label: "Trung tính" },
  { value: "bad", label: "Ngược chiều" },
]

export const NHAN_DINH_LABEL: Record<NhanDinhLop, string> = {
  ok: "Ủng hộ",
  neu: "Trung tính",
  bad: "Ngược chiều",
}

const NHAN_DINH_VALUES: readonly string[] = ["ok", "neu", "bad"]

export type Lop5Partial = Partial<Record<Lop, NhanDinhLop | null>> | null | undefined

/** spec §5.2 cổng cứng - all five layers rated. */
export function isDoc5LopComplete(answers: Lop5Partial): boolean {
  if (!answers) return false
  return LOP_KEYS.every((lop) => NHAN_DINH_VALUES.includes(answers[lop] as string))
}

export function countRated(answers: Lop5Partial): number {
  if (!answers) return 0
  return LOP_KEYS.filter((lop) => answers[lop] != null).length
}

/** Layers the AI rates Ủng hộ - local display only, the server owns the counters. */
export function countDongThuan(ai: Lop5Partial): number {
  if (!ai) return 0
  return LOP_KEYS.filter((lop) => ai[lop] === "ok").length
}

/** Layers where both sides exist and agree (a layer missing on either side is neither). */
export function countCungGocNhin(user: Lop5Partial, ai: Lop5Partial): number {
  if (!user || !ai) return 0
  return LOP_KEYS.filter((lop) => user[lop] != null && ai[lop] != null && user[lop] === ai[lop]).length
}

/* ── Hunt filters (Cấp 5 «Săn mã») ──────────────────────────────────────── */

export type HuntFilterKey = "ngoai" | "tudoanh" | "kl" | "dinh" | "tang"

export type HuntFilterDef = {
  ma: HuntFilterKey
  Icon: Icon
  ten: string
  mo_ta: string
  dieu_kien: string
  ghi_chu_top: string
}

/** spec §5.3 + mockup - exact order and wording (product definition, not market data). */
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
    ten: "Tăng mạnh + KL cao",
    mo_ta: "Tăng giá mạnh kèm lực mua thật",
    dieu_kien: "Tăng ≥3% · KL ≥1,5× trung bình 20 phiên",
    ghi_chu_top: "mã tăng mạnh nhất có thanh khoản",
  },
]

export const HUNT_FILTER_ORDER: readonly HuntFilterKey[] = ["ngoai", "tudoanh", "kl", "dinh", "tang"]

export function huntFilterDef(ma: string | null | undefined): HuntFilterDef | undefined {
  return HUNT_FILTERS.find((f) => f.ma === ma)
}

/** Unknown filter codes are never dressed up as a real filter - `null` instead. */
export function huntFilterLabel(ma: string | null | undefined): string | null {
  return huntFilterDef(ma)?.ten ?? null
}

export const NOTABLE_MIN_LOP = 4
export const TONG_SO_LOP = 5

/* ── Formatting ─────────────────────────────────────────────────────────── */

const INT_VI = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })
const INT_EN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const PERCENT_VALUE = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })
const RATIO_PERCENT = new Intl.NumberFormat("vi-VN", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" })

/** `null`/unknown ⇒ "-". Never 0. */
export function formatInt(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? DASH : INT_VI.format(Math.round(value))
}

/** `{n}%` for already-percent numbers; `null` ⇒ "-". */
export function formatRate(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? DASH : `${INT_VI.format(Math.round(value))}%`
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

/** `+950,000đ` / `−50,000đ` / `0đ` - legacy Cấp 1-6 VND rule (U+2212 minus, glued `đ`). */
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

/** `dd/mm` for week labels. */
export function formatDayMonth(value: string | null | undefined): string {
  if (!value) return DASH
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return DASH
  return date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" })
}

/* ── Shared presentation tokens ─────────────────────────────────────────── */

/** Card shell matching the v2 token set (used by every insight block). */
export const CARD = "min-w-0 space-y-2 rounded-lg border border-border bg-card p-3 [&>*]:min-w-0"
export const SECTION_HEADER = "text-xs font-bold tracking-wider text-primary uppercase"
export const NOTE = "text-xs text-muted-foreground"
export const HINT = "text-xs leading-snug text-muted-foreground"

export const LEVEL_NAMES: readonly string[] = [
  "Nhập môn",
  "Học việc",
  "Kỷ luật",
  "Bản lĩnh",
  "Thuần thục",
  "Lão luyện",
  "Bậc thầy",
]

export function levelName(level: number): string {
  return LEVEL_NAMES[level] ?? `Cấp ${level}`
}
