import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api"

import {
  adaptPatternLookup,
  adaptPatternOverview,
  adaptPatternStatus,
  readPatternFailedSymbols,
  readPatternRunError,
} from "./flashback-patterns-api"
import {
  describeRecomputeError,
  formatPatternDate,
  groupPatternCardsByTier,
  patternRunPercent,
  patternRunState,
  patternTierInfo,
  validatePatternLookup,
} from "./flashback-patterns-format"
import {
  patternLookupWire,
  patternOverviewWire,
  patternRunWire,
  patternStatusWire,
} from "./flashback-patterns-test-support"

const status = (over: Parameters<typeof patternStatusWire>[0] = {}) =>
  adaptPatternStatus(patternStatusWire(over) as Parameters<typeof adaptPatternStatus>[0])

describe("đọc dữ liệu mẫu nến", () => {
  it("đổi trạng thái, tra cứu và tổng quan sang tên dùng trong giao diện", () => {
    const adapted = status({ warnings: [{ code: "pattern_missing", level: "medium", message: "Thiếu", at: null }] })
    expect(adapted).toMatchObject({
      version: 3,
      detectorVersion: 1,
      outdated: false,
      raw: { symbols: 97, sessions: 320_000 },
      warnings: [{ code: "pattern_missing", level: "medium", message: "Thiếu", at: null }],
    })
    expect(adapted.used).toMatchObject({ id: 11, patternsCount: 482_310, failedCount: 0, durationMs: 125_000 })

    const lookup = adaptPatternLookup(patternLookupWire() as Parameters<typeof adaptPatternLookup>[0])
    expect(lookup.total).toBe(26)
    expect(lookup.cards[0]).toEqual({ cardId: "doji", name: "Doji", tier: 1, count: 14 })

    const overview = adaptPatternOverview(patternOverviewWire() as Parameters<typeof adaptPatternOverview>[0])
    expect(overview.zeroCount).toBe(2)
    expect(overview.cards.find((card) => card.cardId === "tran_trang")).toMatchObject({ vn: true, zero: true })
  })

  it("nhật ký lần tính tự do: khoá thiếu hoặc sai kiểu bị bỏ, không ném lỗi", () => {
    expect(readPatternRunError({ error: "hết bộ nhớ" })).toBe("hết bộ nhớ")
    expect(readPatternRunError({ error: "  " })).toBeNull()
    expect(readPatternRunError({ error: 12 })).toBeNull()
    expect(readPatternRunError(undefined)).toBeNull()
    expect(readPatternFailedSymbols({ failed: [null, 5, { reason: "thiếu mã" }, { symbol: "AAA" }, { symbol: "BBB", reason: "x" }] })).toEqual([
      "AAA",
      "BBB",
    ])
    expect(readPatternFailedSymbols({ failed: "AAA" })).toEqual([])
  })

  it("trạng thái lần tính: đang chạy, bị gián đoạn, xong, thất bại, chưa có", () => {
    const running = patternRunWire({ id: 12, status: "running", symbols_done: 40, symbols_total: 97 })
    expect(patternRunState(status({ running, latest: running }))).toBe("running")
    // Ghi `running` mà máy chủ không còn coi là đang chạy: mất tín hiệu sống.
    expect(patternRunState(status({ running: null, latest: running }))).toBe("stale")
    expect(patternRunState(status())).toBe("done")
    expect(patternRunState(status({ latest: patternRunWire({ status: "failed" }) }))).toBe("failed")
    expect(patternRunState(status({ latest: null, used: null }))).toBe("none")

    expect(patternRunPercent({ symbolsDone: 40, symbolsTotal: 97 })).toBe(41)
    expect(patternRunPercent({ symbolsDone: 5, symbolsTotal: 0 })).toBe(0)
    expect(patternRunPercent({ symbolsDone: 120, symbolsTotal: 97 })).toBe(100)
  })
})

