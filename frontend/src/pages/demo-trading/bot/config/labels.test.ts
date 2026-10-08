import { describe, expect, it } from "vitest"

import { buildRegistry } from "../test-support"
import { operandLabel, ruleLine } from "./labels"
import { activeConditions, effectiveText } from "./summary"
import { templateConfig } from "./draft"
import type { SharedConfig } from "./types"

const registry = buildRegistry()
const get = (id: string) => registry.find((entry) => entry.id === id)!

describe("rule labels", () => {
  it("reads RSI rules with the previous-session suffix and the side's own threshold", () => {
    const rsi = get("rsi")
    const buy = rsi.buy.rules.map((rule) => ruleLine(rule, rule.op, rsi, { period: 14, level: 30 }))
    expect(buy).toEqual(["RSI phiên trước < 30", "RSI > RSI phiên trước"])
    const sell = rsi.sell.rules.map((rule) => ruleLine(rule, rule.op, rsi, { period: 14, level: 70 }))
    expect(sell[0]).toBe("RSI phiên trước > 70")
  })

  it("names moving-average series with their period and the Bollinger interval", () => {
    expect(ruleLine(get("ma").buy.rules[0]!, ">", get("ma"), { period: 20 })).toBe("Giá đóng cửa > SMA 20")
    expect(ruleLine(get("ema").sell.rules[0]!, "<", get("ema"), { period: 12 })).toBe("Giá đóng cửa < EMA 12")
    const bollinger = get("bollinger")
    expect(ruleLine(bollinger.buy.rules[1]!, "∉", bollinger, { period: 20, k: 2 })).toBe("Giá đóng cửa ∉ Dải Bollinger")
    expect(ruleLine(bollinger.buy.rules[0]!, "<", bollinger, { period: 20, k: 2 })).toBe("Giá đóng cửa phiên trước < Dải dưới phiên trước")
  })

  it("renders the volume threshold from the side's multiplier and look-back", () => {
    const volume = get("volume")
    expect(ruleLine(volume.buy.rules[1]!, ">", volume, { lookback: 20, mult: 1.5 })).toBe("Khối lượng > 1,5 × TB 20 phiên")
  })

  it("never prints a raw key or a blank for a half-typed param", () => {
    const rsi = get("rsi")
    expect(operandLabel({ kind: "param", key: "level" }, rsi, { level: undefined })).toBe("—")
  })
})

describe("readable conditions of the effective config", () => {
  const configWith = (turnOn: (config: SharedConfig) => void): SharedConfig => {
    const config: SharedConfig = {
      schema_version: "3.0", revision: 3, rule_version: "iqx-rules-3.0",
      indicators: Object.fromEntries(registry.map((entry) => [entry.id, templateConfig(entry)])),
    }
    turnOn(config)
    return config
  }

  it("lists active indicators in registry order with params and rule lines, per side", () => {
    const config = configWith((value) => {
      for (const id of ["ma_cross", "rsi"]) {
        value.indicators[id]!.master_enabled = true
        value.indicators[id]!.buy.enabled = true
      }
      value.indicators.macd!.master_enabled = true
      value.indicators.macd!.sell.enabled = true
    })
    const buy = activeConditions(config, "buy", registry)
    expect(buy.map((item) => item.name)).toEqual(["RSI", "MA Cross"])
    expect(buy[0]!.params).toEqual(["Chu kỳ RSI 14 phiên", "Ngưỡng quá bán 30"])
    expect(buy[0]!.rules).toEqual(["RSI phiên trước < 30", "RSI > RSI phiên trước"])
    expect(buy[1]!.rules).toEqual(["Giao cắt giữa hai phiên: SMA 20 > SMA 50"])
    expect(activeConditions(config, "sell", registry).map((item) => item.name)).toEqual(["MACD"])
  })

  it("ignores indicators whose master is OFF even when a side is ON, and has nothing without a config", () => {
    const config = configWith((value) => { value.indicators.rsi!.buy.enabled = true })
    expect(activeConditions(config, "buy", registry)).toEqual([])
    expect(activeConditions(undefined, "buy", registry)).toEqual([])
  })
})

describe("effective-session text", () => {
  it("separates pending from effective and never guesses without a calendar", () => {
    expect(effectiveText("pending", "2026-10-09")).toBe("Có hiệu lực từ phiên 09/10/2026")
    expect(effectiveText("effective", "2026-10-09")).toBe("Đang có hiệu lực từ phiên 09/10/2026")
    expect(effectiveText("calendar_unavailable", null)).toBe("Chưa xác định phiên hiệu lực vì thiếu lịch giao dịch")
    expect(effectiveText("pending", null)).toBeNull()
  })
})
