import { describe, expect, it } from "vitest"
import {
  GBAR_TAG,
  TASK4_GBAR_MESSAGE,
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

  // ★ Nhiệm vụ ① là TWO steps, không còn ba: bước ★ ("Mở 👁 Danh mục xem tab
  // Nắm giữ, rồi quay lại Đặt lệnh gắn ★ cạnh VNM") đã tách ra thành nhiệm vụ
  // ② và ③ riêng. ① giờ là chip lý do + mua, hết.
  it("★ has exactly TWO steps — the ★ / Nắm giữ step is now nhiệm vụ ②③ of its own", () => {
    expect(gbarStepMessage(1)).toBe(
      "Bước 1/2 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
    )
    expect(gbarStepMessage(2)).toBe("Bước 2/2 — Bấm ĐẶT LỆNH MUA để mua 100 VNM")
    expect(gbarStepMessage(1)).not.toContain("/3")
    expect(gbarStepMessage(2)).not.toContain("/3")
    expect(gbarStepMessage(2)).not.toContain("★")
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

  it("both flags set → gbarStep is null (task done) and bar is hidden", () => {
    const s = apply(initialGbarState, { type: "REASON_PICKED" }, { type: "ORDER_FILLED" })
    expect(gbarStep(s)).toBeNull()
    expect(gbarVisible(s)).toBe(false)
    expect(gbarText(s)).toBeNull()
  })

  it("TASK_DONE hides the bar regardless of flags", () => {
    const s = apply(initialGbarState, { type: "TASK_DONE" })
    expect(gbarVisible(s)).toBe(false)
    expect(gbarText(s)).toBeNull()
  })

  it("WARN flips tone to warn and prefixes the current step's message with «⚠ »", () => {
    const s = apply(initialGbarState, { type: "WARN" })
    expect(s.tone).toBe("warn")
    expect(gbarText(s)).toBe(
      "⚠ Bước 1/2 — Chọn 1 lý do trong khối KẾ HOẠCH (panel Đặt lệnh) trước khi mua",
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

// ── Nhiệm vụ ④ (Bán — Kết sổ) ────────────────────────────────────────────────
// Một lời nhắc đứng yên, không có gì để tuần tự. Nhiệm vụ này từng là ⑥ rồi ⑤;
// nó lùi về ④ khi Chặng 2 (ba tour sản phẩm) bị bỏ khỏi Cấp 0.
describe("nhiệm vụ ④ gbar message (spec §6)", () => {
  it("★ is verbatim spec §6's bán/Kết sổ line", () => {
    expect(TASK4_GBAR_MESSAGE).toBe(
      "Chọn lệnh trong Nắm giữ và bấm Bán để khép vòng đời lệnh đầu tiên",
    )
  })

  it("★ names no cắt lỗ / chốt lời — Cấp 0 has neither", () => {
    expect(TASK4_GBAR_MESSAGE).not.toContain("cắt lỗ")
    expect(TASK4_GBAR_MESSAGE).not.toContain("chốt lời")
    expect(TASK4_GBAR_MESSAGE).not.toContain("Bước")
    expect(TASK4_GBAR_MESSAGE).not.toContain("lệnh thứ hai")
  })
})