describe("tra cứu: kiểm tra ô nhập và gom theo bậc", () => {
  const ok = { scope: "one" as const, symbol: " hpg ", from: "2025-03-01", to: "2025-06-30" }

  it("chuẩn hoá mã viết hoa; Tất cả mã thì không có mã", () => {
    expect(validatePatternLookup(ok)).toEqual({
      ok: true,
      params: { symbol: "HPG", from: "2025-03-01", to: "2025-06-30" },
    })
    expect(validatePatternLookup({ ...ok, scope: "all", symbol: "" })).toEqual({
      ok: true,
      params: { symbol: null, from: "2025-03-01", to: "2025-06-30" },
    })
    // Một ngày cũng là khoảng hợp lệ (gồm cả hai đầu).
    expect(validatePatternLookup({ ...ok, to: "2025-03-01" }).ok).toBe(true)
  })

  it("báo lỗi rõ cho từng ô sai", () => {
    const error = (draft: Partial<typeof ok>) => {
      const result = validatePatternLookup({ ...ok, ...draft })
      return result.ok ? null : result.error
    }
    expect(error({ symbol: " " })).toBe("Nhập mã cổ phiếu hoặc chọn Tất cả mã.")
    expect(error({ symbol: "HP-G" })).toBe("Mã chỉ gồm chữ và số, tối đa 16 ký tự.")
    expect(error({ from: "" })).toBe("Chọn ngày bắt đầu.")
    expect(error({ to: "" })).toBe("Chọn ngày kết thúc.")
    expect(error({ from: "2025-02-30" })).toBe("Ngày bắt đầu không hợp lệ.")
    expect(error({ to: "01/03/2025" })).toBe("Ngày kết thúc không hợp lệ.")
    expect(error({ from: "2025-06-30", to: "2025-03-01" })).toBe("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.")
  })

  it("gom thẻ theo bậc tăng dần, thẻ nhiều lần trước, thẻ 0 lần cuối; bậc lạ vẫn hiện", () => {
    const cards = [
      { cardId: "b", name: "B", tier: 2, count: 3 },
      { cardId: "z", name: "Z", tier: 1, count: 0 },
      { cardId: "a", name: "A", tier: 1, count: 5 },
      { cardId: "c", name: "C", tier: 1, count: 5 },
      { cardId: "x", name: "X", tier: 9, count: 1 },
    ]
    const groups = groupPatternCardsByTier(cards)
    expect(groups.map((group) => group.tier)).toEqual([1, 2, 9])
    expect(groups[0]!.cards.map((card) => card.cardId)).toEqual(["a", "c", "z"])
    expect(groups[0]!.total).toBe(10)
    expect(patternTierInfo(1)).toEqual({ label: "1 NẾN", color: "#2F7BF5" })
    expect(patternTierInfo(9)).toEqual({ label: "Bậc 9", color: null })
    expect(formatPatternDate("2025-03-01")).toBe("01/03/2025")
    expect(formatPatternDate(null)).toBe("—")
  })
})

describe("câu báo lỗi của Tính lại mẫu nến", () => {
  it("dựa vào mã lỗi và mã HTTP của máy chủ", () => {
    const api = (statusCode: number, code?: string) => new ApiError("Lỗi gốc", statusCode, { code })
    expect(describeRecomputeError(api(409, "PATTERN_RUN_RUNNING"))).toMatch(/Đang có một lần tính mẫu nến chạy/)
    expect(describeRecomputeError(api(409, "PATTERN_NO_ACTIVE_DATASET"))).toMatch(/Hãy làm mới kho trước/)
    expect(describeRecomputeError(api(409))).toMatch(/đang bận tính mẫu nến/)
    expect(describeRecomputeError(api(403))).toBe("Chỉ quản trị viên được tính lại mẫu nến.")
    expect(describeRecomputeError(api(429))).toMatch(/quá nhanh/)
    expect(describeRecomputeError(api(503))).toMatch(/thử lại sau ít phút/)
    // Lỗi khác giữ nguyên thông điệp của máy chủ.
    expect(describeRecomputeError(api(400, "BAD"))).toBe("Lỗi gốc")
    expect(describeRecomputeError(new Error("Mất kết nối"))).toBe("Mất kết nối")
  })
})
