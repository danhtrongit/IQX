import { describe, expect, it } from "vitest"

import type { BotConditions, BotJournalItem } from "../types"
import { executionRows } from "./history"
import { groupJournal, sessionSummary } from "./journal"
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

function decision(partial: Partial<BotJournalItem> & Pick<BotJournalItem, "id" | "trading_date" | "action">): BotJournalItem {
  return {
    condition_snapshot: null, created_at: `${partial.trading_date}T12:00:00Z`, decision_config_revision: 3, execution: null, in_universe: true,
    legacy_filter_ids: [], legacy_threshold_vnd: null, policy_version: "iqx-bot-v1.0", rank_tuple: null, reason: "raw", reason_code: "x",
    reason_label: null, run_id: "r", source_refs: {}, symbol: null, universe_kind: "vn30", universe_revision: 0, ...partial,
  }
}
const execution = (side: "buy" | "sell", net: string) => ({ id: "e", side, qty: 100, price_vnd: "10000", gross_value_vnd: "1000000", fee_vnd: "1500", tax_vnd: "0", net_cash_delta_vnd: net })

describe("journal per session", () => {
  const items = [
    decision({ id: "3", trading_date: "2026-10-07", action: "skip", symbol: "HPG", reason_label: "Điều kiện Mua chưa đạt" }),
    decision({ id: "2", trading_date: "2026-10-07", action: "skip", symbol: "MWG", reason_label: "Điều kiện Mua chưa đạt" }),
    decision({ id: "1", trading_date: "2026-10-06", action: "buy", symbol: "FPT", reason_label: "Mua theo điều kiện Mua", execution: execution("buy", "-1001500") }),
  ]

  it("groups decisions by session, newest first, with the server's reason labels counted", () => {
    const sessions = groupJournal(items)
    expect(sessions.map((session) => session.date)).toEqual(["2026-10-07", "2026-10-06"])
    expect(sessionSummary(sessions[0]!)).toBe("Điều kiện Mua chưa đạt ×2")
    expect(sessionSummary(sessions[1]!)).toBe("Mua 1")
    expect(sessions[0]).toMatchObject({ source: "VN30", revision: 3 })
  })

  it("falls back to the server's own text when a code has no label", () => {
    const [session] = groupJournal([decision({ id: "9", trading_date: "2026-10-07", action: "hold", symbol: "FPT", reason: "Giữ FPT" })])
    expect(session?.reasons).toEqual([{ label: "Giữ FPT", count: 1 }])
  })
})

describe("history pairing", () => {
  it("pairs a sell with the buy it closed and derives the realized P&L, leaving unpaired sells unknown", () => {
    const items = [
      decision({ id: "4", trading_date: "2026-10-07", action: "sell", symbol: "FPT", created_at: "2026-10-07T12:00:00Z", execution: execution("sell", "1098000") }),
      decision({ id: "3", trading_date: "2026-10-01", action: "buy", symbol: "FPT", created_at: "2026-10-01T12:00:00Z", execution: execution("buy", "-1001500") }),
      decision({ id: "2", trading_date: "2026-10-06", action: "sell", symbol: "ACB", created_at: "2026-10-06T12:00:00Z", execution: execution("sell", "500000") }),
    ]
    const rows = executionRows(items)
    expect(rows.map((row) => row.id)).toEqual(["4", "2", "3"])
    expect(rows[0]).toMatchObject({ realizedPnl: 96500, entryCost: 1001500, openedSession: "2026-10-01" })
    expect(rows[1]?.realizedPnl).toBeNull()
    expect(rows[2]?.realizedPnl).toBeNull()
  })
})
