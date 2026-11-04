import { describe, expect, it } from "vitest"

import { sessionCaption, technicalCellView } from "./technical-cell"
import type { TechnicalCell } from "./types"

const cell = (partial: Partial<TechnicalCell>): TechnicalCell =>
  ({ key: "rsi.level", indicator: "rsi", row_id: "rsi.level", label: "RSI14", status: "ok", result: true, op: "<", value: 28.4, value2: null, value3: null, display: "28,4", sort_value: 28.4, previous: null, lag: null, params: {}, ...partial }) as TechnicalCell

describe("technicalCellView", () => {
  it("shows the value at T and says nothing under a row that is true", () => {
    expect(technicalCellView(cell({}))).toMatchObject({ text: "28,4", caption: null, ok: true, verdict: "pass" })
  })

  it("marks a row that is false with its own caption and keeps its value", () => {
    expect(technicalCellView(cell({ result: false }))).toMatchObject({ text: "28,4", caption: "Không đạt", ok: true, verdict: "fail" })
  })

  it("shows both sides of a comparison as the server wrote them", () => {
    expect(technicalCellView(cell({ display: "0,41 / 0,28" })).text).toBe("0,41 / 0,28")
  })

  it("turns NO_SIGNAL into a dash and its reason, never a value or a pass", () => {
    const view = technicalCellView(cell({ status: "missing", result: null, display: null, value: null, reason: "Chưa đủ số phiên.", reason_code: "insufficient_price_history" }))
    expect(view).toMatchObject({ text: "—", caption: "Chưa đủ lịch sử giá", ok: false, verdict: "none", title: "Chưa đủ số phiên." })
  })

  it("treats a missing cell like a NO_SIGNAL, and a session without a bar with its own reason", () => {
    expect(technicalCellView(undefined)).toMatchObject({ text: "—", caption: "Chưa đủ lịch sử giá", verdict: "none" })
    expect(technicalCellView(cell({ status: "missing", result: null, display: null, reason_code: "no_session_bar" })).caption).toBe("Không có giá của phiên đã đóng cửa")
  })
})

describe("sessionCaption", () => {
  it("writes the session under a column title as phiên dd/mm", () => {
    expect(sessionCaption("2026-10-07")).toBe("phiên 07/10")
    expect(sessionCaption(null)).toBeNull()
    expect(sessionCaption("not a date")).toBeNull()
  })
})
