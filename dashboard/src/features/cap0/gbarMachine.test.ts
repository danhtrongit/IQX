import { describe, expect, it } from "vitest"
import {
  GBAR_TAG,
  gbarReducer,
  gbarStep,
  gbarStepMessage,
  gbarText,
  gbarVisible,
  initialGbarState,
  type GbarState,
} from "./gbarMachine"

function apply(state: GbarState, ...actions: Parameters<typeof gbarReducer>[1][]): GbarState {
  return actions.reduce(gbarReducer, state)
}

describe("gbarMachine", () => {
  it("starts at step 1 (chưa chọn lý do), visible, amber tone", () => {
    expect(gbarStep(initialGbarState)).toBe(1)
    expect(gbarVisible(initialGbarState)).toBe(true)
    expect(initialGbarState.tone).toBe("amber")
  })

  it("tag is verbatim spec §6 «CẦN LÀM»", () => {
    expect(GBAR_TAG).toBe("CẦN LÀM")
  })

  it("step messages are verbatim spec §6", () => {
    expect(gbarStepMessage(1)).toBe(
      "Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
    )
    expect(gbarStepMessage(2)).toBe("Bước 2/3 — Bấm ĐẶT LỆNH MUA để mua 100 VNM")
    expect(gbarStepMessage(3)).toBe(
      "Bước 3/3 — Mở 👁 Danh mục xem tab Nắm giữ, rồi quay lại Đặt lệnh gắn ★ cạnh VNM",
    )
  })

  it("REASON_PICKED advances step 1 → 2", () => {
    const s = apply(initialGbarState, { type: "REASON_PICKED" })
    expect(gbarStep(s)).toBe(2)
  })

  it("ORDER_FILLED alone (reason not picked) does NOT skip ahead of step 1", () => {
    const s = apply(initialGbarState, { type: "ORDER_FILLED" })
    // The flag is recorded, but `gbarStep` reports the first MISSING flag —
    // reason is still missing, so it stays on step 1.
    expect(gbarStep(s)).toBe(1)
  })

  it("REASON_PICKED then ORDER_FILLED advances step 2 → 3", () => {
    const s = apply(initialGbarState, { type: "REASON_PICKED" }, { type: "ORDER_FILLED" })
    expect(gbarStep(s)).toBe(3)
  })

  it("all 3 flags set → gbarStep is null (task done) and bar is hidden", () => {
    const s = apply(
      initialGbarState,
      { type: "REASON_PICKED" },
      { type: "ORDER_FILLED" },
      { type: "STAR_TOGGLED" },
    )
    expect(gbarStep(s)).toBeNull()
    expect(gbarVisible(s)).toBe(false)
    expect(gbarText(s)).toBeNull()
  })

  it("TASK_DONE hides the bar regardless of flags", () => {
    const s = apply(initialGbarState, { type: "TASK_DONE" })
    expect(gbarVisible(s)).toBe(false)
    expect(gbarText(s)).toBeNull()
  })

  it("out-of-order: STAR_TOGGLED before reason/order still resolves to step 1 (next missing gap)", () => {
    const s = apply(initialGbarState, { type: "STAR_TOGGLED" })
    expect(gbarStep(s)).toBe(1)
  })

  it("WARN flips tone to warn and prefixes the current step's message with «⚠ »", () => {
    const s = apply(initialGbarState, { type: "WARN" })
    expect(s.tone).toBe("warn")
    expect(gbarText(s)).toBe(
      "⚠ Bước 1/3 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
    )
  })

  it("WARN_TIMEOUT reverts tone to amber but the bar stays visible on the same step", () => {
    const warned = apply(initialGbarState, { type: "WARN" })
    const recovered = gbarReducer(warned, { type: "WARN_TIMEOUT" })
    expect(recovered.tone).toBe("amber")
    expect(gbarStep(recovered)).toBe(1)
    expect(gbarText(recovered)).toBe(gbarStepMessage(1))
  })

  it("WARN_TIMEOUT is a no-op when tone is already amber", () => {
    const s = gbarReducer(initialGbarState, { type: "WARN_TIMEOUT" })
    expect(s).toBe(initialGbarState)
  })

  it("warn tone persists across a legitimate step advance until explicitly timed out", () => {
    // Not part of the spec'd UX (a real advance always follows a *correct*
    // action, which the caller wouldn't warn on) — this just documents that
    // `tone` and the flags are independent axes in the reducer.
    const s = apply(initialGbarState, { type: "WARN" }, { type: "REASON_PICKED" })
    expect(s.tone).toBe("warn")
    expect(gbarStep(s)).toBe(2)
  })

  it("repeated identical flag actions are idempotent (no unnecessary object churn)", () => {
    const once = gbarReducer(initialGbarState, { type: "REASON_PICKED" })
    const twice = gbarReducer(once, { type: "REASON_PICKED" })
    expect(twice).toBe(once)
  })
})
