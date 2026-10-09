import { describe, expect, it } from "vitest"

import { formatPercentSigned } from "../format"
import { sessionFixture } from "../test-support"
import { reasonLabel, runStatusNote, sessionSource, sessionSummary } from "./session"
import { snapshotSourceText, sourceText } from "./source"

describe("session summary (from the server's counts and reason groups)", () => {
  it("leads with the buys and sells, then the largest non-trade reasons, merging groups that share a label", () => {
    const session = sessionFixture({
      session: "2026-10-07",
      counts: { buy: 1, sell: 2, hold: 3, skip: 28, total: 34 },
      reasons: [
        { action: "buy", reason_code: "buy_all_conditions_met", reason_label: "Mua theo điều kiện Mua", count: 1 },
        { action: "sell", reason_code: "sell_all_conditions_met", reason_label: "Bán theo điều kiện Bán", count: 2 },
        { action: "skip", reason_code: "buy_not_met", reason_label: "Điều kiện Mua chưa đạt", count: 20 },
        { action: "hold", reason_code: "sell_not_met", reason_label: "Điều kiện Bán chưa đạt", count: 3 },
        { action: "skip", reason_code: "buy_not_met_b", reason_label: "Điều kiện Mua chưa đạt", count: 8 },
      ],
    })
    expect(sessionSummary(session)).toBe("Mua 1 · Bán 2 · Điều kiện Mua chưa đạt ×28 · Điều kiện Bán chưa đạt ×3")
  })

  it("counts the rest as «+n lý do khác» and drops a ×1", () => {
    const session = sessionFixture({
      session: "2026-10-07",
      counts: { buy: 0, sell: 0, hold: 0, skip: 4, total: 4 },
      reasons: [
        { action: "skip", reason_code: "a", reason_label: "Lý do A", count: 2 },
        { action: "skip", reason_code: "b", reason_label: "Lý do B", count: 1 },
        { action: "skip", reason_code: "c", reason_label: "Lý do C", count: 1 },
      ],
    })
    expect(sessionSummary(session)).toBe("Lý do A ×2 · Lý do B · +1 lý do khác")
    expect(sessionSummary(session, 3)).toBe("Lý do A ×2 · Lý do B · Lý do C")
  })

  it("shows the reason code when the server has no label, and says so when nothing was decided", () => {
    const withCode = sessionFixture({
      session: "2026-10-07",
      counts: { buy: 0, sell: 0, hold: 0, skip: 1, total: 1 },
      reasons: [{ action: "skip", reason_code: "no_data", reason_label: null, count: 1 }],
    })
    expect(sessionSummary(withCode)).toBe("no_data")
    expect(sessionSummary(sessionFixture({ session: "2026-10-07" }))).toBe("Không có quyết định")
    expect(reasonLabel({ reason_label: "  " }, "raw")).toBe("raw")
  })
})

describe("session source and run status", () => {
  it("names the buy source of the run, and «—» for a run from before sources existed", () => {
    expect(sessionSource({ universe: { kind: "vn30", name: "VN30", revision: 0 } })).toBe("VN30")
    expect(sessionSource({ universe: { kind: "custom", name: "Cổ phiếu ngân hàng", revision: 2 } })).toBe("Cổ phiếu ngân hàng · bản 2")
    expect(sessionSource({ universe: { kind: "custom", name: null, revision: 3 } })).toBe("Danh mục riêng · bản 3")
    expect(sessionSource({ universe: null })).toBe("—")
  })

  it("only a running or failed run needs a note", () => {
    expect(runStatusNote("succeeded")).toBeNull()
    expect(runStatusNote("running")).toBe("Đang xử lý")
    expect(runStatusNote("failed")).toBe("Lỗi xử lý")
  })
})

describe("entry source of a trade or a position", () => {
  it("reads kind, name and revision from the frozen snapshot", () => {
    expect(snapshotSourceText({ kind: "vn30", name: "VN30", revision: 0 })).toBe("VN30")
    expect(snapshotSourceText({ kind: "custom", name: "Cổ phiếu ngân hàng", revision: 2 })).toBe("Cổ phiếu ngân hàng · bản 2")
    expect(snapshotSourceText({ kind: "custom", name: "Cổ phiếu ngân hàng" })).toBe("Cổ phiếu ngân hàng")
    expect(snapshotSourceText({ kind: "custom" })).toBe("Danh mục riêng")
  })

  it("is «—» for a legacy lot without a snapshot or an unknown kind", () => {
    expect(snapshotSourceText(null)).toBe("—")
    expect(snapshotSourceText({})).toBe("—")
    expect(sourceText("legacy", "x")).toBe("—")
  })
})

describe("signed percent already scaled", () => {
  it("keeps the sign, uses the Vietnamese decimal comma and shows an exact zero as 0%", () => {
    expect(formatPercentSigned("2.330782")).toBe("+2,33%")
    expect(formatPercentSigned("-4.912345678901")).toBe("−4,91%")
    expect(formatPercentSigned("0")).toBe("0%")
    expect(formatPercentSigned("0.001")).toBe("0%")
    expect(formatPercentSigned(null)).toBe("—")
  })
})
