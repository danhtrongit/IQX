import { describe, expect, it } from "vitest"

import { buildRegistry, createWorld, rowsOf } from "../test-support"
import { activeConditions, effectiveConfigOf, effectiveText, pendingConfigOf, pendingStartText } from "./summary"
import type { SharedConfig, SharedConfigState } from "./types"

const registry = buildRegistry()

function config(revision: number, edit: (indicators: SharedConfig["indicators"]) => void = () => {}): SharedConfig {
  const { indicators } = createWorld()
  edit(indicators)
  return { schema_version: "3.0", revision, rule_version: "iqx-rules-4.0", indicators }
}

function state(partial: Partial<SharedConfigState> & Pick<SharedConfigState, "saved_revision">): SharedConfigState {
  return {
    effective_revision: null, effective_session: null, status: "pending", config: config(partial.saved_revision), config_hash: `h${partial.saved_revision}`,
    registry_version: "iqx-ta-2.0", granted_indicators: [], legacy: null, ...partial,
  }
}

const rsiBuy = (level: number) => (indicators: SharedConfig["indicators"]) => {
  indicators.rsi!.master_enabled = true
  indicators.rsi!.buy.enabled = true
  rowsOf(indicators.rsi!, "buy").rules[0]!.threshold = level
}

describe("effective config", () => {
  it("is the server's `effective` block, not the latest saved config", () => {
    const value = state({
      saved_revision: 5, effective_revision: 4, effective_session: "2026-10-09", config: config(5, rsiBuy(20)), config_hash: "h5",
      effective: { revision: 4, effective_session: "2026-10-01", config_hash: "h4", config: config(4, rsiBuy(25)), legacy: null },
    })
    const effective = effectiveConfigOf(value)
    expect(effective).toMatchObject({ revision: 4, session: "2026-10-01" })
    expect(activeConditions(effective!.config, "buy", registry)[0]?.rules).toContain("RSI 14 < 25")
  })

  it("is null before any revision is in force, and null for a missing state", () => {
    expect(effectiveConfigOf(state({ saved_revision: 1, effective: null }))).toBeNull()
    expect(effectiveConfigOf(undefined)).toBeNull()
  })

  it("from a response without the field, trusts the saved config only when it is the effective revision", () => {
    expect(effectiveConfigOf(state({ saved_revision: 3, effective_revision: 3, effective_session: "2026-10-01" }))).toMatchObject({ revision: 3 })
    expect(effectiveConfigOf(state({ saved_revision: 5, effective_revision: 4 }))).toBeNull()
    expect(effectiveConfigOf(state({ saved_revision: 0 }))).toBeNull()
  })
})

describe("pending config", () => {
  const inForce = { revision: 4, effective_session: "2026-10-01", config_hash: "h4", config: config(4, rsiBuy(25)), legacy: null }

  it("is the saved revision that is newer than the one in force and starts from the saved revision's session", () => {
    const pending = pendingConfigOf(state({ saved_revision: 5, effective_revision: 4, effective_session: "2026-10-09", config: config(5, rsiBuy(20)), config_hash: "h5", effective: inForce }))
    expect(pending).toMatchObject({ revision: 5, session: "2026-10-09", calendarUnavailable: false })
    expect(pendingStartText(pending!)).toBe("Chờ hiệu lực từ phiên 09/10/2026")
  })

  it("is nothing when the saved revision is the one in force, never saved, or has the same content", () => {
    expect(pendingConfigOf(state({ saved_revision: 4, effective_revision: 4, status: "effective", config_hash: "h4", effective: inForce }))).toBeNull()
    expect(pendingConfigOf(state({ saved_revision: 0 }))).toBeNull()
    expect(pendingConfigOf(state({ saved_revision: 5, effective_revision: 4, effective_session: "2026-10-09", config_hash: "h4", effective: inForce }))).toBeNull()
    expect(pendingConfigOf(undefined)).toBeNull()
  })

  it("with nothing in force yet, the first saved revision is the pending one", () => {
    const pending = pendingConfigOf(state({ saved_revision: 1, effective_session: "2026-10-09", effective: null }))
    expect(pending).toMatchObject({ revision: 1, session: "2026-10-09" })
  })

  it("never guesses a session when the trading calendar is missing", () => {
    const pending = pendingConfigOf(state({ saved_revision: 1, status: "calendar_unavailable", effective_session: null, effective: null }))
    expect(pending).toMatchObject({ revision: 1, session: null, calendarUnavailable: true })
    expect(pendingStartText(pending!)).toBe("Chờ hiệu lực · chưa xác định phiên bắt đầu vì thiếu lịch giao dịch")
  })

  it("from a response without the field: not pending when saved is effective, pending otherwise", () => {
    expect(pendingConfigOf(state({ saved_revision: 3, effective_revision: 3, status: "effective", effective_session: "2026-10-01" }))).toBeNull()
    expect(pendingConfigOf(state({ saved_revision: 5, effective_revision: 4, effective_session: "2026-10-09" }))).toMatchObject({ revision: 5 })
  })
})

describe("readable conditions", () => {
  it("lists the enabled rows of the active indicators as sentences with their own values, in registry order", () => {
    const value = config(3, (indicators) => {
      for (const id of ["ma_cross", "rsi"]) {
        indicators[id]!.master_enabled = true
        indicators[id]!.buy.enabled = true
      }
      rowsOf(indicators.rsi!, "buy").rules[1]!.period = 9
      indicators.macd!.master_enabled = true
      indicators.macd!.sell.enabled = true
    })
    const buy = activeConditions(value, "buy", registry)
    expect(buy.map((item) => item.name)).toEqual(["RSI", "MA Cross"])
    expect(buy[0]).toMatchObject({ params: [], rules: ["RSI 14 < 30", "RSI 9 xu hướng lên"] })
    expect(buy[1]!.rules).toEqual(["SMA 20 cắt lên SMA 50"])
    expect(activeConditions(value, "sell", registry)).toEqual([{ id: "macd", name: "MACD", params: [], rules: ["MACD 12 / 26 cắt xuống Signal 9"] }])
  })

  it("ignores a master OFF, omits rows that are off and hides a tab whose rows are all off", () => {
    expect(activeConditions(config(3, (indicators) => { indicators.rsi!.buy.enabled = true }), "buy", registry)).toEqual([])
    const value = config(3, (indicators) => {
      indicators.rsi!.master_enabled = true
      indicators.rsi!.buy.enabled = true
      rowsOf(indicators.rsi!, "buy").rules[1]!.enabled = false
    })
    expect(activeConditions(value, "buy", registry)[0]!.rules).toEqual(["RSI 14 < 30"])
    rowsOf(value.indicators.rsi!, "buy").rules[0]!.enabled = false
    expect(activeConditions(value, "buy", registry)).toEqual([])
    expect(activeConditions(undefined, "buy", registry)).toEqual([])
  })

  it("keeps Volume's param chips and rule lines", () => {
    const value = config(3, (indicators) => {
      indicators.volume!.master_enabled = true
      indicators.volume!.buy.enabled = true
    })
    expect(activeConditions(value, "buy", registry)[0]).toMatchObject({
      name: "Khối lượng",
      params: ["Số phiên tham chiếu 20 phiên", expect.stringMatching(/^Hệ số/)],
      rules: ["Giá đóng cửa > Giá đóng cửa phiên trước", "Khối lượng > 1 × TB 20 phiên"],
    })
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
