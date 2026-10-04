/**
 * Human-readable (Vietnamese) labels for rule operands of the technical registry,
 * ported from the reference UI (`assets/shared.js` → `label`). Param operands show
 * the current draft value of that side.
 */
import type { TechnicalIndicator } from "@/lib/shared-config"

type OperandLike = {
  kind?: string
  key?: string
  offset?: number
  value?: number
  lower?: OperandLike
  upper?: OperandLike
}

const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 })

function formatValue(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? numberFormat.format(value) : "—"
}

function seriesName(key: string, indicator: TechnicalIndicator, params: Record<string, number | undefined>): string {
  const id = indicator.id
  const p = (name: string) => formatValue(params[name])
  switch (key) {
    case "close": return "Giá đóng cửa"
    case "volume": return "Khối lượng"
    case "high": return "Giá cao nhất"
    case "low": return "Giá thấp nhất"
    case "index": return "VN-Index"
    case "plus": return "+DI"
    case "minus": return "−DI"
    case "upper": return id === "donchian" ? "Dải trên Donchian" : id === "keltner" ? "Dải trên Keltner" : "Dải trên"
    case "lower": return id === "donchian" ? "Dải dưới Donchian" : id === "keltner" ? "Dải dưới Keltner" : "Dải dưới"
    case "signal": return id === "stochastic" ? "%D" : "Đường tín hiệu"
    case "fast": return `SMA${p("fast")}`
    case "slow": return `SMA${p("slow")}`
    case "threshold": return `${p("mult")} × Khối lượng TB${p("lookback")}`
    case "baseline":
      return id === "obv" ? `SMA OBV ${p("baseline")}` : id === "ad_line" ? `SMA độ rộng ${p("baseline")}` : `ATR trung bình ${p("baseline")}`
    case "value":
      return id === "ma" ? `SMA${p("period")}` : id === "ema" ? `EMA${p("period")}` : id === "index_ma" ? `MA${p("period")}` : id === "stochastic" ? "%K" : indicator.name
    default: return key
  }
}

export function operandLabel(operand: unknown, indicator: TechnicalIndicator, params: Record<string, number | undefined>): string {
  const value = (operand ?? {}) as OperandLike
  if (value.kind === "param") return formatValue(params[value.key ?? ""])
  if (value.kind === "constant") return formatValue(value.value)
  if (value.kind === "series") {
    return `${seriesName(value.key ?? "", indicator, params)}${value.offset === -1 ? " phiên trước" : ""}`
  }
  if (value.lower && value.upper) {
    return `khoảng (${operandLabel(value.lower, indicator, params)}; ${operandLabel(value.upper, indicator, params)})`
  }
  return "—"
}

/** Draft param text → numbers for labels (invalid text becomes undefined → "—"). */
export function numericParams(params: Record<string, string>): Record<string, number | undefined> {
  return Object.fromEntries(Object.entries(params).map(([key, text]) => {
    const value = text.trim() === "" ? Number.NaN : Number(text)
    return [key, Number.isFinite(value) ? value : undefined]
  }))
}

const CAPABILITY_PREFIX: Record<string, string> = {
  indicator: "Chỉ báo",
  metric: "Chỉ tiêu cơ bản",
  lesson: "Bài học",
}

/** `indicator:rsi` → "Chỉ báo · RSI" (name lookup when known). */
export function capabilityLabel(capability: string, names: ReadonlyMap<string, string>): string {
  const [prefix, ...rest] = capability.split(":")
  const id = rest.join(":")
  const kind = CAPABILITY_PREFIX[prefix]
  if (!kind || !id) return capability
  return `${kind} · ${names.get(capability) ?? id}`
}
