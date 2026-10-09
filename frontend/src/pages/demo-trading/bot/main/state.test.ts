import { describe, expect, it } from "vitest"

import type { BotConditions } from "../types"
import { configStateChip, pendingConfigNote } from "./state"

function conditions(partial: Partial<BotConditions> = {}): BotConditions {
  return {
    state: "waiting_for_conditions", state_label: "Chờ thiết lập điều kiện", has_active_buy: false, has_active_sell: false,
    buy_condition_count: 0, sell_condition_count: 0, buy_status: "inactive", sell_status: "inactive", errors: { buy: null, sell: null },
    saved_revision: null, effective_revision: null, effective_session: null, config_status: "none", pending: null, open_positions: 0, ...partial,
  }
}

describe("config state chip", () => {
  it.each([
    ["waiting_for_conditions", "Chờ thiết lập điều kiện", "info"],
    ["buy_only", "Đã bật điều kiện Mua", "good"],
    ["sell_only", "Chỉ xét điều kiện Bán", "info"],
    ["buy_and_sell", "Đã bật Mua và Bán", "good"],
    ["error", "Lỗi cấu hình hoặc quyền", "danger"],
  ] as const)("maps %s to its label and tone", (state, label, tone) => {
    expect(configStateChip(conditions({ state }))).toMatchObject({ label, tone })
  })

  it("explains an error with the blocked side's detail", () => {
    const chip = configStateChip(conditions({
      state: "error",
      errors: { buy: { reason: "config_invalid_or_unauthorized", detail: "Chỉ báo RSI chưa được cấp quyền", indicator_ids: ["rsi"] }, sell: null },
    }))
    expect(chip.detail).toBe("Mua: Chỉ báo RSI chưa được cấp quyền")
  })

  it("does not read an unknown state as waiting, and has a muted chip without conditions", () => {
    expect(configStateChip(conditions({ state: "entry_enabled" as BotConditions["state"], state_label: "Đang xử lý" }))).toMatchObject({ label: "Đang xử lý", tone: "muted" })
    expect(configStateChip(null)).toMatchObject({ label: "Chưa xác định điều kiện", tone: "muted" })
  })
})

describe("pending config note", () => {
  it("names the saved and the still-effective revision and the session the change starts", () => {
    const note = pendingConfigNote(conditions({
      saved_revision: 5, effective_revision: 4, pending: { revision: 5, effective_session: "2026-10-09", status: "pending" },
    }))
    expect(note).toBe("Đã lưu cấu hình bản 5. Bản 4 vẫn đang có hiệu lực; thay đổi bắt đầu từ phiên 09/10/2026.")
  })

  it("reports a missing trading calendar instead of guessing a session", () => {
    const note = pendingConfigNote(conditions({
      saved_revision: 1, effective_revision: null, pending: { revision: 1, effective_session: null, status: "calendar_unavailable" },
    }))
    expect(note).toBe("Đã lưu cấu hình bản 1. Chưa có bản nào đang hiệu lực; chưa xác định phiên bắt đầu vì thiếu lịch giao dịch.")
  })

  it("is empty when nothing is waiting", () => {
    expect(pendingConfigNote(conditions())).toBeNull()
    expect(pendingConfigNote(null)).toBeNull()
  })
})
