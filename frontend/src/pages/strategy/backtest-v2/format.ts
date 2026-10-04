/**
 * Formatting for Backtest v2. KPI and curve values are already in percent
 * units (12.5 = +12,5%), unlike the legacy lab whose KPIs are ratios.
 * Missing values always render "—", never 0.
 */
import type { Operand, Rule, Side, TechnicalIndicator } from "@/lib/shared-config"

export const SIDE_LABEL: Record<Side, string> = { buy: "Mua", sell: "Bán" }

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

export function fmtNumberVN(value: number | null | undefined, digits = 2): string {
  return isNumber(value) ? value.toLocaleString("vi-VN", { maximumFractionDigits: digits }) : "—"
}

/** Signed percent from a value already expressed in percent units. */
export function fmtPercent(value: number | null | undefined, digits = 2): string {
  if (!isNumber(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

/** Unsigned percent (win rate). */
export function fmtPlainPercent(value: number | null | undefined, digits = 1): string {
  return isNumber(value) ? `${value.toLocaleString("vi-VN", { maximumFractionDigits: digits })}%` : "—"
}

export function fmtMoney(value: number | null | undefined): string {
  return isNumber(value) ? `${Math.round(value).toLocaleString("vi-VN")} đ` : "—"
}

export function fmtCount(value: number | null | undefined): string {
  return isNumber(value) ? Math.round(value).toLocaleString("vi-VN") : "—"
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const [year, month, day] = iso.slice(0, 10).split("-")
  return day && month && year ? `${day}/${month}/${year}` : iso
}

export function toneOf(value: number | null | undefined): "up" | "down" | null {
  if (!isNumber(value) || value === 0) return null
  return value > 0 ? "up" : "down"
}

const EXIT_REASONS: Record<string, string> = {
  sell_consensus: "Hợp lưu Bán",
  stop_loss: "Cắt lỗ",
  take_profit: "Chốt lời",
  trailing: "Trailing stop",
  max_holding: "Hết thời gian giữ",
  universe_removal: "Rời danh sách",
  portfolio_drawdown: "Dừng theo sụt giảm danh mục",
  rebalance: "Tái cân bằng",
}

export function exitReasonLabel(reason: string): string {
  return EXIT_REASONS[reason] ?? reason
}

const SERIES_NAMES: Record<string, string> = {
  close: "Giá đóng cửa",
  open: "Giá mở cửa",
  volume: "Khối lượng",
  high: "Giá cao nhất",
  low: "Giá thấp nhất",
  index: "VN-Index",
  plus: "+DI",
  minus: "−DI",
}

function seriesName(key: string, indicator: TechnicalIndicator, params: Record<string, number>): string {
  const p = (name: string) => (isNumber(params[name]) ? String(params[name]) : "?")
  switch (key) {
    case "upper":
      return indicator.id === "donchian" ? "Dải trên Donchian" : indicator.id === "keltner" ? "Dải trên Keltner" : "Dải trên"
    case "lower":
      return indicator.id === "donchian" ? "Dải dưới Donchian" : indicator.id === "keltner" ? "Dải dưới Keltner" : "Dải dưới"
    case "signal":
      return indicator.id === "stochastic" ? "%D" : "Đường tín hiệu"
    case "fast":
      return `SMA${p("fast")}`
    case "slow":
      return `SMA${p("slow")}`
    case "threshold":
      return `${p("mult")} × Khối lượng TB${p("lookback")}`
    case "baseline":
      return indicator.id === "obv"
        ? `SMA OBV ${p("baseline")}`
        : indicator.id === "ad_line"
          ? `SMA độ rộng ${p("baseline")}`
          : `ATR trung bình ${p("baseline")}`
    case "value":
      if (indicator.id === "ma") return `SMA${p("period")}`
      if (indicator.id === "ema") return `EMA${p("period")}`
      if (indicator.id === "index_ma") return `MA${p("period")}`
      if (indicator.id === "stochastic") return "%K"
      return indicator.name
    default:
      return SERIES_NAMES[key] ?? key
  }
}

/** Human label of one rule operand (current params of that side). */
export function operandLabel(operand: Operand | Record<string, unknown>, indicator: TechnicalIndicator, params: Record<string, number>): string {
  const value = operand as Operand
  if (value.kind === "param") return fmtNumberVN(params[value.key])
  if (value.kind === "constant") return fmtNumberVN(value.value)
  if (value.kind === "series") {
    return `${seriesName(value.key, indicator, params)}${value.offset === -1 ? " phiên trước" : ""}`
  }
  return indicator.id === "bollinger" ? "Dải Bollinger" : "Khoảng"
}

/** Right-hand side label; membership rules compare against an interval. */
export function ruleRhsLabel(rule: Rule, indicator: TechnicalIndicator, params: Record<string, number>): string {
  if (rule.kind === "membership") {
    const rhs = rule.rhs as { lower?: Operand; upper?: Operand }
    if (indicator.id === "bollinger") return "Dải Bollinger"
    const lower = rhs.lower ? operandLabel(rhs.lower, indicator, params) : "?"
    const upper = rhs.upper ? operandLabel(rhs.upper, indicator, params) : "?"
    return `(${lower}; ${upper})`
  }
  return operandLabel(rule.rhs, indicator, params)
}

export const OPERATOR_LABELS: Record<string, string> = {
  ">": "> lớn hơn",
  "<": "< nhỏ hơn",
  "∈": "∈ nằm trong",
  "∉": "∉ nằm ngoài",
}
