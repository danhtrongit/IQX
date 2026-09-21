import { describe, expect, it } from "vitest"
import {
  GBAR_TAG,
  TASK5_GBAR_MESSAGE,
  gbarReducer,
  gbarStep,
  gbarStepMessage,
  gbarText,
  gbarVisible,
  initialGbarState,
  type GbarState,
} from "./gbarMachine"

function apply(state: GbarState, ...actions: Parameters<typeof gbarReducer>[1][]) {
  return actions.reduce(gbarReducer, state)
}

describe("gbarMachine — nhiệm vụ 1", () => {
  it("starts visible at step 1/3", () => {
    expect(GBAR_TAG).toBe("CẦN LÀM")
    expect(gbarStep(initialGbarState)).toBe(1)
    expect(gbarVisible(initialGbarState)).toBe(true)
    expect(gbarStepMessage(1)).toBe(
      "Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
    )
  })

  it("moves through reason, filled buy and watchlist star", () => {
    const afterReason = apply(initialGbarState, { type: "REASON_PICKED" })
    expect(gbarStep(afterReason)).toBe(2)
    expect(gbarStepMessage(2)).toBe("Bước 2/3 — Bấm ĐẶT LỆNH MUA để mua 100 VNM")

    const afterBuy = apply(afterReason, { type: "ORDER_FILLED" })
    expect(gbarStep(afterBuy)).toBe(3)
    expect(gbarStepMessage(3)).toContain("gắn ★ cạnh VNM")

    const complete = apply(afterBuy, { type: "STAR_TOGGLED" })
    expect(gbarStep(complete)).toBeNull()
    expect(gbarVisible(complete)).toBe(false)
    expect(gbarText(complete)).toBeNull()
  })

  it("always reports the first missing gate", () => {
    expect(gbarStep(apply(initialGbarState, { type: "ORDER_FILLED" }, { type: "STAR_TOGGLED" }))).toBe(1)
  })

  it("warns on the current step and returns to amber", () => {
    const warned = apply(initialGbarState, { type: "WARN" })
    expect(warned.tone).toBe("warn")
    expect(gbarText(warned)).toMatch(/^⚠ Bước 1\/3/)
    const recovered = gbarReducer(warned, { type: "WARN_TIMEOUT" })
    expect(recovered.tone).toBe("amber")
    expect(gbarStep(recovered)).toBe(1)
  })

  it("keeps repeated flag actions idempotent", () => {
    const once = gbarReducer(initialGbarState, { type: "STAR_TOGGLED" })
    expect(gbarReducer(once, { type: "STAR_TOGGLED" })).toBe(once)
  })
})

describe("nhiệm vụ 5 reminder", () => {
  it("uses the exact sell/Kết sổ instruction and introduces no SL/TP", () => {
    expect(TASK5_GBAR_MESSAGE).toBe(
      "Chọn lệnh trong Nắm giữ và bấm Bán để khép vòng đời lệnh đầu tiên",
    )
    expect(TASK5_GBAR_MESSAGE).not.toMatch(/cắt lỗ|chốt lời|Bước/)
  })
})
